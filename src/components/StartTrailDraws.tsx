/**
 * @file StartTrailDraws.tsx
 * @description "Stigen ritas" — välkomstanimation för Tipspromenaden.
 *
 * Mörkgrön panel, T-formad stig som ritar sig själv via stroke-dashoffset,
 * tre röda checkpoints landar staggrat, wordmark + tagline tonar in.
 * Tappa var som helst för att hoppa över.
 *
 * **Designkälla:** Claude Design-handoff (Friluft Folio).
 *
 * **Krasch-fix v2 (2026-05-07):**
 * Den tidigare versionen kraschade på Android i build 17. Tre samtidiga
 * problem i SVG-rendering:
 *   1. `<AnimatedG transform={string-interpolation}>` är fragilt på
 *      Android via react-native-svg.
 *   2. `<SvgText fontFamily="Lora_600SemiBold">` resolvar inte
 *      expo-font-registrerade fonter på Android (kräver native build-tids
 *      asset-mapp, inte JS runtime-registrering).
 *   3. Animated.Value på opacity + transform på samma G samtidigt får
 *      bridgen att flippa.
 *
 * Den här versionen följer RN-mönstret: **SVG ritar statiska former,
 * `Animated.View` wrappar dem och sköter transformer/opacity utanför
 * SVG:n**. Trail-stroken behåller stroke-dashoffset-animationen (det
 * mönstret är välbeprövat och säkert).
 *
 * **Stack:** `react-native-svg` + classic `Animated`. SVG-props kan inte
 * useNativeDriver så `useNativeDriver: false` på trail-strokens animering;
 * checkpoint-View:erna och text-elementen kör native driver.
 *
 * **Tids­linje:** oförändrad sedan v1
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
  Text,
} from "react-native";
import Svg, { G, Path, Polygon } from "react-native-svg";
import { TP } from "../theme/colors";

const AnimatedPath = Animated.createAnimatedComponent(Path);

const VIEWBOX = 380;
/** stroke-dashoffset behöver matcha path-längden + linecap-kapar; 400 är safe over-cap. */
const TRAIL_LEN = 400;

/** Kontrollpunkt-positioner i viewBox-koordinater (380×380). */
const CHECKPOINTS: Array<{ cx: number; cy: number; n: number }> = [
  { cx: 190, cy: 215, n: 1 },
  { cx: 130, cy: 130, n: 2 },
  { cx: 290, cy: 130, n: 3 },
];
const CHECKPOINT_SIZE_VB = 42; // i viewBox-koordinater

interface Props {
  onComplete?: () => void;
}

/**
 * Checkpoint som View ovanpå SVG (inte SvgText/SvgCircle inuti animerad G).
 * scale + opacity körs på native driver — säkert och prestandavänligt.
 *
 * Cirklarna ritas med borderRadius istället för SVG. Lora-fonten på
 * `<Text>` resolveras genom RN:s vanliga font-registrering (= fungerar
 * eftersom App.tsx kallar useFonts på Lora_600SemiBold).
 */
function AnimatedCheckpoint({
  cx,
  cy,
  n,
  scaleVb,
  delay,
}: {
  cx: number; // viewBox-x
  cy: number; // viewBox-y
  n: number;
  scaleVb: number; // viewBox→pixel-skala
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
        useNativeDriver: true,
      }),
    ]).start();
  }, [delay, t]);

  const sizePx = CHECKPOINT_SIZE_VB * scaleVb;
  const halfPx = sizePx / 2;
  const left = cx * scaleVb - halfPx;
  const top = cy * scaleVb - halfPx;

  const scale = t.interpolate({
    inputRange: [0, 1],
    outputRange: [0.6, 1],
  });

  return (
    <Animated.View
      style={[
        styles.checkpoint,
        {
          left,
          top,
          width: sizePx,
          height: sizePx,
          borderRadius: halfPx,
          opacity: t,
          transform: [{ scale }],
        },
      ]}
    >
      <View
        style={{
          position: "absolute",
          left: 3,
          top: 3,
          right: 3,
          bottom: 3,
          borderRadius: halfPx - 3,
          backgroundColor: TP.pin,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            fontFamily: "Lora_600SemiBold",
            fontSize: sizePx * 0.5,
            color: TP.pinIvory,
            includeFontPadding: false,
            lineHeight: sizePx * 0.6,
          }}
        >
          {n}
        </Text>
      </View>
    </Animated.View>
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
  const scaleVb = renderSize / VIEWBOX;

  const trailDraw = useRef(new Animated.Value(0)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordTranslate = useRef(new Animated.Value(8)).current;
  const tagOpacity = useRef(new Animated.Value(0)).current;
  const tagTranslate = useRef(new Animated.Value(6)).current;

  // Guard så vi inte kallar onComplete två gånger
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
        </Svg>
        {/* Checkpoints renderas som Animated.View ovanpå SVG:n istället för
            SvgCircle/SvgText inuti en animerad G. Detta löser kraschen som
            uppstod när react-native-svg på Android fick både animerad
            transform-string och unresolverad SvgText-fontFamily samtidigt. */}
        {CHECKPOINTS.map((cp, i) => (
          <AnimatedCheckpoint
            key={i}
            cx={cp.cx}
            cy={cp.cy}
            n={cp.n}
            scaleVb={scaleVb}
            delay={1400 + i * 200}
          />
        ))}
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
  checkpoint: {
    position: "absolute",
    backgroundColor: TP.pinIvory, // ytterring
    alignItems: "center",
    justifyContent: "center",
  },
  wordmarkWrap: {
    alignItems: "center",
    marginTop: 24,
    paddingHorizontal: 24,
  },
  wordmark: {
    fontFamily: "Lora_600SemiBold",
    fontSize: 30,
    color: TP.bg,
    letterSpacing: -0.3,
  },
  tagline: {
    fontFamily: "Lora_400Regular_Italic",
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
