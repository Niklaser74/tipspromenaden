import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
  Dimensions,
} from "react-native";
import { NavigationContainer, LinkingOptions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import * as ScreenOrientation from "expo-screen-orientation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AuthProvider } from "./src/context/AuthContext";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { initI18n, useTranslation } from "./src/i18n";
import { installWalkTagsSync } from "./src/services/walkTagsSync";
import { warmFeedbackPref } from "./src/services/feedback";
import OnboardingScreen, {
  ONBOARDED_STORAGE_KEY,
} from "./src/screens/OnboardingScreen";
import StartTrailDraws from "./src/components/StartTrailDraws";
import UpdateNotifier from "./src/components/UpdateNotifier";
import OfflineBanner from "./src/components/OfflineBanner";
import {
  useFonts,
  Lora_400Regular,
  Lora_400Regular_Italic,
  Lora_600SemiBold,
} from "@expo-google-fonts/lora";

// Koppla in taggarnas auto-push till molnet en gång vid modulladdning.
// Ligger utanför komponentträdet så det inte återupprepas vid re-render.
installWalkTagsSync();

// Hydrera ljud/haptik-preferensen tidigt så första rätt/fel-svaret
// respekterar användarens val (enabledNow() är synkron i hot path).
warmFeedbackPref();

// Orientation: native-config är "default" (alla rotationer tillåtna).
// Här bestämmer vi runtime: telefoner låses till portrait (där flesta
// layouter är finputsade), surfplattor får rotera fritt så att t.ex.
// CreateWalkScreen kan visa karta + frågelista i splitvy. Tröskeln 600 dp
// är Androids standardgräns mellan "phone" och "tablet" sw-qualifier.
// Web/iOS-iPad fungerar också med samma logik via Dimensions API.
function applyOrientationLock() {
  if (Platform.OS === "web") return; // web styrs av webbläsaren
  const { width, height } = Dimensions.get("screen");
  const shortestSide = Math.min(width, height);
  const isTablet = shortestSide >= 600;
  if (isTablet) {
    ScreenOrientation.unlockAsync().catch(() => {});
  } else {
    ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.PORTRAIT_UP
    ).catch(() => {});
  }
}
applyOrientationLock();

import HomeTabs from "./src/navigation/HomeTabs";
import LoginScreen from "./src/screens/LoginScreen";
import CreateWalkScreen from "./src/screens/CreateWalkScreen";
import ShowQRScreen from "./src/screens/ShowQRScreen";
import ScanQRScreen from "./src/screens/ScanQRScreen";
import JoinWalkScreen from "./src/screens/JoinWalkScreen";
import ActiveWalkScreen from "./src/screens/ActiveWalkScreen";
import ResultsScreen from "./src/screens/ResultsScreen";
import LeaderboardScreen from "./src/screens/LeaderboardScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import OpenWalkScreen from "./src/screens/OpenWalkScreen";
import OpenTipspackScreen from "./src/screens/OpenTipspackScreen";
import ManageTagsScreen from "./src/screens/ManageTagsScreen";
import WalkInsightsScreen from "./src/screens/WalkInsightsScreen";
import {
  APP_SCHEME,
  WALK_PATH,
  TIPSPACK_PATH,
} from "./src/constants/deepLinks";

const Stack = createNativeStackNavigator();

// Stöttade deep-link-format:
//   1. `https://tipspromenaden.app/walk/<id>` (App Link, primärt)
//      eller `tipspromenaden://walk/<id>` (legacy custom-scheme)
//      → OpenWalkScreen → JoinWalk
//   2. `tipspromenaden://tipspack/<slug>` (custom-scheme bara — vi vill
//      INTE intercepta https://tipspromenaden.app/tipspack/* eftersom
//      de URL:erna är publika nedladdningar av .tipspack-filer)
//      → OpenTipspackScreen → CreateWalk (batteri förladdat)
const linking: LinkingOptions<ReactNavigation.RootParamList> = {
  prefixes: [
    Linking.createURL("/"),
    `${APP_SCHEME}://`,
    "https://tipspromenaden.app",
    "https://www.tipspromenaden.app",
  ],
  config: {
    screens: {
      Home: "",
      OpenWalk: {
        path: `${WALK_PATH}/:walkId?`,
        parse: {
          walkId: (v: string) => decodeURIComponent(v),
        },
      },
      OpenTipspack: {
        path: `${TIPSPACK_PATH}/:slug`,
        parse: {
          slug: (v: string) => decodeURIComponent(v),
        },
      },
      Settings: "settings",
    },
  },
};

