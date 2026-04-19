/**
 * @file HomeTabs.tsx
 * @description Top-tab-navigator för Home + Stats med swipe.
 *
 * Användaren swipar höger på startsidan för att komma till sin
 * personliga statistik. Top-tabs valdes (istället för bottom-tabs)
 * eftersom interaktionen är swipe-driven och inte ska ta upp permanent
 * skärmyta — startsidan är fortfarande "huvudvyn" och vi vill inte
 * lägga till en bottom-bar bara för en sekundär flik.
 *
 * `tabBarStyle: display: none` döljer själva tab-baren visuellt; vi
 * litar på swipe-gesten och en liten indikator i HomeScreen som
 * antyder att man kan swipa.
 */
import React from "react";
import { createMaterialTopTabNavigator } from "@react-navigation/material-top-tabs";
import HomeScreen from "../screens/HomeScreen";
import StatsScreen from "../screens/StatsScreen";

const Tab = createMaterialTopTabNavigator();

export default function HomeTabs() {
  return (
    <Tab.Navigator
      initialRouteName="HomeMain"
      tabBarPosition="top"
      screenOptions={{
        swipeEnabled: true,
        tabBarStyle: { display: "none" },
        // Lazy-mount Stats: undvik att läsa AsyncStorage i bakgrunden
        // när användaren inte sett vyn än.
        lazy: true,
        animationEnabled: true,
      }}
    >
      <Tab.Screen name="HomeMain" component={HomeScreen} />
      <Tab.Screen name="Stats" component={StatsScreen} />
    </Tab.Navigator>
  );
}
