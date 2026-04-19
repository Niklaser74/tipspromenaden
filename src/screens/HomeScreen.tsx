import React, { useEffect, useState } from "react";
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
import { signOut, deleteAccountAndData } from "../services/auth";
import { useAuth } from "../context/AuthContext";
import { SavedWalk, Walk } from "../types";
import { syncPendingData } from "../services/offlineSync";
import { refreshAllSavedWalks } from "../services/walkRefresh";
import { useTranslation } from "../i18n";

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [savedWalks, setSavedWalks] = useState<SavedWalk[]>([]);
  const [renameTarget, setRenameTarget] = useState<SavedWalk | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const walks = await getSavedWalks();
      if (cancelled) return;
      setSavedWalks(walks);

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

  const handleDeleteAccount = () => {
    // Dubbel bekräftelse: radering är oåterkallelig och Apple/Google
    // kräver att det inte kan ske av misstag.
    Alert.alert(
      t("home.deleteConfirmTitle"),
      t("home.deleteConfirmMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("home.deleteContinue"),
          style: "destructive",
          onPress: () => {
            Alert.alert(
              t("home.deleteSureTitle"),
              t("home.deleteSureMessage"),
              [
                { text: t("home.deleteSureNo"), style: "cancel" },
                {
                  text: t("home.deleteSureYes"),
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await deleteAccountAndData();
                      Alert.alert(
                        t("home.deleteDoneTitle"),
                        t("home.deleteDoneMessage")
                      );
                    } catch (e: any) {
                      if (e?.code === "auth/requires-recent-login") {
                        Alert.alert(
                          t("home.deleteReloginTitle"),
                          t("home.deleteReloginMessage")
                        );
                      } else {
                        Alert.alert(
                          t("common.error"),
                          e?.message || t("common.error")
                        );
                      }
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

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
            setSavedWalks((prev) => prev.filter((w) => w.walk.id !== walk.id));
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
        </View>

        {/* Saved Walks */}
        {savedWalks.length > 0 && (
          <View style={styles.savedSection}>
            <Text style={styles.sectionTitle}>{t("home.yourWalks")}</Text>
            {savedWalks.map((item) => {
              const isCreator = user && item.walk.createdBy === user.uid;
              const title = displayWalkTitle(item);
              const hasAlias = title !== item.walk.title;
              return (
                <TouchableOpacity
                  key={item.walk.id}
                  style={styles.walkCard}
                  onPress={() =>
                    navigation.navigate("JoinWalk", { walk: item.walk })
                  }
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
                    </View>
                  </View>

                  {/* Undre rad: alla åtgärdsknappar höger-justerade */}
                  <View style={styles.walkCardActions}>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => handleShowLeaderboard(item.walk)}
                      activeOpacity={0.6}
                      accessibilityLabel={t("home.leaderboard")}
                    >
                      <Text style={styles.editButtonText}>📊</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.editButton}
                      onPress={() => openRename(item)}
                      activeOpacity={0.6}
                      accessibilityLabel={t("home.rename")}
                    >
                      <MaterialCommunityIcons
                        name="rename-box"
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
                      style={styles.deleteButton}
                      onPress={() => handleDeleteWalk(item.walk, !!isCreator)}
                      activeOpacity={0.6}
                      accessibilityLabel={
                        isCreator
                          ? t("home.deleteWalkTitle")
                          : t("home.removeSavedTitle")
                      }
                    >
                      <Text style={styles.deleteButtonText}>🗑️</Text>
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

        {/* GDPR: möjlighet att radera konto + data */}
        {user && (
          <View style={styles.dangerZone}>
            <TouchableOpacity
              onPress={handleDeleteAccount}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteAccountText}>{t("home.deleteAccount")}</Text>
            </TouchableOpacity>
          </View>
        )}
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
  dangerZone: {
    alignItems: "center",
    marginTop: 40,
    paddingHorizontal: 24,
  },
  deleteAccountText: {
    color: "#B33A3A",
    fontSize: 13,
    fontWeight: "500",
    textDecorationLine: "underline",
  },

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
