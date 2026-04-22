/**
 * @file EditTagsModal.tsx
 * @description Modal för att välja vilka taggar som ska gälla för en
 *   specifik promenad. Öppnas från HomeScreen när användaren trycker
 *   länge på ett walk-kort eller på tagg-knappen.
 *
 *   Hela tagg-katalogen visas som "pillar" — tryck växlar på/av. Ny tagg
 *   kan skapas direkt i modalen utan att behöva gå till ManageTagsScreen.
 *   Ändringar sparas när användaren trycker "Klar" (eller rör backdrop).
 */

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  Alert,
} from "react-native";
import {
  Tag,
  createTag,
  getAllTags,
  setTagsForWalk,
} from "../services/walkTags";
import { useTranslation } from "../i18n";

interface Props {
  /** Walk-id som taggar ska redigeras för. När null är modalen stängd. */
  walkId: string | null;
  /** Walkens visningstitel — visas som kontext överst i modalen. */
  walkTitle: string;
  /** Nuvarande tagg-id:n för walken. */
  currentTagIds: string[];
  /** Anropas med den slutgiltiga uppsättningen tagg-id:n när användaren stänger. */
  onClose: (newTagIds: string[] | null) => void;
}

export default function EditTagsModal({
  walkId,
  walkTitle,
  currentTagIds,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  // Ladda om när modalen öppnas (walkId går från null → något) så att
  // nyskapade taggar från andra vägar också syns.
  useEffect(() => {
    if (walkId === null) return;
    setSelected(new Set(currentTagIds));
    setNewName("");
    (async () => {
      const all = await getAllTags();
      setAllTags(all);
    })();
  }, [walkId, currentTagIds]);

  const toggle = (tagId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const addInline = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const tag = await createTag(name);
      setAllTags(await getAllTags());
      setSelected((prev) => new Set(prev).add(tag.id));
      setNewName("");
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message || t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!walkId) return;
    const ids = Array.from(selected);
    try {
      await setTagsForWalk(walkId, ids);
      onClose(ids);
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message || t("common.error"));
      onClose(null);
    }
  };

  return (
    <Modal
      visible={walkId !== null}
      transparent
      animationType="fade"
      onRequestClose={() => onClose(null)}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.overlay}
      >
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => onClose(null)}
        />
        <View style={styles.card}>
          <Text style={styles.title}>{t("home.tagsEditTitle")}</Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {walkTitle}
          </Text>
          <Text style={styles.message}>
            {allTags.length === 0
              ? t("home.tagsEditEmpty")
              : t("home.tagsEditMessage")}
          </Text>

          {allTags.length > 0 && (
            <ScrollView
              style={styles.chipsScroll}
              contentContainerStyle={styles.chipsContent}
              showsVerticalScrollIndicator={false}
            >
              {allTags.map((tag) => {
                const on = selected.has(tag.id);
                return (
                  <TouchableOpacity
                    key={tag.id}
                    style={[styles.chip, on && styles.chipOn]}
                    onPress={() => toggle(tag.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>
                      {on ? "✓ " : ""}
                      {tag.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}

          <View style={styles.addRow}>
            <TextInput
              style={styles.input}
              value={newName}
              onChangeText={setNewName}
              placeholder={t("home.tagsNewPlaceholder")}
              placeholderTextColor="#B0BAB2"
              maxLength={30}
              returnKeyType="done"
              onSubmitEditing={addInline}
            />
            <TouchableOpacity
              style={[
                styles.addButton,
                (!newName.trim() || busy) && styles.addButtonDisabled,
              ]}
              onPress={addInline}
              disabled={!newName.trim() || busy}
              activeOpacity={0.8}
            >
              <Text style={styles.addButtonText}>{t("home.tagsAdd")}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.modalButton, styles.modalButtonPrimary]}
              onPress={save}
              activeOpacity={0.7}
            >
              <Text style={styles.modalButtonPrimaryText}>
                {t("home.tagsSave")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "80%",
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 22,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
      },
      android: { elevation: 12 },
      web: { boxShadow: "0px 8px 24px rgba(0,0,0,0.2)" },
    }),
  },
  title: {
    fontSize: 19,
    fontWeight: "700",
    color: "#2C3E2D",
  },
  subtitle: {
    fontSize: 14,
    color: "#4A5E4C",
    marginTop: 2,
    fontWeight: "500",
  },
  message: {
    fontSize: 13,
    color: "#8A9A8D",
    lineHeight: 18,
    marginTop: 8,
    marginBottom: 14,
  },

  chipsScroll: {
    maxHeight: 220,
    marginBottom: 12,
  },
  chipsContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: "#F0F4F0",
    borderWidth: 1,
    borderColor: "#E0E8E0",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  chipOn: {
    backgroundColor: "#1B6B35",
    borderColor: "#1B6B35",
  },
  chipText: {
    color: "#2C3E2D",
    fontSize: 13,
    fontWeight: "600",
  },
  chipTextOn: {
    color: "#F5F0E8",
  },

  addRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
  },
  input: {
    flex: 1,
    backgroundColor: "#F5F0E8",
    borderWidth: 1.5,
    borderColor: "#E8E8E4",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#2C3E2D",
  },
  addButton: {
    backgroundColor: "#E8B830",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 70,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: "#2C3E2D",
    fontSize: 13,
    fontWeight: "700",
  },

  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  modalButton: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    minWidth: 80,
    alignItems: "center",
  },
  modalButtonPrimary: {
    backgroundColor: "#1B6B35",
  },
  modalButtonPrimaryText: {
    color: "#F5F0E8",
    fontSize: 14,
    fontWeight: "700",
  },
});
