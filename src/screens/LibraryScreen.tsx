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

export default function LibraryScreen() {
  const navigation = useNavigation<any>();
  const { t } = useTranslation();

  const [packs, setPacks] = useState<LibraryTipspack[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLanguages, setSelectedLanguages] = useState<Set<string>>(new Set());
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const [previewBySlug, setPreviewBySlug] = useState<
    Record<string, { questions: { text: string; options: string[]; correctOptionIndex: number }[] } | "loading" | "error">
  >({});
  const [usingSlug, setUsingSlug] = useState<string | null>(null);

  // Initial fetch
  useEffect(() => {
    let cancelled = false;
    getLibraryTipspacks()
      .then((list) => {
        if (!cancelled) setPacks(list);
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
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder={t("library.searchPlaceholder")}
          placeholderTextColor="#8A9A8D"
          value={searchTerm}
          onChangeText={setSearchTerm}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>

      {availableLanguages.length > 1 && (
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

      {error && <Text style={styles.error}>{error}</Text>}

      {packs === null && !error && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#1B6B35" />
          <Text style={styles.loadingText}>{t("library.loading")}</Text>
        </View>
      )}

      {packs !== null && filtered.length === 0 && (
        <Text style={styles.empty}>
          {searchTerm || selectedLanguages.size > 0
            ? t("library.noMatch")
            : t("library.empty")}
        </Text>
      )}

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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F0E8",
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
