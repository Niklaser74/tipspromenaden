/**
 * @file OpenEventScreen.tsx
 * @description Mellanlandning för deep links av typen
 * `tipspromenaden://event/<id>`. Aktiverar event-läge via
 * `EventThemeContext.activateEvent`, visar en kort välkomst och
 * replace:ar till Home.
 *
 * Mönster speglat från `OpenTipspackScreen.tsx`. Separat skärm istället
 * för logik inne i HomeScreen för att hålla event-flödet isolerat och
 * visningsbart även från QR-skanning mitt i navigationen.
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  TouchableOpacity,
  Image,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { useEventTheme } from "../context/EventThemeContext";
import { useTranslation } from "../i18n";

export default function OpenEventScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { activateEvent } = useEventTheme();
  const { t, locale } = useTranslation();
  const eventId: string | undefined = route.params?.eventId;
  const [error, setError] = useState<string | null>(null);
  const [welcomeName, setWelcomeName] = useState<string | null>(null);
  const [welcomeText, setWelcomeText] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  useEffect(() => {
    // OBS: Behåll bara `eventId` som dep — `t`, `locale` och `activateEvent`
    // är instabila/triggar re-renders och skulle få cleanup att fyra mellan
    // welcome-rendering och setTimeout, vilket dödar navigeringen och
    // låser användaren på välkomstskärmen. Vi vill att effekten kör EXAKT
    // en gång per eventId.
    let unmounted = false;
    let timerId: ReturnType<typeof setTimeout> | undefined;
    (async () => {
      if (!eventId) {
        setError(t("event.openMissing") as string);
        return;
      }
      try {
        const event = await activateEvent(eventId);
        if (unmounted) return;
        setWelcomeName(event.name);
        setLogoUrl(event.logoUrl || null);
        const lang: "sv" | "en" = locale?.startsWith("en") ? "en" : "sv";
        setWelcomeText(
          event.welcomeText?.[lang] ||
            event.welcomeText?.sv ||
            event.welcomeText?.en ||
            null
        );
        // Visa välkomst i 2 sek, replace:a sedan till Home. Timer-ID:t
        // sparas så cleanup kan rensa det om användaren backar tidigare.
        timerId = setTimeout(() => {
          if (!unmounted) navigation.replace("Home");
        }, 2000);
      } catch (e: any) {
        if (unmounted) return;
        setError(e?.message || (t("common.error") as string));
      }
    })();
    return () => {
      unmounted = true;
      if (timerId) clearTimeout(timerId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>{t("event.openCantActivate")}</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => navigation.replace("Home")}
          activeOpacity={0.8}
        >
          <Text style={styles.homeButtonText}>
            {(t("results.backHome") as string) || t("event.openBackHome")}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (welcomeName) {
    return (
      <View style={styles.container}>
        {logoUrl && (
          <Image
            source={{ uri: logoUrl }}
            style={styles.logo}
            resizeMode="contain"
          />
        )}
        <Text style={styles.welcomeTitle}>{t("event.openWelcomeTitle")}</Text>
        <Text style={styles.eventName}>{welcomeName}</Text>
        {welcomeText && <Text style={styles.welcomeText}>{welcomeText}</Text>}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#1B6B35" />
      <Text style={styles.loadingText}>{t("event.openActivating")}</Text>
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
  logo: {
    width: 160,
    height: 80,
    marginBottom: 24,
  },
  welcomeTitle: {
    fontSize: 16,
    color: "#8A9A8D",
    marginBottom: 4,
  },
  eventName: {
    fontSize: 24,
    fontWeight: "700",
    color: "#2C3E2D",
    textAlign: "center",
    marginBottom: 16,
  },
  welcomeText: {
    fontSize: 15,
    color: "#4F5F50",
    textAlign: "center",
    maxWidth: 320,
    lineHeight: 22,
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
