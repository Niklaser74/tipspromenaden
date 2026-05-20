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
  Vibration,
} from "react-native";
import * as Speech from "expo-speech";
import { useKeepAwake } from "expo-keep-awake";
import MapView, { Marker, Circle, Polyline } from "../components/MapViewWeb";
import MapTypeToggle from "../components/MapTypeToggle";
import MapAttribution from "../components/MapAttribution";
import { useMapType } from "../hooks/useMapType";
import { useRoute, useNavigation } from "@react-navigation/native";
import { watchPosition, getDistanceInMeters, AccuracyTier } from "../utils/location";
import {
  createSession,
  addParticipant,
  updateParticipant,
} from "../services/firestore";
import { savePendingSync } from "../services/storage";
import { recordWalkCompletion } from "../services/stats";
import {
  feedbackCorrect,
  feedbackWrong,
  feedbackComplete,
  feedbackArrival,
} from "../services/feedback";
import { Walk, Question, Answer, Participant, Session } from "../types";
import { generateId } from "../utils/qr";
import { usePedometer } from "../hooks/usePedometer";
import { useOnlineStatus } from "../hooks/useOnlineStatus";
import { useTranslation } from "../i18n";
import { getActivityConfig } from "../constants/activityType";

export default function ActiveWalkScreen() {
  // Skärmen ska aldrig släckas under aktiv promenad. Tre skäl:
  //   1. Karta + GPS är centrala — skärm-på är förväntat under promenaden
  //   2. När skärmen släcks fryser Android JS-tråden (Doze) efter någon
  //      minut → GPS-bevakning stoppas → vibration när man kommer i
  //      frågezonen triggas inte → man går förbi kontrollen
  //   3. Wake-locket släpps automatiskt när screen unmountar (när
  //      användaren navigerar bort eller appen stängs)
  // Batterikostnad accepteras — promenader är timmar, inte dagar.
  useKeepAwake();

  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { t, locale } = useTranslation();
  const {
    walk,
    participantId,
    participantName,
    sessionId: existingSessionId,
    existingAnswers,
    existingScore,
  } = route.params as {
    walk: Walk;
    participantId: string;
    participantName: string;
    sessionId?: string;
    // Resume-läge: JoinWalkScreen detekterade att uid:t redan är deltagare
    // i sessionen med oavslutade svar. Hydrera state istället för att
    // börja om från fråga 1. addParticipant nedan är idempotent → säkert
    // att kalla även när deltagaren redan finns.
    existingAnswers?: Answer[];
    existingScore?: number;
  };

  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLng, setUserLng] = useState<number | null>(null);
  // Hydrera answers + answeredIds från resume-state. Vid kall-start är
  // bägge tomma; vid fortsätt får vi tillbaka svarslistan från Firestore.
  // Notera: svaren är index-baserade mot frågans `options`, så om
  // skaparen har ändrat frågordningen (questions reorderade) sedan
  // sessionsstart blir hydratiseringen fel. JoinWalkScreen kör redan
  // refreshSavedWalk INNAN den hittar resume-state, men om skaparen
  // ändrat efter det får vi leva med en mindre risk för fel-mapping
  // tills #7 (.tipswalk-formatet) ger stabila question-ID:n.
  const [answers, setAnswers] = useState<Answer[]>(existingAnswers || []);
  const [answeredIds, setAnsweredIds] = useState<Set<string>>(
    () => new Set((existingAnswers || []).map((a) => a.questionId))
  );
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
  // Default AV — tystast möjligt i naturen är default; användaren slår på
  // när hen vill via 🔇/🎧-knappen i modalen. Tidigare default var PÅ
  // vilket överraskade folk som öppnade frågan på fika eller i sällskap.
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<{
    correct: boolean;
    correctAnswer: string;
  } | null>(null);

  // GPS noggrannhetsnivå styrs av kartans zoomnivå:
  // inzoomad (latitudeDelta ≤ 0.02) → precise, utzoomad → battery.
  const [accuracyTier, setAccuracyTier] = useState<AccuracyTier>("precise");

  // Karttyp (standard/hybrid/terrain), persisterad mellan sessioner.
  const { mapType, cycleMapType } = useMapType();

  // Live NetInfo-status (skild från `isOnline` ovan som speglar Firestore-
  // sessionen). Styr `offline` på kartan: utan nät läses terräng-tiles ur
  // disk-cachen i stället för att bli grå.
  const networkOnline = useOnlineStatus();

  // Karta-följer-användaren. Default på — kartan animerar mjukt till
  // användarens nya position vid varje GPS-tick (behåller zoomnivå).
  // När användaren pannar manuellt (onPanDrag) stängs detta av tillfälligt
  // så de kan kolla rutten framåt utan att kartan rycker tillbaka. 🎯-
  // knappen återupptar följningen.
  const mapRef = useRef<any>(null);
  const [followUser, setFollowUser] = useState(true);
  const followUserRef = useRef(followUser);
  followUserRef.current = followUser;

  // Stegräkning — startar när vi har en session och stannar när vi unmountar.
  // Värdet sparas på Participant vid varje answer-update så att Results,
  // Leaderboard och Insights kan visa det. På enheter utan sensor eller
  // utan permission blir det `undefined` och fältet utelämnas tyst.
  const [pedometerEnabled, setPedometerEnabled] = useState(false);
  const { steps, available: stepsAvailable } = usePedometer(pedometerEnabled);

  // Refs for GPS callback to access latest state
  const answeredIdsRef = useRef(answeredIds);
  answeredIdsRef.current = answeredIds;
  const modalVisibleRef = useRef(modalVisible);
  modalVisibleRef.current = modalVisible;

  // Aktivitetstyp-konfiguration — styr trigger-tröskel, approaching-distans
  // och initial kartzoom. Walk = snäv tröskel (15 m), bike = bredare (50 m)
  // plus förvarning vid 100 m. Stabilt under hela promenaden.
  const activityConfig = getActivityConfig(walk);
  const TRIGGER_DISTANCE_METERS = activityConfig.triggerDistanceMeters;
  const APPROACHING_DISTANCE_METERS = activityConfig.approachingDistanceMeters;

  // Spårar vilka kontrollpunkter vi redan har "närmar dig"-vibrerat för,
  // så att vi inte vibrerar varje GPS-tick när användaren befinner sig
  // i approaching-zonen. Reset:as när kontrollen blir besvarad.
  const approachingNotifiedRef = useRef<Set<string>>(new Set());

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
        // Aktivera stegräknaren när session är på plats — då börjar
        // räkningen tickas så vi har totalsumman för promenaden.
        setPedometerEnabled(true);
      } catch (e: any) {
        console.log("Session-fel (offline-läge):", e.message);
        setIsOnline(false);
        if (!existingSessionId) {
          setSessionId(generateId());
        }
        // Stegräknaren ska köra även offline — sparas via savePendingSync
        // i samma payload som svaren.
        setPedometerEnabled(true);
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

      // Auto-centrera kartan på användaren när följning är på. Behåller
      // zoomnivå (animateCamera utan zoom-fält rör inte den) så batteri-
      // tier-logiken inte påverkas. Tystar ev. exceptions från native-
      // ref:n så GPS-callbacken aldrig dör pga animationsfel.
      if (followUserRef.current && mapRef.current?.animateCamera) {
        try {
          mapRef.current.animateCamera(
            { center: { latitude: lat, longitude: lng } },
            { duration: 500 }
          );
        } catch {
          // ignore — animationsfel ska inte stoppa GPS-spårning
        }
      }

      // Strict-order-läge (Walk.enforceSequentialOrder): bara nästa-i-
      // ordning är "aktiv" för trigger + approaching-vibration + distans-
      // pill. Övriga obesvarade visas som låsta på kartan (se Marker-
      // renderingen nedan) men öppnar inte modalen även om användaren
      // står precis intill. I fri-läge (default, bakåtkompatibelt) körs
      // hela listan som tidigare → närmaste obesvarade triggar.
      const allUnanswered = walk.questions.filter(
        (q) => !answeredIdsRef.current.has(q.id)
      );
      const strictMode = !!walk.enforceSequentialOrder;
      const triggerableQuestions =
        strictMode && allUnanswered.length > 0
          ? [
              [...allUnanswered].sort(
                (a, b) => (a.order ?? 0) - (b.order ?? 0)
              )[0],
            ]
          : allUnanswered;

      let minDist = Infinity;
      let closest: Question | null = null;

      for (const question of triggerableQuestions) {
        // (Tidigare check `if (answeredIds.has) continue;` är redundant
        // sedan vi filtrerade ovan, men behålls för defensiv kod om
        // listan någonsin skulle byggas annorlunda.)
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

        // "Närmar dig"-förvarning för bike-mode (för walk är trigger ==
        // approaching så vi hoppar över). En kort enpuls första gången
        // användaren passerar approaching-tröskeln för en kontroll. Hjälper
        // cyklist att börja sänka farten så de inte susar förbi triggern.
        if (
          APPROACHING_DISTANCE_METERS > TRIGGER_DISTANCE_METERS &&
          dist <= APPROACHING_DISTANCE_METERS &&
          dist > TRIGGER_DISTANCE_METERS &&
          !approachingNotifiedRef.current.has(question.id) &&
          !modalVisibleRef.current
        ) {
          approachingNotifiedRef.current.add(question.id);
          if (Platform.OS !== "web") {
            try {
              // En kort puls — distinkt från trigger-mönstret (3 pulsar).
              Vibration.vibrate(180);
            } catch {
              // Saknad permission eller hårdvara — tyst.
            }
          }
        }

        if (dist <= TRIGGER_DISTANCE_METERS && !modalVisibleRef.current) {
          // Vibrationspuls för att göra deltagaren uppmärksam även när
          // telefonen är i fickan eller man pratar med någon. Mönstret
          // [paus, vibrera, paus, vibrera, paus, vibrera] = tre korta
          // pulsar med 100 ms paus emellan — distinkt från en SMS-notis
          // utan att vara skrämmande. Web saknar Vibration så vi skippar.
          if (Platform.OS !== "web") {
            try {
              Vibration.vibrate([0, 220, 100, 220, 100, 220]);
            } catch {
              // Saknad permission eller hårdvara — tyst.
            }
          }
          // Förfinad haptik utöver den distinkta 3-pulsen (känns
          // bättre på iOS Taptic Engine). Respekterar feedback-toggle.
          feedbackArrival();
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

  // Användaren drog kartan manuellt → pausa auto-följning. onPanDrag fyrar
  // bara på faktiska touchgester (inte på våra animateCamera-anrop), så
  // ingen risk för loop. setState används med funktionsform för att inte
  // re-rendera om värdet redan är false.
  const handleUserPan = useCallback(() => {
    setFollowUser((cur) => (cur ? false : cur));
  }, []);

  // 🎯-knappen: återuppta följning + animera direkt till nuvarande position.
  const handleCenterOnMe = useCallback(() => {
    setFollowUser(true);
    if (
      userLat != null &&
      userLng != null &&
      mapRef.current?.animateCamera
    ) {
      try {
        mapRef.current.animateCamera(
          { center: { latitude: userLat, longitude: userLng } },
          { duration: 500 }
        );
      } catch {
        // ignore
      }
    }
  }, [userLat, userLng]);

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
      // Ljud + haptik direkt på valet (innan 3,5 s-feedback-pausen).
      if (correct) feedbackCorrect();
      else feedbackWrong();

      // Tid som rätt-svar-bannern visas innan modalen stängs.
      // Tidigare 1500 ms — testarna tyckte det gick för fort, särskilt
      // när rätt svar är en längre fras man ska hinna läsa. 3500 ms ger
      // tid för 2 grundliga genomläsningar utan att kännas långrandigt.
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
          // Bara inkludera fältet om vi har en faktisk siffra. Saknas
          // sensor/permission utelämnas det helt — stripUndefined i
          // saveWalk skulle annars rensat det, men för Participant går
          // vägen via updateParticipant utan scrub.
          ...(typeof steps === "number" ? { steps } : {}),
        };

        if (sessionId) {
          try {
            await updateParticipant(
              sessionId,
              updatedParticipant,
              !!walk.event
            );
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
              isEvent: !!walk.event,
              ...(typeof steps === "number" ? { steps } : {}),
              timestamp: Date.now(),
            });
          }
        }

        if (isComplete) {
          // Firande: arpeggio + success-haptik när sista frågan klarats.
          feedbackComplete();
          // Bokför stats lokalt och VÄNTA in skrivningen innan vi
          // navigerar. Tidigare var det fire-and-forget med sväljt fel
          // — kombinerat med lost-update-racen i stats.ts kunde en
          // slutförd promenad försvinna ur statistiken. Mutexen i
          // stats.ts gör skrivningen snabb och atomär; await:en
          // garanterar att den hunnit klart medan skärmen lever.
          // Logga ev. fel istället för att svälja det tyst.
          try {
            await recordWalkCompletion(
              walk.id,
              walk.title,
              newScore,
              walk.questions.length
            );
          } catch (e) {
            console.warn("[stats] recordWalkCompletion misslyckades:", e);
          }

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
                steps,
              });
            }
          }, 500);
        }
      }, 3500);
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

  // Strict-order: id:t på nästa-i-ordning-frågan (eller null när allt
  // är besvarat). Driver låst-styling på övriga markers + "Gå till
  // kontroll #N härnäst"-bannern. Rå klient-uträkning per render —
  // total <= 200 så ingen memo-kostnad värd att infektera koden med.
  const strictMode = !!walk.enforceSequentialOrder;
  const nextExpectedQuestion: Question | null = strictMode
    ? [...walk.questions]
        .filter((q) => !answeredIds.has(q.id))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))[0] || null
    : null;

  const getInitialRegion = () => {
    // Bike-walks zoomar ut mer som default — rutterna är längre och
    // cyklisten behöver mer kontext om kommande kontroller.
    const delta = activityConfig.initialLatitudeDelta;
    if (userLat && userLng) {
      return {
        latitude: userLat,
        longitude: userLng,
        latitudeDelta: delta,
        longitudeDelta: delta,
      };
    }
    if (walk.questions.length > 0) {
      const q = walk.questions[0];
      return {
        latitude: q.coordinate.latitude,
        longitude: q.coordinate.longitude,
        latitudeDelta: delta,
        longitudeDelta: delta,
      };
    }
    return undefined;
  };

  return (
    <View style={styles.container}>
      {/* Full-screen map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        showsUserLocation
        initialRegion={getInitialRegion()}
        mapType={mapType}
        offline={!networkOnline}
        onRegionChangeComplete={
          Platform.OS !== "web" ? handleRegionChange : undefined
        }
        onPanDrag={handleUserPan}
      >
        {/* Rutt-linje mellan kontrollpunkter — hjälper deltagaren se
            sammanhanget och nästa kontroll. Bara om vi har ≥ 2 frågor
            (annars finns ingen linje att rita). Streckad så den inte
            misstas för en exakt rutt — skaparens ordning, inte
            navigerings-rutt. */}
        {walk.questions.length >= 2 && (
          <Polyline
            coordinates={walk.questions.map((q) => q.coordinate)}
            strokeColor="rgba(27,107,53,0.6)"
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />
        )}
        {walk.questions.map((q, idx) => {
          const isDone = answeredIds.has(q.id);
          // L\u00e5st = strict-order \u00e4r p\u00e5, kontrollen \u00e4r obesvarad och INTE
          // den som \u00e4r n\u00e4st p\u00e5 tur. Renderas d\u00e4mpad + \ud83d\udd12 i st\u00e4llet f\u00f6r
          // ordningsnummer; trigger-cirkeln d\u00f6ljs s\u00e5 anv\u00e4ndaren visuellt
          // f\u00f6rst\u00e5r att den inte aktiveras \u00e4n.
          const isLocked =
            strictMode && !isDone && nextExpectedQuestion?.id !== q.id;
          const isNearest = nearestQuestion?.id === q.id;
          return (
            <React.Fragment key={q.id}>
              <Marker
                coordinate={q.coordinate}
                opacity={isDone ? 0.4 : isLocked ? 0.5 : 1}
              >
                <View style={styles.markerContainer}>
                  <View
                    style={[
                      styles.marker,
                      isDone && styles.markerDone,
                      isLocked && styles.markerLocked,
                      isNearest && !isDone && !isLocked && styles.markerNearest,
                    ]}
                  >
                    <Text style={styles.markerText}>
                      {isDone ? "\u2713" : isLocked ? "\ud83d\udd12" : idx + 1}
                    </Text>
                  </View>
                </View>
              </Marker>
              {!isDone && !isLocked && (
                <Circle
                  center={q.coordinate}
                  radius={TRIGGER_DISTANCE_METERS}
                  strokeColor="rgba(229,57,53,0.5)"
                  fillColor="rgba(229,57,53,0.1)"
                />
              )}
              {/* Bike-mode: ytterligare ring för approaching-zonen, så
                  cyklisten ser var "närmar dig"-pulsen utlöses. */}
              {!isDone && APPROACHING_DISTANCE_METERS > TRIGGER_DISTANCE_METERS && (
                <Circle
                  center={q.coordinate}
                  radius={APPROACHING_DISTANCE_METERS}
                  strokeColor="rgba(232,168,56,0.4)"
                  fillColor="rgba(232,168,56,0.05)"
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

      {/* Karttyp-toggle */}
      <MapTypeToggle
        mapType={mapType}
        onPress={cycleMapType}
        style={styles.mapTypeToggle}
      />
      <MapAttribution mapType={mapType} />

      {/* 🎯-knapp för att åter-centrera kartan på användaren. Visas bara när
          följning är AV — när den är på är användaren redan centrerad,
          så knappen skulle vara onödigt brus. Klick: slår på följning +
          animerar direkt till user-position. */}
      {!followUser && (
        <TouchableOpacity
          onPress={handleCenterOnMe}
          style={styles.centerOnMeButton}
          activeOpacity={0.7}
          accessibilityLabel={t("active.centerOnMeLabel")}
        >
          <Text style={styles.centerOnMeIcon}>🎯</Text>
        </TouchableOpacity>
      )}

      {/* Distance indicator - floating pill.
          I strict-order-läge byts texten ut: "Nästa: kontroll #N — 78 m"
          istället för "Avstånd till kontroll #N: 78 m", för att göra
          tydligt att kontrollen är den som SKA besökas härnäst — inte
          bara den närmaste. Approaching-prefix och "almost there"-
          suffix lämnas oförändrade så användaren får samma feedback
          när de närmar sig rätt kontroll. */}
      <View style={[styles.distancePill, strictMode && styles.distancePillStrict]}>
        {nearestDistance !== null && nearestQuestion ? (
          <Text style={[styles.distanceText, strictMode && styles.distanceTextStrict]}>
            {nearestDistance <= Math.max(30, APPROACHING_DISTANCE_METERS) && nearestDistance > TRIGGER_DISTANCE_METERS
              ? "📍 "
              : ""}
            {t(
              strictMode ? "active.nextInOrder" : "active.distanceToControl",
              {
                distance:
                  nearestDistance > 1000
                    ? `${(nearestDistance / 1000).toFixed(1)} km`
                    : `${nearestDistance} m`,
                order: nearestQuestion.order,
              }
            )}
            {nearestDistance <= Math.max(30, APPROACHING_DISTANCE_METERS) && nearestDistance > TRIGGER_DISTANCE_METERS
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
          {stepsAvailable && typeof steps === "number" && (
            <Text style={styles.stepsLabel}>
              {t("active.stepsLabel", { count: steps })}
            </Text>
          )}
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
  // Låst-stil (strict-order, ej näst på tur): dämpad grå-blå färg så
  // pinen skiljer sig från både färdig (grön) och nästa (röd). 🔒-emoji
  // renderas i Text-noden ovan. Inget annat trigger-feedback bör hända
  // för dessa — loop:n i GPS-callbacken filtrerar bort dem.
  markerLocked: {
    backgroundColor: "#6B7B8E",
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

  mapTypeToggle: {
    position: "absolute",
    top: Platform.OS === "web" ? 16 : 120,
    right: 16,
  },

  centerOnMeButton: {
    position: "absolute",
    top: Platform.OS === "web" ? 64 : 168,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.95)",
    justifyContent: "center",
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 2px 6px rgba(0,0,0,0.15)" },
    }),
  },
  centerOnMeIcon: {
    fontSize: 20,
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
  // Strict-mode-pillens variant: blå ton i bakgrunden så användaren
  // visuellt registrerar att läget är annorlunda (riktnings-styrt
  // istället för fri vandring). Layout/positioning är samma.
  distancePillStrict: {
    backgroundColor: "rgba(227,239,255,0.97)",
    borderWidth: 1,
    borderColor: "#B8D4F0",
  },
  distanceTextStrict: {
    color: "#1B4D7A",
    fontWeight: "700",
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
  stepsLabel: {
    color: "rgba(250,250,248,0.85)",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 4,
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
