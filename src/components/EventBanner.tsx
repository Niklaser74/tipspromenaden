/**
 * @file EventBanner.tsx
 * @description Smal banner som visas högst upp i appen när ett event är aktivt.
 * Visar event-namn + logo (om satt) och en "Avsluta"-knapp för att gå tillbaka
 * till standard-läget.
 *
 * Mountas i `App.tsx` ovanför `<OfflineBanner />`. När inget event är aktivt
 * renderas null (no-op), så banner-stacken är osynlig för normala användare.
 */

import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  StyleSheet,
  Alert,
} from "react-native";
import { useEventTheme } from "../context/EventThemeContext";

export default function EventBanner() {
  const { event, isActive, colors, deactivateEvent } = useEventTheme();

  if (!isActive || !event) return null;

  const handleEnd = () => {
    Alert.alert(
      "Avsluta event-läge?",
      `Du lämnar ${event.name} och appen återgår till standard-utseendet.`,
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Avsluta",
          style: "destructive",
          onPress: () => {
            deactivateEvent().catch(() => {});
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.primary }]}>
      {event.logoUrl ? (
        <Image
          source={{ uri: event.logoUrl }}
          style={styles.logo}
          resizeMode="contain"
        />
      ) : (
        <Text style={styles.emoji}>🏁</Text>
      )}
      <Text style={styles.name} numberOfLines={1}>
        {event.name}
      </Text>
      <TouchableOpacity
        onPress={handleEnd}
        style={styles.endButton}
        accessibilityLabel="Avsluta event-läge"
      >
        <Text style={styles.endText}>Avsluta</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 8,
  },
  emoji: {
    fontSize: 16,
  },
  logo: {
    width: 24,
    height: 24,
  },
  name: {
    flex: 1,
    color: "#F5F0E8",
    fontSize: 13,
    fontWeight: "600",
  },
  endButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "rgba(245,240,232,0.18)",
  },
  endText: {
    color: "#F5F0E8",
    fontSize: 12,
    fontWeight: "600",
  },
});
