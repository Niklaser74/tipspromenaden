/**
 * @file OpenTipspackScreen.tsx
 * @description Mellanlandning för deep links av typen
 * `tipspromenaden://tipspack/<slug>`. Hämtar `.tipspack`-filen från
 * `https://tipspromenaden.app/tipspack/<slug>.tipspack`, validerar
 * den och replace:ar till `CreateWalk` med batteriet förladdat så
 * användaren landar direkt i placerings-flödet på kartan.
 *
 * Mönster speglat från `OpenWalkScreen.tsx`. Skälet att vi gör en
 * separat skärm istället för att hantera deep linket inne i CreateWalk
 * är att vi vill kunna visa rena fel-meddelanden ("kunde inte hämta
 * paket") utan att behöva blanda in CreateWalk:s eget state-flöde.
 *
 * Hämtar via vanlig `fetch` mot tipspromenaden.app — webbservern är
 * publik och kräver ingen auth. Om enheten är offline visas felet och
 * användaren får en knapp tillbaka hem.
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { doc, getDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import { db, storage } from "../config/firebase";
import { useTranslation } from "../i18n";
import { WEB_HOST, TIPSPACK_PATH } from "../constants/deepLinks";
import { validateBattery } from "../services/tipspackValidator";

/** Slug-validering — bara safe URL-tecken så vi inte injicerar konstigheter. */
function isValidSlug(s: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(s) && s.length <= 100;
}

/**
 * Hämta tipspack-innehållet. Två källor:
 *
 *   1. **Curated (statisk fil)** — `tipspromenaden.app/tipspack/<slug>.tipspack`
 *      serverad av Cloudflare. Snabbast, fungerar offline efter cache.
 *
 *   2. **Uppladdad (Firebase Storage)** — användar-uppladdade pack ligger
 *      på `tipspack/<slug>` med metadata i Firestore-collection `tipspacks`.
 *
 * Vi provar curated först (en HTTP-request), faller tillbaka på Firestore-
 * lookup om 404. Det ger snabbast väg för de flesta paketen utan att
 * blockera uppladdade.
 */
async function fetchTipspack(slug: string): Promise<any> {
  // 1. Curated — direkt fetch
  const staticUrl = `https://${WEB_HOST}/${TIPSPACK_PATH}/${encodeURIComponent(slug)}.tipspack`;
  try {
    const res = await fetch(staticUrl);
    if (res.ok) {
      return await res.json();
    }
    // 404 eller annat fel — fall vidare till Firestore-uppladdat
  } catch {
    // Nätverksfel — fall vidare
  }

  // 2. Uppladdat — kolla Firestore för metadata, hämta sedan från Storage
  const docSnap = await getDoc(doc(db, "tipspacks", slug));
  if (!docSnap.exists()) {
    throw new Error(
      `Paketet "${slug}" finns inte. Kontrollera länken eller om paketet har raderats.`
    );
  }
  const downloadUrl = await getDownloadURL(ref(storage, `tipspack/${slug}`));
  const res = await fetch(downloadUrl);
  if (!res.ok) {
    throw new Error(`Kunde inte hämta paketet (HTTP ${res.status}).`);
  }
  return res.json();
}

export default function OpenTipspackScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const slug: string | undefined = route.params?.slug;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) {
        setError(t("openTipspack.missingSlug"));
        return;
      }
      if (!isValidSlug(slug)) {
        setError(t("openTipspack.invalidSlug"));
        return;
      }
      try {
        const data = await fetchTipspack(slug);
        if (cancelled) return;
        validateBattery(data);
        // Replace istället för navigate så bakåtpilen från CreateWalk
        // hoppar tillbaka till Home, inte till loadern.
        navigation.replace("CreateWalk", {
          pendingBattery: data.questions,
          pendingBatteryName: data.name,
          pendingBatteryLanguage: data.language,
        });
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || t("common.error"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug, navigation, t]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>{t("openTipspack.cantOpen")}</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => navigation.replace("Home")}
          activeOpacity={0.8}
        >
          <Text style={styles.homeButtonText}>{t("results.backHome")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1B6B35" />
      <Text style={styles.loadingText}>{t("openTipspack.loading")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F0E8",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    color: "#4A5E4C",
    fontSize: 15,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2C3E2D",
    marginBottom: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: "#8A9A8D",
    textAlign: "center",
    marginBottom: 24,
  },
  homeButton: {
    backgroundColor: "#1B6B35",
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 14,
  },
  homeButtonText: {
    color: "#F5F0E8",
    fontSize: 16,
    fontWeight: "700",
  },
});
