import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import {
  subscribeToSession,
  subscribeToWalkSessions,
} from "../services/firestore";
import { Session, Participant } from "../types";
import { useTranslation } from "../i18n";

export default function LeaderboardScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { t, locale } = useTranslation();
  const {
    sessionId,
    walkTitle,
    totalQuestions,
    participantId,
    walkId,
    isEvent,
  } = route.params as {
    sessionId: string;
    walkTitle: string;
    totalQuestions: number;
    participantId?: string;
    walkId?: string;
    isEvent?: boolean;
  };

  const [session, setSession] = useState<Session | null>(null);
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    if (isEvent && walkId) {
      const unsub = subscribeToWalkSessions(walkId, (sessions) => {
        const merged: Participant[] = [];
        for (const s of sessions) {
          for (const p of s.participants) {
            if (!merged.some((m) => m.id === p.id)) {
              merged.push(p);
            }
          }
        }
        setAllParticipants(merged);
        const mainSession = sessions.find((s) => s.id === sessionId);
        if (mainSession) setSession(mainSession);
        else if (sessions.length > 0) setSession(sessions[0]);

        setLoading(false);
        setLastUpdated(new Date());
      });
      return unsub;
    } else {
      const unsub = subscribeToSession(sessionId, (s) => {
        setSession(s);
        setAllParticipants(s.participants);
        setLoading(false);
        setLastUpdated(new Date());
      });
      return unsub;
    }
  }, [sessionId, walkId, isEvent]);

  // Sort participants: score desc, then completion time asc
  const sortedParticipants = [...allParticipants].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTime = a.completedAt || Infinity;
    const bTime = b.completedAt || Infinity;
    return aTime - bTime;
  });

  const allDone =
    allParticipants.length > 0 && allParticipants.every((p) => p.completedAt);
  const activePlayers = allParticipants.filter((p) => !p.completedAt).length;
  const completedPlayers = allParticipants.filter(
    (p) => p.completedAt
  ).length;

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2D7A3A" />
        <Text style={styles.loadingText}>{t("leaderboard.loading")}</Text>
      </View>
    );
  }

  const getMedal = (index: number) => {
    if (index === 0) return "\uD83E\uDD47";
    if (index === 1) return "\uD83E\uDD48";
    if (index === 2) return "\uD83E\uDD49";
    return "";
  };

  const renderTopThree = () => {
    const top = sortedParticipants.slice(0, 3);
    if (top.length === 0) return null;

    return (
      <View style={styles.podium}>
        {top.map((player, idx) => {
          const isMe = player.id === participantId;
          const percentage =
            totalQuestions > 0
              ? Math.round((player.score / totalQuestions) * 100)
              : 0;
          return (
            <View
              key={player.id}
              style={[
                styles.podiumItem,
                idx === 0 && styles.podiumFirst,
                isMe && styles.podiumMe,
              ]}
            >
              <Text style={styles.podiumMedal}>{getMedal(idx)}</Text>
              <Text
                style={[styles.podiumName, isMe && styles.podiumNameMe]}
                numberOfLines={1}
              >
                {player.name}
              </Text>
              <Text style={styles.podiumScore}>{player.score} {t("leaderboard.points")}</Text>
              <Text style={styles.podiumPercent}>{percentage}%</Text>
            </View>
          );
        })}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{t("leaderboard.title")}</Text>
        <Text style={styles.walkTitle}>{walkTitle}</Text>

        {isEvent && (
          <View style={styles.eventBanner}>
            <Text style={styles.eventText}>{t("leaderboard.eventBanner")}</Text>
          </View>
        )}

        {/* Live indicator */}
        <View style={styles.liveRow}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>
            {t("leaderboard.liveRealtime", { count: allParticipants.length })}
          </Text>
          {lastUpdated && (
            <Text style={styles.liveTimestamp}>
              {lastUpdated.toLocaleTimeString(locale === "sv" ? "sv-SE" : "en-US")}
            </Text>
          )}
        </View>
      </View>

      {/* Status banners */}
      {!allDone && activePlayers > 0 && (
        <View style={styles.waitingBanner}>
          <ActivityIndicator size="small" color="#F0C040" />
          <Text style={styles.waitingText}>
            {t("leaderboard.waiting", { done: completedPlayers, active: activePlayers })}
          </Text>
        </View>
      )}

      {allDone && (
        <View style={styles.completeBanner}>
          <Text style={styles.completeEmoji}>🎉</Text>
          <Text style={styles.completeText}>{t("leaderboard.allDone")}</Text>
        </View>
      )}

      {/* Podium for top 3 */}
      {renderTopThree()}

      {/* Full list (skip top 3) */}
      <FlatList
        data={sortedParticipants.slice(3)}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        style={styles.list}
        renderItem={({ item, index }) => {
          const rank = index + 4;
          const isMe = item.id === participantId;
          const percentage =
            totalQuestions > 0
              ? Math.round((item.score / totalQuestions) * 100)
              : 0;
          const answeredCount = item.answers ? item.answers.length : 0;
          const progressPercent =
            totalQuestions > 0
              ? Math.round((answeredCount / totalQuestions) * 100)
              : 0;

          return (
            <View
              style={[
                styles.row,
                isMe && styles.rowMe,
                !item.completedAt && styles.rowPending,
              ]}
            >
              <Text style={styles.rank}>{rank}</Text>
              <View style={styles.rowInfo}>
                <Text style={[styles.rowName, isMe && styles.rowNameMe]}>
                  {item.name} {isMe ? t("leaderboard.you") : ""}
                </Text>
                {item.completedAt ? (
                  <Text style={styles.rowDetail}>
                    {t("leaderboard.correctCount", { score: item.score, total: totalQuestions, percentage })}
                  </Text>
                ) : (
                  <View style={styles.progressRow}>
                    <View style={styles.miniProgressBar}>
                      <View
                        style={[
                          styles.miniProgressFill,
                          { width: `${progressPercent}%` },
                        ]}
                      />
                    </View>
                    <Text style={styles.pendingText}>
                      {answeredCount}/{totalQuestions}
                    </Text>
                  </View>
                )}
              </View>
              <Text style={styles.rowScore}>
                {item.completedAt ? item.score : "\u2014"}
              </Text>
            </View>
          );
        }}
        ListEmptyComponent={
          sortedParticipants.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>👥</Text>
              <Text style={styles.emptyText}>{t("leaderboard.emptyText")}</Text>
            </View>
          ) : null
        }
      />

      {/* Home button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => navigation.navigate("Home")}
          activeOpacity={0.8}
        >
          <Text style={styles.homeButtonText}>{t("leaderboard.backHome")}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1B3D2B",
  },
  loadingContainer: {
    flex: 1,
    backgroundColor: "#1B3D2B",
    justifyContent: "center",
    alignItems: "center",
    gap: 12,
  },
  loadingText: {
    color: "rgba(245,240,232,0.6)",
    fontSize: 16,
    fontWeight: "500",
  },

  // Header
  header: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 16,
    alignItems: "center",
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#F5F0E8",
    letterSpacing: -0.3,
  },
  walkTitle: {
    fontSize: 15,
    color: "rgba(245,240,232,0.6)",
    marginTop: 4,
    fontWeight: "500",
  },
  eventBanner: {
    backgroundColor: "rgba(240,192,64,0.15)",
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    marginTop: 10,
  },
  eventText: {
    color: "#F0C040",
    fontSize: 13,
    fontWeight: "600",
  },
  liveRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    gap: 6,
  },
  liveDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
  },
  liveText: {
    color: "rgba(245,240,232,0.5)",
    fontSize: 12,
    fontWeight: "500",
  },
  liveTimestamp: {
    color: "rgba(245,240,232,0.3)",
    fontSize: 11,
  },

  // Status banners
  waitingBanner: {
    flexDirection: "row",
    backgroundColor: "rgba(240,192,64,0.15)",
    marginHorizontal: 24,
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginBottom: 16,
  },
  waitingText: {
    color: "#F0C040",
    fontSize: 14,
    fontWeight: "600",
  },
  completeBanner: {
    flexDirection: "row",
    backgroundColor: "rgba(45,122,58,0.4)",
    marginHorizontal: 24,
    padding: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 16,
  },
  completeEmoji: {
    fontSize: 18,
  },
  completeText: {
    color: "rgba(245,240,232,0.8)",
    fontSize: 14,
    fontWeight: "600",
  },

  // Podium
  podium: {
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginBottom: 16,
    gap: 8,
  },
  podiumItem: {
    flex: 1,
    backgroundColor: "rgba(245,240,232,0.08)",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
  },
  podiumFirst: {
    backgroundColor: "rgba(240,192,64,0.15)",
    borderWidth: 1,
    borderColor: "rgba(240,192,64,0.3)",
  },
  podiumMe: {
    borderWidth: 1,
    borderColor: "#F0C040",
  },
  podiumMedal: {
    fontSize: 28,
    marginBottom: 6,
  },
  podiumName: {
    color: "#F5F0E8",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 4,
  },
  podiumNameMe: {
    color: "#F0C040",
  },
  podiumScore: {
    color: "#F5F0E8",
    fontSize: 22,
    fontWeight: "800",
  },
  podiumPercent: {
    color: "rgba(245,240,232,0.5)",
    fontSize: 12,
    marginTop: 2,
  },

  // List
  list: {
    flex: 1,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(245,240,232,0.06)",
    padding: 14,
    borderRadius: 14,
    marginBottom: 6,
  },
  rowMe: {
    backgroundColor: "rgba(240,192,64,0.12)",
    borderWidth: 1,
    borderColor: "rgba(240,192,64,0.3)",
  },
  rowPending: {
    opacity: 0.6,
  },
  rank: {
    fontSize: 16,
    fontWeight: "700",
    width: 36,
    textAlign: "center",
    color: "rgba(245,240,232,0.5)",
  },
  rowInfo: {
    flex: 1,
    marginLeft: 8,
  },
  rowName: {
    color: "#F5F0E8",
    fontSize: 15,
    fontWeight: "600",
  },
  rowNameMe: {
    color: "#F0C040",
  },
  rowDetail: {
    color: "rgba(245,240,232,0.5)",
    fontSize: 13,
    marginTop: 2,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  miniProgressBar: {
    flex: 1,
    height: 4,
    backgroundColor: "rgba(245,240,232,0.1)",
    borderRadius: 2,
  },
  miniProgressFill: {
    height: 4,
    backgroundColor: "#F0C040",
    borderRadius: 2,
  },
  pendingText: {
    color: "rgba(245,240,232,0.3)",
    fontSize: 12,
  },
  rowScore: {
    color: "#F5F0E8",
    fontSize: 22,
    fontWeight: "800",
    width: 40,
    textAlign: "right",
  },

  // Empty
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyText: {
    color: "rgba(245,240,232,0.5)",
    fontSize: 16,
  },

  // Bottom
  bottomBar: {
    padding: 16,
    paddingBottom: Platform.OS === "web" ? 16 : 32,
  },
  homeButton: {
    backgroundColor: "rgba(245,240,232,0.12)",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(245,240,232,0.15)",
  },
  homeButtonText: {
    color: "#F5F0E8",
    fontSize: 17,
    fontWeight: "600",
  },
});
