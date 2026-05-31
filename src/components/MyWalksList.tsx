/**
 * @file MyWalksList.tsx
 * @description Lista över användarens sparade promenader (egna + sparade från
 * andra). Innehåller segmented control (Mina / Sparade), tagg-filter, sort-
 * meny, walk-cards, rename-modal, edit-tags-modal och actions-meny.
 *
 * Tidigare bodde all den här logiken inne i HomeScreen. Flyttades hit för
 * att HomeScreen ska bli en ren portal (Skapa / Scanna / Bibliotek) och
 * "Mina promenader" får en egen flik i LibraryScreen.
 *
 * Komponenten är självständig: laddar sin egen data (sparade walks + tags)
 * och håller all UI-state internt. Den enda externa interaktionen är
 * `useNavigation` för att öppna detaljskärmar.
 */
import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  getSavedWalks,
  removeSavedWalk,
  setWalkAlias,
  displayWalkTitle,
} from "../services/storage";
import { flagForLanguage } from "../constants/languages";
import { findActiveSession, deleteWalkCompletely } from "../services/firestore";
import { useAuth } from "../context/AuthContext";
import { SavedWalk, Walk } from "../types";
import WalkActionsMenu from "./WalkActionsMenu";
import EditTagsModal from "./EditTagsModal";
import { syncPendingData } from "../services/offlineSync";
import { refreshAllSavedWalks } from "../services/walkRefresh";
import {
  Tag,
  getAllTags,
  getTagsByWalk,
  removeWalkFromTags,
} from "../services/walkTags";
import { getCurrentLocation } from "../utils/location";
import { distanceToWalk, LatLng } from "../utils/walkGeo";
import { shareContent } from "../utils/shareContent";
import { useTranslation } from "../i18n";

type WalkTab = "mine" | "saved";
type SortMode = "recent" | "name" | "distance";

// Throttle refresh-från-molnet till max var 5:e minut. Tidigare fyrade den
// på varje focus (= varje gång man swipade tillbaka till Library), vilket
// gav en Firestore-läsning per sparad walk per swipe.
const REFRESH_THROTTLE_MS = 5 * 60 * 1000;
let lastRefreshAt = 0;

