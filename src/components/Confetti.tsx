/**
 * @file Confetti.tsx
 * @description Lättviktig konfetti-animation byggd på RN:s `Animated`-API.
 *
 * Spawnar N partiklar som faller från toppen med slumpad horisontell drift
 * och rotation. Helt OTA-bart — inga native-deps utöver det som redan finns
 * i Expo SDK. Tänkt att overlay:as ovanpå skärmar via absolut position.
 */

import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from "react-native";

const COLORS = ["#E8B830", "#2D7A3A", "#1B6B35", "#FFCDD2", "#C8E6C9", "#F5F0E8", "#E76F51"];

type Particle = {
  startX: number;
  driftX: number;
  delay: number;
  duration: number;
  rotateTo: number;
  size: number;
  color: string;
  shape: "rect" | "circle";
};

interface ConfettiProps {
  /** Antal partiklar (default 36). */
  count?: number;
  /** Förhindra att animationen startar (t.ex. när score är låg). */
  active?: boolean;
}

export default function Confetti({ count = 36, active = true }: ConfettiProps) {
  const { width, height } = useWindowDimensions();

  const particles = useMemo<Particle[]>(() => {
    if (!active) return [];
    return Array.from({ length: count }).map(() => ({
      startX: Math.random() * width,
      driftX: (Math.random() - 0.5) * 120,
      delay: Math.random() * 600,
      duration: 1800 + Math.random() * 1400,
      rotateTo: (Math.random() - 0.5) * 720,
      size: 6 + Math.random() * 8,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      shape: Math.random() > 0.5 ? "rect" : "circle",
    }));
  }, [count, width, active]);

  if (!active) return null;

  return (
    <View pointerEvents="none" style={[styles.container, { width, height }]}>
      {particles.map((p, i) => (
        <ConfettiPiece key={i} particle={p} screenHeight={height} />
      ))}
    </View>
  );
}

function ConfettiPiece({ particle, screenHeight }: { particle: Particle; screenHeight: number }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: particle.duration,
      delay: particle.delay,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [progress, particle]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-40, screenHeight + 40],
  });
  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, particle.driftX],
  });
  const rotate = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", `${particle.rotateTo}deg`],
  });
  const opacity = progress.interpolate({
    inputRange: [0, 0.1, 0.85, 1],
    outputRange: [0, 1, 1, 0],
  });

  return (
    <Animated.View
      style={[
        styles.piece,
        {
          left: particle.startX,
          width: particle.size,
          height: particle.size,
          backgroundColor: particle.color,
          borderRadius: particle.shape === "circle" ? particle.size / 2 : 2,
          opacity,
          transform: [{ translateY }, { translateX }, { rotate }],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
  },
  piece: {
    position: "absolute",
    top: 0,
  },
});
