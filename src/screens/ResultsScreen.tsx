/**
 * @file ResultsScreen.tsx
 * @description Slutskärm efter avslutad tipspromenad.
 *
 * Visar deltagarens slutpoäng, en uppdelning av svar (rätt/fel) och — för
 * V1 av viral-spridning — en "Dela resultat"-knapp som öppnar systemets
 * delningsmeny med en färdig text + länk till promenaden.
 *
 * Text + länk är enkelt att implementera, men kraftfullt: varje delning
 * kan få fler spelare in i samma promenad vilket hjälper försäljningen av
 * premium-tipspack. V2 (score-card som bild) och V3 (animerad video)
 * finns i ROADMAP.
 */

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Share,
  Alert,
} from "react-native";
import { useRoute, useNavigation } from "@react-navigation/native";
import { Walk, Answer } from "../types";
import { useTranslation } from "../i18n";
import { buildWalkLink } from "../constants/deepLinks";

export default function ResultsScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { walk, participantName, answers, score, total } = route.params as {
    walk: Walk;
    participantName: string;
    answers: Answer[];
    score: number;
    total: number;
  };

  const percentage = Math.round((score / total) * 100);

  const getEmoji = () => {
    if (percentage === 100) return "🏆";
    if (percentage >= 70) return "🎉";
    if (percentage >= 40) return "👍";
    return "💪";
  };

  const getMessage = () => {
    if (percentage === 100) return t("results.messagePerfect");
    if (percentage >= 70) return t("results.messageGreat");
    if (percentage >= 40) return t("results.messageOk");
    return t("results.messageLow");
  };

  /**
   * V1 social delning: öppna systemets delningsmeny (iMessage, WhatsApp,
   * Instagram, Twitter/X, …) med en färdig text + deep link tillbaka till
   * promenaden. Deep linken använder appens `tipspromenaden://`-schema så
   * mottagare med appen installerad hoppar direkt in; utan appen syns
   * länken som ofarlig text tills vi kopplar en universal link.
   */
  const handleShare = async () => {
    const emoji = getEmoji();
    const deepLink = buildWalkLink(walk.id);
    const message = t("results.shareText", {
      score,
      total,
      percentage,
      title: walk.title,
      emoji,
    });
    try {
      await Share.share(
        {
          // `message` fungerar på både iOS & Android. Vi inkluderar länken
          // inline i texten eftersom Android inte stöder `url`-fältet.
          message: `${message}\n\n${deepLink}`,
          // iOS använder separat `url` när det finns.
          url: deepLink,
          title: t("results.shareTitle"),
        },
        { dialogTitle: t("results.shareTitle") }
      );
    } catch (e: any) {
      // Användaren kan avbryta — det är inget fel. Men om systemet kastar
      // något ovanligt vill vi ändå ge feedback.
      Alert.alert(t("common.error"), e?.message || "");
    }
  };

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Celebration header */}
      <View style={styles.header}>
        <Text style={styles.emoji}>{getEmoji()}</Text>
        <Text style={styles.title}>{t("results.done")}</Text>
        <Text style={styles.name}>{participantName}</Text>
        <Text style={styles.message}>{getMessage()}</Text>
      </View>

      {/* Score card */}
      <View style={styles.scoreCard}>
        <View style={styles.scoreCircle}>
          <Text style={styles.scoreNumber}>{score}</Text>
          <Text style={styles.scoreDivider}>
            {t("results.ofTotal", { total })}
          </Text>
        </View>
        <View style={styles.percentageContainer}>
          <View style={styles.percentageBar}>
            <View
              style={[
                styles.percentageFill,
                { width: `${percentage}%` },
                percentage >= 70 && styles.percentageFillGood,
                percentage < 40 && styles.percentageFillLow,
              ]}
            />
          </View>
          <Text style={styles.percentageText}>{percentage}%</Text>
        </View>
      </View>

      {/* Share button — V1 viral loop */}
      <TouchableOpacity
        style={styles.shareButton}
        onPress={handleShare}
        activeOpacity={0.8}
      >
        <Text style={styles.shareIcon}>📤</Text>
        <Text style={styles.shareButtonText}>{t("results.share")}</Text>
      </TouchableOpacity>

      {/* Answer breakdown */}
      <View style={styles.detailSection}>
        <Text style={styles.detailTitle}>{t("results.yourAnswers")}</Text>
        {walk.questions.map((q, idx) => {
          const answer = answers.find((a) => a.questionId === q.id);
          const isCorrect = answer?.correct;
          return (
            <View
              key={q.id}
              style={[
                styles.detailCard,
                isCorrect ? styles.detailCardCorrect : styles.detailCardWrong,
              ]}
            >
              <View style={styles.detailCardLeft}>
                <View
                  style={[
                    styles.detailNumber,
                    isCorrect
                      ? styles.detailNumberCorrect
                      : styles.detailNumberWrong,
                  ]}
                >
                  <Text style={styles.detailNumberText}>{idx + 1}</Text>
                </View>
              </View>
              <View style={styles.detailCardCenter}>
                <Text style={styles.detailQuestion} numberOfLines={2}>
                  {q.text}
                </Text>
                {!isCorrect && answer && (
                  <Text style={styles.detailCorrectAnswer}>
                    {t("results.correctAnswer", {
                      answer: q.options[q.correctOptionIndex],
                    })}
                  </Text>
                )}
              </View>
              <Text style={styles.detailIcon}>
                {isCorrect ? "✓" : "✗"}
              </Text>
            </View>
          );
        })}
      </View>

      {/* Home button */}
      <TouchableOpacity
        style={styles.homeButton}
        onPress={() => navigation.navigate("Home")}
        activeOpacity={0.8}
      >
        <Text style={styles.homeButtonText}>{t("results.backHome")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: "#F5F0E8",
  },
  container: {
    padding: 24,
    alignItems: "center",
    paddingBottom: 40,
  },

  // Header
  header: {
    alignItems: "center",
    marginBottom: 24,
    marginTop: 8,
  },
  emoji: {
    fontSize: 56,
    marginBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#2C3E2D",
    letterSpacing: -0.3,
  },
  name: {
    fontSize: 16,
    color: "#4A5E4C",
    marginTop: 4,
    fontWeight: "500",
  },
  message: {
    fontSize: 15,
    color: "#8A9A8D",
    marginTop: 8,
  },

  // Score card
  scoreCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 28,
    alignItems: "center",
    width: "100%",
    marginBottom: 20,
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
  scoreCircle: {
    alignItems: "center",
    marginBottom: 20,
  },
  scoreNumber: {
    fontSize: 56,
    fontWeight: "800",
    color: "#2C3E2D",
    lineHeight: 62,
  },
  scoreDivider: {
    fontSize: 16,
    color: "#8A9A8D",
    fontWeight: "500",
  },
  percentageContainer: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    gap: 12,
  },
  percentageBar: {
    flex: 1,
    height: 8,
    backgroundColor: "#F0F0EC",
    borderRadius: 4,
    overflow: "hidden",
  },
  percentageFill: {
    height: 8,
    backgroundColor: "#2D7A3A",
    borderRadius: 4,
  },
  percentageFillGood: {
    backgroundColor: "#2D7A3A",
  },
  percentageFillLow: {
    backgroundColor: "#E8B830",
  },
  percentageText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2C3E2D",
    width: 50,
    textAlign: "right",
  },

  // Share button
  shareButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "#E8B830",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 14,
    width: "100%",
    marginBottom: 28,
    ...Platform.select({
      ios: {
        shadowColor: "#E8B830",
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.25,
        shadowRadius: 8,
      },
      android: { elevation: 3 },
      web: { boxShadow: "0px 3px 8px rgba(232,184,48,0.25)" },
    }),
  },
  shareIcon: {
    fontSize: 20,
  },
  shareButtonText: {
    color: "#2C3E2D",
    fontSize: 16,
    fontWeight: "700",
  },

  // Detail section
  detailSection: {
    width: "100%",
    marginBottom: 24,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2C3E2D",
    marginBottom: 14,
  },
  detailCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
  },
  detailCardCorrect: {
    borderColor: "#C8E6C9",
    backgroundColor: "#FAFFF9",
  },
  detailCardWrong: {
    borderColor: "#FFCDD2",
    backgroundColor: "#FFFAFA",
  },
  detailCardLeft: {
    marginRight: 12,
  },
  detailNumber: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  detailNumberCorrect: {
    backgroundColor: "#E8F0E0",
  },
  detailNumberWrong: {
    backgroundColor: "#FBE9E7",
  },
  detailNumberText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#2C3E2D",
  },
  detailCardCenter: {
    flex: 1,
  },
  detailQuestion: {
    color: "#2C3E2D",
    fontSize: 14,
    fontWeight: "500",
  },
  detailCorrectAnswer: {
    color: "#8A9A8D",
    fontSize: 12,
    marginTop: 4,
  },
  detailIcon: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#2D7A3A",
    width: 30,
    textAlign: "right",
  },

  // Home button
  homeButton: {
    backgroundColor: "#1B6B35",
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 14,
    ...Platform.select({
      ios: {
        shadowColor: "#1B6B35",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 4px 8px rgba(27,107,53,0.2)" },
    }),
  },
  homeButtonText: {
    color: "#F5F0E8",
    fontSize: 17,
    fontWeight: "700",
  },
});
