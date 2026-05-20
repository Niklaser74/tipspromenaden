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
  Modal,
  ScrollView,
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

// Grundenhet på kartan = en plats. Ofta = 1 walk, men kan vara flera
// walks som delar (nästan) exakt samma centroid (~30 m radie). Klustring
// vid utzoomning grupperar sen grupperna, inte individuella walks.
type WalkGroup = {
  id: string;
  latitude: number;
  longitude: number;
  walks: Walk[]; // 1 eller fler — samma fysiska startpunkt
};

type Cluster = {
  id: string;
  latitude: number;
  longitude: number;
  groups: WalkGroup[]; // alltid flera grupper, annars hade det blivit en grupp
};

/** ~30 m i lat/lng-grader (lat-grader är konstant, lng varierar med
 *  breddgrad men på svenska breddgrader är 30 m ≈ 0.00027° i båda
 *  riktningarna inom acceptabel felmarginal för "samma plats"). */
const SHARED_POINT_GRID = 0.0003;

/** Snappar walks med samma fysiska startpunkt (centroid) till EN grupp.
 *  Körs oavsett zoom — så även när användaren zoomar in maximalt syns
 *  flera walks på samma plats som EN pin med antal-badge istället för
 *  överlappande nålar. */
function groupColocated(walks: Walk[]): WalkGroup[] {
  const buckets = new Map<string, Walk[]>();
  for (const w of walks) {
    if (!w.centroid) continue;
    const key = `${Math.floor(
      w.centroid.latitude / SHARED_POINT_GRID
    )}_${Math.floor(w.centroid.longitude / SHARED_POINT_GRID)}`;
    const arr = buckets.get(key);
    if (arr) arr.push(w);
    else buckets.set(key, [w]);
  }
  const groups: WalkGroup[] = [];
  for (const [key, members] of buckets) {
    const lat =
      members.reduce((s, w) => s + w.centroid!.latitude, 0) / members.length;
    const lng =
      members.reduce((s, w) => s + w.centroid!.longitude, 0) / members.length;
    groups.push({ id: key, latitude: lat, longitude: lng, walks: members });
  }
  return groups;
}

