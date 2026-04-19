import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { parseQRData } from "../utils/qr";
import { getWalk } from "../services/firestore";
import { saveWalkLocally, getSavedWalks } from "../services/storage";
import { useTranslation } from "../i18n";

// Kamera finns bara på native
let CameraView: any = null;
let useCameraPermissions: any = null;
if (Platform.OS !== "web") {
  const cam = require("expo-camera");
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
}

export default function ScanQRScreen() {
  const navigation = useNavigation<any>();

  // På web: manuell kodinmatning istället för kamera
  if (Platform.OS === "web") {
    return <WebScanner navigation={navigation} />;
  }

  return <NativeScanner navigation={navigation} />;
}

// Web-version: klistra in QR-data manuellt
function WebScanner({ navigation }: { navigation: any }) {
  const { t } = useTranslation();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!code.trim()) return;
    setLoading(true);
    await processQRData(code.trim(), navigation, t, () => setLoading(false));
    setLoading(false);
  };

  return (
    <View style={styles.webContainer}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
        <Text style={styles.backButtonText}>{t("scan.backButton")}</Text>
      </TouchableOpacity>
      <View style={styles.webContent}>
        <View style={styles.webIconContainer}>
          <Text style={styles.webIcon}>📷</Text>
        </View>
        <Text style={styles.webTitle}>{t("scan.webTitle")}</Text>
        <Text style={styles.webHint}>{t("scan.webHint")}</Text>
        <TextInput
          style={styles.webInput}
          placeholder='{"type":"tipspromenaden","walkId":"..."}'
          placeholderTextColor="#B0BAB2"
          value={code}
          onChangeText={setCode}
          multiline
        />
        <TouchableOpacity
          style={[styles.webButton, loading && styles.webButtonDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#F5F0E8" />
          ) : (
            <Text style={styles.webButtonText}>{t("scan.webFetchWalk")}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Native-version: kamera med QR-skanning
function NativeScanner({ navigation }: { navigation: any }) {
  const { t } = useTranslation();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  useEffect(() => {
    requestPermission();
  }, []);

  const handleBarCodeScanned = async ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);
    await processQRData(data, navigation, t, () => setScanned(false));
  };

  if (!permission?.granted) {
    return (
      <View style={styles.permContainer}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <Text style={styles.backButtonText}>{t("scan.backButton")}</Text>
        </TouchableOpacity>
        <View style={styles.permContent}>
          <View style={styles.permIconContainer}>
            <Text style={styles.permIcon}>📷</Text>
          </View>
          <Text style={styles.permTitle}>{t("scan.permTitle")}</Text>
          <Text style={styles.permText}>{t("scan.permText")}</Text>
          <TouchableOpacity
            style={styles.permButton}
            onPress={requestPermission}
            activeOpacity={0.8}
          >
            <Text style={styles.permButtonText}>{t("scan.permButton")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.cameraContainer}>
      <CameraView
        style={styles.camera}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      >
        <View style={styles.overlay}>
          {/* Back button */}
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <Text style={styles.backButtonText}>{t("scan.backButton")}</Text>
          </TouchableOpacity>
          {/* Darkened areas */}
          <View style={styles.overlayTop} />
          <View style={styles.overlayMiddle}>
            <View style={styles.overlaySide} />
            <View style={styles.scanArea}>
              {/* Corner markers */}
              <View style={[styles.corner, styles.cornerTL]} />
              <View style={[styles.corner, styles.cornerTR]} />
              <View style={[styles.corner, styles.cornerBL]} />
              <View style={[styles.corner, styles.cornerBR]} />
            </View>
            <View style={styles.overlaySide} />
          </View>
          <View style={styles.overlayBottom}>
            <View style={styles.hintPill}>
              <Text style={styles.hint}>{t("scan.aimHint")}</Text>
            </View>
          </View>
        </View>
      </CameraView>
    </View>
  );
}

type TFn = (key: string, opts?: any) => string;

async function processQRData(
  data: string,
  navigation: any,
  t: TFn,
  onError?: () => void
) {
  const qrData = parseQRData(data);
  if (!qrData) {
    Alert.alert(t("scan.invalidTitle"), t("scan.invalidMessage"));
    onError?.();
    return;
  }

  const savedWalks = await getSavedWalks();
  const cached = savedWalks.find((sw) => sw.walk.id === qrData.walkId);

  if (cached) {
    showWalkOptions(cached.walk, data, navigation, t, onError);
    return;
  }

  try {
    const walk = await getWalk(qrData.walkId);
    if (!walk) {
      Alert.alert(t("scan.notFoundTitle"), t("scan.notFoundMessage"));
      onError?.();
      return;
    }

    await saveWalkLocally({ walk, savedAt: Date.now(), qrData: data });
    showWalkOptions(walk, data, navigation, t, onError);
  } catch (e: any) {
    Alert.alert(
      t("scan.offlineTitle"),
      t("scan.offlineMessage"),
      [{ text: t("common.ok"), onPress: () => onError?.() }]
    );
  }
}

function showWalkOptions(
  walk: any,
  qrData: string,
  navigation: any,
  t: TFn,
  onError?: () => void
) {
  Alert.alert(walk.title, t("scan.controlPointCount", { count: walk.questions.length }), [
    {
      text: t("scan.saveForLater"),
      style: "cancel",
      onPress: async () => {
        await saveWalkLocally({ walk, savedAt: Date.now(), qrData });
        Alert.alert(t("scan.savedTitle"), t("scan.savedMessage"));
        navigation.navigate("Home");
      },
    },
    {
      text: t("scan.startNow"),
      onPress: () => {
        navigation.navigate("JoinWalk", { walk });
      },
    },
  ]);
}

const styles = StyleSheet.create({
  // Camera / native
  cameraContainer: {
    flex: 1,
    backgroundColor: "#000",
  },
  camera: {
    flex: 1,
    width: "100%",
  },
  overlay: {
    flex: 1,
  },
  overlayTop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  overlayMiddle: {
    flexDirection: "row",
  },
  overlaySide: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  scanArea: {
    width: 260,
    height: 260,
    backgroundColor: "transparent",
  },
  corner: {
    position: "absolute",
    width: 30,
    height: 30,
    borderColor: "#E8B830",
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 3,
    borderLeftWidth: 3,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 3,
    borderRightWidth: 3,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 3,
    borderLeftWidth: 3,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 3,
    borderRightWidth: 3,
    borderBottomRightRadius: 12,
  },
  overlayBottom: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    paddingTop: 32,
  },
  hintPill: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 24,
  },
  hint: {
    color: "#F5F0E8",
    fontSize: 15,
    fontWeight: "500",
  },

  // Permission screen
  permContainer: {
    flex: 1,
    backgroundColor: "#F5F0E8",
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  permContent: {
    alignItems: "center",
  },
  permIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "#E8F0E0",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  permIcon: {
    fontSize: 36,
  },
  permTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2C3E2D",
    marginBottom: 8,
  },
  permText: {
    color: "#4A5E4C",
    fontSize: 15,
    textAlign: "center",
    marginBottom: 28,
    lineHeight: 22,
  },
  permButton: {
    backgroundColor: "#1B6B35",
    paddingVertical: 16,
    paddingHorizontal: 36,
    borderRadius: 14,
  },
  permButtonText: {
    color: "#F5F0E8",
    fontSize: 16,
    fontWeight: "700",
  },

  // Web styles
  backButton: {
    position: "absolute",
    top: 48,
    left: 20,
    zIndex: 10,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    ...Platform.select({
      ios: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 3 },
      android: { elevation: 2 },
      web: { boxShadow: "0px 1px 3px rgba(0,0,0,0.1)" },
    }),
  },
  backButtonText: {
    color: "#1B6B35",
    fontSize: 15,
    fontWeight: "600",
  },
  webContainer: {
    flex: 1,
    backgroundColor: "#F5F0E8",
    justifyContent: "center",
    padding: 24,
  },
  webContent: {
    alignItems: "center",
  },
  webIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "#E8F0E0",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  webIcon: {
    fontSize: 36,
  },
  webTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#2C3E2D",
    marginBottom: 8,
  },
  webHint: {
    color: "#4A5E4C",
    textAlign: "center",
    marginBottom: 24,
    fontSize: 14,
    lineHeight: 20,
  },
  webInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E8E8E4",
    borderRadius: 14,
    padding: 16,
    fontSize: 14,
    minHeight: 90,
    width: "100%",
    maxWidth: 400,
    marginBottom: 16,
    color: "#2C3E2D",
  },
  webButton: {
    backgroundColor: "#1B6B35",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
    width: "100%",
    maxWidth: 400,
  },
  webButtonDisabled: {
    opacity: 0.6,
  },
  webButtonText: {
    color: "#F5F0E8",
    fontSize: 17,
    fontWeight: "700",
  },
});
