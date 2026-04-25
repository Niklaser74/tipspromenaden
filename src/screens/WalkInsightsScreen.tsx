/**
 * @file WalkInsightsScreen.tsx
 * @description Skaparens statistikvy för en specifik promenad.
 *
 * Skiljer sig från `StatsScreen` (som visar användarens egen lokala
 * aktivitet) genom att hämta från Firestore: alla sessioner som körts
 * av denna walk, alla deltagares svar, och aggregerar per-frågevyer
 * så skaparen ser vilka frågor som är för svåra/lätta.
 *
 * Datakostnad: 1 walk-dok + 1 sessions-query + 1 participants-query
 * per session. Görs vid focus, inte i realtid — refresh-knapp finns.
 */
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { useRoute, useFocusEffect } from "@react-navigation/native";
import { getWalkInsights, WalkInsights } from "../services/firestore";
import { useTranslation } from "../i18n";

export default function WalkInsightsScreen() {
  const { t } = useTranslation();
  const route = useRoute<any>();
  const walkId: string = route.params?.walkId;

  const [insights, setInsights] = useState<WalkInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!walkId) return;
    setError(null);
    try {
      const data = await getWalkInsights(walkId);
      setInsights(data);
    } catch (e: any) {
      console.warn("[WalkInsights] load failed:", e);
      setError(e?.message ?? "unknown error");
    } finally {
      setLoading(false);
    }
  }, [walkId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#1B6B35" />
      </View>
    );
  }

  if (error || !insights) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>
          {error ?? t("insights.loadFailed")}
        </Text>
      </View>
    );
  }

  const hasActivity = insights.totalParticipants > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <Text style={styles.header} numberOfLines={2}>
        {insights.walk.title}
      </Text>
      <Text style={styles.subtitle}>{t("insights.subtitle")}</Text>

      {!hasActivity ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyEmoji}>📭</Text>
          <Text style={styles.emptyTitle}>{t("insights.emptyTitle")}</Text>
          <Text style={styles.emptyDesc}>{t("insights.emptyDesc")}</Text>
        </View>
      ) : (
        <>
          <View style={styles.cardRow}>
            <SummaryCard
              value={String(insights.totalSessions)}
              label={t("insights.sessions")}
            />
            <SummaryCard
              value={String(insights.totalParticipants)}
              label={t("insights.participants")}
            />
          </View>
          <View style={styles.cardRow}>
            <SummaryCard
              value={String(insights.completedParticipants)}
              label={t("insights.completed")}
            />
            <SummaryCard
              value={`${insights.averageScorePct}%`}
              label={t("insights.avgScore")}
              accent
            />
          </View>

          <Text style={styles.sectionTitle}>{t("insights.perQuestion")}</Text>
          {insights.questionStats.map((q, idx) => {
            const correctPct =
              q.totalAnswers === 0
                ? 0
                : Math.round((q.correctCount / q.totalAnswers) * 100);
            return (
              <View key={q.questionId} style={styles.questionCard}>
                <View style={styles.questionHeader}>
                  <Text style={styles.questionIndex}>{idx + 1}</Text>
                  <Text style={styles.questionText} numberOfLines={3}>
                    {q.questionText || t("insights.noQuestionText")}
                  </Text>
                </View>
                <Text style={styles.questionMeta}>
                  {t("insights.questionMeta", {
                    answers: q.totalAnswers,
                    correctPct,
                  })}
                </Text>
                {q.options.map((opt, optIdx) => {
                  const count = q.optionCounts[optIdx] ?? 0;
                  const pct =
                    q.totalAnswers === 0
                      ? 0
                      : Math.round((count / q.totalAnswers) * 100);
                  const isCorrect = optIdx === q.correctOptionIndex;
                  return (
                    <View key={optIdx} style={styles.optionRow}>
                      <View style={styles.optionLabelWrap}>
                        <Text
                          style={[
                            styles.optionLabel,
                            isCorrect && styles.optionLabelCorrect,
                          ]}
                          numberOfLines={1}
                        >
                          {isCorrect ? "✓ " : ""}
                          {opt}
                        </Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { width: `${pct}%` },
                            isCorrect && styles.barFillCorrect,
                          ]}
                        />
                      </View>
                      <Text style={styles.optionCount}>
                        {count} · {pct}%
                      </Text>
                    </View>
                  );
                })}
              </View>
            );
          })}
        </>
      )}

      <Text style={styles.footnote}>{t("insights.footnote")}</Text>
    </ScrollView>
  );
}

function SummaryCard({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.summaryCard}>
      <Text style={[styles.summaryValue, accent && styles.summaryValueAccent]}>
        {value}
      </Text>
      <Text style={styles.summaryLabel}>{label}</Text>
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
  center: {
    flex: 1,
    backgroundColor: "#F5F0E8",
    justifyContent: "center",
    alignItems: "center",
  },
  errorText: {
    color: "#8B3A3A",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  header: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1B3D2B",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7568",
    marginBottom: 18,
  },
  emptyBox: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
  },
  emptyEmoji: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2C3E2D",
    marginBottom: 4,
  },
  emptyDesc: {
    fontSize: 13,
    color: "#6B7568",
    textAlign: "center",
    lineHeight: 19,
  },
  cardRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: "700",
    color: "#2C3E2D",
  },
  summaryValueAccent: {
    color: "#1B6B35",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#6B7568",
    marginTop: 4,
    textAlign: "center",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2C3E2D",
    marginTop: 18,
    marginBottom: 10,
  },
  questionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  questionHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  questionIndex: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#1B6B35",
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
    lineHeight: 22,
    marginRight: 8,
    marginTop: 1,
  },
  questionText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: "#2C3E2D",
    lineHeight: 19,
  },
  questionMeta: {
    fontSize: 12,
    color: "#6B7568",
    marginBottom: 10,
    marginLeft: 30,
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    marginLeft: 30,
  },
  optionLabelWrap: {
    width: 90,
    paddingRight: 6,
  },
  optionLabel: {
    fontSize: 12,
    color: "#6B7568",
  },
  optionLabelCorrect: {
    color: "#1B6B35",
    fontWeight: "600",
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: "#E8E2D5",
    borderRadius: 4,
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    backgroundColor: "#A8B5A6",
  },
  barFillCorrect: {
    backgroundColor: "#1B6B35",
  },
  optionCount: {
    width: 64,
    textAlign: "right",
    fontSize: 11,
    color: "#6B7568",
    marginLeft: 6,
  },
  footnote: {
    fontSize: 11,
    color: "#8B948D",
    textAlign: "center",
    marginTop: 20,
    fontStyle: "italic",
  },
});