/** Bucketar grupper på lat/lng-grid baserat på aktuell zoom. */
function clusterGroups(
  groups: WalkGroup[],
  region: Region
): { clusters: Cluster[]; loose: WalkGroup[] } {
  // Bucket-storlek skalar med zoom så vi alltid får 6–8 buckets på
  // skärmen oavsett zoomnivå. På inzoomad nivå visas grupperna som
  // de är (deras shared-point-bucketing räcker).
  const cellSize =
    region.latitudeDelta >= 0.5
      ? region.latitudeDelta / 6
      : region.latitudeDelta >= 0.05
      ? region.latitudeDelta / 8
      : 0;

  if (cellSize === 0) {
    return { clusters: [], loose: groups };
  }

  const buckets = new Map<string, WalkGroup[]>();
  for (const g of groups) {
    const key = `${Math.floor(g.latitude / cellSize)}_${Math.floor(
      g.longitude / cellSize
    )}`;
    const arr = buckets.get(key);
    if (arr) arr.push(g);
    else buckets.set(key, [g]);
  }

  const clusters: Cluster[] = [];
  const loose: WalkGroup[] = [];
  for (const [key, members] of buckets) {
    if (members.length === 1) {
      loose.push(members[0]);
    } else {
      const totalWalks = members.reduce((s, g) => s + g.walks.length, 0);
      const lat =
        members.reduce((s, g) => s + g.latitude * g.walks.length, 0) /
        totalWalks;
      const lng =
        members.reduce((s, g) => s + g.longitude * g.walks.length, 0) /
        totalWalks;
      clusters.push({ id: key, latitude: lat, longitude: lng, groups: members });
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
  // Listan visas när användaren tryckt en shared-point-pin (flera walks
  // på samma plats). null = inte öppen.
  const [groupList, setGroupList] = useState<WalkGroup | null>(null);
  const mapRef = useRef<any>(null);

  // Om walks-listan ändras (filter/sök/load) och vi redan har en
  // initialRegion låter vi den vara — annars rör sig kartan ryckigt
  // för användaren. Initial-fit körs bara vid första mount.

  // Två lager: först gruppera co-located walks (alltid på, ~30 m radie),
  // sedan klustra grupperna baserat på aktuell zoom.
  const groups = useMemo(() => groupColocated(walks), [walks]);
  const { clusters, loose } = useMemo(
    () => clusterGroups(groups, region),
    [groups, region]
  );

  function handlePressCluster(cluster: Cluster) {
    // Tryck på kluster → zooma in till klustrets bbox.
    const lats = cluster.groups.map((g) => g.latitude);
    const lngs = cluster.groups.map((g) => g.longitude);
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

  function handlePressGroup(group: WalkGroup) {
    // Enskild walk på platsen → öppna preview-kortet direkt.
    // Flera walks → öppna list-modalen så användaren får välja.
    if (group.walks.length === 1) {
      setSelected(group.walks[0]);
    } else {
      setGroupList(group);
    }
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
        {clusters.map((c) => {
          // Räkna ihop alla walks i klustret (alla gruppers walks
          // summerade) så badgen speglar verkligt antal, inte antal
          // grupper.
          const total = c.groups.reduce((s, g) => s + g.walks.length, 0);
          return (
            <Marker
              key={c.id}
              coordinate={{ latitude: c.latitude, longitude: c.longitude }}
              onPress={() => handlePressCluster(c)}
              tracksViewChanges={false}
            >
              <View style={styles.clusterPin}>
                <Text style={styles.clusterCount}>{total}</Text>
              </View>
            </Marker>
          );
        })}
        {loose.map((g) => {
          const sample = g.walks[0];
          const isShared = g.walks.length > 1;
          // Vid shared-point: alla walks ska ha relevant emoji-mix —
          // använd cykel-emoji om någon walk är bike, annars promenad.
          const anyBike = g.walks.some((w) => w.activityType === "bike");
          return (
            <Marker
              key={g.id}
              coordinate={{ latitude: g.latitude, longitude: g.longitude }}
              onPress={() => handlePressGroup(g)}
              tracksViewChanges={false}
            >
              <View
                style={[
                  styles.walkPin,
                  anyBike && styles.walkPinBike,
                  isShared && styles.walkPinShared,
                ]}
              >
                <Text style={styles.walkPinEmoji}>
                  {anyBike ? "🚲" : "🚶"}
                </Text>
                {isShared && (
                  <View style={styles.sharedBadge}>
                    <Text style={styles.sharedBadgeText}>{g.walks.length}</Text>
                  </View>
                )}
              </View>
            </Marker>
          );
        })}
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

      {/* List-modal: visas när användaren tryckt en pin där flera walks
          delar samma startpunkt. Halv-skärm-sheet med varje walk som
          rad → tryck rad öppnar preview-kortet (eller startar direkt). */}
      <Modal
        visible={!!groupList}
        transparent
        animationType="slide"
        onRequestClose={() => setGroupList(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {t("library.sharedPointTitle", {
                  count: groupList?.walks.length ?? 0,
                })}
              </Text>
              <TouchableOpacity
                onPress={() => setGroupList(null)}
                style={styles.previewClose}
              >
                <Text style={styles.previewCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalList}>
              {groupList?.walks.map((w) => (
                <TouchableOpacity
                  key={w.id}
                  style={styles.modalRow}
                  onPress={() => {
                    setGroupList(null);
                    setSelected(w);
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={styles.modalRowTitle} numberOfLines={1}>
                    {flagForLanguage(w.language)}
                    {w.activityType === "bike" ? " 🚲" : ""} {w.title}
                  </Text>
                  <Text style={styles.modalRowMeta}>
                    {w.questions.length}{" "}
                    {w.questions.length === 1
                      ? t("library.checkpoint")
                      : t("library.checkpoints")}
                    {w.city ? ` · 📍 ${w.city}` : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
  // Shared-point-variant: orange ton för att signalera "flera här" så
  // användaren vet att tap öppnar en lista, inte ett enskilt walk-kort.
  walkPinShared: {
    backgroundColor: "#D97706",
  },
  walkPinEmoji: {
    fontSize: 16,
  },
  // Liten räkne-badge uppe till höger på pinen — låg vikt men tydlig
  // siffra, undviker konflikt med själva pin-emojin.
  sharedBadge: {
    position: "absolute",
    top: -6,
    right: -8,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#1B3D2B",
    borderWidth: 1.5,
    borderColor: "#F5F0E8",
    paddingHorizontal: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  sharedBadgeText: {
    color: "#F5F0E8",
    fontSize: 11,
    fontWeight: "800",
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
  // List-modal när flera walks delar startpunkt
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalSheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 8,
    paddingBottom: 32,
    maxHeight: "70%",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D9D2C2",
    alignSelf: "center",
    marginBottom: 12,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  modalTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: "#2C3E2D",
  },
  modalList: {
    paddingHorizontal: 20,
  },
  modalRow: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EDE5",
  },
  modalRowTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2C3E2D",
    marginBottom: 4,
  },
  modalRowMeta: {
    fontSize: 13,
    color: "#6B7B6E",
  },
});
