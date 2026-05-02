/**
 * @file LibraryScreen.tsx
 * @description Bibliotek över publika tipspacks (frågebatterier).
 * Visar kuraterade pack från tipspromenaden.app + användar-uppladdade
 * från Firestore i en gemensam lista.
 *
 * UX:
 *   - Sökruta för att filtrera på titel/beskrivning
 *   - Språk-flagg-chips för att filtrera på språk
 *   - Varje rad visar: titel + beskrivning + antal frågor + språk
 *     (frågorna är DOLDA by default — de är hela poängen att inte
 *      spoila innehållet)
 *   - "Förhandsgranska frågor"-toggle expanderar och visar frågorna
 *   - "Använd"-knapp navigerar till CreateWalk med batteriet förladdat
 *     (samma flöde som deep-link tipspromenaden://tipspack/<slug>)
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useTranslation } from "../i18n";
import { LANGUAGES, flagForLanguage } from "../constants/languages";
import {
  getLibraryTipspacks,
  fetchTipspackContent,
  type LibraryTipspack,
} from "../services/tipspackLibrary";
import { getPublicWalks } from "../services/firestore";
import { getCurrentLocation, getDistanceInMeters } from "../utils/location";
import { WALK_CATEGORIES } from "../constants/categories";
import { Walk } from "../types";

export default function LibraryScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();
  const [tab, setTab] = useState<"tipspack" | "walks">("tipspack");

  const [packs, setPacks] = useState<LibraryTipspack[] | null>(null);
  const [walks, setWalks] = useState<Walk[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [previewBySlug, setPreviewBySlug] = useState<
    Record<string, { questions: { text: string; options: string[]; correctOptionIndex: number }[] } | "loading" | "error">
  >({});
  const [usingSlug, setUsingSlug] = useState<string | null>(null);

  const [nearMe, setNearMe] = useState(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationLoading, setLocationLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getLibraryTipspacks()
      .then((list) => {
        if (!cancelled) setPacks(list);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || t("library.fetchError"));
      });
    getPublicWalks()
      .then((list) => {
        if (!cancelled) setWalks(list);
      })
      .catch((e: any) => {
        if (!cancelled) setError(e?.message || t("library.fetchError"));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // Vilka språk-flaggor finns att visa som filter? (bara de som faktiskt
  // har minst ett pack — undvik att visa filter för språk som inte finns)
  const availableLanguages = useMemo(() => {
    if (!packs) return [];
    const codes = new Set(packs.map((p) => p.language));
    return LANGUAGES.filter((l) => codes.has(l.code));
  }, [packs]);

  // Filtrera lista på sök + språk
  const filtered = useMemo(() => {
    if (!packs) return [];
    const term = searchTerm.trim().toLowerCase();
    return packs.filter((p) => {
      if (selectedLanguages.size > 0 && !selectedLanguages.has(p.language)) {
        return false;
      }
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        p.description.toLowerCase().includes(term) ||
        p.author.toLowerCase().includes(term)
      );
    });
  }, [packs, searchTerm, selectedLanguages]);

  function toggleLanguage(code: string) {
    setSelectedLanguages((curr) => {
      const next = new Set(curr);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  function toggleCategory(code: string) {
    setSelectedCategories((curr) => {
      const next = new Set(curr);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const availableCategories = useMemo(() => {
    if (!walks) return [];
    const codes = new Set<string>();
    for (const w of walks) {
      if (w.category) codes.add(w.category);
    }
    return WALK_CATEGORIES.filter((c) => codes.has(c));
  }, [walks]);

  const filteredWalks = useMemo(() => {
    if (!walks) return [];
    const term = searchTerm.trim().toLowerCase();
    return walks.filter((w) => {
      if (selectedCategories.size > 0) {
        if (!w.category || !selectedCategories.has(w.category)) return false;
      }
      if (selectedLanguages.size > 0) {
        if (!w.language || !selectedLanguages.has(w.language)) return false;
      }
      if (!term) return true;
      return (
        w.title.toLowerCase().includes(term) ||
        (w.description?.toLowerCase().includes(term) ?? false) ||
        (w.city?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [walks, searchTerm, selectedCategories, selectedLanguages]);

  function joinWalk(walk: Walk) {
    // Replace istället för navigate så bakåtpilen från JoinWalk hoppar
    // tillbaka till Home, inte till biblioteket.
    navigation.replace("JoinWalk", { walk });
  }

  async function toggleNearMe() {
    if (nearMe) {
      setNearMe(false);
      return;
    }
    if (userLocation) {
      setNearMe(true);
      return;
    }
    setLocationLoading(true);
    setLocationError(null);
    try {
      const loc = await getCurrentLocation();
      setUserLocation({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
      });
      setNearMe(true);
    } catch (e: any) {
      setLocationError(e?.message || t("library.locationError"));
    } finally {
      setLocationLoading(false);
    }
  }

  /**
   * Walks med pre-beräknad metadata för rendering. Avstånd räknas en
   * gång (inte i både sort och display) och placedCount memoiseras
   * tillsammans med listan istället för per render-rad.
   */
  const walksToRender = useMemo(() => {
    const items = filteredWalks.map((w) => {
      const placedCount = w.questions.filter(
        (q) => q.coordinate.latitude !== 0 || q.coordinate.longitude !== 0
      ).length;
      const distance =
        nearMe && userLocation && w.centroid
          ? getDistanceInMeters(
              userLocation.latitude,
              userLocation.longitude,
              w.centroid.latitude,
              w.centroid.longitude
            )
          : null;
      return { walk: w, placedCount, distance };
    });
    if (nearMe && userLocation) {
      items.sort(
        (a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)
      );
    }
    return items;
  }, [filteredWalks, nearMe, userLocation]);

  function formatDistance(m: number): string {
    if (m < 1000) return `${Math.round(m)} m`;
    if (m < 10000) return `${(m / 1000).toFixed(1)} km`;
    return `${Math.round(m / 1000)} km`;
  }

  async function expandPack(pack: LibraryTipspack) {
    if (expandedSlug === pack.slug) {
      setExpandedSlug(null);
      return;
    }
    setExpandedSlug(pack.slug);
    if (previewBySlug[pack.slug]) return; // redan hämtat
    setPreviewBySlug((curr) => ({ ...curr, [pack.slug]: "loading" }));
    try {
      const data = await fetchTipspackContent(pack);
      setPreviewBySlug((curr) => ({
        ...curr,
        [pack.slug]: { questions: data.questions },
      }));
    } catch {
      setPreviewBySlug((curr) => ({ ...curr, [pack.slug]: "error" }));
    }
  }

  async function usePack(pack: LibraryTipspack) {
    setUsingSlug(pack.slug);
    try {
      const data = await fetchTipspackContent(pack);
      navigation.replace("CreateWalk", {
        pendingBattery: data.questions,
        pendingBatteryName: pack.name,
        pendingBatteryLanguage: pack.language,
      });
    } catch (e: any) {
      setError(e?.message || t("library.fetchError"));
      setUsingSlug(null);
    }
  }

  return (
    <View style={styles.container}>
      {/* Segmented control: Frågebatterier vs Promenader */}
      <View style={styles.segmented}>
        <TouchableOpacity
          style={[
            styles.segmentedItem,
            tab === "tipspack" && styles.segmentedItemActive,
          ]}
          onPress={() => setTab("tipspack")}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.segmentedText,
              tab === "tipspack" && styles.segmentedTextActive,
            ]}
          >
            📚 {t("library.tabTipspacks")}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.segmentedItem,
            tab === "walks" && styles.segmentedItemActive,
          ]}
          onPress={() => setTab("walks")}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.segmentedText,
              tab === "walks" && styles.segmentedTextActive,
            ]}
          >
            🚶 {t("library.tabWalks")}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={
            tab === "tipspack"
              ? t("library.searchPlaceholder")
              : t("library.searchPlaceholderWalks")
          }
          placeholderTextColor="#8A9A8D"
          value={searchTerm}
          onChangeText={setSearchTerm}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {tab === "tipspack" && availableLanguages.length > 1 && (
        <View style={styles.flagRow}>
          {availableLanguages.map((lang) => {
            const active = selectedLanguages.has(lang.code);
            return (
              <TouchableOpacity
                key={lang.code}
                onPress={() => toggleLanguage(lang.code)}
                style={[styles.flagChip, active && styles.flagChipActive]}
              >
                <Text style={styles.flagChipText}>
                  {lang.flag} {lang.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {tab === "walks" && availableCategories.length > 0 && (
        <View style={styles.flagRow}>
          {availableCategories.map((cat) => {
            const active = selectedCategories.has(cat);
            return (
              <TouchableOpacity
                key={cat}
                onPress={() => toggleCategory(cat)}
                style={[styles.flagChip, active && styles.flagChipActive]}
              >
                <Text
                  style={[
                    styles.flagChipText,
                    active && styles.flagChipTextActive,
                  ]}
                >
                  {t(`category.${cat}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {tab === "walks" && walks !== null && walks.length > 0 && (
        <View style={styles.flagRow}>
          <TouchableOpacity
            onPress={toggleNearMe}
            disabled={locationLoading}
            style={[
              styles.flagChip,
              nearMe && styles.flagChipActive,
              locationLoading && { opacity: 0.5 },
            ]}
          >
            <Text
              style={[
                styles.flagChipText,
                nearMe && styles.flagChipTextActive,
              ]}
            >
              {locationLoading
                ? `📍 ${t("library.locationLoading")}`
                : nearMe
                ? `📍 ${t("library.nearMeOn")}`
                : `📍 ${t("library.nearMe")}`}
            </Text>
          </TouchableOpacity>
          {locationError && (
            <Text style={styles.locationError}>{locationError}</Text>
          )}
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      {tab === "tipspack" && packs === null && !error && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1B6B35" />
          <Text style={styles.loadingText}>{t("library.loading")}</Text>
        </View>
      )}

      {tab === "walks" && walks === null && !error && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1B6B35" />
          <Text style={styles.loadingText}>{t("library.loading")}</Text>
        </View>
      )}

      {tab === "tipspack" && packs !== null && filtered.length === 0 && (
        <Text style={styles.empty}>
          {searchTerm || selectedLanguages.size > 0
            ? t("library.noMatch")
            : t("library.empty")}
        </Text>
      )}

      {tab === "walks" && walks !== null && walksToRender.length === 0 && (
        <Text style={styles.empty}>
          {searchTerm || selectedCategories.size > 0 || selectedLanguages.size > 0
            ? t("library.noMatch")
            : t("library.emptyWalks")}
        </Text>
      )}

      {tab === "walks" && (
        <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
          {walksToRender.map(({ walk, placedCount, distance }) => (
            <View key={walk.id} style={styles.card}>
              <Text style={styles.cardTitle}>
                {flagForLanguage(walk.language)} {walk.title}
              </Text>
              {walk.description ? (
                <Text style={styles.cardDescription}>{walk.description}</Text>
              ) : null}
              <Text style={styles.cardMeta}>
                {placedCount}{" "}
                {placedCount === 1
                  ? t("library.checkpoint")
                  : t("library.checkpoints")}
                {walk.city ? ` · 📍 ${walk.city}` : ""}
                {walk.category ? ` · ${t(`category.${walk.category}`)}` : ""}
                {distance !== null ? ` · 🚶 ${formatDistance(distance)}` : ""}
              </Text>
              <TouchableOpacity
                style={styles.useButton}
                onPress={() => joinWalk(walk)}
              >
                <Text style={styles.useButtonText}>
                  {t("library.playWalk")}
                </Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}

      {tab === "tipspack" && (
      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {filtered.map((pack) => {
          const isExpanded = expandedSlug === pack.slug;
          const preview = previewBySlug[pack.slug];
          const isUsing = usingSlug === pack.slug;
          return (
            <View key={pack.slug} style={styles.card}>
              <Text style={styles.cardTitle}>
                {flagForLanguage(pack.language)} {pack.name}
              </Text>
              {pack.description ? (
                <Text style={styles.cardDescription}>{pack.description}</Text>
              ) : null}
              <Text style={styles.cardMeta}>
                {pack.questionCount}{" "}
                {pack.questionCount === 1 ? t("library.question") : t("library.questions")}
                {" · "}
                {pack.author}
                {pack.source === "uploaded" && ` · ${t("library.uploaded")}`}
              </Text>

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.previewButton}
                  onPress={() => expandPack(pack)}
                >
                  <Text style={styles.previewButtonText}>
                    {isExpanded
                      ? t("library.hideQuestions")
                      : t("library.previewQuestions")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.useButton, isUsing && styles.useButtonDisabled]}
                  onPress={() => usePack(pack)}
                  disabled={isUsing}
                >
                  <Text style={styles.useButtonText}>
                    {isUsing ? t("library.loading") : t("library.use")}
                  </Text>
                </TouchableOpacity>
              </View>

              {isExpanded && (
                <View style={styles.preview}>
                  {preview === "loading" && (
                    <Text style={styles.previewLoading}>{t("library.loading")}</Text>
                  )}
                  {preview === "error" && (
                    <Text style={styles.previewError}>
                      {t("library.previewError")}
                    </Text>
                  )}
                  {preview && typeof preview === "object" && (
                    <View>
                      {preview.questions.map((q, i) => (
                        <View key={i} style={styles.previewQuestion}>
                          <Text style={styles.previewQuestionText}>
                            {i + 1}. {q.text}
                          </Text>
                          {q.options.map((opt, j) => (
                            <Text
                              key={j}
                              style={[
                                styles.previewOption,
                                j === q.correctOptionIndex &&
                                  styles.previewOptionCorrect,
                              ]}
                            >
                              {j === q.correctOptionIndex ? "✓ " : "•  "}
                              {opt}
                            </Text>
                          ))}
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F0E8",
  },
  segmented: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#D9D2C2",
    overflow: "hidden",
  },
  segmentedItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  segmentedItemActive: {
    backgroundColor: "#1B6B35",
  },
  segmentedText: {
    fontSize: 14,
    color: "#4A5E4C",
    fontWeight: "600",
  },
  segmentedTextActive: {
    color: "#F5F0E8",
  },
  flagChipTextActive: {
    color: "#F5F0E8",
    fontWeight: "600",
  },
  locationError: {
    fontSize: 12,
    color: "#A33",
    marginLeft: 8,
    alignSelf: "center",
  },
  searchRow: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    backgroundColor: "#F5F0E8",
  },
  searchInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#2C3E2D",
    borderWidth: 1,
    borderColor: "#D9D2C2",
  },
  flagRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  flagChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D9D2C2",
  },
  flagChipActive: {
    backgroundColor: "#1B6B35",
    borderColor: "#1B6B35",
  },
  flagChipText: {
    fontSize: 14,
    color: "#2C3E2D",
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#D9D2C2",
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1B3D2B",
    marginBottom: 6,
  },
  cardDescription: {
    fontSize: 14,
    color: "#2C3E2D",
    lineHeight: 20,
    marginBottom: 8,
  },
  cardMeta: {
    fontSize: 12,
    color: "#8A9A8D",
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: "row",
    gap: 8,
  },
  previewButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#1B3D2B",
    alignItems: "center",
  },
  previewButtonText: {
    fontSize: 14,
    color: "#1B3D2B",
    fontWeight: "600",
  },
  useButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: "#1B3D2B",
    alignItems: "center",
  },
  useButtonDisabled: {
    opacity: 0.5,
  },
  useButtonText: {
    fontSize: 14,
    color: "#F5F0E8",
    fontWeight: "700",
  },
  preview: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#EDE6D8",
  },
  previewLoading: {
    fontSize: 14,
    color: "#8A9A8D",
    textAlign: "center",
    paddingVertical: 12,
  },
  previewError: {
    fontSize: 14,
    color: "#A33",
    textAlign: "center",
    paddingVertical: 12,
  },
  previewQuestion: {
    marginBottom: 14,
  },
  previewQuestionText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2C3E2D",
    marginBottom: 6,
  },
  previewOption: {
    fontSize: 13,
    color: "#4A5E4C",
    marginLeft: 12,
    marginBottom: 2,
  },
  previewOptionCorrect: {
    color: "#1B6B35",
    fontWeight: "600",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    color: "#4A5E4C",
    fontSize: 15,
  },
  empty: {
    textAlign: "center",
    color: "#8A9A8D",
    fontSize: 15,
    paddingVertical: 40,
  },
  error: {
    color: "#A33",
    backgroundColor: "#FDE7E7",
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 8,
    fontSize: 14,
  },
});
