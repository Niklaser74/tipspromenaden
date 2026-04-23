import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  Platform,
  Image,
} from "react-native";
import * as Speech from "expo-speech";
import MapView, { Marker, Circle } from "../components/MapViewWeb";
import { useRoute, useNavigation } from "@react-navigation/native";
import { watchPosition, getDistanceInMeters, AccuracyTier } from "../utils/location";
import {
  createSession,
  addParticipant,
  updateParticipant,
} from "../services/firestore";
import { savePendingSync } from "../services/storage";
import { recordWalkCompletion } from "../services/stats";
import { Walk, Question, Answer, Participant, Session } from "../types";
import { generateId } from "../utils/qr";
import { useTranslation } from "../i18n";

const TRIGGER_DISTANCE_METERS = 15;

export default function ActiveWalkScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { t, locale } = useTranslation();
  const {
    walk,
    participantId,
    participantName,
    sessionId: existingSessionId,
  } = route.params as {
    walk: Walk;
    participantId: string;
    participantName: string;
    sessionId?: string;
  };

  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(new Set());
  const [sessionId, setSessionId] = useState<string | null>(
    existingSessionId || null
  );
  const [isOnline, setIsOnline] = useState(true);

  // Distance to nearest unanswered control
  const [nearestDistance, setNearestDistance] = useState<number | null>(null);
  const [nearestQuestion, setNearestQuestion] = useState<Question | null>(null);

  // Fråga som triggas av närheten
  const [activeQuestion, setActiveQuestion] = useState<Question | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // TTS: autospela frågetexten när en ny fråga öppnas (bra för cykel + headset).
  // Slås av genom att trycka på mute-knappen i modalen.
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<{
    correct: boolean;
    correctAnswer: string;
  } | null>(null);

  // GPS noggrannhetsnivå styrs av kartans zoomnivå:
  // inzoomad (latitudeDelta ≤ 0.02) → precise, utzoomad → battery.
  const [accuracyTier, setAccuracyTier] = useState<AccuracyTier>("precise");

  // Refs for GPS callback to access latest state
  const answeredIdsRef = useRef(answeredIds);
  answeredIdsRef.current = answeredIds;
  const modalVisibleRef = useRef(modalVisible);
  modalVisibleRef.current = modalVisible;

  // Skapa eller anslut till session vid start
  useEffect(() => {
    (async () => {
      try {
        let sid = existingSessionId;

        if (!sid) {
          sid = generateId();
          const session: Session = {
            id: sid,
            walkId: walk.id,
            participants: [],
            status: "active",
            createdAt: Date.now(),
          };
          await createSession(session);
        }

        setSessionId(sid);

        const participant: Participant = {
          id: participantId,
          name: participantName,
          answers: [],
          score: 0,
        };
        await addParticipant(sid, participant);
        setIsOnline(true);
      } catch (e: any) {
        console.log("Session-fel (offline-läge):", e.message);
        setIsOnline(false);
        if (!existingSessionId) {
          setSessionId(generateId());
        }
      }
    })();
  }, []);

  // Stabil GPS-callback — använder refs för föränderlig state så att
  // callbacken inte behöver bytas ut vid varje render.
  const handleGpsLocation = useCallback(
    (loc: { coords: { latitude: number; longitude: number } }) => {
      const lat = loc.coords.latitude;
      const lng = loc.coords.longitude;
      setUserLat(lat);
      setUserLng(lng);

      let minDist = Infinity;
      let closest: Question | null = null;

      for (const question of walk.questions) {
        if (answeredIdsRef.current.has(question.id)) continue;

        const dist = getDistanceInMeters(
          lat,
          lng,
          question.coordinate.latitude,
          question.coordinate.longitude
        );

        if (dist < minDist) {
          minDist = dist;
          closest = question;
        }

        if (dist <= TRIGGER_DISTANCE_METERS && !modalVisibleRef.current) {
          setActiveQuestion(question);
          setSelectedAnswer(null);
          setAnswerFeedback(null);
          setModalVisible(true);
        }
      }

      setNearestDistance(minDist === Infinity ? null : Math.round(minDist));
      setNearestQuestion(closest);
    },
    [walk.questions] // walk är stabilt under hela promenaden
  );

  // GPS-bevakning — återprenumererar när zoomnivån ändrar noggrannhetsnivå.
  // Korta glapp vid byte (~50–100 ms) är acceptabla eftersom den gamla
  // prenumerationen tas bort i cleanup och en ny skapas direkt efter.
  useEffect(() => {
    let subscription: any;

    (async () => {
      try {
        subscription = await watchPosition(handleGpsLocation, accuracyTier);
      } catch (e: any) {
        Alert.alert(t("active.gpsError"), e.message);
      }
    })();

    return () => {
      if (subscription) subscription.remove();
    };
  }, [accuracyTier, handleGpsLocation]);

  // Uppdatera noggrannhetsnivå när användaren zoomar kartan.
  // latitudeDelta > 0.02 (~2 km vy) = översikt → spara batteri.
  // latitudeDelta ≤ 0.02 = inzoomad, letar kontroll → maxnoggrannhet.
  const handleRegionChange = useCallback(
    (region: { latitudeDelta: number }) => {
      const tier: AccuracyTier = region.latitudeDelta > 0.02 ? "battery" : "precise";
      setAccuracyTier((prev) => (prev === tier ? prev : tier));
    },
    []
  );

  /**
   * Läser upp frågetexten + svarsalternativen på svenska via TTS.
   * Routas automatiskt till Bluetooth-headset om anslutet.
   */
  const speakQuestion = useCallback((q: Question) => {
    Speech.stop();
    const optionList = q.options
      .map((o, i) => t("active.speakOption", { index: i + 1, option: o }))
      .join(". ");
    const text = `${q.text}. ${optionList}.`;
    setIsSpeaking(true);
    Speech.speak(text, {
      language: locale === "sv" ? "sv-SE" : "en-US",
      rate: 0.95,
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  }, [locale, t]);

  /** Pausar pågående uppläsning. */
  const stopSpeaking = useCallback(() => {
    Speech.stop();
    setIsSpeaking(false);
  }, []);

  // Autospela frågan när den öppnas (om autoSpeak är på).
  useEffect(() => {
    if (modalVisible && activeQuestion && autoSpeak) {
      speakQuestion(activeQuestion);
    }
    // Stoppa när modalen stängs eller frågan byts.
    return () => {
      Speech.stop();
      setIsSpeaking(false);
    };
  }, [modalVisible, activeQuestion?.id, autoSpeak, speakQuestion]);

  const handleAnswer = useCallback(
    async (selectedIndex: number) => {
      if (!activeQuestion) return;

      const correct = selectedIndex === activeQuestion.correctOptionIndex;

      // Stoppa ev. pågående TTS så användaren inte hör alternativ efter val
      Speech.stop();
      setIsSpeaking(false);

      setSelectedAnswer(selectedIndex);
      setAnswerFeedback({
        correct,
        correctAnswer: activeQuestion.options[activeQuestion.correctOptionIndex],
      });

      setTimeout(async () => {
        const answer: Answer = {
          questionId: activeQuestion.id,
          selectedOptionIndex: selectedIndex,
          correct,
          answeredAt: Date.now(),
        };

        const newAnswers = [...answers, answer];
        const newAnsweredIds = new Set(answeredIds);
        newAnsweredIds.add(activeQuestion.id);
        const newScore = newAnswers.filter((a) => a.correct).length;

        setAnswers(newAnswers);
        setAnsweredIds(newAnsweredIds);
        setModalVisible(false);
        setActiveQuestion(null);
        setSelectedAnswer(null);
        setAnswerFeedback(null);

        const isComplete = newAnsweredIds.size === walk.questions.length;
        const updatedParticipant: Participant = {
          id: participantId,
          name: participantName,
          answers: newAnswers,
          score: newScore,
          completedAt: isComplete ? Date.now() : undefined,
        };

        if (sessionId) {
          try {
            await updateParticipant(sessionId, updatedParticipant);
          } catch (e) {
            console.log("Kunde inte synka (sparar offline):", e);
            await savePendingSync({
              sessionId,
              participantId,
              participantName,
              walkId: walk.id,
              answers: newAnswers,
              score: newScore,
              completedAt: isComplete ? Date.now() : undefined,
              timestamp: Date.now(),
            });
          }
        }

        if (isComplete) {
          // Bokför stats lokalt — gör det innan navigering så att
          // StatsScreen visar uppdaterade värden om användaren öppnar
          // den direkt efter. Fel sväljs: stats är inte affärskritiskt.
          recordWalkCompletion(
            walk.id,
            walk.title,
            newScore,
            walk.questions.length
          ).catch(() => {});

          setTimeout(() => {
            if (sessionId) {
              navigation.navigate("Leaderboard", {
                sessionId,
                walkTitle: walk.title,
                totalQuestions: walk.questions.length,
                participantId,
                walkId: walk.id,
                isEvent: !!walk.event,
              });
            } else {
              navigation.navigate("Results", {
                walk,
                participantName,
                answers: newAnswers,
                score: newScore,
                total: walk.questions.length,
              });
            }
          }, 500);
        }
      }, 1500);
    },
    [
      activeQuestion,
      answers,
      answeredIds,
      sessionId,
      participantId,
      participantName,
      walk,
      navigation,
    ]
  );

  const score = answers.filter((a) => a.correct).length;
  const progress = answeredIds.size;
  const total = walk.questions.length;

  const getInitialRegion = () => {
    if (userLat && userLng) {
      return {
        latitude: userLat,
        longitude: userLng,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };
    }
    if (walk.questions.length > 0) {
      const q = walk.questions[0];
      return {
        latitude: q.coordinate.latitude,
        longitude: q.coordinate.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      };
    }
    return undefined;
  };

  return (
    <View style={styles.container}>
      {/* Full-screen map */}
      <MapView
        style={styles.map}
        showsUserLocation
        followsUserLocation
        initialRegion={getInitialRegion()}
        onRegionChangeComplete={
          Platform.OS !== "web" ? handleRegionChange : undefined
        }
      >
        {walk.questions.map((q, idx) => {
          const isDone = answeredIds.has(q.id);
          const isNearest = nearestQuestion?.id === q.id;
          return (
            <React.Fragment key={q.id}>
              <Marker
                coordinate={q.coordinate}
                opacity={isDone ? 0.4 : 1}
              >
                <View style={styles.markerContainer}>
                  <View
                    style={[
                      styles.marker,
                      isDone && styles.markerDone,
                      isNearest && !isDone && styles.markerNearest,
                    ]}
                  >
                    <Text style={styles.markerText}>
                      {isDone ? "\u2713" : idx + 1}
                    </Text>
                  </View>
                </View>
              </Marker>
              {!isDone && (
                <Circle
                  center={q.coordinate}
                  radius={TRIGGER_DISTANCE_METERS}
                  strokeColor="rgba(229,57,53,0.5)"
                  fillColor="rgba(229,57,53,0.1)"
                />
              )}
            </React.Fragment>
          );
        })}
      </MapView>

      {/* Top overlay - status bar */}
      <View style={styles.topOverlay}>
        <View style={styles.statusPill}>
          <View style={styles.statusLeft}>
            <Text style={styles.statusName}>{participantName}</Text>
            {!isOnline && (
              <View style={styles.offlineBadge}>
                <Text style={styles.offlineText}>{t("active.offline")}</Text>
              </View>
            )}
          </View>
          <View style={styles.scorePill}>
            <Text style={styles.scoreText}>{score} {t("active.points")}</Text>
          </View>
        </View>
      </View>

      {/* Distance indicator - floating pill */}
      <View style={styles.distancePill}>
        {nearestDistance !== null && nearestQuestion ? (
          <Text style={styles.distanceText}>
            {nearestDistance <= 30 && nearestDistance > TRIGGER_DISTANCE_METERS
              ? "📍 "
              : ""}
            {t("active.distanceToControl", {
              distance:
                nearestDistance > 1000
                  ? `${(nearestDistance / 1000).toFixed(1)} km`
                  : `${nearestDistance} m`,
              order: nearestQuestion.order,
            })}
            {nearestDistance <= 30 && nearestDistance > TRIGGER_DISTANCE_METERS
              ? t("active.almostThere")
              : ""}
          </Text>
        ) : progress === total ? (
          <Text style={styles.distanceTextDone}>{t("active.allDoneBanner")}</Text>
        ) : (
          <Text style={styles.distanceText}>{t("active.waitingGPS")}</Text>
        )}
      </View>

      {/* Bottom progress */}
      <View style={styles.bottomBar}>
        <View style={styles.progressInfo}>
          <Text style={styles.progressText}>
            {t("active.progressOf", { progress, total })}
          </Text>
          <Text style={styles.progressLabel}>{t("active.controlsLabel")}</Text>
        </View>
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${total > 0 ? (progress / total) * 100 : 0}%` },
              ]}
            />
          </View>
        </View>
        <View style={styles.controlDots}>
          {walk.questions.map((q, idx) => (
            <View
              key={q.id}
              style={[
                styles.controlDot,
                answeredIds.has(q.id) && styles.controlDotDone,
                nearestQuestion?.id === q.id &&
                  !answeredIds.has(q.id) &&
                  styles.controlDotNearest,
              ]}
            >
              <Text
                style={[
                  styles.controlDotText,
                  answeredIds.has(q.id) && styles.controlDotTextDone,
                ]}
              >
                {answeredIds.has(q.id) ? "✓" : idx + 1}
              </Text>
            </View>
          ))}
        </View>
      </View>

      {/* Question modal */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <View style={styles.modalHandle} />

            <View style={styles.questionHeader}>
              <View style={styles.questionBadge}>
                <Text style={styles.questionBadgeText}>
                  {t("create.controlLabel", { order: activeQuestion?.order })}
                </Text>
              </View>
              <View style={styles.questionHeaderActions}>
                <TouchableOpacity
                  onPress={() =>
                    isSpeaking
                      ? stopSpeaking()
                      : activeQuestion && speakQuestion(activeQuestion)
                  }
                  style={[
                    styles.iconButton,
                    isSpeaking && styles.iconButtonActive,
                  ]}
                  accessibilityLabel={
                    isSpeaking ? t("active.stopSpeakLabel") : t("active.startSpeakLabel")
                  }
                  activeOpacity={0.7}
                >
                  <Text style={styles.iconButtonText}>
                    {isSpeaking ? "⏸" : "🔊"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setAutoSpeak((v) => !v)}
                  style={[
                    styles.iconButton,
                    autoSpeak && styles.iconButtonActive,
                  ]}
                  accessibilityLabel={
                    autoSpeak
                      ? t("active.autoSpeakOffLabel")
                      : t("active.autoSpeakOnLabel")
                  }
                  activeOpacity={0.7}
                >
                  <Text style={styles.iconButtonText}>
                    {autoSpeak ? "🎧" : "🔇"}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {activeQuestion?.imageUrl && (
              <Image
                source={{ uri: activeQuestion.imageUrl }}
                style={styles.questionImage}
                resizeMode="cover"
              />
            )}

            <Text style={styles.questionText}>{activeQuestion?.text}</Text>

            {activeQuestion?.options.map((option, idx) => {
              const isSelected = selectedAnswer === idx;
              const showCorrect =
                answerFeedback &&
                idx === activeQuestion.correctOptionIndex;
              const showWrong =
                answerFeedback &&
                isSelected &&
                !answerFeedback.correct;

              return (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.optionButton,
                    showCorrect && styles.optionCorrect,
                    showWrong && styles.optionWrong,
                  ]}
                  onPress={() => handleAnswer(idx)}
                  disabled={selectedAnswer !== null}
                  activeOpacity={0.7}
                >
                  <View style={styles.optionInner}>
                    <View
                      style={[
                        styles.optionDot,
                        showCorrect && styles.optionDotCorrect,
                        showWrong && styles.optionDotWrong,
                      ]}
                    >
                      {showCorrect && (
                        <Text style={styles.optionDotIcon}>✓</Text>
                      )}
                      {showWrong && (
                        <Text style={styles.optionDotIcon}>✗</Text>
                      )}
                    </View>
                    <Text
                      style={[
                        styles.optionText,
                        (showCorrect || showWrong) &&
                          styles.optionTextHighlight,
                      ]}
                    >
                      {option}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}

            {answerFeedback && (
              <View
                style={[
                  styles.feedbackBanner,
                  answerFeedback.correct
                    ? styles.feedbackCorrect
                    : styles.feedbackWrong,
                ]}
              >
                <Text style={styles.feedbackEmoji}>
                  {answerFeedback.correct ? "🎉" : "😔"}
                </Text>
                <Text
                  style={[
                    styles.feedbackText,
                    answerFeedback.correct
                      ? styles.feedbackTextCorrect
                      : styles.feedbackTextWrong,
                  ]}
                >
                  {answerFeedback.correct
                    ? t("active.correctAnswerSimple")
                    : t("active.correctAnswerWith", { answer: answerFeedback.correctAnswer })}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F0E8",
  },
  map: {
    flex: 1,
  },

  // Markers
  markerContainer: {
    alignItems: "center",
  },
  marker: {
    backgroundColor: "#E53935",
    width: 34,
    height: 34,
    borderRadius: 17,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 2px 4px rgba(0,0,0,0.2)" },
    }),
  },
  markerDone: {
    backgroundColor: "#2D7A3A",
  },
  markerNearest: {
    backgroundColor: "#E53935",
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: "#FFFFFF",
  },
  markerText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },

  // Top overlay
  topOverlay: {
    position: "absolute",
    top: Platform.OS === "web" ? 16 : 56,
    left: 16,
    right: 16,
  },
  statusPill: {
    backgroundColor: "rgba(27,107,53,0.92)",
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: { elevation: 8 },
      web: { boxShadow: "0px 4px 12px rgba(0,0,0,0.2)" },
    }),
  },
  statusLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusName: {
    color: "#F5F0E8",
    fontSize: 15,
    fontWeight: "600",
  },
  offlineBadge: {
    backgroundColor: "rgba(211,47,47,0.2)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  offlineText: {
    color: "#FF6B6B",
    fontSize: 10,
    fontWeight: "700",
  },
  scorePill: {
    backgroundColor: "rgba(250,250,248,0.15)",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
  },
  scoreText: {
    color: "#E8B830",
    fontSize: 15,
    fontWeight: "700",
  },

  // Distance pill
  distancePill: {
    position: "absolute",
    top: Platform.OS === "web" ? 80 : 120,
    alignSelf: "center",
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 24,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.1)" },
    }),
  },
  distanceText: {
    color: "#2C3E2D",
    fontSize: 14,
    fontWeight: "600",
  },
  distanceTextDone: {
    color: "#E8B830",
    fontSize: 14,
    fontWeight: "700",
  },

  // Bottom bar
  bottomBar: {
    backgroundColor: "rgba(27,107,53,0.95)",
    paddingVertical: 14,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "web" ? 14 : 28,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  progressInfo: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    marginBottom: 8,
    gap: 4,
  },
  progressText: {
    color: "#F5F0E8",
    fontSize: 18,
    fontWeight: "700",
  },
  progressLabel: {
    color: "rgba(250,250,248,0.6)",
    fontSize: 14,
  },
  progressBarContainer: {
    marginBottom: 10,
  },
  progressBar: {
    height: 4,
    backgroundColor: "rgba(250,250,248,0.15)",
    borderRadius: 2,
  },
  progressFill: {
    height: 4,
    backgroundColor: "#E8B830",
    borderRadius: 2,
  },
  controlDots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  controlDot: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "rgba(250,250,248,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  controlDotDone: {
    backgroundColor: "#2D7A3A",
  },
  controlDotNearest: {
    backgroundColor: "#E8B830",
  },
  controlDotText: {
    color: "rgba(250,250,248,0.5)",
    fontSize: 12,
    fontWeight: "700",
  },
  controlDotTextDone: {
    color: "#F5F0E8",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modal: {
    backgroundColor: "#F5F0E8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D4D4D0",
    alignSelf: "center",
    marginBottom: 20,
  },
  questionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  questionBadge: {
    alignSelf: "flex-start",
    backgroundColor: "#E8F0E0",
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
  },
  questionBadgeText: {
    color: "#2D7A3A",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  questionText: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2C3E2D",
    marginBottom: 24,
    lineHeight: 30,
  },
  questionHeaderActions: {
    flexDirection: "row",
    gap: 8,
    marginLeft: "auto",
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F0F4F0",
    justifyContent: "center",
    alignItems: "center",
  },
  iconButtonActive: {
    backgroundColor: "#2D7A3A",
  },
  iconButtonText: {
    fontSize: 18,
  },
  questionImage: {
    width: "100%",
    height: 200,
    borderRadius: 12,
    marginBottom: 16,
    backgroundColor: "#F0F0EC",
  },
  optionButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E8E8E4",
    borderRadius: 14,
    marginBottom: 10,
  },
  optionCorrect: {
    backgroundColor: "#E8F0E0",
    borderColor: "#2D7A3A",
    borderWidth: 2,
  },
  optionWrong: {
    backgroundColor: "#FBE9E7",
    borderColor: "#D32F2F",
    borderWidth: 2,
  },
  optionInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  optionDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F0F0EC",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 14,
  },
  optionDotCorrect: {
    backgroundColor: "#2D7A3A",
  },
  optionDotWrong: {
    backgroundColor: "#D32F2F",
  },
  optionDotIcon: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 14,
  },
  optionText: {
    fontSize: 16,
    color: "#2C3E2D",
    flex: 1,
  },
  optionTextHighlight: {
    fontWeight: "700",
  },
  feedbackBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    marginTop: 8,
    gap: 10,
  },
  feedbackCorrect: {
    backgroundColor: "#E8F0E0",
  },
  feedbackWrong: {
    backgroundColor: "#FBE9E7",
  },
  feedbackEmoji: {
    fontSize: 24,
  },
  feedbackText: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  feedbackTextCorrect: {
    color: "#2D7A3A",
  },
  feedbackTextWrong: {
    color: "#D32F2F",
  },
});
