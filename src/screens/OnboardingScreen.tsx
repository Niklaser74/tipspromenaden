/**
 * @file OnboardingScreen.tsx
 * @description Tre-stegs intro-flöde som visas första gången appen öppnas.
 *
 * Persisteras i AsyncStorage under nyckeln `app.onboarded` — när användaren
 * trycker "Kom igång" eller "Hoppa över" sätts den till `"true"` och
 * skärmen visas inte igen. Tas bort om användaren raderar app-data eller
 * installerar om appen.
 *
 * Sidorna täcker:
 *   1. Vad är Tipspromenaden? (GPS-baserad quizpromenad utomhus)
 *   2. Så funkar det (skanna QR eller skapa själv)
 *   3. Kom igång (tips om biblioteket)
 *
 * Sveps med horisontell ScrollView med `pagingEnabled` — ingen extern
 * lib krävs (en av få ställen där default RN räcker långt).
 */

import React, { useRef, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  NativeSyntheticEvent,
  NativeScrollEvent,
  StatusBar,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useTranslation } from "../i18n";

export const ONBOARDED_STORAGE_KEY = "app.onboarded";

interface Props {
  /** Anropas när användaren slutför eller hoppar över. */
  onDone: () => void;
}

export default function OnboardingScreen({ onDone }: Props) {
  const { t } = useTranslation();
  const scrollRef = useRef<ScrollView | null>(null);
  const [page, setPage] = useState(0);
  const { width } = Dimensions.get("window");

  // 3 sidor — emoji, titel, text. Håller datat i en array så det är lätt
  // att lägga till en sida senare.
  const pages: { emoji: string; titleKey: string; bodyKey: string }[] = [
    {
      emoji: "🌳📍",
      titleKey: "onboarding.page1Title",
      bodyKey: "onboarding.page1Body",
    },
    {
      emoji: "📱🗺️",
      titleKey: "onboarding.page2Title",
      bodyKey: "onboarding.page2Body",
    },
    {
      emoji: "🎯",
      titleKey: "onboarding.page3Title",
      bodyKey: "onboarding.page3Body",
    },
  ];

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const x = e.nativeEvent.contentOffset.x;
    const idx = Math.round(x / width);
    if (idx !== page) setPage(idx);
  }

  function next() {
    if (page < pages.length - 1) {
      scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
    } else {
      finish();
    }
  }

  async function finish() {
    try {
      await AsyncStorage.setItem(ONBOARDED_STORAGE_KEY, "true");
    } catch {
      // Inte kritiskt — sämsta fall ser de onboarding igen vid nästa
      // start. Inget värt att blocka på.
    }
    onDone();
  }

  const isLast = page === pages.length - 1;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F5F0E8"
        translucent={false}
      />
      {/* Top bar: bara "Hoppa över"-knappen, inte på sista sidan */}
      <View style={styles.topBar}>
        {!isLast ? (
          <TouchableOpacity onPress={finish} style={styles.skipButton}>
            <Text style={styles.skipText}>{t("onboarding.skip")}</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.skipButton} /> /* placeholder för spacing */
        )}
      </View>

      {/* Swipe-able pages */}
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        style={styles.scroll}
      >
        {pages.map((p, idx) => (
          <View key={idx} style={[styles.page, { width }]}>
            <Text style={styles.emoji}>{p.emoji}</Text>
            <Text style={styles.title}>{t(p.titleKey)}</Text>
            <Text style={styles.body}>{t(p.bodyKey)}</Text>
          </View>
        ))}
      </ScrollView>

      {/* Pagination dots */}
      <View style={styles.dots}>
        {pages.map((_, idx) => (
          <View
            key={idx}
            style={[styles.dot, idx === page && styles.dotActive]}
          />
        ))}
      </View>

      {/* Next / Done button */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          onPress={next}
          style={styles.nextButton}
          activeOpacity={0.8}
        >
          <Text style={styles.nextText}>
            {isLast ? t("onboarding.done") : t("onboarding.next")}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F0E8",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "ios" ? 56 : 24,
    paddingBottom: 8,
  },
  skipButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: "flex-end",
  },
  skipText: {
    fontSize: 15,
    color: "#8A9A8D",
    fontWeight: "500",
  },
  scroll: {
    flex: 1,
  },
  page: {
    flex: 1,
    paddingHorizontal: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  emoji: {
    fontSize: 72,
    marginBottom: 32,
    textAlign: "center",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1B3D2B",
    textAlign: "center",
    marginBottom: 16,
    lineHeight: 32,
  },
  body: {
    fontSize: 17,
    color: "#4A5E4C",
    textAlign: "center",
    lineHeight: 25,
    maxWidth: 360,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 24,
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#D9D2C2",
  },
  dotActive: {
    backgroundColor: "#1B6B35",
    width: 24,
  },
  bottomBar: {
    paddingHorizontal: 32,
    paddingBottom: Platform.OS === "ios" ? 40 : 24,
  },
  nextButton: {
    backgroundColor: "#1B6B35",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
      web: { boxShadow: "0px 2px 6px rgba(0,0,0,0.1)" },
    }),
  },
  nextText: {
    color: "#F5F0E8",
    fontSize: 17,
    fontWeight: "700",
  },
});
