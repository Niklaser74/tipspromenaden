import React, { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { NavigationContainer, LinkingOptions } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import * as Linking from "expo-linking";
import { AuthProvider } from "./src/context/AuthContext";
import ErrorBoundary from "./src/components/ErrorBoundary";
import { initI18n, useTranslation } from "./src/i18n";
import { installWalkTagsSync } from "./src/services/walkTagsSync";

// Koppla in taggarnas auto-push till molnet en gång vid modulladdning.
// Ligger utanför komponentträdet så det inte återupprepas vid re-render.
installWalkTagsSync();

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
import ManageTagsScreen from "./src/screens/ManageTagsScreen";
import WalkInsightsScreen from "./src/screens/WalkInsightsScreen";
import { APP_SCHEME, WALK_PATH } from "./src/constants/deepLinks";

const Stack = createNativeStackNavigator();

// Stöttade format: `tipspromenaden://walk/<id>` och (när universal links är
// uppsatta) `https://tipspromenaden.se/walk/<id>`. OpenWalkScreen löser
// walkId → Walk och replace:ar till JoinWalk.
const linking: LinkingOptions<ReactNavigation.RootParamList> = {
  prefixes: [
    Linking.createURL("/"),
    `${APP_SCHEME}://`,
    "https://tipspromenaden.se",
    "https://www.tipspromenaden.se",
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
          options={{
            title: t("nav.joinWalk"),
            headerStyle: { backgroundColor: "#F5F0E8" },
            headerTintColor: "#2C3E2D",
          }}
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

  useEffect(() => {
    // Läs in sparat språkval innan vi renderar navigator. Väldigt snabbt
    // (bara en AsyncStorage-läsning), men förhindrar blipp från fel språk.
    initI18n().finally(() => setReady(true));
  }, []);

  if (!ready) {
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

  return (
    <ErrorBoundary>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </ErrorBoundary>
  );
}
