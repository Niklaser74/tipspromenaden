/**
 * @file OfflineBanner.tsx
 * @description Banner högst upp när enheten är offline. Visar antal
 * köade svar som väntar på sync så användaren ser att deras spel-
 * progress är säker.
 *
 * Diskret design — gul ton, kort text, ingen knapp. Försvinner automatiskt
 * när nätet är tillbaka. Auto-trigad sync av väntande svar händer i
 * services/offlineSync via startBackgroundSync.
 */
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, Platform } from "react-native";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { getPendingSyncs } from "../services/storage";
import { useTranslation } from "../i18n";

export default function OfflineBanner() {
  const online = useOnlineStatus();
  const { t } = useTranslation();
  const [pendingCount, setPendingCount] = useState(0);

  // Räkna om kö-djupet vid varje on/offline-flip + var 10:e sek när vi är
  // offline. Vi vill inte polla AsyncStorage hela tiden — bara medan
  // användaren faktiskt har banner uppe.
  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;

    const refresh = async () => {
      try {
        const items = await getPendingSyncs();
        if (!cancelled) setPendingCount(items.length);
      } catch {
        if (!cancelled) setPendingCount(0);
      }
    };

    refresh();
    if (!online) {
      interval = setInterval(refresh, 10000);
    }
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [online]);

  if (online) return null;

  return (
    <View style={styles.banner} pointerEvents="box-none">
      <Text style={styles.icon}>📡</Text>
      <View style={styles.textBox}>
        <Text style={styles.title}>{t("offline.bannerTitle")}</Text>
        <Text style={styles.subtitle}>
          {pendingCount > 0
            ? t("offline.bannerQueued", { count: pendingCount })
            : t("offline.bannerNoQueue")}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFF4D6",
    borderBottomWidth: 1,
    borderBottomColor: "#E8B830",
    paddingHorizontal: 16,
    paddingVertical: 10,
    paddingTop: Platform.OS === "web" ? 10 : 14,
  },
  icon: { fontSize: 18 },
  textBox: { flex: 1 },
  title: { color: "#6B4F00", fontSize: 13, fontWeight: "700" },
  subtitle: { color: "#8A6B1A", fontSize: 11, marginTop: 2 },
});
