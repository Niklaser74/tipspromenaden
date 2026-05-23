/**
 * @file WalkFeedbackPrompt.tsx
 * @description Tumme-upp/ner-feedback efter slutförd promenad.
 *
 * Två-stegs-UI:
 *   1. Övergripande prompt: "Hur kändes promenaden?" → 👍 / 👎
 *   2. Vid 👎: tre kategori-rader (Frågorna, Punkterna, Gränssnittet)
 *      där användaren kan markera 👍 eller 👎 per kategori. Hoppa
 *      över är OK — null sparas för obesvarade.
 *   3. Vid 👍: skickar feedback direkt, ingen följdfråga.
 *
 * Skickar `WalkFeedback` till Firestore via `services/firestore.ts
 * submitWalkFeedback`. Försök-och-glöm — användaren ser ett tack-
 * meddelande direkt och blockeras aldrig på nätfel.
 *
 * Renderas i ResultsScreen efter resultatkortet. Visas EN gång per
 * session (lagrar `feedback_sent_<sessionId>` i AsyncStorage så
 * användaren inte ser prompten igen om de scrollar tillbaka).
 */

import React, { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth } from "../config/firebase";
import { submitWalkFeedback } from "../services/firestore";
import { generateId } from "../utils/qr";
import { useTranslation } from "../i18n";
import type { WalkFeedback } from "../types";

interface Props {
  walkId: string;
  sessionId: string;
}

type Thumb = "up" | "down";
type CategoryRating = Thumb | null;

const STORAGE_KEY_PREFIX = "feedback_sent_";

export default function WalkFeedbackPrompt({ walkId, sessionId }: Props) {
  const { t } = useTranslation();

  // Tre-stegs-stat: "initial" (visa övergripande prompt), "details"
  // (visa kategori-rader efter tumme-ner), "done" (visa tack).
  const [stage, setStage] = useState<"initial" | "details" | "done">("initial");
  const [overall, setOverall] = useState<Thumb | null>(null);
  const [questions, setQuestions] = useState<CategoryRating>(null);
  const [points, setPoints] = useState<CategoryRating>(null);
  const [ui, setUi] = useState<CategoryRating>(null);
  const [hidden, setHidden] = useState(false);

  // Kolla om feedback redan skickats för denna session — då gömmer
  // vi prompten helt (användaren scrollade bara tillbaka eller
  // navigerade in på Results igen).
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY_PREFIX + sessionId).then((val) => {
      if (!cancelled && val) setHidden(true);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function send(finalOverall: Thumb, withDetails: boolean) {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      // Inte inloggad → skicka inte, men gå ändå till "done" så
      // promten försvinner. Skulle inte hända i praktiken eftersom
      // anonym auth är default — defensiv kod.
      setStage("done");
      return;
    }
    const feedback: WalkFeedback = {
      id: generateId(),
      walkId,
      sessionId,
      userId: uid,
      overall: finalOverall,
      createdAt: Date.now(),
      ...(withDetails
        ? { details: { questions, points, ui } }
        : {}),
    };
    // Fire-and-forget — uppdatera UI omedelbart, låt nätet jobba
    submitWalkFeedback(feedback);
    AsyncStorage.setItem(STORAGE_KEY_PREFIX + sessionId, "1").catch(() => {});
    setStage("done");
  }

  if (hidden) return null;

  // ─── Stage: DONE ──────────────────────────────────────────────────
  if (stage === "done") {
    return (
      <View style={[styles.container, styles.containerDone]}>
        <Text style={styles.doneEmoji}>🙏</Text>
        <Text style={styles.doneText}>{t("feedback.thanks")}</Text>
      </View>
    );
  }

  // ─── Stage: DETAILS (efter tumme-ner) ─────────────────────────────
  if (stage === "details") {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{t("feedback.detailsTitle")}</Text>
        <Text style={styles.subtitle}>{t("feedback.detailsHint")}</Text>

        <CategoryRow
          label={t("feedback.catQuestions")}
          value={questions}
          onChange={setQuestions}
        />
        <CategoryRow
          label={t("feedback.catPoints")}
          value={points}
          onChange={setPoints}
        />
        <CategoryRow
          label={t("feedback.catUi")}
          value={ui}
          onChange={setUi}
        />

        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.skipButton}
            onPress={() => send("down", true)}
          >
            <Text style={styles.skipButtonText}>{t("feedback.skip")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.submitButton}
            onPress={() => send("down", true)}
          >
            <Text style={styles.submitButtonText}>{t("feedback.submit")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Stage: INITIAL (övergripande tumme upp/ner) ──────────────────
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t("feedback.title")}</Text>
      <View style={styles.thumbsRow}>
        <TouchableOpacity
          style={[
            styles.bigThumb,
            overall === "up" && styles.bigThumbActive,
          ]}
          onPress={() => {
            setOverall("up");
            send("up", false);
          }}
        >
          <Text style={styles.bigThumbEmoji}>👍</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.bigThumb,
            overall === "down" && styles.bigThumbActiveDown,
          ]}
          onPress={() => {
            setOverall("down");
            setStage("details");
          }}
        >
          <Text style={styles.bigThumbEmoji}>👎</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Kategori-rad ────────────────────────────────────────────────────
function CategoryRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: CategoryRating;
  onChange: (v: CategoryRating) => void;
}) {
  return (
    <View style={styles.categoryRow}>
      <Text style={styles.categoryLabel}>{label}</Text>
      <View style={styles.categoryThumbs}>
        <TouchableOpacity
          onPress={() => onChange(value === "up" ? null : "up")}
          style={[
            styles.smallThumb,
            value === "up" && styles.smallThumbActiveUp,
          ]}
        >
          <Text style={styles.smallThumbEmoji}>👍</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => onChange(value === "down" ? null : "down")}
          style={[
            styles.smallThumb,
            value === "down" && styles.smallThumbActiveDown,
          ]}
        >
          <Text style={styles.smallThumbEmoji}>👎</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 20,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#F0EDE5",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" },
    }),
  },
  containerDone: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 10,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    color: "#2C3E2D",
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7B6E",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 12,
  },
  thumbsRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    marginTop: 14,
  },
  bigThumb: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F5F0E8",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  bigThumbActive: {
    backgroundColor: "#E8F5E9",
    borderColor: "#1B6B35",
  },
  bigThumbActiveDown: {
    backgroundColor: "#FFEBE8",
    borderColor: "#D9534F",
  },
  bigThumbEmoji: {
    fontSize: 38,
  },
  // Kategori-rader
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDE5",
  },
  categoryLabel: {
    fontSize: 15,
    color: "#2C3E2D",
    flex: 1,
  },
  categoryThumbs: {
    flexDirection: "row",
    gap: 8,
  },
  smallThumb: {
    width: 44,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F5F0E8",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  smallThumbActiveUp: {
    backgroundColor: "#E8F5E9",
    borderColor: "#1B6B35",
  },
  smallThumbActiveDown: {
    backgroundColor: "#FFEBE8",
    borderColor: "#D9534F",
  },
  smallThumbEmoji: {
    fontSize: 18,
  },
  // Actions
  actionsRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  skipButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#F0EDE5",
  },
  skipButtonText: {
    color: "#6B7B6E",
    fontSize: 14,
    fontWeight: "600",
  },
  submitButton: {
    flex: 2,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    backgroundColor: "#1B6B35",
  },
  submitButtonText: {
    color: "#F5F0E8",
    fontSize: 14,
    fontWeight: "700",
  },
  // Done
  doneEmoji: {
    fontSize: 22,
  },
  doneText: {
    fontSize: 15,
    color: "#1B3D2B",
    fontWeight: "600",
  },
});
