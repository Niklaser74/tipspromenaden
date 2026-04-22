/**
 * @file ManageTagsScreen.tsx
 * @description Skärm för att skapa, döpa om och radera privata taggar.
 *
 *   Nås via "Hantera taggar"-knappen i tagg-filterraden på HomeScreen.
 *   Ingen sortering eller filtrering här — bara raw-katalog. Visar hur
 *   många promenader varje tagg är satt på som en liten hint.
 *
 *   Rename sker inline (tagg-raden förvandlas till en TextInput vid
 *   redigering) istället för via `Alert.prompt` — den funktionen finns
 *   bara på iOS och vi vill att upplevelsen ska vara likadan överallt.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  FlatList,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  Tag,
  createTag,
  deleteTag,
  getAllTags,
  getTagsByWalk,
  renameTag,
} from "../services/walkTags";
import { useTranslation } from "../i18n";

export default function ManageTagsScreen() {
  const { t } = useTranslation();
  const [tags, setTags] = useState<Tag[]>([]);
  const [usageCount, setUsageCount] = useState<Record<string, number>>({});
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const reload = useCallback(async () => {
    const [all, byWalk] = await Promise.all([getAllTags(), getTagsByWalk()]);
    const counts: Record<string, number> = {};
    for (const tagIds of Object.values(byWalk)) {
      for (const id of tagIds) counts[id] = (counts[id] || 0) + 1;
    }
    setTags(all);
    setUsageCount(counts);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      await createTag(name);
      setNewName("");
      await reload();
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message || t("common.error"));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setEditDraft(tag.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft("");
  };

  const commitEdit = async () => {
    if (!editingId) return;
    const name = editDraft.trim();
    if (!name) {
      cancelEdit();
      return;
    }
    try {
      await renameTag(editingId, name);
      cancelEdit();
      await reload();
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message || t("common.error"));
    }
  };

  const handleDelete = (tag: Tag) => {
    Alert.alert(
      t("manageTags.deleteTitle"),
      t("manageTags.deleteMessage", { name: tag.name }),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("common.delete"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteTag(tag.id);
              await reload();
            } catch (e: any) {
              Alert.alert(t("common.error"), e?.message || t("common.error"));
            }
          },
        },
      ]
    );
  };

  const renderTag = ({ item }: { item: Tag }) => {
    const count = usageCount[item.id] || 0;
    const isEditing = editingId === item.id;

    return (
      <View style={styles.tagRow}>
        <View style={styles.tagInfo}>
          {isEditing ? (
            <TextInput
              style={styles.editInput}
              value={editDraft}
              onChangeText={setEditDraft}
              onSubmitEditing={commitEdit}
              onBlur={commitEdit}
              maxLength={30}
              autoFocus
              returnKeyType="done"
            />
          ) : (
            <>
              <Text style={styles.tagName}>{item.name}</Text>
              <Text style={styles.tagMeta}>
                {count > 0
                  ? t("manageTags.usedIn", { count })
                  : t("manageTags.unused")}
              </Text>
            </>
          )}
        </View>

        {isEditing ? (
          <>
            <TouchableOpacity
              onPress={cancelEdit}
              style={styles.iconButton}
              activeOpacity={0.6}
            >
              <Text style={styles.dangerText}>✕</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={commitEdit}
              style={[styles.iconButton, styles.iconButtonPrimary]}
              activeOpacity={0.6}
            >
              <Text style={styles.primaryText}>✓</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity
              onPress={() => startEdit(item)}
              style={styles.iconButton}
              activeOpacity={0.6}
              accessibilityLabel={t("manageTags.rename")}
            >
              <MaterialCommunityIcons
                name="rename-box"
                size={20}
                color="#2C3E2D"
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleDelete(item)}
              style={[styles.iconButton, styles.iconButtonDanger]}
              activeOpacity={0.6}
              accessibilityLabel={t("manageTags.delete")}
            >
              <Text style={styles.dangerText}>🗑️</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FlatList
        data={tags}
        keyExtractor={(t) => t.id}
        renderItem={renderTag}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏷️</Text>
            <Text style={styles.emptyTitle}>{t("manageTags.empty")}</Text>
            <Text style={styles.emptyHint}>{t("manageTags.emptyHint")}</Text>
          </View>
        }
      />

      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          value={newName}
          onChangeText={setNewName}
          placeholder={t("manageTags.newTagPlaceholder")}
          placeholderTextColor="#B0BAB2"
          maxLength={30}
          returnKeyType="done"
          onSubmitEditing={handleAdd}
        />
        <TouchableOpacity
          style={[
            styles.addButton,
            (!newName.trim() || busy) && styles.addButtonDisabled,
          ]}
          onPress={handleAdd}
          disabled={!newName.trim() || busy}
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonText}>{t("manageTags.addButton")}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F0E8",
  },
  listContent: {
    padding: 16,
    paddingBottom: 24,
    flexGrow: 1,
  },

  tagRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#F0F0EC",
    gap: 8,
  },
  tagInfo: {
    flex: 1,
  },
  tagName: {
    color: "#2C3E2D",
    fontSize: 16,
    fontWeight: "600",
  },
  tagMeta: {
    color: "#8A9A8D",
    fontSize: 12,
    marginTop: 2,
  },
  editInput: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2C3E2D",
    borderBottomWidth: 1.5,
    borderBottomColor: "#1B6B35",
    paddingVertical: 2,
  },

  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F0F4F0",
    borderWidth: 1,
    borderColor: "#E0E8E0",
    justifyContent: "center",
    alignItems: "center",
  },
  iconButtonDanger: {
    backgroundColor: "#FBE9E7",
    borderColor: "#F6C8C3",
  },
  iconButtonPrimary: {
    backgroundColor: "#1B6B35",
    borderColor: "#1B6B35",
  },
  dangerText: {
    fontSize: 15,
  },
  primaryText: {
    color: "#F5F0E8",
    fontSize: 16,
    fontWeight: "800",
  },

  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 40,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2C3E2D",
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    color: "#8A9A8D",
    textAlign: "center",
    lineHeight: 20,
  },

  inputBar: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#E8E8E4",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  input: {
    flex: 1,
    backgroundColor: "#F5F0E8",
    borderWidth: 1.5,
    borderColor: "#E8E8E4",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: "#2C3E2D",
  },
  addButton: {
    backgroundColor: "#1B6B35",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 10,
    minWidth: 80,
    alignItems: "center",
  },
  addButtonDisabled: {
    opacity: 0.5,
  },
  addButtonText: {
    color: "#F5F0E8",
    fontSize: 14,
    fontWeight: "700",
  },
});
