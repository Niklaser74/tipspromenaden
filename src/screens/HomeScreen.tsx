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
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { getSavedWalks } from "../services/storage";
import { signOut, deleteAccountAndData } from "../services/auth";
import { useAuth } from "../context/AuthContext";
import { SavedWalk } from "../types";
import { syncPendingData } from "../services/offlineSync";

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const [savedWalks, setSavedWalks] = useState<SavedWalk[]>([]);

  useEffect(() => {
    const load = async () => {
      const walks = await getSavedWalks();
      setSavedWalks(walks);

      // Try syncing pending offline data
      try {
        await syncPendingData();
      } catch {
        // silent
      }
    };
    load();
    const unsub = navigation.addListener("focus", load);
    return unsub;
  }, [navigation]);

  const handleDeleteAccount = () => {
    // Steg 1: bekräfta att användaren förstår vad som händer.
    Alert.alert(
      "Radera konto",
      "Detta raderar permanent ditt konto, alla promenader du skapat samt alla sessioner och deltagardata kopplade till dem. Åtgärden kan inte ångras.",
      [
        { text: "Avbryt", style: "cancel" },
        {
          text: "Fortsätt",
          style: "destructive",
          onPress: () => {
            // Steg 2: extra bekräftelse innan vi faktiskt kör.
            Alert.alert(
              "Är du helt säker?",
              "All din data försvinner direkt och kan inte återställas.",
              [
                { text: "Nej, avbryt", style: "cancel" },
                {
                  text: "Ja, radera allt",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await deleteAccountAndData();
                      Alert.alert("Klart", "Ditt konto och din data är raderade.");
                    } catch (e: any) {
                      if (e?.code === "auth/requires-recent-login") {
                        Alert.alert(
                          "Logga in igen",
                          "Av säkerhetsskäl behöver du logga in på nytt innan kontot kan raderas. Logga ut, logga in igen och försök sedan en gång till."
                        );
                      } else {
                        Alert.alert(
                          "Något gick fel",
                          e?.message || "Kunde inte radera kontot. Försök igen."
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
                <Text style={styles.logoutText}>Logga ut</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.userBar}>
              <TouchableOpacity
                onPress={() => navigation.navigate("Login")}
                style={styles.loginButton}
                activeOpacity={0.7}
              >
                <Text style={styles.loginButtonText}>Logga in</Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.heroContent}>
            <Text style={styles.heroIcon}>🧭</Text>
            <Text style={styles.title}>Tipspromenaden</Text>
            <Text style={styles.subtitleBrand}>{`Quiz & \u00C4ventyr`}</Text>
            <Text style={styles.subtitle}>Utforska. Svara. Vinn.</Text>
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
                <Text style={styles.actionTitle}>Skapa promenad</Text>
                <Text style={styles.actionDescription}>
                  {!user || user.isAnonymous
                    ? "Logga in for att skapa"
                    : "Skapa en ny tipspromenad med frågor"}
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
                <Text style={styles.actionTitleDark}>Scanna QR-kod</Text>
                <Text style={styles.actionDescriptionDark}>
                  Gå med i en promenad via QR
                </Text>
              </View>
              <Text style={styles.actionArrowDark}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Saved Walks */}
        {savedWalks.length > 0 && (
          <View style={styles.savedSection}>
            <Text style={styles.sectionTitle}>Dina promenader</Text>
            {savedWalks.map((item) => {
              const isCreator = user && item.walk.createdBy === user.uid;
              return (
                <TouchableOpacity
                  key={item.walk.id}
                  style={styles.walkCard}
                  onPress={() =>
                    navigation.navigate("JoinWalk", { walk: item.walk })
                  }
                  activeOpacity={0.7}
                >
                  <View style={styles.walkCardLeft}>
                    <View style={styles.walkIconContainer}>
                      <Text style={styles.walkIcon}>🗺️</Text>
                    </View>
                  </View>
                  <View style={styles.walkCardCenter}>
                    <View style={styles.walkCardTitleRow}>
                      <Text style={styles.walkTitle} numberOfLines={1}>
                        {item.walk.title}
                      </Text>
                      {isCreator && (
                        <View style={styles.creatorBadge}>
                          <Text style={styles.creatorBadgeText}>Skapad</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.walkInfo}>
                      {item.walk.questions.length} frågor
                      {item.walk.event
                        ? ` · ${item.walk.event.startDate}`
                        : ""}
                    </Text>
                  </View>
                  {isCreator && (
                    <View style={styles.creatorActions}>
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
                        <Text style={styles.qrButtonText}>QR</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {savedWalks.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🌲</Text>
            <Text style={styles.emptyTitle}>Inga promenader ännu</Text>
            <Text style={styles.emptyDescription}>
              Skapa din egen eller scanna en QR-kod för att komma igång
            </Text>
          </View>
        )}

        {/* GDPR: möjlighet att radera konto + data */}
        {user && (
          <View style={styles.dangerZone}>
            <TouchableOpacity
              onPress={handleDeleteAccount}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteAccountText}>Radera konto och data</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
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
    flexDirection: "row",
    alignItems: "center",
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
  walkCardLeft: {
    marginRight: 12,
  },
  walkIconContainer: {
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
  creatorActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginLeft: 10,
  },
  editButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F0F4F0",
    borderWidth: 1,
    borderColor: "#E0E8E0",
    justifyContent: "center",
    alignItems: "center",
  },
  editButtonText: {
    fontSize: 16,
  },
  qrButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#1B6B35",
    justifyContent: "center",
    alignItems: "center",
  },
  qrButtonText: {
    color: "#F5F0E8",
    fontSize: 12,
    fontWeight: "700",
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
});
