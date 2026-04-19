import React, { useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Share,
  Platform,
  Alert,
  ScrollView,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useRoute, useNavigation } from "@react-navigation/native";
// SDK 55: nya File/Directory-API:t är inte stabilt än, så vi använder legacy.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Walk } from "../types";
import { useTranslation } from "../i18n";

export default function ShowQRScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const { walk, qrData } = route.params as { walk: Walk; qrData: string };
  const qrRef = useRef<any>(null);
  const qrContainerRef = useRef<any>(null);

  /**
   * Retrieves the QR code as a base64 PNG data URL from the react-native-qrcode-svg ref.
   * Used primarily on native platforms.
   */
  const getQRDataURL = useCallback((): Promise<string> => {
    return new Promise((resolve, reject) => {
      if (qrRef.current) {
        qrRef.current.toDataURL((dataURL: string) => {
          resolve(dataURL);
        });
      } else {
        reject(new Error("QR ref not available"));
      }
    });
  }, []);

  /**
   * On web: finds the rendered SVG element inside the QR container, serializes it,
   * draws it onto a canvas with branding, and triggers a PNG download.
   * Falls back to copying the walk code to clipboard if anything fails.
   */
  const handleWebShareImage = useCallback(async () => {
    try {
      // Find the SVG element rendered by react-native-qrcode-svg
      const container = qrContainerRef.current;
      let svgEl: SVGSVGElement | null = null;
      if (container) {
        // The container is a React Native View; on web it's a div.
        // We need to access its underlying DOM node.
        const domNode =
          container._nativeTag || container;
        if (typeof domNode === "object" && domNode.querySelector) {
          svgEl = domNode.querySelector("svg");
        }
      }
      // Fallback: search the whole document for the QR SVG
      if (!svgEl) {
        svgEl = document.querySelector("[data-qr-container] svg") || document.querySelector("svg");
      }

      if (!svgEl) {
        throw new Error("Could not find QR SVG element");
      }

      // Serialize SVG to a string and create a blob URL
      const serializer = new XMLSerializer();
      const svgString = serializer.serializeToString(svgEl);
      const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
      const svgUrl = URL.createObjectURL(svgBlob);

      const padding = 40;
      const qrSize = 300;
      const textHeight = 100;

      const canvas = document.createElement("canvas");
      canvas.width = qrSize + padding * 2;
      canvas.height = qrSize + padding * 2 + textHeight;
      const ctx = canvas.getContext("2d")!;

      // Background
      ctx.fillStyle = "#1B6B35";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // White rounded rect behind QR
      ctx.fillStyle = "#ffffff";
      const radius = 16;
      const rx = padding - 10;
      const ry = padding - 10;
      const rw = qrSize + 20;
      const rh = qrSize + 20;
      ctx.beginPath();
      ctx.moveTo(rx + radius, ry);
      ctx.lineTo(rx + rw - radius, ry);
      ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + radius);
      ctx.lineTo(rx + rw, ry + rh - radius);
      ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - radius, ry + rh);
      ctx.lineTo(rx + radius, ry + rh);
      ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - radius);
      ctx.lineTo(rx, ry + radius);
      ctx.quadraticCurveTo(rx, ry, rx + radius, ry);
      ctx.closePath();
      ctx.fill();

      // Draw QR SVG onto canvas
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          ctx.drawImage(img, padding, padding, qrSize, qrSize);

          // Title text
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 20px Arial, sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(walk.title, canvas.width / 2, qrSize + padding + 35);

          // Subtitle
          ctx.fillStyle = "rgba(245,240,232,0.6)";
          ctx.font = "14px Arial, sans-serif";
          ctx.fillText(
            t("showQR.appNameFrHeader", { count: walk.questions.length }),
            canvas.width / 2,
            qrSize + padding + 60
          );

          URL.revokeObjectURL(svgUrl);
          resolve();
        };
        img.onerror = () => {
          URL.revokeObjectURL(svgUrl);
          reject(new Error("Failed to load QR SVG as image"));
        };
        img.src = svgUrl;
      });

      // Try native Web Share API with file, otherwise download
      const dataUrl = canvas.toDataURL("image/png");
      const fileName = `tipspromenaden-${walk.title.replace(/\s+/g, "-")}.png`;

      if (navigator.share && navigator.canShare) {
        try {
          const response = await fetch(dataUrl);
          const blob = await response.blob();
          const file = new File([blob], fileName, { type: "image/png" });
          if (navigator.canShare({ files: [file] })) {
            await navigator.share({
              title: walk.title,
              text: t("showQR.shareImageText", { title: walk.title }),
              files: [file],
            });
            return;
          }
        } catch (shareErr: any) {
          // User cancelled or share not supported with files, fall through to download
          if (shareErr.name === "AbortError") return;
        }
      }

      // Fallback: trigger download
      const link = document.createElement("a");
      link.download = fileName;
      link.href = dataUrl;
      link.click();
    } catch (e) {
      console.error("Web share image error:", e);
      // Fallback: copy walk code to clipboard
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          await navigator.clipboard.writeText(qrData);
          Alert.alert(t("showQR.copiedTitle"), t("showQR.copiedMessage"));
        } else {
          Alert.alert(t("showQR.codeTitle"), t("showQR.codeManual", { code: qrData }));
        }
      } catch (_) {
        Alert.alert(t("common.errorTitle"), t("showQR.copyError", { code: qrData }));
      }
    }
  }, [walk, qrData]);

  /**
   * Shares the QR code as a PNG image. On web, uses SVG-to-canvas rendering.
   * On native, uses the react-native-qrcode-svg toDataURL method with expo-sharing.
   * Falls back to sharing the walk code as text if image sharing fails.
   */
  const handleShareImage = async () => {
    if (Platform.OS === "web") {
      await handleWebShareImage();
      return;
    }

    try {
      const dataURL = await getQRDataURL();
      const fileName = `tipspromenaden-${walk.title.replace(/\s+/g, "-")}.png`;
      const filePath = `${FileSystem.cacheDirectory}${fileName}`;

      await FileSystem.writeAsStringAsync(filePath, dataURL, {
        encoding: FileSystem.EncodingType.Base64,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: "image/png",
          dialogTitle: t("showQR.shareDialogTitle", { title: walk.title }),
        });
      } else {
        await Share.share({
          message: t("showQR.shareMessage", { title: walk.title, code: qrData }),
        });
      }
    } catch (e) {
      console.error("Share error:", e);
      try {
        await Share.share({
          message: t("showQR.shareMessage", { title: walk.title, code: qrData }),
        });
      } catch (_) {}
    }
  };

  const handleShareText = async () => {
    try {
      await Share.share({
        message: t("showQR.shareMessage", { title: walk.title, code: qrData }),
      });
    } catch (e) {
      // Avbruten av användaren
    }
  };

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Success header */}
      <View style={styles.header}>
        <View style={styles.successIcon}>
          <Text style={styles.successEmoji}>✓</Text>
        </View>
        <Text style={styles.title}>{t("showQR.createdTitle")}</Text>
        <Text style={styles.walkTitle}>{walk.title}</Text>
      </View>

      {/* Walk summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryValue}>{walk.questions.length}</Text>
          <Text style={styles.summaryLabel}>{t("showQR.questionsLabel")}</Text>
        </View>
        {walk.event && (
          <>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryValue}>📅</Text>
              <Text style={styles.summaryLabel}>
                {walk.event.startDate}
              </Text>
            </View>
          </>
        )}
      </View>

      {/* QR Code */}
      <View style={styles.qrCard}>
        <View
          style={styles.qrInner}
          ref={qrContainerRef}
          {...(Platform.OS === "web" ? { "data-qr-container": "true" } : {})}
        >
          <QRCode
            value={qrData}
            size={220}
            backgroundColor="#FFFFFF"
            color="#1B6B35"
            getRef={(ref: any) => (qrRef.current = ref)}
          />
        </View>
        <Text style={styles.qrHint}>{t("showQR.hint")}</Text>
      </View>

      {/* Share buttons */}
      <View style={styles.shareSection}>
        <TouchableOpacity
          style={styles.shareButton}
          onPress={handleShareImage}
          activeOpacity={0.8}
        >
          <Text style={styles.shareIcon}>📷</Text>
          <Text style={styles.shareButtonText}>{t("showQR.shareAsImage")}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.textShareButton}
          onPress={handleShareText}
          activeOpacity={0.8}
        >
          <Text style={styles.textShareIcon}>📝</Text>
          <Text style={styles.textShareButtonText}>{t("showQR.shareAsText")}</Text>
        </TouchableOpacity>
      </View>

      {/* Home button */}
      <TouchableOpacity
        style={styles.homeButton}
        onPress={() => navigation.navigate("Home")}
        activeOpacity={0.7}
      >
        <Text style={styles.homeButtonText}>{t("showQR.backHome")}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: "#F5F0E8",
  },
  container: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 32,
  },

  // Header
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  successIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2D7A3A",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  successEmoji: {
    fontSize: 24,
    color: "#F5F0E8",
    fontWeight: "bold",
  },
  title: {
    fontSize: 26,
    fontWeight: "800",
    color: "#2C3E2D",
    marginBottom: 4,
    letterSpacing: -0.3,
  },
  walkTitle: {
    fontSize: 16,
    color: "#4A5E4C",
    fontWeight: "500",
  },

  // Summary
  summaryRow: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    marginBottom: 28,
    borderWidth: 1,
    borderColor: "#F0F0EC",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04,
        shadowRadius: 8,
      },
      android: { elevation: 1 },
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.04)" },
    }),
  },
  summaryItem: {
    alignItems: "center",
    paddingHorizontal: 24,
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2C3E2D",
  },
  summaryLabel: {
    fontSize: 12,
    color: "#8A9A8D",
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: "#E8E8E4",
  },

  // QR
  qrCard: {
    alignItems: "center",
    marginBottom: 32,
  },
  qrInner: {
    backgroundColor: "#FFFFFF",
    padding: 24,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#F0F0EC",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 16,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 4px 16px rgba(0,0,0,0.08)" },
    }),
  },
  qrHint: {
    color: "#8A9A8D",
    textAlign: "center",
    marginTop: 16,
    fontSize: 14,
  },

  // Share
  shareSection: {
    width: "100%",
    maxWidth: 320,
    gap: 10,
    marginBottom: 20,
  },
  shareButton: {
    backgroundColor: "#1B6B35",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    borderRadius: 14,
    gap: 10,
    ...Platform.select({
      ios: {
        shadowColor: "#1B6B35",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 4px 8px rgba(27,107,53,0.2)" },
    }),
  },
  shareIcon: {
    fontSize: 18,
  },
  shareButtonText: {
    color: "#F5F0E8",
    fontSize: 17,
    fontWeight: "700",
  },
  textShareButton: {
    backgroundColor: "#FFFFFF",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "#E8E8E4",
    paddingVertical: 14,
    borderRadius: 14,
    gap: 10,
  },
  textShareIcon: {
    fontSize: 16,
  },
  textShareButtonText: {
    color: "#2C3E2D",
    fontSize: 16,
    fontWeight: "600",
  },

  // Home
  homeButton: {
    paddingVertical: 14,
  },
  homeButtonText: {
    color: "#8A9A8D",
    fontSize: 15,
    fontWeight: "500",
  },
});
