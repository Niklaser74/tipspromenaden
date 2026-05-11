/**
 * @file UpdateNotifier.tsx
 * @description Visar två olika uppdaterings-UI:
 *
 * 1. **Native-modal** (ny AAB krävs) — full-screen modal vid app-start om
 *    `nativeBuildVersion < latestBuild` i `config/appUpdate`. Required-läget
 *    är icke-dismissable. Knapp öppnar Play Store.
 *
 * 2. **OTA-banner** — diskret toast/banner högst upp när en ny OTA-bundle
 *    körs och vi inte visat noter för den `updateId` än. Auto-stängs efter
 *    8 s eller tap.
 *
 * Native har företräde — om både OTA och native-uppdatering är aktiva visas
 * bara native-modalen (OTA-bannern dyker upp nästa gång användaren startar
 * appen efter native-uppdatering).
 */
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Linking,
  Animated,
  ScrollView,
} from "react-native";
import * as Updates from "expo-updates";
import { useTranslation, useLanguageChoice } from "../i18n";
import {
  checkNativeUpdate,
  getEmbeddedReleaseNotes,
  getLastShownOtaUpdateId,
  markOtaUpdateShown,
  pickNotes,
  type NativeUpdateStatus,
} from "../services/appUpdate";

export default function UpdateNotifier() {
  const { t } = useTranslation();
  const choice = useLanguageChoice();
  // Release notes finns bara på sv + en — övriga locales mappas till sv.
  const lang: "sv" | "en" = choice === "en" ? "en" : "sv";

  const [native, setNative] = useState<NativeUpdateStatus>({ kind: "none" });
  const [otaNotes, setOtaNotes] = useState<string | null>(null);
  const otaUpdateId = useRef<string | null>(null);
  const slideAnim = useRef(new Animated.Value(-200)).current;

  // Native-check körs en gång vid mount
  useEffect(() => {
    let cancelled = false;
    checkNativeUpdate().then((s) => {
      if (!cancelled) setNative(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // OTA-check: om vi just kör en update vars id inte ännu visats
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const id = Updates.updateId;
      if (!id) return;
      const last = await getLastShownOtaUpdateId();
      if (cancelled || last === id) return;
      const notes = pickNotes(getEmbeddedReleaseNotes(), lang);
      if (!notes) {
        // Ingen text att visa — markera ändå som "sett" så vi inte
        // hänger i loop, men visa ingen banner.
        await markOtaUpdateShown(id);
        return;
      }
      otaUpdateId.current = id;
      setOtaNotes(notes);
    })();
    return () => {
      cancelled = true;
    };
  }, [lang]);

  // Slide-in när bannern dyker upp; auto-dismiss efter 8 s
  useEffect(() => {
    if (!otaNotes) return;
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 280,
      useNativeDriver: true,
    }).start();
    const timer = setTimeout(() => dismissOta(), 8000);
    return () => clearTimeout(timer);
  }, [otaNotes, slideAnim]);

  function dismissOta() {
    Animated.timing(slideAnim, {
      toValue: -200,
      duration: 200,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        if (otaUpdateId.current) markOtaUpdateShown(otaUpdateId.current);
        setOtaNotes(null);
      }
    });
  }

  // Native-modal har företräde
  if (native.kind !== "none") {
    const notes = pickNotes(native.releaseNotes, lang);
    const required = native.kind === "required";
    return (
      <Modal visible transparent={false} animationType="fade">
        <View style={styles.modalRoot}>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalIcon}>🌲</Text>
            <Text style={styles.modalTitle}>
              {required
                ? t("updates.nativeRequiredTitle")
                : t("updates.nativeOptionalTitle")}
            </Text>
            <Text style={styles.modalSubtitle}>
              {required
                ? t("updates.nativeRequiredBody")
                : t("updates.nativeOptionalBody")}
            </Text>
            {native.latestVersion ? (
              <Text style={styles.versionLine}>v{native.latestVersion}</Text>
            ) : null}
            {notes ? (
              <View style={styles.notesBox}>
                <Text style={styles.notesHeader}>
                  {t("updates.releaseNotesHeader")}
                </Text>
                <Text style={styles.notesText}>{notes}</Text>
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.modalActions}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => Linking.openURL(native.playStoreUrl)}
            >
              <Text style={styles.primaryButtonText}>
                {t("updates.openPlayStore")}
              </Text>
            </TouchableOpacity>
            {!required ? (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setNative({ kind: "none" })}
              >
                <Text style={styles.secondaryButtonText}>
                  {t("updates.later")}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>
    );
  }

  if (!otaNotes) return null;

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}
      pointerEvents="box-none"
    >
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={dismissOta}
        style={styles.bannerInner}
      >
        <Text style={styles.bannerTitle}>{t("updates.otaBannerTitle")}</Text>
        <Text style={styles.bannerText} numberOfLines={4}>
          {otaNotes}
        </Text>
        <Text style={styles.bannerDismiss}>{t("updates.tapToDismiss")}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: "#F5F0E8",
  },
  modalContent: {
    padding: 32,
    paddingTop: 72,
    alignItems: "center",
  },
  modalIcon: {
    fontSize: 56,
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#1B3D2B",
    textAlign: "center",
    marginBottom: 12,
  },
  modalSubtitle: {
    fontSize: 16,
    color: "#2C3E2D",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 16,
  },
  versionLine: {
    fontSize: 14,
    color: "#6B7B6E",
    marginBottom: 16,
  },
  notesBox: {
    backgroundColor: "#EAE3D6",
    borderRadius: 12,
    padding: 16,
    width: "100%",
    marginTop: 8,
  },
  notesHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: "#1B3D2B",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  notesText: {
    fontSize: 15,
    color: "#2C3E2D",
    lineHeight: 21,
  },
  modalActions: {
    padding: 24,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: "#1B6B35",
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#F5F0E8",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#6B7B6E",
    fontSize: 15,
    fontWeight: "500",
  },
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 12,
    paddingTop: 44,
    paddingHorizontal: 12,
  },
  bannerInner: {
    backgroundColor: "#1B6B35",
    borderRadius: 14,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  bannerTitle: {
    color: "#F5F0E8",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  bannerText: {
    color: "#F5F0E8",
    fontSize: 14,
    lineHeight: 19,
  },
  bannerDismiss: {
    color: "#C5D6CB",
    fontSize: 11,
    marginTop: 6,
    fontStyle: "italic",
  },
});
