/**
 * @file LibraryMapView.tsx
 * @description Kart-vy för Bibliotek → Upptäck. Visar publika promenader
 * som pins på sina `centroid`-koordinater. Egenrullad klustring så
 * Stockholm-zoom inte renderar 200 överlappande pins.
 *
 * Tre zoom-nivåer styrs av samma `region.latitudeDelta`:
 *   • >= 0.5 (region/land): grov klustring (bucket = delta/6)
 *   • 0.05–0.5 (stad): finkornig klustring (bucket = delta/8)
 *   • < 0.05 (kvarter): inga kluster — alla pins synliga
 *
 * Klustringen är ren JS, körs vid varje regionChange (debounced via
 * onRegionChangeComplete-callbacken som react-native-maps redan
 * trottlar internt — typiskt en händelse per kart-rörelse-stopp).
 * Walks utan centroid (gamla/utkast utan koordinater) hoppas över tyst.
 *
 * Inga native deps — använder bara MapView/Marker som redan länkade
 * via react-native-maps. OTA-bart.
 */
import React, { useMemo, useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import MapView, { Marker } from "./MapViewWeb";
import { Walk } from "../types";
import { useTranslation } from "../i18n";
import { flagForLanguage } from "../constants/languages";
import { getDistanceInMeters, formatDistance } from "../utils/location";

type Coord = { latitude: number; longitude: number };
type Region = Coord & { latitudeDelta: number; longitudeDelta: number };

interface Props {
  walks: Walk[];
  userLocation: Coord | null;
  onSelect: (walk: Walk) => void;
}

/** Initiell region: zooma till bbox runt walks (med padding), eller
 *  användarens position som fallback om walks saknar centroid, eller
 *  Sverige-vy som sista fallback. */
function pickInitialRegion(
  walks: Walk[],
  userLocation: Coord | null
): Region {
  const placed = walks.filter((w) => !!w.centroid);
  if (placed.length > 0) {
    const lats = placed.map((w) => w.centroid!.latitude);
    const lngs = placed.map((w) => w.centroid!.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const latDelta = Math.max(0.05, (maxLat - minLat) * 1.4);
    const lngDelta = Math.max(0.05, (maxLng - minLng) * 1.4);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: latDelta,
      longitudeDelta: lngDelta,
    };
  }
  if (userLocation) {
    return {
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
      latitudeDelta: 0.3,
      longitudeDelta: 0.3,
    };
  }
  // Sverige-default — landet centrerat, hela syns på iPhone-skärm.
  return {
    latitude: 62.5,
    longitude: 16.5,
    latitudeDelta: 12,
    longitudeDelta: 12,
  };
}

type Cluster = {
  id: string;
  latitude: number;
  longitude: number;
  walks: Walk[];
};

/** Bucketar walks på lat/lng-grid baserat på aktuell zoom. */
function clusterWalks(
  walks: Walk[],
  region: Region
): { clusters: Cluster[]; loose: Walk[] } {
  // Bucket-storlek skalar med zoom så vi alltid får 6–8 buckets på
  // skärmen oavsett zoomnivå.
  const cellSize =
    region.latitudeDelta >= 0.5
      ? region.latitudeDelta / 6
      : region.latitudeDelta >= 0.05
      ? region.latitudeDelta / 8
      : 0; // 0 = ingen klustring, visa alla individuellt

  if (cellSize === 0) {
    return {
      clusters: [],
      loose: walks.filter((w) => !!w.centroid),
    };
  }

  const buckets = new Map<string, Walk[]>();
  for (const w of walks) {
    if (!w.centroid) continue;
    const key = `${Math.floor(w.centroid.latitude / cellSize)}_${Math.floor(
      w.centroid.longitude / cellSize
    )}`;
    const arr = buckets.get(key);
    if (arr) arr.push(w);
    else buckets.set(key, [w]);
  }

  const clusters: Cluster[] = [];
  const loose: Walk[] = [];
  for (const [key, group] of buckets) {
    if (group.length === 1) {
      loose.push(group[0]);
    } else {
      const lat =
        group.reduce((s, w) => s + w.centroid!.latitude, 0) / group.length;
      const lng =
        group.reduce((s, w) => s + w.centroid!.longitude, 0) / group.length;
      clusters.push({
        id: key,
        latitude: lat,
        longitude: lng,
        walks: group,
      });
    }
  }
  return { clusters, loose };
}

export default function LibraryMapView({
  walks,
  userLocation,
  onSelect,
}: Props) {
  const { t } = useTranslation();
  const [region, setRegion] = useState<Region>(() =>
    pickInitialRegion(walks, userLocation)
  );
  const [selected, setSelected] = useState<Walk | null>(null);
  const mapRef = useRef<any>(null);

  // Om walks-listan ändras (filter/sök/load) och vi redan har en
  // initialRegion låter vi den vara — annars rör sig kartan ryckigt
  // för användaren. Initial-fit körs bara vid första mount.
  // (Senare iteration: knapp "🎯 Centrera" som auto-fittar igen.)

  const { clusters, loose } = useMemo(
    () => clusterWalks(walks, region),
    [walks, region]
  );

  function handlePressCluster(cluster: Cluster) {
    // Tryck på kluster → zooma in till klustrets bbox.
    const lats = cluster.walks.map((w) => w.centroid!.latitude);
    const lngs = cluster.walks.map((w) => w.centroid!.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const newRegion: Region = {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.5),
      longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.5),
    };
    if (mapRef.current?.animateToRegion) {
      try {
        mapRef.current.animateToRegion(newRegion, 400);
      } catch {
        // ignore
      }
    }
    setRegion(newRegion);
  }

  function handlePressWalk(walk: Walk) {
    setSelected(walk);
  }

  // Avstånd till vald walk (för preview-kortet)
  const selectedDistance =
    selected && userLocation && selected.centroid
      ? getDistanceInMeters(
          userLocation.latitude,
          userLocation.longitude,
          selected.centroid.latitude,
          selected.centroid.longitude
        )
      : null;

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        onRegionChangeComplete={(r: Region) => setRegion(r)}
        showsUserLocation
      >
        {clusters.map((c) => (
          <Marker
            key={c.id}
            coordinate={{ latitude: c.latitude, longitude: c.longitude }}
            onPress={() => handlePressCluster(c)}
            tracksViewChanges={false}
          >
            <View style={styles.clusterPin}>
              <Text style={styles.clusterCount}>{c.walks.length}</Text>
            </View>
          </Marker>
        ))}
        {loose.map((w) => (
          <Marker
            key={w.id}
            coordinate={w.centroid!}
            onPress={() => handlePressWalk(w)}
            tracksViewChanges={false}
          >
            <View
              style={[
                styles.walkPin,
                w.activityType === "bike" && styles.walkPinBike,
              ]}
            >
              <Text style={styles.walkPinEmoji}>
                {w.activityType === "bike" ? "🚲" : "🚶"}
              </Text>
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Hjälp-banner när inga walks finns */}
      {walks.length === 0 && (
        <View style={styles.hint}>
          <Text style={styles.hintText}>{t("library.mapEmpty")}</Text>
        </View>
      )}

      {/* Preview-kort när en pin är vald */}
      {selected && (
        <View style={styles.previewCard}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle} numberOfLines={1}>
              {flagForLanguage(selected.language)}
              {selected.activityType === "bike" ? " 🚲" : ""}{" "}
              {selected.title}
            </Text>
            <TouchableOpacity
              onPress={() => setSelected(null)}
              style={styles.previewClose}
            >
              <Text style={styles.previewCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.previewMeta}>
            {selected.questions.length}{" "}
            {selected.questions.length === 1
              ? t("library.checkpoint")
              : t("library.checkpoints")}
            {selected.city ? ` · 📍 ${selected.city}` : ""}
            {selectedDistance !== null
              ? ` · ${
                  selected.activityType === "bike" ? "🚲" : "🚶"
                } ${formatDistance(selectedDistance)}`
              : ""}
          </Text>
          {selected.description ? (
            <Text style={styles.previewDescription} numberOfLines={2}>
              {selected.description}
            </Text>
          ) : null}
          <TouchableOpacity
            style={styles.previewButton}
            onPress={() => {
              const w = selected;
              setSelected(null);
              onSelect(w);
            }}
          >
            <Text style={styles.previewButtonText}>
              {t("library.playWalk")}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  clusterPin: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#1B6B35",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#F5F0E8",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: { elevation: 5 },
      web: { boxShadow: "0px 2px 4px rgba(0,0,0,0.25)" },
    }),
  },
  clusterCount: {
    color: "#F5F0E8",
    fontSize: 16,
    fontWeight: "800",
  },
  walkPin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#E53935",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "#F5F0E8",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
      },
      android: { elevation: 5 },
      web: { boxShadow: "0px 2px 4px rgba(0,0,0,0.25)" },
    }),
  },
  walkPinBike: {
    backgroundColor: "#2874A6",
  },
  walkPinEmoji: {
    fontSize: 16,
  },
  hint: {
    position: "absolute",
    top: 20,
    left: 20,
    right: 20,
    backgroundColor: "rgba(255,255,255,0.95)",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  hintText: {
    color: "#2C3E2D",
    fontSize: 14,
  },
  previewCard: {
    position: "absolute",
    bottom: 20,
    left: 16,
    right: 16,
    backgroundColor: "#FFFFFF",
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8E8E4",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      android: { elevation: 12 },
      web: { boxShadow: "0px 4px 12px rgba(0,0,0,0.18)" },
    }),
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
  },
  previewTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#2C3E2D",
  },
  previewClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#F0EDE5",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  previewCloseText: {
    color: "#6B7B6E",
    fontSize: 16,
    fontWeight: "600",
  },
  previewMeta: {
    color: "#6B7B6E",
    fontSize: 13,
    marginBottom: 8,
  },
  previewDescription: {
    color: "#2C3E2D",
    fontSize: 14,
    lineHeight: 19,
    marginBottom: 12,
  },
  previewButton: {
    backgroundColor: "#1B6B35",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  previewButtonText: {
    color: "#F5F0E8",
    fontSize: 16,
    fontWeight: "700",
  },
});
