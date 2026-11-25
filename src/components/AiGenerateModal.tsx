/**
 * @file AiGenerateModal.tsx
 * @description Dialog för att generera frågor med AI mot krediter som
 * redan finns på kontot. Används från CreateWalkScreen.
 *
 * Bara Android och bakom fjärrflagga — se `services/aiQuestions.ts` för
 * varför. Dialogen får aldrig innehålla köp, priser eller länkar till köp
 * (Google Plays betalningspolicy). När krediterna inte räcker visas en
 * textrad om att de köps på tipspromenaden.app — ren text, inte tryckbar.
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useTranslation } from "../i18n";
import {
  AI_LIMITS,
  AiError,
  creditCost,
  generateQuestions,
  newRequestId,
  type AiAudience,
  type AiDifficulty,
  type AiMode,
} from "../services/aiQuestions";
import type { QuestionBattery } from "../services/tipspackValidator";
import { lastAppCheckError } from "../config/firebase";

interface Props {
  visible: boolean;
  /** Saldot (köpta + Pro-krediter). */
  credits: number;
  /** Språkkod som frågorna ska skrivas på. */
  language: string;
  /** Promenadens ungefärliga plats, om den är känd — skickas med i platsläget. */
  location?: { lat: number; lng: number };
  onGenerated: (battery: QuestionBattery) => void;
  onClose: () => void;
}

const COUNTS = [5, 10, 15, 20];
const MODES: AiMode[] = ["topic", "place", "text"];
const DIFFICULTIES: AiDifficulty[] = ["easy", "medium", "hard"];
const AUDIENCES: AiAudience[] = ["mixed", "adults", "kids"];

