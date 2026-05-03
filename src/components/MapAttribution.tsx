/**
 * @file MapAttribution.tsx
 * @description Liten copyright-text för OSM/OpenTopoMap-tiles.
 *
 * OpenStreetMap kräver "© OpenStreetMap contributors"-attribution när
 * deras tiles används (Tile Usage Policy). OpenTopoMap kräver
 * "© OpenTopoMap (CC-BY-SA)" när deras tiles används. Webbsidan får
 * detta automatiskt via Leaflets attribution-control; på native måste
 * vi rendera det själva.
 *
 * Kompakt textetikett i nedre vänstra hörnet — stör inte UI:t men är
 * synlig vid behov.
 */

import React from "react";
import { Text, StyleSheet, Platform, View } from "react-native";
import type { MapType } from "../services/storage";

interface Props {
  mapType: MapType;
}

export default function MapAttribution({ mapType }: Props) {
  // Hybrid använder Apple/Google-satellit på native som har egen
  // inbäddad attribution — vi behöver inte lägga till något där.
  if (Platform.OS === "web" || mapType === "hybrid") return null;

  const text =
    mapType === "terrain" ? "© OpenTopoMap (CC-BY-SA)" : "© OpenStreetMap";

  return (
    <View style={styles.container} pointerEvents="none">
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(255,255,255,0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  text: {
    fontSize: 10,
    color: "#2C3E2D",
  },
});
