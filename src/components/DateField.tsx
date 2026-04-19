/**
 * @file DateField.tsx
 * @description Klickbar yta som öppnar plattformens native datumväljare.
 *
 * Ersätter manuell text-inmatning av `YYYY-MM-DD`-strängar — använder
 * `@react-native-community/datetimepicker` för att slippa felmatningar
 * och ge användaren en kalendervy. Värdet hålls som ISO-sträng utåt så
 * att kallarna (Firestore, jämförelser) inte påverkas.
 */

import React, { useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import DateTimePicker, {
  DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { parseIsoDate, toIsoDate } from "../utils/date";

export interface DateFieldProps {
  /** Aktuellt värde på `YYYY-MM-DD`-form, eller tom sträng. */
  value: string;
  /** Anropas med nytt ISO-datum när användaren bekräftar valet. */
  onChange: (iso: string) => void;
  /** Visas när inget datum är valt. */
  placeholder?: string;
  /** Tidigaste tillåtna datum (inklusivt). */
  minimumDate?: Date;
  /** Senaste tillåtna datum (inklusivt). */
  maximumDate?: Date;
}

export function DateField({
  value,
  onChange,
  placeholder = "Välj datum",
  minimumDate,
  maximumDate,
}: DateFieldProps) {
  const [show, setShow] = useState(false);
  const current = parseIsoDate(value) ?? new Date();

  const handleChange = (event: DateTimePickerEvent, selected?: Date) => {
    // Android stänger pickern automatiskt efter val (event.type === "set")
    // eller avbryt ("dismissed"). På iOS lever pickern tills vi själva
    // stänger — vi gör det vid varje val för enkelhet (inline läget kunde
    // visas i en modal istället, men ett klick = ett val räcker här).
    if (Platform.OS !== "ios") setShow(false);
    if (event.type === "set" && selected) {
      onChange(toIsoDate(selected));
      if (Platform.OS === "ios") setShow(false);
    } else if (event.type === "dismissed" && Platform.OS === "ios") {
      setShow(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.button}
        onPress={() => setShow(true)}
        activeOpacity={0.7}
      >
        <Text style={value ? styles.value : styles.placeholder}>
          {value || placeholder}
        </Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={current}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={handleChange}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
  },
  button: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#D4C9B8",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  value: {
    fontSize: 16,
    color: "#1B6B35",
    fontWeight: "500",
  },
  placeholder: {
    fontSize: 16,
    color: "#B0BAB2",
  },
});