export function AiGenerateModal({ visible, credits, language, location, onGenerated, onClose }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<AiMode>("topic");
  const [prompt, setPrompt] = useState("");
  const [place, setPlace] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [count, setCount] = useState(10);
  const [difficulty, setDifficulty] = useState<AiDifficulty>("medium");
  const [audience, setAudience] = useState<AiAudience>("mixed");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Samma id vid nytt försök efter nätfel → servern drar inte två gånger.
  const [requestId, setRequestId] = useState(newRequestId);

  const cost = creditCost(mode, count);
  const enough = credits >= cost;

  const validate = (): string | null => {
    if (mode === "topic" && !prompt.trim()) return t("ai.needTopic");
    if (mode === "place" && !place.trim()) return t("ai.needPlace");
    if (mode === "text" && sourceText.trim().length < AI_LIMITS.minSourceText) {
      return t("ai.needText", { min: AI_LIMITS.minSourceText });
    }
    return null;
  };

  const errorText = (e: AiError): string => {
    switch (e.reason) {
      case "no-credits":
        return t("ai.noCredits");
      case "rate-limited":
        return t("ai.errorRateLimited");
      case "in-progress":
        return t("ai.errorInProgress");
      case "anonymous":
        return t("ai.errorAnonymous");
      case "generation-failed":
        return t("ai.errorFailed");
      case "app-check": {
        // Den tekniska orsaken visas med, annars går felet inte att
        // felsöka utan adb.
        const detail = lastAppCheckError();
        return detail ? `${t("ai.errorAppCheck")}\n(${detail.slice(0, 200)})` : t("ai.errorAppCheck");
      }
      case "network":
        return t("ai.errorNetwork");
      default:
        return t("ai.errorUnknown");
    }
  };

  const handleGenerate = async () => {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await generateQuestions({
        mode,
        prompt: prompt.trim().slice(0, AI_LIMITS.maxPrompt),
        ...(mode === "text" ? { sourceText: sourceText.trim().slice(0, AI_LIMITS.maxSourceText) } : {}),
        ...(mode === "place"
          ? { place: { name: place.trim().slice(0, AI_LIMITS.maxPlace), ...(location ?? {}) } }
          : {}),
        count,
        language,
        difficulty,
        audience,
        requestId,
      });
      setRequestId(newRequestId());
      setPrompt("");
      setPlace("");
      setSourceText("");
      onGenerated(res.battery);
    } catch (e) {
      const err = e instanceof AiError ? e : new AiError("unknown", String(e));
      // Vid nätfel behålls id:t så att ett nytt försök hämtar samma
      // resultat om genereringen egentligen gick igenom. Alla andra fel
      // är slutgiltiga för det id:t.
      if (err.reason !== "network" && err.reason !== "unknown") setRequestId(newRequestId());
      setError(errorText(err));
    } finally {
      setLoading(false);
    }
  };

  const chip = (label: string, selected: boolean, onPress: () => void, key: string) => (
    <TouchableOpacity
      key={key}
      style={[styles.chip, selected && styles.chipSelected]}
      onPress={onPress}
      disabled={loading}
      activeOpacity={0.7}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={() => {
        if (!loading) onClose();
      }}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>{t("ai.title")}</Text>
            <Text style={styles.balance}>{t("ai.balance", { count: credits })}</Text>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#1B6B35" />
              <Text style={styles.loadingTitle}>{t("ai.loadingTitle")}</Text>
              <Text style={styles.loadingHint}>
                {mode === "place" ? t("ai.loadingHintPlace") : t("ai.loadingHint")}
              </Text>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={styles.chipRow}>
                {MODES.map((m) => chip(t(`ai.mode_${m}`), mode === m, () => setMode(m), m))}
              </View>

              {mode === "topic" && (
                <TextInput
                  value={prompt}
                  onChangeText={setPrompt}
                  placeholder={t("ai.topicPlaceholder")}
                  placeholderTextColor="#8A9A8D"
                  maxLength={AI_LIMITS.maxPrompt}
                  style={styles.input}
                />
              )}
              {mode === "place" && (
                <TextInput
                  value={place}
                  onChangeText={setPlace}
                  placeholder={t("ai.placePlaceholder")}
                  placeholderTextColor="#8A9A8D"
                  maxLength={AI_LIMITS.maxPlace}
                  style={styles.input}
                />
              )}
              {mode === "text" && (
                <TextInput
                  value={sourceText}
                  onChangeText={setSourceText}
                  placeholder={t("ai.textPlaceholder", { min: AI_LIMITS.minSourceText })}
                  placeholderTextColor="#8A9A8D"
                  maxLength={AI_LIMITS.maxSourceText}
                  multiline
                  textAlignVertical="top"
                  style={[styles.input, styles.inputMultiline]}
                />
              )}
              {mode !== "topic" && (
                <TextInput
                  value={prompt}
                  onChangeText={setPrompt}
                  placeholder={t("ai.wishesPlaceholder")}
                  placeholderTextColor="#8A9A8D"
                  maxLength={AI_LIMITS.maxPrompt}
                  style={styles.input}
                />
              )}

              <Text style={styles.label}>{t("ai.countLabel")}</Text>
              <View style={styles.chipRow}>
                {COUNTS.map((n) => chip(String(n), count === n, () => setCount(n), String(n)))}
              </View>

              <Text style={styles.label}>{t("ai.difficultyLabel")}</Text>
              <View style={styles.chipRow}>
                {DIFFICULTIES.map((d) =>
                  chip(t(`ai.difficulty_${d}`), difficulty === d, () => setDifficulty(d), d)
                )}
              </View>

              <Text style={styles.label}>{t("ai.audienceLabel")}</Text>
              <View style={styles.chipRow}>
                {AUDIENCES.map((a) => chip(t(`ai.audience_${a}`), audience === a, () => setAudience(a), a))}
              </View>

              {error && <Text style={styles.error}>{error}</Text>}
              {!error && !enough && <Text style={styles.error}>{t("ai.noCredits")}</Text>}
              {/* Ren upplysning: ingen länk, ingen knapp, inte tryckbar. Gör
                  ALDRIG den här raden klickbar — se services/aiQuestions.ts. */}
              {!enough && <Text style={styles.cost}>{t("ai.whereToBuy")}</Text>}
              {!error && enough && <Text style={styles.cost}>{t("ai.cost", { count: cost })}</Text>}

              <TouchableOpacity
                style={[styles.generateButton, !enough && styles.generateButtonDisabled]}
                onPress={handleGenerate}
                disabled={!enough}
                activeOpacity={0.8}
              >
                <Text style={styles.generateText}>{t("ai.generate")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClose} style={styles.cancelButton} activeOpacity={0.7}>
                <Text style={styles.cancelText}>{t("common.cancel")}</Text>
              </TouchableOpacity>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  card: {
    backgroundColor: "#FBF7F0",
    borderRadius: 18,
    padding: 20,
    marginHorizontal: 20,
    maxWidth: 420,
    maxHeight: "88%",
    width: "90%",
    alignSelf: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 19,
    fontWeight: "700",
    color: "#1B3D2B",
  },
  balance: {
    fontSize: 13,
    fontWeight: "600",
    color: "#7A5A0A",
    backgroundColor: "#FFF8E7",
    borderWidth: 1,
    borderColor: "#E8B830",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: "hidden",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    borderWidth: 1.5,
    borderColor: "#D9D2C2",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
  },
  chipSelected: {
    borderColor: "#1B6B35",
    backgroundColor: "#E6F2EA",
  },
  chipText: {
    fontSize: 14,
    color: "#4F5F50",
  },
  chipTextSelected: {
    color: "#1B3D2B",
    fontWeight: "700",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: "#4F5F50",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#D9D2C2",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#2C3E2D",
    backgroundColor: "#FFFFFF",
    marginBottom: 12,
  },
  inputMultiline: {
    minHeight: 110,
    maxHeight: 180,
  },
  error: {
    fontSize: 13,
    color: "#A33A2A",
    lineHeight: 18,
    marginBottom: 10,
  },
  cost: {
    fontSize: 13,
    color: "#4F5F50",
    lineHeight: 18,
    marginBottom: 10,
  },
  generateButton: {
    backgroundColor: "#1B6B35",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 4,
  },
  generateButtonDisabled: {
    backgroundColor: "#A9B8AC",
  },
  generateText: {
    color: "#F5F0E8",
    fontSize: 16,
    fontWeight: "700",
  },
  cancelButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 15,
    color: "#4F5F50",
  },
  loadingBox: {
    alignItems: "center",
    paddingVertical: 28,
    gap: 10,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1B3D2B",
  },
  loadingHint: {
    fontSize: 13,
    color: "#4F5F50",
    textAlign: "center",
  },
});