function AppNavigator() {
  // t() används för att få rubriker översatta; hook-en får komponenten
  // att rerenderas när språket byts.
  const { t } = useTranslation();

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{
          headerStyle: {
            backgroundColor: "#1B6B35",
          },
          headerTintColor: "#F5F0E8",
          headerTitleStyle: {
            fontWeight: "600",
            fontSize: 17,
          },
          headerShadowVisible: false,
          contentStyle: {
            backgroundColor: "#F5F0E8",
          },
        }}
      >
        <Stack.Screen
          name="Home"
          component={HomeTabs}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{
            title: t("nav.login"),
            headerStyle: { backgroundColor: "#F5F0E8" },
            headerTintColor: "#2C3E2D",
          }}
        />
        <Stack.Screen
          name="CreateWalk"
          component={CreateWalkScreen}
          options={{
            title: t("nav.createWalk"),
            headerStyle: { backgroundColor: "#1B6B35" },
          }}
        />
        <Stack.Screen
          name="ShowQR"
          component={ShowQRScreen}
          options={{
            title: t("nav.showQR"),
            headerBackVisible: false,
            headerStyle: { backgroundColor: "#F5F0E8" },
            headerTintColor: "#2C3E2D",
          }}
        />
        <Stack.Screen
          name="ScanQR"
          component={ScanQRScreen}
          options={{
            title: t("nav.scanQR"),
            headerStyle: { backgroundColor: "#1B6B35" },
          }}
        />
        <Stack.Screen
          name="JoinWalk"
          component={JoinWalkScreen}
          options={({ navigation }) => ({
            title: t("nav.joinWalk"),
            headerStyle: { backgroundColor: "#F5F0E8" },
            headerTintColor: "#2C3E2D",
            // JoinWalk nås ofta via OpenWalk → navigation.replace, dvs
            // utan bakåt-historik → ingen auto-bakåtknapp. iOS saknar
            // hårdvaru-bakåt, så utan detta blir man fast (t.ex. på en
            // avslutad event-promenad). Explicit Hem-knapp garanterar
            // alltid en väg ut.
            headerLeft: () => (
              <TouchableOpacity
                onPress={() =>
                  navigation.canGoBack()
                    ? navigation.goBack()
                    : navigation.navigate("Home")
                }
                accessibilityLabel={t("common.home") || "Hem"}
                style={{ paddingVertical: 6, paddingRight: 16 }}
              >
                <Text style={{ color: "#2C3E2D", fontSize: 16, fontWeight: "600" }}>
                  ‹ {t("common.home") || "Hem"}
                </Text>
              </TouchableOpacity>
            ),
          })}
        />
        <Stack.Screen
          name="ActiveWalk"
          component={ActiveWalkScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Results"
          component={ResultsScreen}
          options={{
            title: t("nav.results"),
            headerBackVisible: false,
            headerStyle: { backgroundColor: "#F5F0E8" },
            headerTintColor: "#2C3E2D",
          }}
        />
        <Stack.Screen
          name="Leaderboard"
          component={LeaderboardScreen}
          options={{
            title: t("nav.leaderboard"),
            headerBackVisible: false,
            headerStyle: { backgroundColor: "#1B3D2B" },
          }}
        />
        <Stack.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            title: t("nav.settings"),
            headerStyle: { backgroundColor: "#F5F0E8" },
            headerTintColor: "#2C3E2D",
          }}
        />
        <Stack.Screen
          name="OpenWalk"
          component={OpenWalkScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="OpenTipspack"
          component={OpenTipspackScreen}
          options={{ headerShown: false }}
        />
        {/* Library är inte längre en egen stack-skärm — den bor som en
            top-tab-flik inom HomeTabs (sibling till HomeMain + Stats).
            Navigationskommandot `navigate("Library")` från en sibling-tab
            byter flik istället för att pusha ny skärm. Eventuella params
            (t.ex. `initialTab: "events"` från event-bannern) propageras
            till LibraryScreen. */}
        <Stack.Screen
          name="ManageTags"
          component={ManageTagsScreen}
          options={{
            title: t("nav.manageTags"),
            headerStyle: { backgroundColor: "#F5F0E8" },
            headerTintColor: "#2C3E2D",
          }}
        />
        <Stack.Screen
          name="WalkInsights"
          component={WalkInsightsScreen}
          options={{
            title: t("nav.walkInsights"),
            headerStyle: { backgroundColor: "#F5F0E8" },
            headerTintColor: "#2C3E2D",
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  // null = vi vet inte än (väntar på AsyncStorage), false = behöver visas,
  // true = onboarding redan klar (eller just klar). Tristate undviker
  // blink från fel default vid första render.
  const [onboarded, setOnboarded] = useState<boolean | null>(null);
  // Start-animationen ("stigen ritas") spelas en gång per cold-start.
  // Sätts till true när animationens onComplete fyrar ELLER när användaren
  // tappar för att hoppa över. Återställs aldrig under en session — vi vill
  // inte att animationen återkommer mitt i ett spel.
  //
  // 2026-05-07: animationen omskriven (checkpoints som Animated.View utanför
  // SVG istället för animerad SvgG med SvgText). Aktiverad igen efter
  // emergency-disable i build 17.
  const [startAnimDone, setStartAnimDone] = useState(false);

  // Brand-fonter (Lora) registreras via expo-font under app-laddningen så
  // StartTrailDraws kan rendera wordmark + tagline + checkpoint-siffror i
  // korrekt typografi enligt Friluft Folio. Phase A: bara välkomstanim:n
  // använder Lora — resten av appen håller system-defaults oförändrat.
  // useFonts returnerar [loaded] men appen renderar oavsett efter timeout
  // så en saknad font aldrig hänger startflödet (vi har system-fallback).
  const [fontsLoaded] = useFonts({
    Lora_400Regular,
    Lora_400Regular_Italic,
    Lora_600SemiBold,
  });

  useEffect(() => {
    // Läs in sparat språkval + onboarding-status innan vi renderar
    // navigator. Båda är snabba AsyncStorage-läsningar; vi gör dem
    // parallellt så loading-spinnern syns ett ögonblick mindre.
    Promise.all([
      initI18n(),
      AsyncStorage.getItem(ONBOARDED_STORAGE_KEY)
        .then((v) => setOnboarded(v === "true"))
        .catch(() => setOnboarded(false)),
    ]).finally(() => setReady(true));
  }, []);

  if (!ready || onboarded === null || !fontsLoaded) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#F5F0E8",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color="#1B6B35" />
      </View>
    );
  }

  // Start-animation först — varje cold start, tap för att skippa.
  // Renderas FÖRE både onboarding och navigator så loggan + stigen är det
  // användaren ser direkt efter splash-ikonen.
  if (!startAnimDone) {
    return (
      <ErrorBoundary>
        <StartTrailDraws onComplete={() => setStartAnimDone(true)} />
      </ErrorBoundary>
    );
  }

  // Onboarding renderas över allt annat (utanför navigator) eftersom
  // det är ett pre-app-flöde. När användaren slutfört eller hoppat över
  // sätts onboarded=true och vanliga app:en visas.
  if (!onboarded) {
    return (
      <ErrorBoundary>
        <OnboardingScreen onDone={() => setOnboarded(true)} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <OfflineBanner />
        <AppNavigator />
        <UpdateNotifier />
      </AuthProvider>
    </ErrorBoundary>
  );
}
