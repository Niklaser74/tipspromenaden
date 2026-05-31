import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Walk, Answer } from "../types";
import {
  findActiveSession,
  getParticipant,
  updateParticipant,
} from "../services/firestore";
import { signInAnonymousUser } from "../services/auth";
import { auth } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import { refreshSavedWalk } from "../services/walkRefresh";
import { useTranslation } from "../i18n";
import ContentContainer from "../components/ContentContainer";

export default function JoinWalkScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { user } = useAuth();
  const { walk: initialWalk } = route.params as { walk: Walk };

  // Håll walk som state så att bakgrunds-refresh kan ersätta den med en
  // nyare version från Firestore om skaparen har ändrat något. Vi visar
  // ett "uppdaterad"-band när referensen skiljer sig från initialWalk.
  const [walk, setWalk] = useState<Walk>(initialWalk);
  const walkWasUpdated = walk !== initialWalk;

  // Förifyll bara om Google gav oss ett displayName — inte e-post-prefix.
  // Anledning: e-post-prefix (ofta "förnamn.efternamn") läcker rätt person
  // till den publika topplistan om användaren bara trycker "Starta" utan
  // att ändra. displayName är vad användaren själv valt på Google-kontot.
  const initialName =
    user && !user.isAnonymous && user.displayName ? user.displayName : "";
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const [existingSessionId, setExistingSessionId] = useState<string | null>(
    null
  );

  // Resume-state: om current uid redan är deltagare i sessionen med svar
  // men inte slutfört, växlar UI:t till "Fortsätt promenaden"-läge.
  // Vi hämtar deltagarens befintliga `answers` och `score` så att
  // ActiveWalkScreen kan hydrera state utan att börja om från fråga 1.
  // Pågående promenad = answers.length > 0 && !completedAt.
  const [resumeState, setResumeState] = useState<{
    answers: Answer[];
    score: number;
    savedName: string;
  } | null>(null);

  // Check if walk is an event and if it's within the date range
  const isEvent = !!walk.event;
  const now = new Date().toISOString().split("T")[0];
  const eventActive = isEvent
    ? now >= walk.event!.startDate && now <= walk.event!.endDate
    : true;
  const eventNotStarted = isEvent ? now < walk.event!.startDate : false;
  const eventEnded = isEvent ? now > walk.event!.endDate : false;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const session = await findActiveSession(walk.id);
        if (cancelled || !session) return;
        setExistingSessionId(session.id);

        // Resume-check: är jag redan deltagare i den här sessionen med
        // svar men inte slutförd? Kräver att auth.currentUser finns
        // (inloggade Google/Apple-användare, eller anonyma som behållit
        // sin uid sedan föregående start). Helt nya anonyma sessioner
        // har ingen uid än → ingen resume möjlig, kör fräsch start.
        const uid = auth.currentUser?.uid;
        if (uid) {
          const p = await getParticipant(session.id, uid);
          if (
            !cancelled &&
            p &&
            !p.completedAt &&
            p.answers &&
            p.answers.length > 0
          ) {
            setResumeState({
              answers: p.answers,
              score: p.score || 0,
              savedName: p.name || "",
            });
            // Visa det sparade namnet i UI:t även om det skiljer sig
            // från initialName (Google-display) — användaren ska se
            // exakt det namn som finns på topplistan.
            if (p.name) setName(p.name);
          }
        }
      } catch {
        // Offline or no session found - that's fine
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [walk.id]);

  // Bakgrunds-refresh: om skaparen har ändrat promenaden efter att
  // användaren sparade den lokalt, ladda nyaste versionen innan de
  // startar — annars svarar de på gamla frågor eller går till fel plats.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fresh = await refreshSavedWalk(initialWalk.id);
      if (!cancelled && fresh) setWalk(fresh);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialWalk.id]);

  // "Starta om från början" — visas bara i resume-läge. Bekräftar först
  // (destruktivt: ersätter befintliga answers + score på Firestore-docen
  // när användaren börjar svara igen, eftersom updateParticipant kör
  // setDoc utan merge). Vi behöver inte rensa Firestore själva — nästa
  // svar i en tom answers-array kommer att skriva över hela docen.
  const handleRestart = () => {
    Alert.alert(
      t("join.restartTitle"),
      t("join.restartMessage", {
        answered: resumeState?.answers.length ?? 0,
        score: resumeState?.score ?? 0,
      }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("join.restartConfirm"),
          style: "destructive",
          onPress: async () => {
            // Rensa lokalt först så UI:t reagerar omedelbart.
            const savedName = resumeState?.savedName || name.trim();
            setResumeState(null);

            // Rensa även Firestore-doken till noll-tillstånd direkt.
            // Annars: om användaren avbryter innan första nya svaret
            // landar, blir gamla state synligt igen vid nästa öppning
            // (resume-detektionen i useEffect ovan slår till på de
            // gamla answers + score). updateParticipant kör setDoc
            // utan merge → ersätter hela doken. Tyst try/catch eftersom
            // offline-fall hanteras av samma logik i ActiveWalkScreen
            // (första svaret efter restart skriver över oavsett).
            const uid = auth.currentUser?.uid;
            if (existingSessionId && uid) {
              try {
                await updateParticipant(
                  existingSessionId,
                  {
                    id: uid,
                    name: savedName,
                    answers: [],
                    score: 0,
                  },
                  isEvent
                );
              } catch {
                // Offline / completed session — ignorera, lokala state
                // räcker för att ge användaren en ren start.
              }
            }

            // Skicka explicit `freshStart: true` så handleStart inte
            // läser från (eventuellt-stale) resumeState i closure:n.
            handleStart({ freshStart: true });
          },
        },
      ]
    );
  };

  const handleStart = async (opts?: { freshStart?: boolean }) => {
    const freshStart = !!opts?.freshStart;
    if (!name.trim()) {
      Alert.alert(t("join.enterNameTitle"), t("join.enterNameMessage"));
      return;
    }

    if (eventNotStarted) {
      Alert.alert(
        t("join.notOpenTitle"),
        t("join.notOpenMessage", { date: walk.event!.startDate })
      );
      return;
    }

    if (eventEnded) {
      Alert.alert(
        t("join.endedTitle"),
        t("join.endedMessage"),
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("join.showLeaderboard"),
            onPress: () => {
              if (existingSessionId) {
                navigation.navigate("Leaderboard", {
                  sessionId: existingSessionId,
                  walkTitle: walk.title,
                  totalQuestions: walk.questions.length,
                  walkId: walk.id,
                  isEvent: true,
                });
              } else {
                Alert.alert(t("join.errorTitle"), t("join.noSessionError"));
              }
            },
          },
        ]
      );
      return;
    }

    setLoading(true);

    // Deltagar-ID ska vara Firebase Auth UID (används som dokument-ID i
    // subkollektionen sessions/{sid}/participants/{uid}, och Firestore-reglerna
    // kräver att auth.uid matchar det ID:t). Logga in anonymt om det behövs.
    let participantId: string | undefined = auth.currentUser?.uid;
    if (!participantId) {
      try {
        const u = await signInAnonymousUser();
        participantId = u.uid;
      } catch (e: any) {
        setLoading(false);
        Alert.alert(
          t("join.cantStartTitle"),
          e?.message || t("join.cantStartMessage")
        );
        return;
      }
    }

    navigation.navigate("ActiveWalk", {
      walk,
      participantId,
      participantName: name.trim(),
      sessionId: existingSessionId || undefined,
      // Resume-läge: skicka med befintliga svar + score så ActiveWalk
      // hydrerar state istället för att börja om. addParticipant där är
      // ändå idempotent (firestore.ts), så det är säkert att resa om
      // vid liten race med en parallell skrivning. Vid freshStart skickar
      // vi medvetet undefined → ActiveWalkScreen börjar på fråga 1 med
      // tom score, och första updateParticipant skriver över den gamla
      // Firestore-doken (setDoc utan merge).
      existingAnswers: freshStart ? undefined : resumeState?.answers,
      existingScore: freshStart ? undefined : resumeState?.score,
    });
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <ContentContainer>
        {/* Walk info card */}
        <View style={styles.walkCard}>
          <View style={styles.walkCardIcon}>
            <Text style={styles.walkEmoji}>🗺️</Text>
          </View>
          <Text style={styles.walkTitle}>{walk.title}</Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statValue}>{walk.questions.length}</Text>
              <Text style={styles.statLabel}>{t("join.controls")}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.stat}>
              <Text style={styles.statValue}>📍</Text>
              <Text style={styles.statLabel}>{t("join.gpsBased")}</Text>
            </View>
          </View>
        </View>

        {/* Uppdaterings-indikator när skaparen ändrat promenaden */}
        {walkWasUpdated && (
          <View style={styles.updatedBadge}>
            <Text style={styles.updatedEmoji}>✨</Text>
            <Text style={styles.updatedText}>{t("join.updatedNotice")}</Text>
          </View>
        )}

        {/* Event badge */}
        {walk.event && (
          <View
            style={[
              styles.eventBadge,
              eventNotStarted && styles.eventNotStarted,
              eventEnded && styles.eventEnded,
            ]}
          >
            <Text style={styles.eventEmoji}>
              {eventNotStarted ? "🔒" : eventEnded ? "🏁" : "📅"}
            </Text>
            <Text
              style={[
                styles.eventText,
                eventNotStarted && styles.eventTextMuted,
                eventEnded && styles.eventTextMuted,
              ]}
            >
              {eventNotStarted
                ? t("join.opensAt", { date: walk.event.startDate })
                : eventEnded
                ? t("join.endedAt", { date: walk.event.endDate })
                : t("join.dateRange", { start: walk.event.startDate, end: walk.event.endDate })}
            </Text>
          </View>
        )}

        {/* Resume-banner: visas när användaren har en pågående promenad
            i den här sessionen. Ersätter "session aktiv"-badgen — bägge
            samtidigt är överflödigt och tar fokus från Fortsätt-knappen. */}
        {resumeState ? (
          <View style={styles.resumeBadge}>
            <Text style={styles.resumeEmoji}>⏯️</Text>
            <Text style={styles.resumeText}>
              {t("join.resumeBanner", {
                answered: resumeState.answers.length,
                total: walk.questions.length,
              })}
            </Text>
          </View>
        ) : (
          existingSessionId && (
            <View style={styles.sessionBadge}>
              <View style={styles.sessionDot} />
              <Text style={styles.sessionText}>{t("join.sessionActive")}</Text>
            </View>
          )
        )}

        {/* Name input */}
        <View style={styles.inputSection}>
          <Text style={styles.inputLabel}>{t("join.nameLabel")}</Text>
          <TextInput
            style={styles.nameInput}
            placeholder={t("join.namePlaceholder")}
            placeholderTextColor="#B0BAB2"
            value={name}
            onChangeText={setName}
            // Fokusera automatiskt bara om fältet är tomt (dvs inte inloggad
            // med displayName). Annars är det irriterande att tangentbordet
            // dyker upp när namnet redan är korrekt förifyllt.
            autoFocus={!initialName}
            returnKeyType="go"
            onSubmitEditing={() => handleStart()}
          />
          <Text style={styles.privacyHint}>{t("join.privacyHint")}</Text>
        </View>

        {/* Start button */}
        <TouchableOpacity
          style={[
            styles.startButton,
            (!eventActive || loading) && styles.startButtonDisabled,
          ]}
          onPress={() => handleStart()}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#F5F0E8" />
          ) : (
            <Text style={styles.startButtonText}>
              {eventNotStarted
                ? t("join.notOpenButton")
                : eventEnded
                ? t("join.showLeaderboard")
                : resumeState
                ? t("join.resumeButton")
                : t("join.startButton")}
            </Text>
          )}
        </TouchableOpacity>

        {/* Sekundärknapp "Starta om från början" — visas bara i resume-
            läge, inte vid första-gångs-start. Diskret stil (text-only)
            så den inte konkurrerar med Fortsätt-knappen visuellt. */}
        {resumeState && !eventNotStarted && !eventEnded && (
          <TouchableOpacity
            style={styles.restartButton}
            onPress={handleRestart}
            disabled={loading}
            activeOpacity={0.7}
          >
            <Text style={styles.restartButtonText}>
              {t("join.restartButton")}
            </Text>
          </TouchableOpacity>
        )}

        {!eventNotStarted && !eventEnded && (
          <Text style={styles.hint}>{t("join.gpsHint")}</Text>
        )}
        </ContentContainer>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F0E8",
  },
  content: {
    flexGrow: 1,
    padding: 24,
    justifyContent: "center",
  },

  // Walk card
  walkCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F0F0EC",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 4px 16px rgba(0,0,0,0.08)" },
    }),
  },
  walkCardIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#E8F0E0",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  walkEmoji: {
    fontSize: 28,
  },
  walkTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#2C3E2D",
    textAlign: "center",
    marginBottom: 16,
    letterSpacing: -0.3,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  stat: {
    alignItems: "center",
    paddingHorizontal: 20,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2C3E2D",
  },
  statLabel: {
    fontSize: 12,
    color: "#8A9A8D",
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: "#E8E8E4",
  },

  // Updated badge — visas när bakgrunds-refresh hittat en nyare version
  updatedBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E8F5E9",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "#C8E6C9",
  },
  updatedEmoji: {
    fontSize: 18,
  },
  updatedText: {
    color: "#1B6B35",
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },

  // Event badge
  eventBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF8E1",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    gap: 10,
  },
  eventNotStarted: {
    backgroundColor: "#F5F5F5",
  },
  eventEnded: {
    backgroundColor: "#FBE9E7",
  },
  eventEmoji: {
    fontSize: 18,
  },
  eventText: {
    color: "#E8B830",
    fontWeight: "600",
    fontSize: 14,
    flex: 1,
  },
  eventTextMuted: {
    color: "#8A9A8D",
  },

  // Resume badge — visas när det finns en pågående promenad att fortsätta
  resumeBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF4E5",
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    gap: 10,
    borderWidth: 1,
    borderColor: "#FFD8A8",
  },
  resumeEmoji: {
    fontSize: 20,
  },
  resumeText: {
    color: "#8C5A1A",
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
  },

  // Session badge
  sessionBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E3F2FD",
    padding: 12,
    borderRadius: 12,
    marginBottom: 12,
    gap: 10,
  },
  sessionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2874A6",
  },
  sessionText: {
    color: "#2874A6",
    fontSize: 13,
    flex: 1,
  },

  // Input
  inputSection: {
    marginBottom: 20,
    marginTop: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2C3E2D",
    marginBottom: 8,
  },
  privacyHint: {
    fontSize: 12,
    color: "#8A9A8D",
    marginTop: 6,
    fontStyle: "italic",
  },
  nameInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E8E8E4",
    borderRadius: 14,
    padding: 16,
    fontSize: 17,
    color: "#2C3E2D",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 4,
      },
      android: { elevation: 1 },
      web: { boxShadow: "0px 1px 4px rgba(0,0,0,0.04)" },
    }),
  },

  // Start button
  startButton: {
    backgroundColor: "#1B6B35",
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#1B6B35",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
      },
      android: { elevation: 6 },
      web: { boxShadow: "0px 4px 8px rgba(27,107,53,0.3)" },
    }),
  },
  startButtonDisabled: {
    opacity: 0.5,
  },
  startButtonText: {
    color: "#F5F0E8",
    fontSize: 18,
    fontWeight: "700",
  },

  // Restart-knapp — text-only, diskret färg så Fortsätt-knappen behåller
  // visuell tyngd. Större tap-yta (paddingVertical 14) för att vara
  // bekväm utan att dra blicken till sig.
  restartButton: {
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  restartButtonText: {
    color: "#8C5A1A",
    fontSize: 15,
    fontWeight: "600",
  },

  // Hint
  hint: {
    textAlign: "center",
    color: "#B0BAB2",
    fontSize: 13,
    marginTop: 14,
  },
});
