/**
 * @file StartTrailDraws.tsx
 * @description "Stigen ritas" — välkomstanimation för Tipspromenaden.
 *
 * Mörkgrön panel, T-formad stig som ritar sig själv via stroke-dashoffset,
 * tre röda checkpoints landar staggrat, wordmark + tagline tonar in.
 * Tappa var som helst för att hoppa över.
 *
 * **Designkälla:** Claude Design-handoff 2026-05-06 (se
 * docs/marketing/animations-handoff/ om paketet ligger kvar). Originalet
 * är skrivet i Reanimated 3 — den här porten använder RN:s inbyggda
 * `Animated`-API för att hålla ändringen OTA-bar (Reanimated kräver native
 * dep + ny AAB-build).
 *
 * **Stack:** `react-native-svg` (redan installerad transitive via Expo)
 * + classic `Animated`. SVG-props kan inte useNativeDriver så
 * `useNativeDriver: false` på allt som binder mot SVG.
 *
 * **Tids­linje:**
 *   0–1.6s   Stigen ritar sig
 *   1.4–1.8s Checkpoints landar (200 ms stagger)
 *   2.4s     Wordmark fadar in (700 ms)
 *   2.8s     Tagline fadar in (700 ms)
 *   3.6s     onComplete körs (om inte tappad förr)
 */

import React, { useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
  useWindowDimensions,
  Platform,
  Text,
} from "react-native";
import Svg, {
  Circle,
  G,
  Path,
  Polygon,
  Text as SvgText,
} from "react-native-svg";
import { TP } from "../theme/colors";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

const VIEWBOX = 380;
/**
 * stroke-dashoffset behöver matcha den faktiska path-längden.
 * T-stem (160) + T-bar (200) ≈ 360, plus rundade kapar (~22) ger 382.
 * Vi cap:ar uppåt till 400 så animationen alltid slutar med fully drawn
 * även om en plattform räknar något annorlunda.
 */
const TRAIL_LEN = 400;

interface Props {
  onComplete?: () => void;
}

function AnimatedCheckpoint({
  cx,
  cy,
  n,
  size,
  delay,
}: {
  cx: number;
  cy: number;
  n: number;
  size: number;
  delay: number;
}) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(t, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();
  }, [delay, t]);

  // Spring-känsla via två-stegs scale (0.6 → 1.05 → 1) hade varit fint
  // men classic Animated.interpolate tar bara monotont input. Vi nöjer oss
  // med en mjuk easeOut som README:n också specat.
  const transform = t.interpolate({
    inputRange: [0, 1],
    outputRange: [
      `translate(${cx} ${cy}) scale(0.6) translate(${-cx} ${-cy})`,
      `translate(${cx} ${cy}) scale(1) translate(${-cx} ${-cy})`,
    ],
  });

  const r = size / 2;

  return (
    <AnimatedG opacity={t} transform={transform as unknown as string}>
      <Circle cx={cx} cy={cy} r={r - 1} fill={TP.pinIvory} />
      <Circle cx={cx} cy={cy} r={r - 4} fill={TP.pin} />
      <SvgText
        x={cx}
        y={cy + size * 0.18}
        textAnchor="middle"
        fontFamily={Platform.select({ ios: "Lora", android: "serif", default: "serif" })}
        fontSize={size * 0.5}
        fontWeight="700"
        fill={TP.pinIvory}
      >
        {n}
      </SvgText>
    </AnimatedG>
  );
}

function ForestEdges() {
  return (
    <G opacity={0.9}>
      <Polygon points="10,360 32,310 54,360" fill={TP.forestDk} opacity={0.55} />
      <Polygon points="35,360 60,300 85,360" fill={TP.forestDk} opacity={0.7} />
      <Polygon points="65,360 90,320 115,360" fill={TP.forestDk} opacity={0.5} />
      <Polygon points="290,360 312,310 334,360" fill={TP.forestDk} opacity={0.5} />
      <Polygon points="320,360 348,300 376,360" fill={TP.forestDk} opacity={0.65} />
    </G>
  );
}

