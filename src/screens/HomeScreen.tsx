/**
 * @file HomeScreen.tsx
 * @description Startsida — portal till de tre primära åtgärderna (Skapa /
 * Scanna / Bibliotek) + närmaste-event-banner. Den bantades 2026-05-11
 * när "Mina promenader"-listan flyttade till LibraryScreen ("Mina"-flik).
 *
 * Allt detaljerat walk-management (lista, taggar, sort, rename, actions
 * menu, delete) finns nu i `components/MyWalksList.tsx` som mountas av
 * LibraryScreen. Hemskärmen ska bara vara en snabb portal.
 */
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Image,
  ScrollView,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSavedWalks } from "../services/storage";
import { getPublicWalks } from "../services/firestore";
import { signOut } from "../services/auth";
import { useAuth } from "../context/AuthContext";
import { Walk } from "../types";
import { syncPendingData } from "../services/offlineSync";
import { getCurrentLocation, formatDistance } from "../utils/location";
import { distanceToWalk, LatLng } from "../utils/walkGeo";
import { useTranslation } from "../i18n";
import { useEventTheme } from "../context/EventThemeContext";

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  // Event-läge — override hero-bakgrund och accent-färger när ett event är
  // aktivt. När inget event är aktivt returnerar hooken TP-defaults så
  // utseendet är oförändrat för normala användare.
  const { colors: eventColors, event } = useEventTheme();

  // Antal sparade promenader (för badge på Bibliotek-knappen).
  // Laddas vid mount + på navigation-focus så badgen alltid är aktuell.
  const [savedCount, setSavedCount] = useState(0);

  // Närmaste kommande event (publik walk med event.startDate inom 14 dagar
  // OCH centroid inom 20 km — eller utan distans-krav om vi inte fått GPS).
  const [nearestEvent, setNearestEvent] = useState<{
    walk: Walk;
    distanceM: number | null;
    daysUntil: number;
    moreCount: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const walks = await getSavedWalks();
      if (cancelled) return;
      setSavedCount(walks.length);
      // Best-effort offline-sync — påverkar inte UI direkt
      syncPendingData().catch(() => {});
    };
    load();
    const unsub = navigation.addListener("focus", load);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [navigation]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // GPS-fix och publika-walks-läsning är oberoende — kör parallellt
        // så cold-start inte väntar på GPS innan Firestore-anropet startar.
        // GPS:n får felchanserna; vi krymper till null vid avslag.
        const [locResult, walks] = await Promise.all([
          getCurrentLocation()
            .then((pos): LatLng | null => ({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
            }))
            .catch((): LatLng | null => null),
          getPublicWalks(),
        ]);
        if (cancelled) return;
        const loc = locResult;

        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() + 14);

        const candidates = walks
          .filter((w) => {
            if (!w.event?.startDate) return false;
            const start = new Date(w.event.startDate).getTime();
            return start >= now.getTime() && start <= cutoff.getTime();
          })
          .map((w) => {
            const distanceM =
              loc && w.centroid ? distanceToWalk(loc, w) : null;
            const daysUntil = Math.round(
              (new Date(w.event!.startDate).getTime() - now.getTime()) /
                (1000 * 60 * 60 * 24)
            );
            return { walk: w, distanceM, daysUntil };
          })
          .filter((c) => c.distanceM === null || c.distanceM <= 20000)
          .sort(
            (a, b) =>
              new Date(a.walk.event!.startDate).getTime() -
              new Date(b.walk.event!.startDate).getTime()
          );

        if (cancelled) return;
        const first = candidates[0];
        if (first) {
          setNearestEvent({ ...first, moreCount: candidates.length - 1 });
        } else {
          setNearestEvent(null);
        }
      } catch {
        // Tyst fail
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 40 + insets.bottom },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero — bakgrunden override:as till event-färg om aktivt. */}
        <View
          style={[
            styles.hero,
            event && { backgroundColor: eventColors.primary },
          ]}
        >
          <View style={styles.heroBackground}>
            <View
              style={[
                styles.heroGradientTop,
                event && { backgroundColor: eventColors.primary },
              ]}
            />
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
                <Text style={styles.loginButtonText}>
                  {t("home.loginButton")}
                </Text>
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
            <Text style={styles.title}>
              {event ? event.name : "Tipspromenaden"}
            </Text>
            <Text style={styles.subtitleBrand}>
              {event ? "EVENT-LÄGE" : t("home.brandTagline")}
            </Text>
            <Text style={styles.subtitle}>
              {event ? "Powered by Tipspromenaden" : t("home.subtitle")}
            </Text>
          </View>
        </View>

        {/* Närmaste event-banner */}
        {nearestEvent && (
          <TouchableOpacity
            style={styles.eventBanner}
            onPress={() =>
              navigation.navigate("Library", { initialTab: "events" })
            }
            activeOpacity={0.85}
          >
            <Text style={styles.eventBannerEmoji}>📅</Text>
            <View style={styles.eventBannerText}>
              <Text style={styles.eventBannerLine1}>
                {nearestEvent.daysUntil === 0
                  ? t("home.eventBannerToday")
                  : nearestEvent.daysUntil === 1
                  ? t("home.eventBannerTomorrow")
                  : t("home.eventBannerInDays", {
                      count: nearestEvent.daysUntil,
                    })}
                {" · "}
                {nearestEvent.walk.title}
              </Text>
              <Text style={styles.eventBannerLine2}>
                {nearestEvent.walk.city ? `📍 ${nearestEvent.walk.city}` : ""}
                {nearestEvent.walk.city && nearestEvent.distanceM !== null
                  ? " · "
                  : ""}
                {nearestEvent.distanceM !== null
                  ? `${formatDistance(nearestEvent.distanceM)} bort`
                  : ""}
              </Text>
            </View>
            {nearestEvent.moreCount > 0 && (
              <Text style={styles.eventBannerMore}>
                {t("home.eventBannerMore", { count: nearestEvent.moreCount })}
              </Text>
            )}
            <Text style={styles.eventBannerArrow}>›</Text>
          </TouchableOpacity>
        )}

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
                <View style={styles.actionTitleRow}>
                  <Text style={styles.actionTitleDark}>
                    {t("home.library")}
                  </Text>
                  {savedCount > 0 && (
                    <View style={styles.actionBadge}>
                      <Text style={styles.actionBadgeText}>{savedCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.actionDescriptionDark}>
                  {t("home.libraryDesc")}
                </Text>
              </View>
              <Text style={styles.actionArrowDark}>›</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Swipe-hint */}
        <Text style={styles.swipeHint}>{t("home.swipeHint")}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F5F0E8" },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 },

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
  heroContent: { alignItems: "center", marginTop: 8 },
  heroIcon: { fontSize: 40, marginBottom: 8 },
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

  userBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  userInfo: { flexDirection: "row", alignItems: "center", flex: 1 },
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
  profileInitial: { color: "#F5F0E8", fontSize: 15, fontWeight: "700" },
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
  settingsIcon: { fontSize: 18 },
  loginButtonText: { color: "#F5F0E8", fontSize: 14, fontWeight: "600" },

  eventBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FBF7F0",
    borderColor: "#1B6B35",
    borderWidth: 1,
    borderRadius: 14,
    marginHorizontal: 20,
    marginTop: -16,
    marginBottom: 28,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    ...Platform.select({
      ios: {
        shadowColor: "#1B3D2B",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.12,
        shadowRadius: 8,
      },
      android: { elevation: 2 },
      web: { boxShadow: "0px 2px 8px rgba(27,61,43,0.12)" },
    }),
  },
  eventBannerEmoji: { fontSize: 24 },
  eventBannerText: { flex: 1 },
  eventBannerLine1: { fontSize: 14, fontWeight: "700", color: "#1B3D2B" },
  eventBannerLine2: { fontSize: 12, color: "#8A9A8D", marginTop: 2 },
  eventBannerArrow: { fontSize: 22, color: "#1B6B35", fontWeight: "300" },
  eventBannerMore: {
    fontSize: 11,
    color: "#1B6B35",
    fontWeight: "600",
    textAlign: "right",
  },

  actionsSection: { paddingHorizontal: 20, marginTop: -16, gap: 10 },
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
  actionCardInner: { flexDirection: "row", alignItems: "center", padding: 18 },
  actionEmoji: { fontSize: 26, width: 44, textAlign: "center" },
  actionTextContainer: { flex: 1, marginLeft: 4 },
  actionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 2,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#F5F0E8",
    marginBottom: 2,
  },
  actionDescription: { fontSize: 13, color: "rgba(245,240,232,0.6)" },
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
  actionDescriptionDark: { fontSize: 13, color: "#4A5E4C" },
  actionArrowDark: { fontSize: 28, color: "#C4CCC6", fontWeight: "300" },
  actionBadge: {
    backgroundColor: "#1B6B35",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    minWidth: 22,
    alignItems: "center",
  },
  actionBadgeText: {
    color: "#F5F0E8",
    fontSize: 12,
    fontWeight: "700",
  },

  swipeHint: {
    textAlign: "center",
    color: "#8A9A8D",
    fontSize: 12,
    marginTop: 24,
    paddingHorizontal: 20,
  },
});
