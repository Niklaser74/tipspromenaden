import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
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
import { deleteAccountAndData } from "../services/auth";

export default function SettingsScreen() {
  const { t } = useTranslation();
  const choice = useLanguageChoice();
  const { user } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Det förväntade ordet i bekräftelseinputen — översatt så att svensk
  // användare ser "RADERA", engelsk ser "DELETE". Vi jämför mot exakt
  // samma sträng som visas som placeholder.
  const deleteConfirmWord = t("settings.deleteTypePlaceholder");

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

  // Steg 1: snabb avbryt-bar varning. Steg 2 (om de fortsätter):
  // modal med textinput som kräver att de skriver "RADERA"/"DELETE"
  // exakt. Två separata mentala bekräftelser hindrar både feltap och
  // muskelminnesfortsättning.
  function startDeleteFlow() {
    Alert.alert(
      t("home.deleteConfirmTitle"),
      t("home.deleteConfirmMessage"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("home.deleteContinue"),
          style: "destructive",
          onPress: () => {
            setDeleteConfirmText("");
            setDeleteModalVisible(true);
          },
        },
      ]
    );
  }

  async function performDelete() {
    if (deleteConfirmText.trim().toUpperCase() !== deleteConfirmWord.toUpperCase()) {
      Alert.alert(t("common.errorTitle"), t("settings.deleteTypeMismatch"));
      return;
    }
    setDeleting(true);
    try {
      await deleteAccountAndData();
      setDeleteModalVisible(false);
      Alert.alert(t("home.deleteDoneTitle"), t("home.deleteDoneMessage"));
    } catch (e: any) {
      if (e?.code === "auth/requires-recent-login") {
        Alert.alert(t("home.deleteReloginTitle"), t("home.deleteReloginMessage"));
      } else {
        Alert.alert(t("common.errorTitle"), e?.message || t("common.error"));
      }
    } finally {
      setDeleting(false);
    }
  }

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
    <>
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

      {/* Danger zone — radera konto + all data. Bara för icke-anonyma;
          anonyma användare har inget Firestore-konto att radera. */}
      {canSync && (
        <>
          <Text style={[styles.sectionTitle, styles.sectionTitleDanger]}>
            {t("settings.dangerZone")}
          </Text>
          <View style={[styles.card, styles.cardDanger]}>
            <TouchableOpacity
              style={styles.row}
              onPress={startDeleteFlow}
              activeOpacity={0.6}
            >
              <View style={styles.syncLabelWrap}>
                <Text style={[styles.rowLabel, styles.rowLabelDanger]}>
                  {t("settings.deleteAccount")}
                </Text>
                <Text style={styles.rowHint}>
                  {t("settings.deleteAccountHint")}
                </Text>
              </View>
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

    {/* Sista bekräftelse-modal: kräver att användaren skriver
        det lokaliserade ordet (RADERA/DELETE) för att bekräfta. */}
    <Modal
      visible={deleteModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => !deleting && setDeleteModalVisible(false)}
    >
      <View style={styles.deleteOverlay}>
        <View style={styles.deleteCard}>
          <Text style={styles.deleteTitle}>
            {t("settings.deleteTypeTitle")}
          </Text>
          <Text style={styles.deletePrompt}>
            {t("settings.deleteTypePrompt")}
          </Text>
          <TextInput
            style={styles.deleteInput}
            value={deleteConfirmText}
            onChangeText={setDeleteConfirmText}
            placeholder={deleteConfirmWord}
            placeholderTextColor="#B0BAB2"
            autoCapitalize="characters"
            autoCorrect={false}
            editable={!deleting}
          />
          <View style={styles.deleteButtonRow}>
            <TouchableOpacity
              style={styles.deleteCancelBtn}
              onPress={() => setDeleteModalVisible(false)}
              disabled={deleting}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteCancelText}>
                {t("common.cancel")}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.deleteConfirmBtn,
                deleteConfirmText.trim().toUpperCase() !==
                  deleteConfirmWord.toUpperCase() && styles.deleteConfirmBtnDisabled,
              ]}
              onPress={performDelete}
              disabled={
                deleting ||
                deleteConfirmText.trim().toUpperCase() !==
                  deleteConfirmWord.toUpperCase()
              }
              activeOpacity={0.7}
            >
              {deleting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.deleteConfirmText}>
                  {t("settings.deleteTypeConfirm")}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
    </>
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
  sectionTitleDanger: {
    color: "#B33A3A",
  },
  cardDanger: {
    borderColor: "#F0D6D6",
  },
  rowLabelDanger: {
    color: "#B33A3A",
  },
  deleteOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  deleteCard: {
    width: "100%",
    maxWidth: 420,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
  },
  deleteTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#B33A3A",
    marginBottom: 8,
  },
  deletePrompt: {
    fontSize: 14,
    color: "#2C3E2D",
    marginBottom: 16,
    lineHeight: 20,
  },
  deleteInput: {
    borderWidth: 1,
    borderColor: "#E0DDD3",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#2C3E2D",
    backgroundColor: "#FAF8F2",
    marginBottom: 16,
  },
  deleteButtonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  deleteCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#F0F0EC",
  },
  deleteCancelText: {
    fontSize: 15,
    color: "#2C3E2D",
    fontWeight: "600",
  },
  deleteConfirmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#B33A3A",
    minWidth: 120,
    alignItems: "center",
  },
  deleteConfirmBtnDisabled: {
    backgroundColor: "#D9A0A0",
  },
  deleteConfirmText: {
    fontSize: 15,
    color: "#FFFFFF",
    fontWeight: "700",
  },
});
