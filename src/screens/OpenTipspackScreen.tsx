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
import { useTranslation } from "../i18n";
import { WEB_HOST, TIPSPACK_PATH } from "../constants/deepLinks";

/**
 * Spegelvalidering av `validateBattery()` i `services/questionBattery.ts`.
 * Vi importerar inte den filen direkt här eftersom OpenTipspackScreen
 * hämtar JSON från nätverket istället för från filsystemet — datakällan
 * skiljer sig men formatet är identiskt. När/om vi extraherar valideringen
 * till en delad util kan båda dela på den.
 */
function validateTipspack(data: any): asserts data is {
  format: "tipspack";
  version: string;
  name: string;
  description?: string;
  author?: string;
  language?: string;
  questions: {
    text: string;
    options: string[];
    correctOptionIndex: number;
  }[];
} {
  if (!data || typeof data !== "object") {
    throw new Error("Filen är inte ett giltigt JSON-objekt.");
  }
  if (data.format !== "tipspack") {
    throw new Error(
      `Fel filformat. Förväntade "tipspack" men fick "${data.format}".`
    );
  }
  if (typeof data.version !== "string") {
    throw new Error("Saknar versionsfält.");
  }
  if (typeof data.name !== "string" || !data.name.trim()) {
    throw new Error("Saknar namn på frågebatteriet.");
  }
  if (!Array.isArray(data.questions) || data.questions.length === 0) {
    throw new Error("Frågebatteriet innehåller inga frågor.");
  }
  if (data.questions.length > 500) {
    throw new Error("Frågebatteriet har för många frågor (max 500).");
  }
  data.questions.forEach((q: any, idx: number) => {
    const prefix = `Fråga ${idx + 1}:`;
    if (typeof q.text !== "string" || !q.text.trim()) {
      throw new Error(`${prefix} saknar frågetext.`);
    }
    if (q.text.length > 1000) {
      throw new Error(`${prefix} frågetexten är för lång.`);
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      throw new Error(`${prefix} måste ha minst 2 svarsalternativ.`);
    }
    if (q.options.length > 10) {
      throw new Error(`${prefix} har för många svarsalternativ (max 10).`);
    }
    if (
      q.options.some(
        (o: any) => typeof o !== "string" || !o.trim() || o.length > 1000
      )
    ) {
      throw new Error(`${prefix} har tomma eller för långa svarsalternativ.`);
    }
    if (
      typeof q.correctOptionIndex !== "number" ||
      q.correctOptionIndex < 0 ||
      q.correctOptionIndex >= q.options.length
    ) {
      throw new Error(`${prefix} har ogiltigt rätt-svar-index.`);
    }
  });
}

/** Slug-validering — bara safe URL-tecken så vi inte injicerar konstigheter. */
function isValidSlug(s: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(s) && s.length <= 100;
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
      const url = `https://${WEB_HOST}/${TIPSPACK_PATH}/${encodeURIComponent(slug)}.tipspack`;
      try {
        const res = await fetch(url);
        if (cancelled) return;
        if (!res.ok) {
          setError(t("openTipspack.fetchFailed", { status: res.status }));
          return;
        }
        const data = await res.json();
        if (cancelled) return;
        validateTipspack(data);
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