export default function MyWalksList() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [savedWalks, setSavedWalks] = useState<SavedWalk[]>([]);
  const [renameTarget, setRenameTarget] = useState<SavedWalk | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");

  const [activeTab, setActiveTab] = useState<WalkTab>("mine");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [activeTagIds, setActiveTagIds] = useState<Set<string>>(new Set());

  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagsByWalk, setTagsByWalk] = useState<Record<string, string[]>>({});

  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [gpsStatus, setGpsStatus] = useState<
    "idle" | "loading" | "ok" | "denied"
  >("idle");

  const [editTagsFor, setEditTagsFor] = useState<SavedWalk | null>(null);
  const [actionsMenuFor, setActionsMenuFor] = useState<SavedWalk | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [walks, tags, byWalk] = await Promise.all([
        getSavedWalks(),
        getAllTags(),
        getTagsByWalk(),
      ]);
      if (cancelled) return;
      setSavedWalks(walks);
      setAllTags(tags);
      setTagsByWalk(byWalk);

      const now = Date.now();
      const shouldRefresh = now - lastRefreshAt > REFRESH_THROTTLE_MS;
      if (shouldRefresh) lastRefreshAt = now;
      const [, refreshed] = await Promise.all([
        syncPendingData().catch(() => {}),
        shouldRefresh ? refreshAllSavedWalks().catch(() => null) : null,
      ]);
      if (!cancelled && refreshed) setSavedWalks(refreshed);
    };
    load();
    const unsub = navigation.addListener("focus", load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [navigation]);

  useEffect(() => {
    if (sortMode !== "distance") return;
    if (gpsStatus === "ok" || gpsStatus === "loading") return;
    let cancelled = false;
    setGpsStatus("loading");
    getCurrentLocation()
      .then((loc) => {
        if (cancelled) return;
        setUserLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        setGpsStatus("ok");
      })
      .catch(() => {
        if (cancelled) return;
        setGpsStatus("denied");
      });
    return () => {
      cancelled = true;
    };
  }, [sortMode, gpsStatus]);

  const { mineWalks, otherWalks } = useMemo(() => {
    const uid = user?.uid;
    const mine: SavedWalk[] = [];
    const others: SavedWalk[] = [];
    for (const w of savedWalks) {
      if (uid && w.walk.createdBy === uid) mine.push(w);
      else others.push(w);
    }
    return { mineWalks: mine, otherWalks: others };
  }, [savedWalks, user?.uid]);

  const visibleTabWalks = activeTab === "mine" ? mineWalks : otherWalks;

  const filteredAndSorted = useMemo(() => {
    const filtered =
      activeTagIds.size === 0
        ? visibleTabWalks
        : visibleTabWalks.filter((sw) => {
            const walkTags = new Set(tagsByWalk[sw.walk.id] || []);
            for (const tagId of activeTagIds) {
              if (!walkTags.has(tagId)) return false;
            }
            return true;
          });

    const sorted = [...filtered];
    if (sortMode === "name") {
      sorted.sort((a, b) =>
        displayWalkTitle(a).localeCompare(displayWalkTitle(b), "sv", {
          sensitivity: "base",
        })
      );
    } else if (sortMode === "distance" && userLocation) {
      sorted.sort(
        (a, b) =>
          distanceToWalk(userLocation, a.walk) -
          distanceToWalk(userLocation, b.walk)
      );
    } else {
      sorted.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    }
    return sorted;
  }, [visibleTabWalks, activeTagIds, tagsByWalk, sortMode, userLocation]);

  const visibleTags = useMemo(() => {
    const usedIds = new Set<string>();
    for (const sw of visibleTabWalks) {
      for (const id of tagsByWalk[sw.walk.id] || []) usedIds.add(id);
    }
    return allTags.filter((t) => usedIds.has(t.id));
  }, [allTags, tagsByWalk, visibleTabWalks]);

  const toggleTagFilter = (tagId: string) => {
    setActiveTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const clearTagFilter = () => setActiveTagIds(new Set());

  const onEditTagsSaved = async (_newTagIds: string[] | null) => {
    setEditTagsFor(null);
    const [tags, byWalk] = await Promise.all([getAllTags(), getTagsByWalk()]);
    setAllTags(tags);
    setTagsByWalk(byWalk);
  };

  const handleShowLeaderboard = async (walk: Walk) => {
    try {
      if (walk.event) {
        navigation.navigate("Leaderboard", {
          sessionId: "",
          walkTitle: walk.title,
          totalQuestions: walk.questions.length,
          walkId: walk.id,
          isEvent: true,
        });
        return;
      }
      const session = await findActiveSession(walk.id);
      if (!session) {
        Alert.alert(
          t("home.leaderboardEmptyTitle"),
          t("home.leaderboardEmptyMessage")
        );
        return;
      }
      navigation.navigate("Leaderboard", {
        sessionId: session.id,
        walkTitle: walk.title,
        totalQuestions: walk.questions.length,
        walkId: walk.id,
        isEvent: false,
      });
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message || "");
    }
  };

  const handleDeleteWalk = (walk: Walk, isCreator: boolean) => {
    const title = isCreator
      ? t("home.deleteWalkTitle")
      : t("home.removeSavedTitle");
    const message = isCreator
      ? t("home.deleteWalkMessage", { title: walk.title })
      : t("home.removeSavedMessage");

    Alert.alert(title, message, [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          try {
            if (isCreator) {
              await deleteWalkCompletely(walk.id);
            }
            await removeSavedWalk(walk.id);
            await removeWalkFromTags(walk.id);
            setSavedWalks((prev) => prev.filter((w) => w.walk.id !== walk.id));
            setTagsByWalk((prev) => {
              if (!(walk.id in prev)) return prev;
              const next = { ...prev };
              delete next[walk.id];
              return next;
            });
          } catch (e: any) {
            Alert.alert(
              t("common.error"),
              e?.message || t("home.deleteWalkError")
            );
          }
        },
      },
    ]);
  };

  const openRename = (item: SavedWalk) => {
    setRenameTarget(item);
    setAliasDraft(item.alias ?? "");
  };

  const closeRename = () => {
    setRenameTarget(null);
    setAliasDraft("");
  };

  const saveAlias = async (alias: string | null) => {
    if (!renameTarget) return;
    try {
      const normalized = await setWalkAlias(renameTarget.walk.id, alias);
      setSavedWalks((prev) =>
        prev.map((w) =>
          w.walk.id === renameTarget.walk.id ? { ...w, alias: normalized } : w
        )
      );
    } catch (e: any) {
      Alert.alert(t("common.error"), e?.message || "");
    }
    closeRename();
  };

  if (savedWalks.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyIcon}>🌲</Text>
        <Text style={styles.emptyTitle}>{t("home.emptyTitle")}</Text>
        <Text style={styles.emptyDescription}>{t("home.emptyDesc")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.segmented}>
        <TouchableOpacity
          style={[
            styles.segmentedItem,
            activeTab === "mine" && styles.segmentedItemActive,
          ]}
          onPress={() => setActiveTab("mine")}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.segmentedText,
              activeTab === "mine" && styles.segmentedTextActive,
            ]}
          >
            {t("home.tabMine")} · {mineWalks.length}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.segmentedItem,
            activeTab === "saved" && styles.segmentedItemActive,
          ]}
          onPress={() => setActiveTab("saved")}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.segmentedText,
              activeTab === "saved" && styles.segmentedTextActive,
            ]}
          >
            {t("home.tabSaved")} · {otherWalks.length}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
          style={styles.chipsScroll}
        >
          <TouchableOpacity
            style={[
              styles.filterChip,
              activeTagIds.size === 0 && styles.filterChipActive,
            ]}
            onPress={clearTagFilter}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.filterChipText,
                activeTagIds.size === 0 && styles.filterChipTextActive,
              ]}
            >
              {t("home.tagsAll")}
            </Text>
          </TouchableOpacity>
          {visibleTags.map((tag) => {
            const on = activeTagIds.has(tag.id);
            return (
              <TouchableOpacity
                key={tag.id}
                style={[styles.filterChip, on && styles.filterChipActive]}
                onPress={() => toggleTagFilter(tag.id)}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    on && styles.filterChipTextActive,
                  ]}
                >
                  {tag.name}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity
            style={styles.manageChip}
            onPress={() => navigation.navigate("ManageTags")}
            activeOpacity={0.7}
            accessibilityLabel={t("home.tagsManage")}
          >
            <MaterialCommunityIcons
              name="tag-edit-outline"
              size={16}
              color="#4A5E4C"
            />
          </TouchableOpacity>
        </ScrollView>

        <TouchableOpacity
          style={styles.sortButton}
          onPress={() => setSortMenuOpen(true)}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons
            name="sort-variant"
            size={16}
            color="#2C3E2D"
          />
          <Text style={styles.sortButtonText}>
            {sortMode === "recent"
              ? t("home.sortRecent")
              : sortMode === "name"
              ? t("home.sortName")
              : t("home.sortDistance")}
          </Text>
        </TouchableOpacity>
      </View>

      {sortMode === "distance" && gpsStatus === "denied" && (
        <Text style={styles.gpsWarning}>{t("home.sortDistanceNoGps")}</Text>
      )}

      {filteredAndSorted.length === 0 && (
        <View style={styles.emptyFilterCard}>
          <Text style={styles.emptyFilterTitle}>{t("home.emptyFiltered")}</Text>
          <Text style={styles.emptyFilterDesc}>
            {t("home.emptyFilteredDesc")}
          </Text>
        </View>
      )}

      {filteredAndSorted.map((item) => {
        const isCreator = user && item.walk.createdBy === user.uid;
        const title = displayWalkTitle(item);
        const hasAlias = title !== item.walk.title;
        const walkTagNames = (tagsByWalk[item.walk.id] || [])
          .map((id) => allTags.find((t) => t.id === id)?.name)
          .filter((n): n is string => !!n);
        return (
          <TouchableOpacity
            key={item.walk.id}
            style={styles.walkCard}
            onPress={() => navigation.navigate("JoinWalk", { walk: item.walk })}
            onLongPress={() => setEditTagsFor(item)}
            delayLongPress={350}
            activeOpacity={0.7}
          >
            <View style={styles.walkCardTop}>
              <View style={styles.walkIconContainer}>
                <Text style={styles.walkIcon}>🗺️</Text>
              </View>
              <View style={styles.walkCardCenter}>
                <View style={styles.walkCardTitleRow}>
                  <Text style={styles.walkTitle} numberOfLines={2}>
                    {title}
                  </Text>
                  {isCreator && (
                    <View style={styles.creatorBadge}>
                      <Text style={styles.creatorBadgeText}>
                        {t("home.createdBadge")}
                      </Text>
                    </View>
                  )}
                </View>
                {hasAlias && (
                  <Text style={styles.originalTitle} numberOfLines={1}>
                    {item.walk.title}
                  </Text>
                )}
                <Text style={styles.walkInfo}>
                  {flagForLanguage(item.walk.language)}
                  {flagForLanguage(item.walk.language) ? "  " : ""}
                  {item.walk.activityType === "bike" ? "🚲  " : ""}
                  {t("home.questions", { count: item.walk.questions.length })}
                  {item.walk.event ? ` · ${item.walk.event.startDate}` : ""}
                </Text>
                {walkTagNames.length > 0 && (
                  <View style={styles.walkTagRow}>
                    {walkTagNames.map((name) => (
                      <View key={name} style={styles.walkTagPill}>
                        <Text style={styles.walkTagPillText}>{name}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>

            <View style={styles.walkCardActions}>
              <TouchableOpacity
                style={styles.editButton}
                onPress={() =>
                  shareContent({ kind: "walk", walk: item.walk }, t)
                }
                activeOpacity={0.6}
                accessibilityLabel={t("share.walkButton")}
              >
                <MaterialCommunityIcons
                  name="share-variant"
                  size={20}
                  color="#2C3E2D"
                />
              </TouchableOpacity>
              {isCreator && (
                <>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() =>
                      navigation.navigate("CreateWalk", { walk: item.walk })
                    }
                    activeOpacity={0.6}
                    accessibilityLabel={t("home.editWalk")}
                  >
                    <Text style={styles.editButtonText}>✏️</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.qrButton}
                    onPress={() =>
                      navigation.navigate("ShowQR", {
                        walk: item.walk,
                        qrData: item.qrData,
                      })
                    }
                    activeOpacity={0.6}
                    accessibilityLabel={t("nav.showQR")}
                  >
                    <MaterialCommunityIcons
                      name="qrcode"
                      size={22}
                      color="#F5F0E8"
                    />
                  </TouchableOpacity>
                </>
              )}
              <TouchableOpacity
                style={styles.editButton}
                onPress={() => setActionsMenuFor(item)}
                activeOpacity={0.6}
                accessibilityLabel={t("home.moreActions")}
              >
                <MaterialCommunityIcons
                  name="dots-horizontal"
                  size={22}
                  color="#2C3E2D"
                />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        );
      })}

      <Modal
        visible={renameTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={closeRename}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalOverlay}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={closeRename}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t("home.renameTitle")}</Text>
            <Text style={styles.modalMessage}>{t("home.renameMessage")}</Text>
            <TextInput
              style={styles.modalInput}
              value={aliasDraft}
              onChangeText={setAliasDraft}
              placeholder={
                renameTarget?.walk.title ?? t("home.renamePlaceholder")
              }
              placeholderTextColor="#B0BAB2"
              autoFocus
              maxLength={80}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonGhost]}
                onPress={closeRename}
                activeOpacity={0.7}
              >
                <Text style={styles.modalButtonGhostText}>
                  {t("common.cancel")}
                </Text>
              </TouchableOpacity>
              {renameTarget?.alias ? (
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonGhost]}
                  onPress={() => saveAlias(null)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalButtonGhostText}>
                    {t("home.renameReset")}
                  </Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={[styles.modalButton, styles.modalButtonPrimary]}
                onPress={() => saveAlias(aliasDraft)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalButtonPrimaryText}>
                  {t("home.renameSave")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={sortMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setSortMenuOpen(false)}
      >
        <TouchableOpacity
          style={styles.sortOverlay}
          activeOpacity={1}
          onPress={() => setSortMenuOpen(false)}
        >
          <View style={styles.sortSheet}>
            <Text style={styles.sortSheetTitle}>{t("home.sortLabel")}</Text>
            {(
              [
                { mode: "recent", label: t("home.sortRecent") },
                { mode: "name", label: t("home.sortName") },
                { mode: "distance", label: t("home.sortDistance") },
              ] as { mode: SortMode; label: string }[]
            ).map((opt) => {
              const isActive = sortMode === opt.mode;
              const disabled =
                opt.mode === "distance" && gpsStatus === "denied";
              return (
                <TouchableOpacity
                  key={opt.mode}
                  style={[
                    styles.sortOption,
                    isActive && styles.sortOptionActive,
                    disabled && styles.sortOptionDisabled,
                  ]}
                  disabled={disabled}
                  onPress={() => {
                    setSortMode(opt.mode);
                    setSortMenuOpen(false);
                  }}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.sortOptionText,
                      isActive && styles.sortOptionTextActive,
                      disabled && styles.sortOptionTextDisabled,
                    ]}
                  >
                    {isActive ? "✓  " : "    "}
                    {opt.label}
                  </Text>
                  {disabled && (
                    <Text style={styles.sortOptionHint}>
                      {t("home.sortDistanceUnavailable")}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>
      </Modal>

      <EditTagsModal
        walkId={editTagsFor?.walk.id ?? null}
        walkTitle={editTagsFor ? displayWalkTitle(editTagsFor) : ""}
        currentTagIds={
          editTagsFor ? tagsByWalk[editTagsFor.walk.id] || [] : []
        }
        onClose={onEditTagsSaved}
      />

      <WalkActionsMenu
        walk={actionsMenuFor}
        isCreator={!!user && actionsMenuFor?.walk.createdBy === user.uid}
        onClose={() => setActionsMenuFor(null)}
        onLeaderboard={() =>
          actionsMenuFor && handleShowLeaderboard(actionsMenuFor.walk)
        }
        onTags={() => actionsMenuFor && setEditTagsFor(actionsMenuFor)}
        onRename={() => actionsMenuFor && openRename(actionsMenuFor)}
        onInsights={() =>
          actionsMenuFor &&
          navigation.navigate("WalkInsights" as never, {
            walkId: actionsMenuFor.walk.id,
          } as never)
        }
        onDelete={() =>
          actionsMenuFor &&
          handleDeleteWalk(
            actionsMenuFor.walk,
            !!user && actionsMenuFor.walk.createdBy === user.uid
          )
        }
        t={t}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  segmented: {
    flexDirection: "row",
    backgroundColor: "#E8E8E4",
    borderRadius: 10,
    padding: 3,
    marginBottom: 12,
  },
  segmentedItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  segmentedItemActive: {
    backgroundColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 3,
      },
      android: { elevation: 1 },
    }),
  },
  segmentedText: { color: "#8A9A8D", fontSize: 14, fontWeight: "600" },
  segmentedTextActive: { color: "#2C3E2D" },
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  chipsScroll: { flex: 1 },
  chipsRow: { flexDirection: "row", gap: 6, paddingRight: 4, alignItems: "center" },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0E8E0",
  },
  filterChipActive: { backgroundColor: "#1B6B35", borderColor: "#1B6B35" },
  filterChipText: { color: "#2C3E2D", fontSize: 12, fontWeight: "600" },
  filterChipTextActive: { color: "#F5F0E8" },
  manageChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0E8E0",
    alignItems: "center",
    justifyContent: "center",
  },
  sortButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0E8E0",
  },
  sortButtonText: { color: "#2C3E2D", fontSize: 12, fontWeight: "600" },
  gpsWarning: {
    color: "#B33A3A",
    fontSize: 12,
    marginBottom: 10,
    fontStyle: "italic",
  },
  sortOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sortSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
    paddingBottom: Platform.OS === "web" ? 20 : 36,
  },
  sortSheetTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#8A9A8D",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  sortOption: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  sortOptionActive: { backgroundColor: "#F0F4F0" },
  sortOptionDisabled: { opacity: 0.5 },
  sortOptionText: { color: "#2C3E2D", fontSize: 16, fontWeight: "500" },
  sortOptionTextActive: { color: "#1B6B35", fontWeight: "700" },
  sortOptionTextDisabled: { color: "#8A9A8D" },
  sortOptionHint: {
    color: "#8A9A8D",
    fontSize: 12,
    marginTop: 2,
    marginLeft: 24,
  },
  walkTagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 6,
  },
  walkTagPill: {
    backgroundColor: "#E8F0E0",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  walkTagPillText: { color: "#2D7A3A", fontSize: 11, fontWeight: "600" },
  emptyFilterCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 20,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#F0F0EC",
  },
  emptyFilterTitle: {
    color: "#2C3E2D",
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  emptyFilterDesc: {
    color: "#8A9A8D",
    fontSize: 13,
    textAlign: "center",
  },
  walkCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F0F0EC",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
      web: { boxShadow: "0px 1px 6px rgba(0,0,0,0.04)" },
    }),
  },
  walkCardTop: { flexDirection: "row", alignItems: "flex-start" },
  walkIconContainer: {
    marginRight: 12,
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#E8F0E0",
    justifyContent: "center",
    alignItems: "center",
  },
  walkIcon: { fontSize: 22 },
  walkCardCenter: { flex: 1 },
  walkCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },
  // `flexShrink: 1` (utan flexGrow) gör att långa titlar fortfarande
  // krymper och wrappar (numberOfLines={2}) medan korta titlar nu sitter
  // tight bredvid SKAPAD-badge:n istället för att blåsas upp till hela
  // kortets bredd. På surfplatte-landscape (880 px-kolumn) blev annars
  // ~600 px tomrum mellan titel och badge.
  walkTitle: { color: "#2C3E2D", fontSize: 16, fontWeight: "600", flexShrink: 1 },
  creatorBadge: {
    backgroundColor: "#E8B830",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  creatorBadgeText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  walkInfo: { color: "#8A9A8D", fontSize: 13 },
  originalTitle: {
    color: "#B0BAB2",
    fontSize: 12,
    fontStyle: "italic",
    marginBottom: 2,
  },
  walkCardActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 6,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "#F0F0EC",
  },
  editButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#F0F4F0",
    borderWidth: 1,
    borderColor: "#E0E8E0",
    justifyContent: "center",
    alignItems: "center",
  },
  editButtonText: { fontSize: 15 },
  qrButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#1B6B35",
    justifyContent: "center",
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 40,
  },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#2C3E2D",
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: "#8A9A8D",
    textAlign: "center",
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
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
  modalTitle: {
    fontSize: 19,
    fontWeight: "700",
    color: "#2C3E2D",
    marginBottom: 6,
  },
  modalMessage: {
    fontSize: 13,
    color: "#8A9A8D",
    lineHeight: 18,
    marginBottom: 14,
  },
  modalInput: {
    backgroundColor: "#F5F0E8",
    borderWidth: 1.5,
    borderColor: "#E8E8E4",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: "#2C3E2D",
    marginBottom: 14,
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 8,
  },
  modalButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    minWidth: 80,
    alignItems: "center",
  },
  modalButtonGhost: { backgroundColor: "#F0F4F0" },
  modalButtonGhostText: { color: "#2C3E2D", fontSize: 14, fontWeight: "600" },
  modalButtonPrimary: { backgroundColor: "#1B6B35" },
  modalButtonPrimaryText: { color: "#F5F0E8", fontSize: 14, fontWeight: "700" },
});
