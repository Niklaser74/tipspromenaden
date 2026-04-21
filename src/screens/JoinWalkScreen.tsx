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
import { Walk } from "../types";
import { findActiveSession } from "../services/firestore";
import { signInAnonymousUser } from "../services/auth";
import { auth } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import { refreshSavedWalk } from "../services/walkRefresh";
import { useTranslation } from "../i18n";

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

  // Förifyll med användarens namn om inloggad (inte anonymt). Anonymt
  // konto har sällan ett meningsfullt displayName, så då lämnar vi tomt.
  const initialName =
    user && !user.isAnonymous
      ? user.displayName || user.email?.split("@")[0] || ""
      : "";
  const [name, setName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const [existingSessionId, setExistingSessionId] = useState<string | null>(
    null
  );

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
        if (!cancelled && session) setExistingSessionId(session.id);
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

  const handleStart = async () => {
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

        {/* Session indicator */}
        {existingSessionId && (
          <View style={styles.sessionBadge}>
            <View style={styles.sessionDot} />
            <Text style={styles.sessionText}>{t("join.sessionActive")}</Text>
          </View>
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
            onSubmitEditing={handleStart}
          />
        </View>

        {/* Start button */}
        <TouchableOpacity
          style={[
            styles.startButton,
            (!eventActive || loading) && styles.startButtonDisabled,
          ]}
          onPress={handleStart}
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
                : t("join.startButton")}
            </Text>
          )}
        </TouchableOpacity>

        {!eventNotStarted && !eventEnded && (
          <Text style={styles.hint}>{t("join.gpsHint")}</Text>
        )}
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

  // Hint
  hint: {
    textAlign: "center",
    color: "#B0BAB2",
    fontSize: 13,
    marginTop: 14,
  },
});
