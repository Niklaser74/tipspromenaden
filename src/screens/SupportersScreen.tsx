/**
 * @file SupportersScreen.tsx
 * @description Tacksidan — listar personer som stöttat projektet (t.ex. via
 * Swish) med ett litet tack. Nås från Inställningar → Om appen.
 *
 * Namnen läses från Firestore-doc:et `config/supporters` som admin fyller i
 * via webbens /admin-sida (eller `scripts/set-supporters.mjs`). Saknas
 * doc:et visas ett tomt-läge med uppmaning att bli först — sidan är alltså
 * ofarlig att skeppa innan listan är ifylld.
 */
import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { useTranslation, useLanguageChoice } from "../i18n";
import {
  getSupporters,
  pickSupportersMessage,
  type SupportersConfig,
} from "../services/supporters";
import ContentContainer from "../components/ContentContainer";

const SUPPORT_URL = "https://tipspromenaden.app/stod";

export default function SupportersScreen() {
  const { t } = useTranslation();
  const choice = useLanguageChoice();

  const [config, setConfig] = useState<SupportersConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    getSupporters()
      .then((c) => setConfig(c))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Admin kan skriva en egen intro i doc:et (sv/en) — annars default-texten.
  const intro =
    pickSupportersMessage(config?.message, choice) ?? t("supporters.intro");

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      <ContentContainer>
        <View style={styles.hero}>
          <Text style={styles.heroEmoji}>💛</Text>
          <Text style={styles.heroTitle}>{t("supporters.title")}</Text>
          <Text style={styles.heroIntro}>{intro}</Text>
        </View>

        {loading ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator color="#1B6B35" />
          </View>
        ) : error ? (
          <View style={styles.stateWrap}>
            <Text style={styles.stateText}>{t("supporters.loadError")}</Text>
            <TouchableOpacity
              style={styles.retryBtn}
              onPress={load}
              activeOpacity={0.7}
            >
              <Text style={styles.retryText}>{t("supporters.retry")}</Text>
            </TouchableOpacity>
          </View>
        ) : config && config.names.length > 0 ? (
          <View style={styles.card}>
            {config.names.map((name, idx) => (
              <View
                key={`${name}-${idx}`}
                style={[
                  styles.nameRow,
                  idx < config.names.length - 1 && styles.nameRowBorder,
                ]}
              >
                <Text style={styles.nameBullet}>✦</Text>
                <Text style={styles.nameText}>{name}</Text>
              </View>
            ))}
          </View>
        ) : (
          <View style={styles.stateWrap}>
            <Text style={styles.stateText}>{t("supporters.empty")}</Text>
          </View>
        )}

        <View style={styles.ctaWrap}>
          <Text style={styles.ctaHint}>{t("supporters.ctaHint")}</Text>
          <TouchableOpacity
            style={styles.ctaBtn}
            onPress={() => Linking.openURL(SUPPORT_URL)}
            activeOpacity={0.8}
          >
            <Text style={styles.ctaText}>{t("supporters.ctaButton")}</Text>
          </TouchableOpacity>
        </View>
      </ContentContainer>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: "#F5F0E8",
  },
  container: {
    padding: 20,
    paddingBottom: 40,
  },
  hero: {
    alignItems: "center",
    paddingVertical: 24,
    paddingHorizontal: 12,
  },
  heroEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2C3E2D",
    textAlign: "center",
    marginBottom: 10,
  },
  heroIntro: {
    fontSize: 15,
    color: "#5A6B5D",
    textAlign: "center",
    lineHeight: 22,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#F0F0EC",
    overflow: "hidden",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
      },
      android: { elevation: 1 },
      web: { boxShadow: "0px 1px 6px rgba(0,0,0,0.04)" },
    }),
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 10,
  },
  nameRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0EC",
  },
  nameBullet: {
    fontSize: 13,
    color: "#C9A227",
  },
  nameText: {
    fontSize: 16,
    color: "#2C3E2D",
    fontWeight: "500",
    flex: 1,
  },
  stateWrap: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 20,
  },
  stateText: {
    fontSize: 15,
    color: "#8A9A8D",
    textAlign: "center",
    lineHeight: 22,
  },
  retryBtn: {
    marginTop: 14,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#1B6B35",
  },
  retryText: {
    color: "#F5F0E8",
    fontSize: 15,
    fontWeight: "600",
  },
  ctaWrap: {
    alignItems: "center",
    marginTop: 28,
  },
  ctaHint: {
    fontSize: 14,
    color: "#8A9A8D",
    textAlign: "center",
    marginBottom: 10,
  },
  ctaBtn: {
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#1B6B35",
  },
  ctaText: {
    color: "#F5F0E8",
    fontSize: 16,
    fontWeight: "700",
  },
});
