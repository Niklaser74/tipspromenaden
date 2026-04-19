import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import Constants from "expo-constants";
import {
  availableLanguages,
  setLanguage,
  useLanguageChoice,
  useTranslation,
} from "../i18n";

export default function SettingsScreen() {
  const { t } = useTranslation();
  const choice = useLanguageChoice();

  const version =
    (Constants.expoConfig?.version as string | undefined) ?? "1.0.0";

  return (
    <ScrollView
      style={styles.scrollView}
      contentContainerStyle={styles.container}
      showsVerticalScrollIndicator={false}
    >
      {/* Språkval */}
      <Text style={styles.sectionTitle}>{t("settings.language")}</Text>
      <View style={styles.card}>
        {availableLanguages.map((lang, idx) => {
          const selected = choice === lang.code;
          return (
            <TouchableOpacity
              key={lang.code}
              style={[
                styles.row,
                idx < availableLanguages.length - 1 && styles.rowBorder,
              ]}
              onPress={() => setLanguage(lang.code)}
              activeOpacity={0.6}
            >
              <Text style={styles.rowLabel}>{t(lang.labelKey)}</Text>
              {selected && <Text style={styles.check}>✓</Text>}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Om appen */}
      <Text style={styles.sectionTitle}>{t("settings.about")}</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>
            {t("settings.version", { version })}
          </Text>
        </View>
      </View>
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
  sectionTitle: {
    fontSize: 13,
    fontWeight: "600",
    color: "#8A9A8D",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 10,
    marginLeft: 4,
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0EC",
  },
  rowLabel: {
    fontSize: 16,
    color: "#2C3E2D",
    fontWeight: "500",
  },
  check: {
    fontSize: 18,
    color: "#1B6B35",
    fontWeight: "700",
  },
});
