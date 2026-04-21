/**
 * @file ShareBadge.tsx
 * @description Delningsbar resultat-badge som rasteriseras till PNG via
 *   react-native-view-shot och skickas till systemets dela-vy.
 *
 *   Komponenten renderas offscreen (absolute + negativ left) i LeaderboardScreen
 *   så att den finns i view-trädet och kan fångas av `captureRef`, utan att
 *   synas för användaren. `collapsable={false}` behövs för att Android inte
 *   ska optimera bort View:n innan den hunnit mätas — utan det returnerar
 *   captureRef en tom bild.
 *
 *   Storleken 1080×1080 är vald för att vara vänlig mot Instagram/FB-posts
 *   (kvadratiskt flöde) och Stories (klarar crop). Texten är dimensionerad
 *   för att vara läsbar även när plattformar skalar ner till thumbnail.
 */

import React, { forwardRef } from "react";
import { View, Text, Image, StyleSheet } from "react-native";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const appIcon = require("../../assets/icon.png");

export interface ShareBadgeProps {
  /** Deltagarnamn (från namninmatningen). */
  name: string;
  /** Uppnådd poäng. */
  score: number;
  /** Totalt antal frågor i promenaden. */
  totalQuestions: number;
  /** Placering, 1-baserad. Bestämmer medalj/text. */
  rank: number;
  /** Promenadens titel. */
  walkTitle: string;
  /** Översättningar – injiceras från anroparen (ShareBadge är locale-agnostisk). */
  labels: {
    /** "Guld", "Silver", "Brons" eller generell platsering, i fallande ordning:
     *  [1:a, 2:a, 3:e, 4:e+]. Index 3 fallback används när rank > 3. */
    rankTitles: [string, string, string, string];
    /** "Jag tog {{rank}}-plats i" — formatteras av anroparen. */
    tagline: string;
    /** "{{score}}/{{total}} rätt" — formatteras av anroparen. */
    correct: string;
    /** Bottentext med CTA. */
    cta: string;
    /** Appens namn som wordmark. */
    appName: string;
  };
}

/**
 * Guld/silver/brons-emoji för 1–3, lagerkrans-emoji för 4+. Samma ikonografi
 * som på topplistan så att mottagaren känner igen stilen.
 */
const medalForRank = (rank: number): string => {
  if (rank === 1) return "\uD83E\uDD47";
  if (rank === 2) return "\uD83E\uDD48";
  if (rank === 3) return "\uD83E\uDD49";
  return "\uD83C\uDFC5"; // sportsmedalj
};

export const ShareBadge = forwardRef<View, ShareBadgeProps>(
  ({ name, score, totalQuestions, rank, walkTitle, labels }, ref) => {
    const medal = medalForRank(rank);
    const rankTitle =
      rank <= 3 ? labels.rankTitles[rank - 1] : labels.rankTitles[3];
    const percentage =
      totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

    return (
      <View ref={ref} collapsable={false} style={styles.card}>
        {/* Wordmark / branding */}
        <View style={styles.header}>
          <Image source={appIcon} style={styles.brandIcon} />
          <Text style={styles.brandText}>{labels.appName}</Text>
        </View>

        {/* Medalj + placeringsrubrik */}
        <View style={styles.medalBlock}>
          <Text style={styles.medal}>{medal}</Text>
          <Text style={styles.rankTitle}>{rankTitle}</Text>
        </View>

        {/* Namn + promenadtitel */}
        <View style={styles.nameBlock}>
          <Text style={styles.tagline}>{labels.tagline}</Text>
          <Text style={styles.name} numberOfLines={2}>
            {name}
          </Text>
          <Text style={styles.walkTitle} numberOfLines={2}>
            {walkTitle}
          </Text>
        </View>

        {/* Resultat */}
        <View style={styles.scoreBlock}>
          <Text style={styles.bigScore}>
            {score}
            <Text style={styles.bigScoreUnit}>p</Text>
          </Text>
          <Text style={styles.correct}>{labels.correct}</Text>
          <Text style={styles.percentage}>{percentage}%</Text>
        </View>

        {/* CTA-footer */}
        <View style={styles.footer}>
          <View style={styles.footerAccent} />
          <Text style={styles.cta}>{labels.cta}</Text>
        </View>
      </View>
    );
  }
);

ShareBadge.displayName = "ShareBadge";

const BG = "#1B3D2B";
const ACCENT = "#F0C040";
const BEIGE = "#F5F0E8";
const MUTED = "rgba(245,240,232,0.6)";

const styles = StyleSheet.create({
  card: {
    width: 1080,
    height: 1080,
    backgroundColor: BG,
    padding: 80,
    justifyContent: "space-between",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
  },
  brandIcon: {
    width: 72,
    height: 72,
    borderRadius: 16,
  },
  brandText: {
    color: BEIGE,
    fontSize: 40,
    fontWeight: "800",
    letterSpacing: -0.5,
  },

  medalBlock: {
    alignItems: "center",
  },
  medal: {
    fontSize: 260,
    lineHeight: 300,
  },
  rankTitle: {
    color: ACCENT,
    fontSize: 72,
    fontWeight: "900",
    letterSpacing: -1,
    marginTop: 8,
    textAlign: "center",
  },

  nameBlock: {
    alignItems: "center",
  },
  tagline: {
    color: MUTED,
    fontSize: 32,
    fontWeight: "500",
    marginBottom: 8,
  },
  name: {
    color: BEIGE,
    fontSize: 56,
    fontWeight: "800",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  walkTitle: {
    color: MUTED,
    fontSize: 34,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 8,
  },

  scoreBlock: {
    alignItems: "center",
  },
  bigScore: {
    color: ACCENT,
    fontSize: 160,
    fontWeight: "900",
    letterSpacing: -3,
    lineHeight: 170,
  },
  bigScoreUnit: {
    fontSize: 80,
    fontWeight: "800",
  },
  correct: {
    color: BEIGE,
    fontSize: 40,
    fontWeight: "700",
  },
  percentage: {
    color: MUTED,
    fontSize: 32,
    fontWeight: "600",
    marginTop: 4,
  },

  footer: {
    alignItems: "center",
    gap: 20,
  },
  footerAccent: {
    width: 120,
    height: 6,
    backgroundColor: ACCENT,
    borderRadius: 3,
  },
  cta: {
    color: BEIGE,
    fontSize: 30,
    fontWeight: "600",
    textAlign: "center",
  },
});
