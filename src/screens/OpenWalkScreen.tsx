/**
 * @file OpenWalkScreen.tsx
 * @description Mellanlandningssida för deep links — tar walkId, hämtar
 * promenaden, och replace:ar till JoinWalk. `replace` (inte navigate) så
 * att bakåtpilen från JoinWalk går till Home, inte tillbaka till loadern.
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
import { getWalk } from "../services/firestore";
import { useTranslation } from "../i18n";

export default function OpenWalkScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const walkId: string | undefined = route.params?.walkId;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!walkId) {
        setError(t("openWalk.missingId"));
        return;
      }
      try {
        const walk = await getWalk(walkId);
        if (cancelled) return;
        if (!walk) {
          setError(t("openWalk.notFound"));
          return;
        }
        // replace så att bakåtpilen från JoinWalk går till Home, inte hit.
        navigation.replace("JoinWalk", { walk });
      } catch (e: any) {
        if (cancelled) return;
        setError(e?.message || t("common.error"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walkId, navigation, t]);

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>{t("openWalk.cantOpen")}</Text>
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
      <Text style={styles.loadingText}>{t("openWalk.loading")}</Text>
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
