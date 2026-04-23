/**
 * @file MapTypeToggle.tsx
 * @description Liten flytande knapp som cyklar karttyp (standard → hybrid → terrain).
 *
 * Används av ActiveWalkScreen och CreateWalkScreen. Valet persisteras av
 * `useMapType`-hooken; den här komponenten hanterar bara presentation.
 *
 * Position/placement styrs av anroparen via `style`-propen så samma knapp
 * kan ligga i olika hörn på olika skärmar.
 */

import React from "react";
import { TouchableOpacity, Text, StyleSheet, Platform, StyleProp, ViewStyle } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { MapType } from "../services/storage";
import { useTranslation } from "../i18n";

interface Props {
  mapType: MapType;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

const ICON_BY_TYPE: Record<MapType, React.ComponentProps<typeof MaterialCommunityIcons>["name"]> = {
  standard: "map-outline",
  hybrid: "satellite-variant",
  terrain: "image-filter-hdr",
};

export default function MapTypeToggle({ mapType, onPress, style }: Props) {
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.button, style]}
      activeOpacity={0.7}
      accessibilityLabel={t("mapType.toggleLabel")}
      accessibilityHint={t(`mapType.${mapType}` as any)}
    >
      <MaterialCommunityIcons name={ICON_BY_TYPE[mapType]} size={20} color="#2C3E2D" />
      <Text style={styles.label}>{t(`mapType.${mapType}` as any)}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.95)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 6,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 2px 6px rgba(0,0,0,0.15)" },
    }),
  },
  label: {
    color: "#2C3E2D",
    fontSize: 13,
    fontWeight: "600",
  },
});
