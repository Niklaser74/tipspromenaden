/**
 * @file StatsScreen.tsx
 * @description Lokal statistikvy.
 *
 * Hämtar och visar användarens samlade mätvärden från `services/stats.ts`.
 * Vyn är sidoflik till HomeScreen — användaren swipar höger för att nå
 * den. All data är device-lokalt; ingen Firebase-läsning krävs.
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import {
  getStats,
  averageCorrectPct,
  UserStats,
} from "../services/stats";
import { useTranslation } from "../i18n";

export default function StatsScreen() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<UserStats | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const s = await getStats();
    setStats(s);
  }, []);

  // useFocusEffect fångar både första visningen och när användaren
  // swipar tillbaka från Home efter att ha genomfört en promenad.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (!stats) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{t("common.loading")}</Text>
      </View>
    );
  }

  const avgPct = averageCorrectPct(stats);
  const bestList = Object.values(stats.bestScores).sort(
    (a, b) => b.score / b.total - a.score / a.total
  );

  const hasAnyActivity =
    stats.walksCompleted > 0 || stats.walksCreated > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.header}>{t("stats.title")}</Text>
      <Text style={styles.subtitle}>{t("stats.subtitle")}</Text>

      {!hasAnyActivity && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyEmoji}>📊</Text>
          <Text style={styles.emptyTitle}>{t("stats.emptyTitle")}</Text>
          <Text style={styles.emptyDesc}>{t("stats.emptyDesc")}</Text>
        </View>
      )}

      <View style={styles.cardRow}>
        <StatCard
          emoji="🚶"
          value={String(stats.walksCompleted)}
          label={t("stats.walksCompleted")}
        />
        <StatCard
          emoji="✏️"
          value={String(stats.walksCreated)}
          label={t("stats.walksCreated")}
        />
      </View>
      <View style={styles.cardRow}>
        <StatCard
          emoji="❓"
          value={String(stats.questionsAnswered)}
          label={t("stats.questionsAnswered")}
        />
        <StatCard
          emoji="🎯"
          value={`${avgPct}%`}
          label={t("stats.avgCorrect")}
        />
      </View>

      {bestList.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{t("stats.bestResults")}</Text>
          {bestList.slice(0, 10).map((b) => {
            const pct = Math.round((b.score / b.total) * 100);
            return (
              <View key={b.walkId} style={styles.bestRow}>
                <View style={styles.bestRowText}>
                  <Text style={styles.bestTitle} numberOfLines={1}>
                    {b.walkTitle}
                  </Text>
                  <Text style={styles.bestSub}>
                    {t("stats.scoreLine", {
                      score: b.score,
                      total: b.total,
                      percentage: pct,
                    })}
                  </Text>
                </View>
                <Text style={styles.bestPct}>{pct}%</Text>
              </View>
            );
          })}
        </View>
      )}

      <Text style={styles.footnote}>{t("stats.footnote")}</Text>
    </ScrollView>
  );
}

function StatCard({
  emoji,
  value,
  label,
}: {
  emoji: string;
  value: string;
  label: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F0E8",
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  empty: {
    flex: 1,
    backgroundColor: "#F5F0E8",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    color: "#6B7568",
    fontSize: 15,
  },
  header: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1B3D2B",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#6B7568",
    marginBottom: 20,
  },
  emptyBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 20,
  },
  emptyEmoji: {
    fontSize: 40,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#2C3E2D",
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 14,
    color: "#6B7568",
    textAlign: "center",
    lineHeight: 20,
  },
  cardRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  statEmoji: {
    fontSize: 28,
    marginBottom: 6,
  },
  statValue: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1B6B35",
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7568",
    marginTop: 4,
    textAlign: "center",
  },
  section: {
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: "#2C3E2D",
    marginBottom: 8,
  },
  bestRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  bestRowText: {
    flex: 1,
    paddingRight: 12,
  },
  bestTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2C3E2D",
  },
  bestSub: {
    fontSize: 13,
    color: "#6B7568",
    marginTop: 2,
  },
  bestPct: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B6B35",
  },
  footnote: {
    fontSize: 12,
    color: "#8B948D",
    textAlign: "center",
    marginTop: 24,
    fontStyle: "italic",
  },
});
