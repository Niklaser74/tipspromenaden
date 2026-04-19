import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as WebBrowser from "expo-web-browser";
import * as Google from "expo-auth-session/providers/google";
import { signInWithGoogle } from "../services/auth";
import { useAuth } from "../context/AuthContext";
import { useTranslation } from "../i18n";

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_WEB_CLIENT_ID =
  "851934058818-ru6b3h1s8mf7evibqquuu6klbh0jv3f6.apps.googleusercontent.com";
const GOOGLE_ANDROID_CLIENT_ID =
  "851934058818-4vrug3e2i4kksvdge2d6rmgoqal4851m.apps.googleusercontent.com";

// Native Google Sign-In laddas bara på native-plattformar (inte webb).
// Try/catch för säkerhets skull om modulen saknas i en viss build.
let NativeGoogleSignin: any = null;
let NativeStatusCodes: any = null;
if (Platform.OS !== "web") {
  try {
    const mod = require("@react-native-google-signin/google-signin");
    NativeGoogleSignin = mod.GoogleSignin;
    NativeStatusCodes = mod.statusCodes;
  } catch (e) {
    console.warn("Native Google Sign-In not available:", e);
  }
}

/**
 * Inloggningsskärm med Google OAuth.
 *
 * - **Webb:** expo-auth-session med web-klient-ID (browser-baserat OAuth)
 * - **Android/iOS:** @react-native-google-signin/google-signin (native flow,
 *   matchas mot Android-klient via paketnamn + SHA-1 i Google Cloud Console)
 */
export default function LoginScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);

  // expo-auth-session-hooken anropas alltid (React-regler), men används
  // bara på webben. Vi skickar med båda klient-ID:n så hooken inte kraschar.
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    scopes: ["openid", "profile", "email"],
  });

  // Konfigurera native Google Sign-In en gång vid mount
  useEffect(() => {
    if (Platform.OS !== "web" && NativeGoogleSignin) {
      try {
        NativeGoogleSignin.configure({
          webClientId: GOOGLE_WEB_CLIENT_ID,
          offlineAccess: false,
          scopes: ["profile", "email"],
        });
      } catch (e) {
        console.warn("Failed to configure GoogleSignin:", e);
      }
    }
  }, []);

  // Om redan inloggad, gå tillbaka till startsidan
  useEffect(() => {
    if (user && !user.isAnonymous) {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate("Home");
      }
    }
  }, [user]);

  // Hantera OAuth-svar (endast webb)
  useEffect(() => {
    if (Platform.OS !== "web") return;
    if (response?.type === "success") {
      const { authentication } = response;
      handleAuthResult(authentication);
    }
  }, [response]);

  const handleAuthResult = async (authentication: any) => {
    if (!authentication) return;
    setLoading(true);
    try {
      if (authentication.idToken) {
        await signInWithGoogle(authentication.idToken);
      }
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate("Home");
      }
    } catch (e: any) {
      Alert.alert(t("auth.loginError"), e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      if (Platform.OS === "web") {
        await promptAsync();
      } else {
        await handleNativeGoogleLogin();
      }
    } catch (e: any) {
      Alert.alert(t("auth.loginError"), e.message || String(e));
      setLoading(false);
    }
  };

  const handleNativeGoogleLogin = async () => {
    if (!NativeGoogleSignin) {
      Alert.alert(
        t("auth.missingNativeTitle"),
        t("auth.missingNativeMessage")
      );
      setLoading(false);
      return;
    }

    try {
      await NativeGoogleSignin.hasPlayServices({
        showPlayServicesUpdateDialog: true,
      });
      const result: any = await NativeGoogleSignin.signIn();

      // v16+ returnerar { type, data: {...} }, äldre versioner returnerar platt
      const idToken = result?.data?.idToken ?? result?.idToken;

      if (idToken) {
        await signInWithGoogle(idToken);
      } else {
        throw new Error(t("auth.noIdToken"));
      }

      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate("Home");
      }
    } catch (e: any) {
      if (
        NativeStatusCodes &&
        (e.code === NativeStatusCodes.SIGN_IN_CANCELLED ||
          e.code === NativeStatusCodes.IN_PROGRESS)
      ) {
        // Användaren avbröt eller redan igång - tyst
      } else {
        Alert.alert(
          t("auth.loginError"),
          t("auth.errorWithCode", {
            message: e.message || t("common.error"),
            code: e.code || t("auth.unknownCode"),
          })
        );
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        {/* Logo area */}
        <View style={styles.logoSection}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoEmoji}>🧭</Text>
          </View>
          <Text style={styles.appName}>Tipspromenaden</Text>
        </View>

        {/* Info */}
        <Text style={styles.title}>{t("auth.welcome")}</Text>
        <Text style={styles.subtitle}>{t("auth.subtitle")}</Text>

        {/* Google Sign-in Button */}
        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#1B6B35" />
          ) : (
            <View style={styles.googleButtonInner}>
              <View style={styles.googleIconContainer}>
                <Text style={styles.googleIcon}>G</Text>
              </View>
              <Text style={styles.googleText}>{t("auth.continueWithGoogle")}</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Divider */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
        </View>

        {/* Back button */}
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <Text style={styles.backText}>{t("common.back")}</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom decoration */}
      <View style={styles.bottomDecoration}>
        <Text style={styles.bottomText}>{t("auth.bottomHint")}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F0E8",
  },
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },

  // Logo
  logoSection: {
    alignItems: "center",
    marginBottom: 40,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: "#E8F0E0",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  logoEmoji: {
    fontSize: 36,
  },
  appName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#7A8A7D",
    letterSpacing: 2,
    textTransform: "uppercase",
  },

  // Text
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#2C3E2D",
    marginBottom: 10,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: "#4A5E4C",
    textAlign: "center",
    marginBottom: 36,
    lineHeight: 22,
    paddingHorizontal: 10,
  },

  // Google button
  googleButton: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1.5,
    borderColor: "#E0E0DC",
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    width: "100%",
    maxWidth: 320,
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
  googleButtonInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  googleIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#4285F4",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  googleIcon: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  googleText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2C3E2D",
  },

  // Divider
  divider: {
    width: "100%",
    maxWidth: 320,
    marginVertical: 24,
    alignItems: "center",
  },
  dividerLine: {
    width: 40,
    height: 2,
    backgroundColor: "#E8E8E4",
    borderRadius: 1,
  },

  // Back
  backButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  backText: {
    color: "#8A9A8D",
    fontSize: 15,
    fontWeight: "500",
  },

  // Bottom
  bottomDecoration: {
    paddingBottom: 40,
    paddingHorizontal: 40,
    alignItems: "center",
  },
  bottomText: {
    fontSize: 12,
    color: "#B0BAB2",
    textAlign: "center",
  },
});