export default function StartTrailDraws({ onComplete }: Props) {
  const { width, height } = useWindowDimensions();
  const renderSize = Math.min(width, height, 480);

  const trailDraw = useRef(new Animated.Value(0)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordTranslate = useRef(new Animated.Value(8)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const tagTranslate = useRef(new Animated.Value(6)).current;

  // En ref-baserad guard så vi inte kallar onComplete två gånger
  // (timeout-utlöst + tap-skip kapplöpning).
  const completedRef = useRef(false);
  const finish = () => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete?.();
  };

  useEffect(() => {
    Animated.timing(trailDraw, {
      toValue: 1,
      duration: 1600,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false, // bundet mot SVG-prop
    }).start();

    Animated.parallel([
      Animated.sequence([
        Animated.delay(2400),
        Animated.timing(wordOpacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(2400),
        Animated.timing(wordTranslate, {
          toValue: 0,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(2800),
        Animated.timing(tagOpacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(2800),
        Animated.timing(tagTranslate, {
          toValue: 0,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    const timeout = setTimeout(finish, 3600);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const strokeDashoffset = trailDraw.interpolate({
    inputRange: [0, 1],
    outputRange: [TRAIL_LEN, 0],
  });

  return (
    <Pressable style={styles.root} onPress={finish}>
      <View style={[styles.canvas, { width: renderSize, height: renderSize }]}>
        <Svg
          width={renderSize}
          height={renderSize}
          viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
        >
          <ForestEdges />
          <AnimatedPath
            d="M 190 290 L 190 130 M 90 130 L 290 130"
            stroke={TP.trail}
            strokeWidth={22}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={TRAIL_LEN}
            strokeDashoffset={strokeDashoffset as unknown as number}
          />
          <AnimatedCheckpoint cx={190} cy={215} n={1} size={42} delay={1400} />
          <AnimatedCheckpoint cx={130} cy={130} n={2} size={42} delay={1600} />
          <AnimatedCheckpoint cx={290} cy={130} n={3} size={42} delay={1800} />
        </Svg>
      </View>

      <View style={styles.wordmarkWrap}>
        <Animated.Text
          style={[
            styles.wordmark,
            {
              opacity: wordOpacity,
              transform: [{ translateY: wordTranslate }],
            },
          ]}
        >
          Tipspromenaden
        </Animated.Text>
        <Animated.Text
          style={[
            styles.tagline,
            {
              opacity: tagOpacity,
              transform: [{ translateY: tagTranslate }],
            },
          ]}
        >
          en quizpromenad i fickan
        </Animated.Text>
      </View>

      {/* Tap-to-skip-hint — diskret, tonas in efter att animationen börjat. */}
      <Animated.View style={[styles.skipHint, { opacity: wordOpacity }]}>
        <Text style={styles.skipText}>Tryck för att hoppa över</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: TP.forestDk,
    alignItems: "center",
    justifyContent: "center",
  },
  canvas: {
    overflow: "hidden",
  },
  wordmarkWrap: {
    alignItems: "center",
    marginTop: 24,
    paddingHorizontal: 24,
  },
  wordmark: {
    // Lora finns inte i appen ännu — system serif som fallback ger ändå
    // en serif-känsla på både iOS (Times-style) och Android (Noto Serif).
    fontFamily: Platform.select({ ios: "Times New Roman", android: "serif", default: "serif" }),
    fontSize: 30,
    fontWeight: "600",
    color: TP.bg,
    letterSpacing: -0.3,
  },
  tagline: {
    fontFamily: Platform.select({ ios: "Times New Roman", android: "serif", default: "serif" }),
    fontStyle: "italic",
    fontSize: 13,
    color: TP.fgMute,
    marginTop: 6,
  },
  skipHint: {
    position: "absolute",
    bottom: 32,
    alignItems: "center",
    width: "100%",
  },
  skipText: {
    color: TP.fgMute,
    fontSize: 11,
    letterSpacing: 0.6,
  },
});
