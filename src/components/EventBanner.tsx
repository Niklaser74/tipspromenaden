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
import { useTranslation } from "../i18n";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function EventBanner() {
  const { event, isActive, colors, deactivateEvent } = useEventTheme();
  const { t } = useTranslation();
  // Banner ligger högst upp i App.tsx, ovan navigatorn → INGEN egen header
  // skuggar status-bar:n. Vi måste själva pad:a för notch/status-ikoner,
  // annars krockar Samsung/iPhone-statusbaren med logo + namn.
  const insets = useSafeAreaInsets();

  if (!isActive || !event) return null;

  const handleEnd = () => {
    Alert.alert(
      t("event.endConfirmTitle"),
      t("event.endConfirmMessage", { name: event.name }),
      [
        { text: t("event.endConfirmCancel"), style: "cancel" },
        {
          text: t("event.endConfirmConfirm"),
          style: "destructive",
          onPress: () => {
            deactivateEvent().catch(() => {});
          },
        },
      ]
    );
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.primary,
          paddingTop: insets.top + 6,
        },
      ]}
    >
      {event.logoUrl ? (
        <Image
          source={{ uri: event.logoUrl }}
          style={styles.logo}
          resizeMode="contain"
        />
      ) : (
        <Text style={styles.emoji}>🏁</Text>
      )}
      {/* Visa event-namn i banner endast om logon saknas — annars upprepas
          informationen och stjäl plats från wordmark-logos. */}
      {!event.logoUrl && (
        <Text style={styles.name} numberOfLines={1}>
          {event.name}
        </Text>
      )}
      <TouchableOpacity
        onPress={handleEnd}
        style={styles.endButton}
        accessibilityLabel={t("event.bannerEndA11y")}
      >
        <Text style={styles.endText}>{t("event.bannerEnd")}</Text>
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
    // Wordmark-vänlig storlek: brett rektangulärt utrymme, höjd ~32 px
    // för att inte spränga bannerns vertikala layout. flex: 1 låter
    // logon ta tillgängligt utrymme efter Avsluta-knappen. resizeMode
    // "contain" (sätts på Image) bevarar proportioner.
    flex: 1,
    height: 32,
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
