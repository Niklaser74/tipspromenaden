import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import {
  availableLanguages,
  setLanguage,
  useLanguageChoice,
  useTranslation,
} from "../i18n";
import { useAuth } from "../context/AuthContext";
import { syncMyWalksFromCloud } from "../services/walkSync";
import { pullWalkTagsFromCloud } from "../services/walkTagsSync";

export default function SettingsScreen() {
  const { t } = useTranslation();
  const choice = useLanguageChoice();
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);

  const version =
    (Constants.expoConfig?.version as string | undefined) ?? "1.0.0";

  // OTA-debug — visar vilken bundle som faktiskt körs. När en ny OTA
  // publicerats ska updateId här ändras efter att man stängt och
  // startat om appen två gånger (Expo laddar i bakgrunden, aktiverar
  // vid nästa start). "embedded" = kör inbakade bundeln från AAB:n,
  // ingen OTA aktiv än.
  const updateId = Updates.updateId
    ? Updates.updateId.slice(-8)
    : "embedded";
  const channel = Updates.channel ?? "—";
  const runtime = Updates.runtimeVersion ?? "—";

  // Visa synk-raden bara för inloggade (icke-anonyma) användare.
  // Anonyma har inga Firestore-ägda promenader att synka.
  const canSync = !!user && !user.isAnonymous;

  async function handleSync() {
    if (!user || syncing) return;
    setSyncing(true);
    try {
      const [added] = await Promise.all([
        syncMyWalksFromCloud(user.uid),
        // Pull:a taggar i samma sveph — syftet med knappen är "återställ
        // allt från molnet efter ominstallation". Tag-pull är tyst; fel
        // loggas bara och blockerar inte walk-resultatet.
        pullWalkTagsFromCloud(user.uid).catch((err) => {
          console.warn("Manual tag sync failed:", err);
        }),
      ]);
      const msg =
        added === 0
          ? t("settings.syncWalksResultNone")
          : t("settings.syncWalksResultAdded", { count: added });
      Alert.alert(t("settings.syncWalks"), msg);
    } catch (e) {
      console.warn("Manual walk sync failed:", e);
      Alert.alert(t("settings.syncWalks"), t("settings.syncWalksError"));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Språkval */}
      <Text style={styles.sectionTitle}>{t("settings.language")}</Text>
      <View style={styles.card}>
        {availableLanguages.map((lang, idx) => {
          const selected = choice === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              style={[
                styles.row,
                idx < availableLanguages.length - 1 && styles.rowBorder,
              ]}
              onPress={() => setLanguage(lang.code)}
              activeOpacity={0.6}
            >
              <Text style={styles.rowLabel}>{t(lang.labelKey)}</Text>
              {selected && <Text style={styles.check}>✓</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Kontosynk — återställ promenader från molnet */}
      {canSync && (
        <>
          <Text style={styles.sectionTitle}>{t("settings.account")}</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.row}
              onPress={handleSync}
              disabled={syncing}
              activeOpacity={0.6}
            >
              <View style={styles.syncLabelWrap}>
                <Text style={styles.rowLabel}>
                  {syncing
                    ? t("settings.syncWalksRunning")
                    : t("settings.syncWalks")}
                </Text>
                <Text style={styles.rowHint}>
                  {t("settings.syncWalksHint")}
                </Text>
              </View>
              {syncing && <ActivityIndicator size="small" color="#1B6B35" />}
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Om appen */}
      <Text style={styles.sectionTitle}>{t("settings.about")}</Text>
      <View style={styles.card}>
        <View style={[styles.row, styles.rowBorder]}>
          <Text style={styles.rowLabel}>
            {t("settings.version", { version })}
          </Text>
        </View>
        <View style={styles.row}>
          <View style={styles.syncLabelWrap}>
            <Text style={styles.rowLabel}>OTA</Text>
            <Text style={styles.rowHint}>
              {channel} · rt {runtime} · {updateId}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: "#F5F0E8",
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8A9A8D",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 10,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F0F0EC",
    overflow: "hidden",
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0EC",
  },
  rowLabel: {
    fontSize: 16,
    color: "#2C3E2D",
    fontWeight: "500",
  },
  check: {
    fontSize: 18,
    color: "#1B6B35",
    fontWeight: "700",
  },
  syncLabelWrap: {
    flex: 1,
    paddingRight: 12,
  },
  rowHint: {
    fontSize: 13,
    color: "#8A9A8D",
    marginTop: 2,
  },
});
