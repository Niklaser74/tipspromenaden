import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Linking,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import {
  subscribeToSession,
  subscribeToWalkSessions,
  subscribeToWalk,
  revealWalkResults,
  unrevealWalkResults,
  getOpenRoundSummary,
  closeOpenRounds,
} from "../services/firestore";
import { Session, Participant, Walk } from "../types";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "../i18n";
import { ShareBadge } from "../components/ShareBadge";
import { shareContent } from "../utils/shareContent";
import ContentContainer from "../components/ContentContainer";
import Confetti from "../components/Confetti";
import WalkFeedbackPrompt from "../components/WalkFeedbackPrompt";

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

  const { user } = useAuth();
  const [session, setSession] = useState<Session | null>(null);
  const [allParticipants, setAllParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);
  // Walk-doc:et i realtid — bär hideResultsUntilReveal + resultsRevealedAt
  // så deltagare som väntar ser arrangörens "Redovisa" i samma sekund.
  // walkLoading skiljer "inte laddat än" från "laddat, inget dolt läge"
  // så vi aldrig hinner visa poäng en frame innan gaten slår till.
  const [walkDoc, setWalkDoc] = useState<Walk | null>(null);
  const [walkLoading, setWalkLoading] = useState(!!walkId);
  const [revealing, setRevealing] = useState(false);
  const [closingRound, setClosingRound] = useState(false);
  // Finns det något öppet att avsluta? Egen state i stället för att läsa
  // `session.status`: i eventläget pekar `session` på EN av flera
  // sessioner och kan råka vara en redan avslutad, medan andra står
  // öppna. Uppdateras av samma prenumeration som topplistan, så knappen
  // försvinner av sig själv när sista deltagaren går i mål.
  const [roundOpen, setRoundOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [sharing, setSharing] = useState(false);
  const badgeRef = useRef<View>(null);

  // Konfetti vid min egen >=70% — fyrar EN gång när min completedAt först
  // dyker upp i streamen, sen aldrig igen även om snapshot:en re-renderar.
  // Tidigare bodde detta i ResultsScreen men den skärmen nås aldrig
  // i praktiken eftersom flödet hoppar direkt till Leaderboard.
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiFiredRef = useRef(false);

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
        setRoundOpen(sessions.some((s) => s.status !== "completed"));

        setLoading(false);
        setLastUpdated(new Date());
      });
      return unsub;
    } else {
      const unsub = subscribeToSession(sessionId, (s) => {
        setSession(s);
        setRoundOpen(s.status !== "completed");
        setAllParticipants(s.participants);
        setLoading(false);
        setLastUpdated(new Date());
      });
      return unsub;
    }
  }, [sessionId, walkId, isEvent]);

  useEffect(() => {
    if (!walkId) return;
    const unsub = subscribeToWalk(walkId, (w) => {
      setWalkDoc(w);
      setWalkLoading(false);
    });
    return unsub;
  }, [walkId]);

  // Dolda resultat-gate: hidden = skaparen valde läget, revealed =
  // arrangören har tryckt "Redovisa resultat". Arrangören ser alltid
  // full topplista (hen behöver den för att avgöra när det är dags).
  const hidden = !!walkDoc?.hideResultsUntilReveal;
  const revealed = !!walkDoc?.resultsRevealedAt;
  const isOrganizer = !!user && !!walkDoc && user.uid === walkDoc.createdBy;
  const gateActive = hidden && !revealed && !isOrganizer;

  // Filtrera bort "spök"-deltagare: någon som skapat participant-dokumentet
  // (joinat + angett namn) men aldrig svarat på en fråga och heller inte
  // slutfört. I event-läge ackumuleras dessa över alla sessioner för
  // promenaden och kan ta medaljplatser på podiet så länge <3 riktiga
  // spelare kört klart. Så snart de har minst ett svar eller completedAt
  // räknas de som riktiga deltagare (även om score=0).
  const rankedParticipants = allParticipants.filter(
    (p) => p.completedAt || (p.answers && p.answers.length > 0)
  );

  const sortedParticipants = [...rankedParticipants].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aTime = a.completedAt || Infinity;
    const bTime = b.completedAt || Infinity;
    return aTime - bTime;
  });

  const allDone =
    rankedParticipants.length > 0 &&
    rankedParticipants.every((p) => p.completedAt);
  const activePlayers = rankedParticipants.filter((p) => !p.completedAt).length;
  const completedPlayers = rankedParticipants.filter(
    (p) => p.completedAt
  ).length;

  // Dela-badge: visa knapp bara om "jag" finns i listan och har slutfört.
  // Placeringen baseras på sorteringsordningen (samma som visas på topplistan).
  const myIndex = sortedParticipants.findIndex((p) => p.id === participantId);
  const me = myIndex >= 0 ? sortedParticipants[myIndex] : undefined;
  const myRank = myIndex + 1;
  const canShare = !!me && !!me.completedAt && !gateActive;

  // Fyra konfetti när min completion blir synlig i streamen för första
  // gången OCH jag fick >=70%. Använder ref så att senare snapshot-
  // uppdateringar (t.ex. nya deltagare som ansluter) inte triggar igen.
  useEffect(() => {
    if (confettiFiredRef.current) return;
    if (!me?.completedAt) return;
    // Dolda resultat: håll inne konfettin tills arrangören redovisat —
    // när reveal-snapshoten landar re-körs effekten och den fyras då.
    if (gateActive) return;
    const myPercentage =
      totalQuestions > 0 ? (me.score / totalQuestions) * 100 : 0;
    if (myPercentage >= 70) {
      confettiFiredRef.current = true;
      setShowConfetti(true);
    }
  }, [me?.completedAt, me?.score, totalQuestions, gateActive]);

  const handleShare = async () => {
    if (!me || sharing) return;
    setSharing(true);
    try {
      const ok = await shareContent({
        kind: "viewAsImage",
        viewRef: badgeRef,
        dialogTitle: t("leaderboard.shareDialogTitle"),
      });
      if (!ok) {
        Alert.alert(t("common.errorTitle"), t("leaderboard.shareUnavailable"));
      }
    } catch {
      Alert.alert(t("common.errorTitle"), t("leaderboard.shareFailed"));
    } finally {
      setSharing(false);
    }
  };

  // Arrangörens reveal/unreveal. Bekräftelse-dialog före reveal —
  // det syns omedelbart på alla deltagares skärmar.
  const handleReveal = () => {
    if (!walkId || revealing) return;
    Alert.alert(
      t("leaderboard.revealConfirmTitle"),
      t("leaderboard.revealConfirmMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("leaderboard.revealButton"),
          onPress: async () => {
            setRevealing(true);
            try {
              await revealWalkResults(walkId);
            } catch (e: any) {
              Alert.alert(t("common.errorTitle"), e?.message || "");
            } finally {
              setRevealing(false);
            }
          },
        },
      ]
    );
  };

  // "Avsluta rundan" härifrån: arrangören ser topplistan, konstaterar
  // att de gråa raderna aldrig kommer gå i mål, och stänger. Samma
  // funktion som i Bibliotekets ⋯-meny — här bara närmare beslutet.
  const handleCloseRound = async () => {
    if (!walkId || closingRound) return;
    setClosingRound(true);
    try {
      const summary = await getOpenRoundSummary(walkId);
      if (!summary) {
        Alert.alert(
          t("home.closeRoundNoneTitle"),
          t("home.closeRoundNoneMessage")
        );
        return;
      }
      const message =
        summary.unfinished > 0
          ? t("home.closeRoundWarnMessage", { count: summary.unfinished })
          : t("home.closeRoundMessage");
      Alert.alert(t("home.closeRoundTitle"), message, [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("home.closeRoundConfirm"),
          style: "destructive",
          onPress: async () => {
            setClosingRound(true);
            try {
              await closeOpenRounds(walkId);
              Alert.alert(
                t("home.closeRoundDoneTitle"),
                t("home.closeRoundDoneMessage")
              );
            } catch (e: any) {
              Alert.alert(t("common.errorTitle"), e?.message || "");
            } finally {
              setClosingRound(false);
            }
          },
        },
      ]);
    } catch (e: any) {
      Alert.alert(t("common.errorTitle"), e?.message || "");
    } finally {
      setClosingRound(false);
    }
  };

  const handleUnreveal = async () => {
    if (!walkId || revealing) return;
    setRevealing(true);
    try {
      await unrevealWalkResults(walkId);
    } catch (e: any) {
      Alert.alert(t("common.errorTitle"), e?.message || "");
    } finally {
      setRevealing(false);
    }
  };

  // Vänta även in walk-doc:et när ett walkId finns — annars kan en dold
  // topplista blinka fram poäng innan gaten hunnit avgöras.
  if (loading || walkLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2D7A3A" />
        <Text style={styles.loadingText}>{t("leaderboard.loading")}</Text>
      </View>
    );
  }

  // Deltagare i dolda resultat-läget före redovisning: neutral vänte-vy
  // utan poäng, placeringar eller delning. Realtidsprenumerationen på
  // walk-doc:et flippar automatiskt till full topplista vid reveal.
  if (gateActive) {
    return (
      <View style={styles.container}>
        <ContentContainer wide style={styles.contentInner}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("leaderboard.title")}</Text>
            <Text style={styles.walkTitle}>{walkTitle}</Text>
          </View>
          <View style={styles.hiddenWaitingContainer}>
            <Text style={styles.hiddenWaitingIcon}>🎭</Text>
            <Text style={styles.hiddenWaitingTitle}>
              {t("leaderboard.hiddenWaitingTitle")}
            </Text>
            <Text style={styles.hiddenWaitingMessage}>
              {t("leaderboard.hiddenWaitingMessage")}
            </Text>
            <View style={styles.hiddenWaitingCountRow}>
              <ActivityIndicator size="small" color="#F0C040" />
              <Text style={styles.hiddenWaitingCount}>
                {t("leaderboard.liveRealtime", {
                  count: allParticipants.length,
                })}
              </Text>
            </View>
          </View>
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={styles.homeButton}
              onPress={() => navigation.navigate("Home")}
              activeOpacity={0.8}
            >
              <Text style={styles.homeButtonText}>
                {t("leaderboard.backHome")}
              </Text>
            </TouchableOpacity>
          </View>
        </ContentContainer>
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
      {/* ContentContainer cappar header, banners, FlatList och bottom-bar
          till en centrerad 880 px-kolumn på surfplatta-landscape.
          Container-bakgrunden (mörkgrön) går fortfarande edge-to-edge. */}
      <ContentContainer wide style={styles.contentInner}>
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
          <Text style={styles.completeText}>
            {hidden && !revealed && isOrganizer
              ? t("leaderboard.allDoneOrganizer")
              : t("leaderboard.allDone")}
          </Text>
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
                    {typeof item.steps === "number" && item.steps > 0
                      ? `  ·  ${t("leaderboard.stepsSuffix", { count: item.steps })}`
                      : ""}
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
        ListFooterComponent={
          // Feedback-prompt + donate-knapp visas under topplistan när jag
          // har slutfört. Bra moment för "stötta projektet"-prompt — folk
          // är på gott humör direkt efter målgång. Klicket öppnar
          // /stod-sidan i webbläsaren (Swish + PayPal).
          me?.completedAt && walkId ? (
            <View>
              <WalkFeedbackPrompt walkId={walkId} sessionId={sessionId} />
              <TouchableOpacity
                style={styles.donateButton}
                onPress={() =>
                  Linking.openURL("https://tipspromenaden.app/stod")
                }
                activeOpacity={0.75}
              >
                <Text style={styles.donateButtonText}>
                  {t("leaderboard.donateCTA")}
                </Text>
                <Text style={styles.donateButtonHint}>
                  {t("leaderboard.donateHint")}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />

      {/* Bottom bar: dela-knapp (när jag har slutfört) + hem-knapp */}
      <View style={styles.bottomBar}>
        {/* Arrangörskontroller i dolda resultat-läget: primär "Redovisa"
            före reveal, diskret "Dölj igen" efter (ångra-möjlighet om
            knappen trycktes för tidigt). */}
        {hidden && isOrganizer && !revealed && (
          <TouchableOpacity
            style={[styles.revealButton, revealing && styles.shareButtonBusy]}
            onPress={handleReveal}
            disabled={revealing}
            activeOpacity={0.85}
          >
            {revealing ? (
              <ActivityIndicator size="small" color="#1B3D2B" />
            ) : (
              <Text style={styles.revealButtonText}>
                🎭 {t("leaderboard.revealButton")}
              </Text>
            )}
          </TouchableOpacity>
        )}
        {hidden && isOrganizer && revealed && (
          <TouchableOpacity
            style={styles.unrevealButton}
            onPress={handleUnreveal}
            disabled={revealing}
            activeOpacity={0.8}
          >
            <Text style={styles.unrevealButtonText}>
              {t("leaderboard.unrevealButton")}
            </Text>
          </TouchableOpacity>
        )}
        {isOrganizer && roundOpen && (
          <TouchableOpacity
            style={styles.closeRoundButton}
            onPress={handleCloseRound}
            disabled={closingRound}
            activeOpacity={0.8}
          >
            {closingRound ? (
              <ActivityIndicator size="small" color="#6B7568" />
            ) : (
              <Text style={styles.closeRoundButtonText}>
                🏁 {t("home.menuCloseRound")}
              </Text>
            )}
          </TouchableOpacity>
        )}
        {canShare && (
          <TouchableOpacity
            style={[styles.shareButton, sharing && styles.shareButtonBusy]}
            onPress={handleShare}
            disabled={sharing}
            activeOpacity={0.85}
          >
            {sharing ? (
              <ActivityIndicator size="small" color="#1B3D2B" />
            ) : (
              <Text style={styles.shareButtonText}>
                {t("leaderboard.share")}
              </Text>
            )}
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => navigation.navigate("Home")}
          activeOpacity={0.8}
        >
          <Text style={styles.homeButtonText}>{t("leaderboard.backHome")}</Text>
        </TouchableOpacity>
      </View>

      </ContentContainer>
      {/* Offscreen badge — måste finnas i view-trädet för att captureRef ska
          kunna rasterisera den. Placeras långt utanför skärmen och blockerar
          inga interaktioner. */}
      {canShare && me && (
        <View style={styles.offscreen} pointerEvents="none">
          <ShareBadge
            ref={badgeRef}
            name={me.name}
            score={me.score}
            totalQuestions={totalQuestions}
            rank={myRank}
            walkTitle={walkTitle}
            labels={{
              appName: t("leaderboard.badge.appName"),
              rankTitles: [
                t("leaderboard.badge.rank1"),
                t("leaderboard.badge.rank2"),
                t("leaderboard.badge.rank3"),
                t("leaderboard.badge.rankOther", { rank: myRank }),
              ],
              tagline: t("leaderboard.badge.tagline"),
              correct: t("leaderboard.badge.correct", {
                score: me.score,
                total: totalQuestions,
              }),
              cta: t("leaderboard.badge.cta"),
            }}
          />
        </View>
      )}
      {/* Konfetti-overlay — absolut-positionerad så den ligger ovanpå hela
          skärmen utan att förskjuta layouten. */}
      {showConfetti && <Confetti active />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1B3D2B",
  },
  contentInner: {
    flex: 1,
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

  // Donate-knapp efter min completion — diskret cream-på-mörkgrön
  // ovanför bottom-bar:n. Avsiktligt subtil så den inte stör glädjen
  // över att man nyss vunnit/slutfört.
  donateButton: {
    backgroundColor: "rgba(245,240,232,0.08)",
    borderWidth: 1,
    borderColor: "rgba(245,240,232,0.2)",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginHorizontal: 16,
    marginTop: 16,
    alignItems: "center",
  },
  donateButtonText: {
    color: "#F5F0E8",
    fontSize: 15,
    fontWeight: "600",
  },
  donateButtonHint: {
    color: "rgba(245,240,232,0.65)",
    fontSize: 12,
    marginTop: 4,
  },

  // Dolda resultat: deltagarens vänte-vy före arrangörens redovisning.
  hiddenWaitingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 12,
  },
  hiddenWaitingIcon: {
    fontSize: 48,
  },
  hiddenWaitingTitle: {
    color: "#F5F0E8",
    fontSize: 22,
    fontWeight: "800",
    textAlign: "center",
  },
  hiddenWaitingMessage: {
    color: "rgba(245,240,232,0.65)",
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
  },
  hiddenWaitingCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  hiddenWaitingCount: {
    color: "rgba(245,240,232,0.5)",
    fontSize: 13,
    fontWeight: "500",
  },
  revealButton: {
    backgroundColor: "#F0C040",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },
  revealButtonText: {
    color: "#1B3D2B",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  closeRoundButton: {
    borderWidth: 1,
    borderColor: "#D4D4D0",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  closeRoundButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7568",
  },
  unrevealButton: {
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(245,240,232,0.2)",
  },
  unrevealButtonText: {
    color: "rgba(245,240,232,0.7)",
    fontSize: 14,
    fontWeight: "600",
  },

  // Bottom
  bottomBar: {
    padding: 16,
    paddingBottom: Platform.OS === "web" ? 16 : 32,
    gap: 10,
  },
  shareButton: {
    backgroundColor: "#F0C040",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 54,
  },
  shareButtonBusy: {
    opacity: 0.7,
  },
  shareButtonText: {
    color: "#1B3D2B",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
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

  // Offscreen-container för delnings-badge:n.
  offscreen: {
    position: "absolute",
    left: -10000,
    top: 0,
  },
});
