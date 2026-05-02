import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Platform,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { getSavedWalks, removeSavedWalk, setWalkAlias, displayWalkTitle } from "../services/storage";
import { flagForLanguage } from "../constants/languages";
import { findActiveSession, deleteWalkCompletely } from "../services/firestore";
import { signOut } from "../services/auth";
import { useAuth } from "../context/AuthContext";
import { SavedWalk, Walk } from "../types";
import WalkActionsMenu from "../components/WalkActionsMenu";
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
import { shareWalk } from "../utils/shareWalk";
import EditTagsModal from "../components/EditTagsModal";
import { useTranslation } from "../i18n";

type WalkTab = "mine" | "saved";
type SortMode = "recent" | "name" | "distance";

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [savedWalks, setSavedWalks] = useState<SavedWalk[]>([]);
  const [renameTarget, setRenameTarget] = useState<SavedWalk | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");

  // Tabs + filter + sortering. `activeTagIds` är OR-filter — lista matchar om
  // den har någon av taggarna (tom = alla). Sparas inte i AsyncStorage; det
  // ska vara tillfälligt filter, inte en inställning.
  const [activeTab, setActiveTab] = useState<WalkTab>("mine");
  const [sortMode, setSortMode] = useState<SortMode>("recent");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [activeTagIds, setActiveTagIds] = useState<Set<string>>(new Set());

  // Tagg-data (laddas om när skärmen får fokus så att ändringar på
  // ManageTags-skärmen slår igenom direkt).
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagsByWalk, setTagsByWalk] = useState<Record<string, string[]>>({});

  // GPS för "Närmast"-sortering. `gpsStatus` = "idle" innan användaren
  // valt distance, sedan "loading" → "ok"/"denied". Vi fångar positionen
  // en gång när användaren byter till distance-läge; inte en kontinuerlig
  // watcher eftersom hemskärmen är statisk.
  const [userLocation, setUserLocation] = useState<LatLng | null>(null);
  const [gpsStatus, setGpsStatus] = useState<
    "idle" | "loading" | "ok" | "denied"
  >("idle");

  // Tagg-redigeringsmodal. walkId=null betyder stängd.
  const [editTagsFor, setEditTagsFor] = useState<SavedWalk | null>(null);
  // Bottom-sheet med sekundära åtgärder för en walk-rad. Hålls här istället
  // för i kortet eftersom Modal:n bör live:a på toppnivå (annars kan
  // animation/scroll gå snett vid många kort).
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

      // Sync av väntande offline-svar och refresh av cachade promenader
      // är oberoende — kör parallellt.
      const [, refreshed] = await Promise.all([
        syncPendingData().catch(() => {}),
        refreshAllSavedWalks().catch(() => null),
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

  // Hämta GPS en gång när användaren väljer "Närmast". Om rättigheter saknas
  // flaggar vi det och faller tillbaka på senaste-sorteringen visuellt, men
  // valet stannar kvar så att användaren vet att hen aktivt valde det.
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

  // Dela upp i två listor (Mina = createdBy == user.uid, Sparade = resten).
  // Anonym/ej inloggad användare har ingen uid → allt räknas som "Sparade".
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

  // Vilken flik visar vi? Ingen auto-växling; vi visar aktuell flik även om
  // den råkar vara tom, så att användaren inte blir förvirrad över var
  // hen är.
  const visibleTabWalks = activeTab === "mine" ? mineWalks : otherWalks;

  // Tagg-filter och sortering. Båda minnesberoende så listan räknas inte
  // om på varje render.
  const filteredAndSorted = useMemo(() => {
    // Filter: AND över valda taggar — varje vald tagg måste finnas på
    // walken. Smalnar av listan ju fler chips man trycker, vilket är
    // det förväntade beteendet (jämför Google Photos / iOS Photos).
    // Tom = visa allt.
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
      // recent (default) — savedAt fallande
      sorted.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    }
    return sorted;
  }, [visibleTabWalks, activeTagIds, tagsByWalk, sortMode, userLocation]);

  // Bara taggar som används av någon walk i aktuell flik visas i chip-raden
  // — det håller raden relevant även när användaren har många taggar som
  // bara gäller Mina (eller vice versa).
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
    // Ladda om efter sparande så att chip-raden och counts stämmer.
    const [tags, byWalk] = await Promise.all([getAllTags(), getTagsByWalk()]);
    setAllTags(tags);
    setTagsByWalk(byWalk);
  };

  // handleDeleteAccount flyttad till SettingsScreen.

  // Topplisteknapp för sparade promenader. För events räcker walkId —
  // LeaderboardScreen slår upp alla sessioner för promenaden. För vanliga
  // promenader behöver vi en aktiv session (annars finns ingen topplista).
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

  // Radering: skapare raderar från Firestore (försvinner för alla); övriga
  // tar bara bort genvägen lokalt (promenaden finns kvar för andra deltagare).
  const handleDeleteWalk = (walk: Walk, isCreator: boolean) => {
    const title = isCreator ? t("home.deleteWalkTitle") : t("home.removeSavedTitle");
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

  const handleCreate = () => {
    if (user && !user.isAnonymous) {
      navigation.navigate("CreateWalk");
    } else {
      navigation.navigate("Login");
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.hero}>
          <View style={styles.heroBackground}>
            <View style={styles.heroGradientTop} />
            <View style={styles.heroGradientBottom} />
          </View>

          {/* User bar */}
          {user && !user.isAnonymous ? (
            <View style={styles.userBar}>
              <View style={styles.userInfo}>
                {user.photoURL ? (
                  <Image
                    source={{ uri: user.photoURL }}
                    style={styles.profilePhoto}
                  />
                ) : (
                  <View
                    style={[styles.profilePhoto, styles.profilePlaceholder]}
                  >
                    <Text style={styles.profileInitial}>
                      {(user.displayName || user.email || "?")[0].toUpperCase()}
                    </Text>
                  </View>
                )}
                <Text style={styles.userText} numberOfLines={1}>
                  {user.displayName || user.email}
                </Text>
              </View>
              <TouchableOpacity
                onPress={signOut}
                style={styles.logoutButton}
                activeOpacity={0.7}
              >
                <Text style={styles.logoutText}>{t("home.logoutButton")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate("Stats")}
                style={styles.settingsButton}
                activeOpacity={0.7}
                accessibilityLabel={t("nav.stats")}
              >
                <Text style={styles.settingsIcon}>📊</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate("Settings")}
                style={styles.settingsButton}
                activeOpacity={0.7}
                accessibilityLabel={t("nav.settings")}
              >
                <Text style={styles.settingsIcon}>⚙️</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.userBar}>
              <TouchableOpacity
                onPress={() => navigation.navigate("Login")}
                style={styles.loginButton}
                activeOpacity={0.7}
              >
                <Text style={styles.loginButtonText}>{t("home.loginButton")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate("Stats")}
                style={styles.settingsButton}
                activeOpacity={0.7}
                accessibilityLabel={t("nav.stats")}
              >
                <Text style={styles.settingsIcon}>📊</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => navigation.navigate("Settings")}
                style={styles.settingsButton}
                activeOpacity={0.7}
                accessibilityLabel={t("nav.settings")}
              >
                <Text style={styles.settingsIcon}>⚙️</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.heroContent}>
            <Text style={styles.heroIcon}>🧭</Text>
            <Text style={styles.title}>Tipspromenaden</Text>
            <Text style={styles.subtitleBrand}>{t("home.brandTagline")}</Text>
            <Text style={styles.subtitle}>{t("home.subtitle")}</Text>
          </View>
        </View>

        {/* Action Cards */}
        <View style={styles.actionsSection}>
          <TouchableOpacity
            style={styles.actionCardPrimary}
            onPress={handleCreate}
            activeOpacity={0.8}
          >
            <View style={styles.actionCardInner}>
              <Text style={styles.actionEmoji}>📍</Text>
              <View style={styles.actionTextContainer}>
                <Text style={styles.actionTitle}>{t("home.createWalk")}</Text>
                <Text style={styles.actionDescription}>
                  {!user || user.isAnonymous
                    ? t("home.createWalkNeedLogin")
                    : t("home.createWalkDesc")}
                </Text>
              </View>
              <Text style={styles.actionArrow}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("ScanQR")}
            activeOpacity={0.8}
          >
            <View style={styles.actionCardInner}>
              <Text style={styles.actionEmoji}>📷</Text>
              <View style={styles.actionTextContainer}>
                <Text style={styles.actionTitleDark}>{t("home.scanQR")}</Text>
                <Text style={styles.actionDescriptionDark}>
                  {t("home.scanQRDesc")}
                </Text>
              </View>
              <Text style={styles.actionArrowDark}>›</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            onPress={() => navigation.navigate("Library")}
            activeOpacity={0.8}
          >
            <View style={styles.actionCardInner}>
              <Text style={styles.actionEmoji}>📚</Text>
              <View style={styles.actionTextContainer}>
                <Text style={styles.actionTitleDark}>{t("home.library")}</Text>
                <Text style={styles.actionDescriptionDark}>
                  {t("home.libraryDesc")}
                </Text>
              </View>
              <Text style={styles.actionArrowDark}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Saved Walks */}
        {savedWalks.length > 0 && (
          <View style={styles.savedSection}>
            {/* Segmented control: Mina / Sparade */}
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

            {/* Sort + tagg-filter rad */}
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
                      style={[
                        styles.filterChip,
                        on && styles.filterChipActive,
                      ]}
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

              {/* Sortering */}
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

            {/* GPS-status-text när "Närmast" är valt men GPS inte är ok */}
            {sortMode === "distance" && gpsStatus === "denied" && (
              <Text style={styles.gpsWarning}>
                {t("home.sortDistanceNoGps")}
              </Text>
            )}

            {/* Filtrerad lista */}
            {filteredAndSorted.length === 0 && (
              <View style={styles.emptyFilterCard}>
                <Text style={styles.emptyFilterTitle}>
                  {t("home.emptyFiltered")}
                </Text>
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
                  onPress={() =>
                    navigation.navigate("JoinWalk", { walk: item.walk })
                  }
                  onLongPress={() => setEditTagsFor(item)}
                  delayLongPress={350}
                  activeOpacity={0.7}
                >
                  {/* Övre rad: ikon + titel får hela bredden */}
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
                            <Text style={styles.creatorBadgeText}>{t("home.createdBadge")}</Text>
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
                        {t("home.questions", {
                          count: item.walk.questions.length,
                        })}
                        {item.walk.event
                          ? ` · ${item.walk.event.startDate}`
                          : ""}
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

                  {/* Undre rad: alla åtgärdsknappar höger-justerade */}
                  {/* Primära åtgärder synliga, sekundära bakom ⋯-meny.
                      Tidigare 5-8 ikon-knappar per rad blev visuellt rörigt
                      och dåligt skalbart — bottom-sheet skalar bättre när vi
                      lägger till nya funktioner. */}
                  <View style={styles.walkCardActions}>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => shareWalk(item.walk, t)}
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
                            navigation.navigate("CreateWalk", {
                              walk: item.walk,
                            })
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
          </View>
        )}

        {savedWalks.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🌲</Text>
            <Text style={styles.emptyTitle}>{t("home.emptyTitle")}</Text>
            <Text style={styles.emptyDescription}>{t("home.emptyDesc")}</Text>
          </View>
        )}

        {/* "Radera konto och data" är flyttad till SettingsScreen — GDPR-
            funktionen ligger inte längre här eftersom Home-skärmen ska
            visa promenadlistan, inte kontoåtgärder. */}
      </ScrollView>

      {/* Rename-modal: lokalt alias för sparade promenader */}
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

      {/* Sort-menu: en minimal "action sheet" över hela skärmen */}
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

      {/* Edit tags modal */}
      <EditTagsModal
        walkId={editTagsFor?.walk.id ?? null}
        walkTitle={editTagsFor ? displayWalkTitle(editTagsFor) : ""}
        currentTagIds={
          editTagsFor ? tagsByWalk[editTagsFor.walk.id] || [] : []
        }
        onClose={onEditTagsSaved}
      />

      {/* Sekundära åtgärder för en walk-rad. Dela / Redigera / QR ligger
          fortfarande direkt i kortet — resten samlas här för att inte
          spreda 5+ ikon-knappar per rad. */}
      <WalkActionsMenu
        walk={actionsMenuFor}
        isCreator={
          !!user && actionsMenuFor?.walk.createdBy === user.uid
        }
        onClose={() => setActionsMenuFor(null)}
        onLeaderboard={() => actionsMenuFor && handleShowLeaderboard(actionsMenuFor.walk)}
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
    flex: 1,
    backgroundColor: "#F5F0E8",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 40,
  },

  // Hero
  hero: {
    backgroundColor: "#1B6B35",
    paddingTop: Platform.OS === "web" ? 40 : 60,
    paddingBottom: 32,
    paddingHorizontal: 24,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  heroBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: "hidden",
  },
  heroGradientTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "#1B6B35",
  },
  heroGradientBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: "50%",
    backgroundColor: "#2D7A3A",
    opacity: 0.5,
  },
  heroContent: {
    alignItems: "center",
    marginTop: 8,
  },
  heroIcon: {
    fontSize: 40,
    marginBottom: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: "800",
    color: "#F5F0E8",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitleBrand: {
    fontSize: 15,
    color: "#E8B830",
    textAlign: "center",
    marginTop: 2,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(245,240,232,0.6)",
    textAlign: "center",
    marginTop: 6,
    fontWeight: "400",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },

  // User bar
  userBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  userInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  profilePhoto: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
    borderWidth: 2,
    borderColor: "rgba(250,250,248,0.3)",
  },
  profilePlaceholder: {
    backgroundColor: "#2D7A3A",
    justifyContent: "center",
    alignItems: "center",
  },
  profileInitial: {
    color: "#F5F0E8",
    fontSize: 15,
    fontWeight: "700",
  },
  userText: {
    color: "rgba(250,250,248,0.8)",
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  logoutButton: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "rgba(250,250,248,0.1)",
  },
  logoutText: {
    color: "rgba(250,250,248,0.7)",
    fontSize: 13,
    fontWeight: "500",
  },
  loginButton: {
    backgroundColor: "rgba(250,250,248,0.15)",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(250,250,248,0.25)",
    marginLeft: "auto",
  },
  settingsButton: {
    marginLeft: 8,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(250,250,248,0.12)",
    justifyContent: "center",
    alignItems: "center",
  },
  settingsIcon: {
    fontSize: 18,
  },
  loginButtonText: {
    color: "#F5F0E8",
    fontSize: 14,
    fontWeight: "600",
  },

  // Actions
  actionsSection: {
    paddingHorizontal: 20,
    marginTop: -16,
    gap: 10,
  },
  actionCardPrimary: {
    backgroundColor: "#2D7A3A",
    borderRadius: 16,
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#1B6B35",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 12,
      },
      android: { elevation: 6 },
      web: { boxShadow: "0px 4px 12px rgba(27,107,53,0.2)" },
    }),
  },
  actionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8E8E4",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" },
    }),
  },
  actionCardInner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 18,
  },
  actionEmoji: {
    fontSize: 26,
    width: 44,
    textAlign: "center",
  },
  actionTextContainer: {
    flex: 1,
    marginLeft: 4,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#F5F0E8",
    marginBottom: 2,
  },
  actionDescription: {
    fontSize: 13,
    color: "rgba(245,240,232,0.6)",
  },
  actionArrow: {
    fontSize: 28,
    color: "rgba(245,240,232,0.4)",
    fontWeight: "300",
  },
  actionTitleDark: {
    fontSize: 17,
    fontWeight: "700",
    color: "#2C3E2D",
    marginBottom: 2,
  },
  actionDescriptionDark: {
    fontSize: 13,
    color: "#4A5E4C",
  },
  actionArrowDark: {
    fontSize: 28,
    color: "#C4CCC6",
    fontWeight: "300",
  },

  // Saved walks section
  savedSection: {
    paddingHorizontal: 20,
    marginTop: 28,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2C3E2D",
    marginBottom: 14,
    letterSpacing: -0.3,
  },

  // Segmented control: Mina / Sparade
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
  segmentedText: {
    color: "#8A9A8D",
    fontSize: 14,
    fontWeight: "600",
  },
  segmentedTextActive: {
    color: "#2C3E2D",
  },

  // Filter-rad: tagg-chips + sortering
  filterBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  },
  chipsScroll: {
    flex: 1,
  },
  chipsRow: {
    flexDirection: "row",
    gap: 6,
    paddingRight: 4,
    alignItems: "center",
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E0E8E0",
  },
  filterChipActive: {
    backgroundColor: "#1B6B35",
    borderColor: "#1B6B35",
  },
  filterChipText: {
    color: "#2C3E2D",
    fontSize: 12,
    fontWeight: "600",
  },
  filterChipTextActive: {
    color: "#F5F0E8",
  },
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
  sortButtonText: {
    color: "#2C3E2D",
    fontSize: 12,
    fontWeight: "600",
  },
  gpsWarning: {
    color: "#B33A3A",
    fontSize: 12,
    marginBottom: 10,
    fontStyle: "italic",
  },

  // Sort-menu modal
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
  sortOptionActive: {
    backgroundColor: "#F0F4F0",
  },
  sortOptionDisabled: {
    opacity: 0.5,
  },
  sortOptionText: {
    color: "#2C3E2D",
    fontSize: 16,
    fontWeight: "500",
  },
  sortOptionTextActive: {
    color: "#1B6B35",
    fontWeight: "700",
  },
  sortOptionTextDisabled: {
    color: "#8A9A8D",
  },
  sortOptionHint: {
    color: "#8A9A8D",
    fontSize: 12,
    marginTop: 2,
    marginLeft: 24,
  },

  // Tagg-pills visade direkt på walk-korten
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
  walkTagPillText: {
    color: "#2D7A3A",
    fontSize: 11,
    fontWeight: "600",
  },

  // Empty state för filtrerad lista
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
  walkCardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  walkIconContainer: {
    marginRight: 12,
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#E8F0E0",
    justifyContent: "center",
    alignItems: "center",
  },
  walkIcon: {
    fontSize: 22,
  },
  walkCardCenter: {
    flex: 1,
  },
  walkCardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 3,
  },
  walkTitle: {
    color: "#2C3E2D",
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
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
  walkInfo: {
    color: "#8A9A8D",
    fontSize: 13,
  },
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
  editButtonText: {
    fontSize: 15,
  },
  qrButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#1B6B35",
    justifyContent: "center",
    alignItems: "center",
  },
  qrButtonText: {
    color: "#F5F0E8",
    fontSize: 11,
    fontWeight: "700",
  },
  deleteButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#FBE9E7",
    borderWidth: 1,
    borderColor: "#F6C8C3",
    justifyContent: "center",
    alignItems: "center",
  },
  deleteButtonText: {
    fontSize: 15,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    paddingHorizontal: 40,
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
  emptyDescription: {
    fontSize: 14,
    color: "#8A9A8D",
    textAlign: "center",
    lineHeight: 20,
  },

  // Danger zone (GDPR-radering)
  // Rename-modal
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
  modalButtonGhost: {
    backgroundColor: "#F0F4F0",
  },
  modalButtonGhostText: {
    color: "#2C3E2D",
    fontSize: 14,
    fontWeight: "600",
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
