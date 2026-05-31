/**
 * @file ContentContainer.tsx
 * @description Centrerande wrapper som cappar innehållsbredden på
 * surfplattor i landscape så listor/kort/knappar inte sträcks ut över
 * hela skärmen.
 *
 * På telefoner (och allt smalare än `maxWidth`) gör den ingenting märkbart
 * — `alignSelf: "stretch"` + `width: "100%"` ger normal full bredd.
 * När skärmen är bredare än `maxWidth` cappas barnen och centreras med
 * `alignSelf: "center"`.
 *
 * Två presets:
 *   - default: 720 px — passar formulär, knappar, smal text, action-cards
 *   - wide:    880 px — passar listor med tags/badges/flera ikoner i rad
 *
 * Använd som direkt barn till en `ScrollView`/`FlatList`-contentContainer
 * (via `contentContainerStyle`) eller wrap:a innehållet i en vanlig
 * `View`/`SafeAreaView` med flex: 1.
 */
import React from "react";
import { View, StyleSheet, StyleProp, ViewStyle } from "react-native";

type Props = {
  children: React.ReactNode;
  wide?: boolean;
  /** Override maxWidth om de två presets inte passar. */
  maxWidth?: number;
  style?: StyleProp<ViewStyle>;
};

export const CONTENT_MAX_WIDTH = 720;
export const CONTENT_MAX_WIDTH_WIDE = 880;

export default function ContentContainer({
  children,
  wide,
  maxWidth,
  style,
}: Props) {
  const cap =
    maxWidth ?? (wide ? CONTENT_MAX_WIDTH_WIDE : CONTENT_MAX_WIDTH);
  return (
    <View style={[styles.outer, { maxWidth: cap }, style]}>{children}</View>
  );
}

const styles = StyleSheet.create({
  outer: {
    width: "100%",
    alignSelf: "center",
  },
});
