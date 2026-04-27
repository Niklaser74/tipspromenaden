/**
 * @file WalkActionsMenu.tsx
 * @description Bottom-sheet med sekundära åtgärder för en SavedWalk.
 *
 * I HomeScreen hade vi tidigare 5-8 ikon-knappar per walk-rad, vilket
 * blev visuellt rörigt och dåligt skalbart när nya funktioner lades till.
 * Den här menyn samlar de mindre använda åtgärderna bakom en ⋯-knapp.
 * Synlig i kortet är bara Dela (+ Redigera/QR för skapare).
 *
 * Kontrolleras genom att HomeScreen sätter `walk` till en SavedWalk
 * (öppnar) eller `null` (stänger). Inga andra props förändras runtime.
 *
 * Stöd för svipa-ner-att-stänga via tap på overlay; en explicit "Stäng"-
 * knapp i botten ger redundans för användare som inte vet det.
 */
import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  Platform,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { SavedWalk } from "../types";

export interface WalkActionsMenuProps {
  walk: SavedWalk | null;
  isCreator: boolean;
  onClose: () => void;
  onLeaderboard: () => void;
  onTags: () => void;
  onRename: () => void;
  onInsights: () => void;
  onDelete: () => void;
  t: (key: string, opts?: any) => string;
}

export default function WalkActionsMenu({
  walk,
  isCreator,
  onClose,
  onLeaderboard,
  onTags,
  onRename,
  onInsights,
  onDelete,
  t,
}: WalkActionsMenuProps) {
  if (!walk) return null;

  return (
    <Modal
      visible={!!walk}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        {/* Stoppa propagation: tap inom själva sheet:n stänger inte. */}
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View style={styles.sheet}>
            <View style={styles.handle} />
            <Text style={styles.title} numberOfLines={1}>
              {walk.walk.title}
            </Text>

            {isCreator && (
              <Row
                icon="chart-bar"
                label={t("home.menuInsights")}
                onPress={() => {
                  onClose();
                  onInsights();
                }}
              />
            )}
            <Row
              icon="trophy-outline"
              label={t("home.menuLeaderboard")}
              onPress={() => {
                onClose();
                onLeaderboard();
              }}
            />
            <Row
              icon="tag-outline"
              label={t("home.menuTags")}
              onPress={() => {
                onClose();
                onTags();
              }}
            />
            <Row
              icon="rename-box"
              label={t("home.menuRename")}
              onPress={() => {
                onClose();
                onRename();
              }}
            />
            <Row
              icon="trash-can-outline"
              label={t("home.menuDelete")}
              destructive
              onPress={() => {
                onClose();
                onDelete();
              }}
            />

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

function Row({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: React.ComponentProps<typeof MaterialCommunityIcons>["name"];
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.6}>
      <MaterialCommunityIcons
        name={icon}
        size={22}
        color={destructive ? "#B0413E" : "#2C3E2D"}
      />
      <Text style={[styles.rowLabel, destructive && styles.rowLabelDestructive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 24,
    paddingHorizontal: 8,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
      },
      android: { elevation: 12 },
      web: { boxShadow: "0px -2px 8px rgba(0,0,0,0.1)" },
    }),
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D4D4D0",
    alignSelf: "center",
    marginBottom: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "600",
    color: "#6B7568",
    textAlign: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 14,
  },
  rowLabel: {
    fontSize: 16,
    color: "#2C3E2D",
    fontWeight: "500",
  },
  rowLabelDestructive: {
    color: "#B0413E",
  },
  cancelButton: {
    marginTop: 8,
    marginHorizontal: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#F5F0E8",
    alignItems: "center",
  },
  cancelText: {
    fontSize: 16,
    color: "#2C3E2D",
    fontWeight: "600",
  },
});
