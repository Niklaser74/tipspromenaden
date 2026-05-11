/**
 * @file HomeTabs.tsx
 * @description Top-tab-navigator med 3 flikar: Library ← HomeMain → Stats.
 *
 * Swipe-höger på startsidan = Stats (personlig statistik).
 * Swipe-vänster på startsidan = Library (alla walks/tipspacks/event).
 * Hemskärmen är fortfarande huvudvyn — Library + Stats är sekundära flikar
 * som nås via swipe eller via knappar i UI:t.
 *
 * `tabBarStyle: display: none` döljer själva tab-baren visuellt; vi
 * litar på swipe-gesten och en liten indikator i HomeScreen.
 */
import React from "react";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import HomeScreen from "../screens/HomeScreen";
import StatsScreen from "../screens/StatsScreen";
import LibraryScreen from "../screens/LibraryScreen";

const Tab = createMaterialTopTabNavigator();

export default function HomeTabs() {
  return (
    <Tab.Navigator
      initialRouteName="HomeMain"
      tabBarPosition="top"
      screenOptions={{
        swipeEnabled: true,
        tabBarStyle: { display: "none" },
        lazy: true,
        animationEnabled: true,
      }}
    >
      <Tab.Screen name="Library" component={LibraryScreen} />
      <Tab.Screen name="HomeMain" component={HomeScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
    </Tab.Navigator>
  );
}
