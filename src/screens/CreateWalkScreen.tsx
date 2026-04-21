import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Image,
} from "react-native";
import MapView, { Marker } from "../components/MapViewWeb";
import { DateField } from "../components/DateField";
import { parseIsoDate } from "../utils/date";
import { LANGUAGES, flagForLanguage } from "../constants/languages";
import { useAuth } from "../context/AuthContext";

// Region-typ definierad lokalt för att undvika web-krasch
interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}
import { useNavigation, useRoute } from "@react-navigation/native";
import { getCurrentLocation } from "../utils/location";
import { generateId, createQRData } from "../utils/qr";
import { saveWalk } from "../services/firestore";
import { saveWalkLocally } from "../services/storage";
import { recordWalkCreation } from "../services/stats";
import {
  pickAndParseBattery,
  batteryQuestionToQuestion,
  BatteryQuestion,
  QuestionBattery,
} from "../services/questionBattery";
import {
  pickAndUploadQuestionImage,
  deleteQuestionImage,
} from "../services/questionImage";
import { Question, Walk } from "../types";
import { useTranslation } from "../i18n";

/** Props för den delade modalinnehålls-komponenten */
interface ModalContentProps {
  editingQuestion: Question | null;
  tempText: string;
  setTempText: (t: string) => void;
  tempOptions: string[];
  setTempOptions: (o: string[]) => void;
  tempCorrect: number;
  setTempCorrect: (i: number) => void;
  tempImageUrl: string | undefined;
  imageUploading: boolean;
  onPickImage: () => void;
  onRemoveImage: () => void;
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
  t: (key: string, opts?: any) => string;
}

/**
 * Inre modalinnehåll, extraherat som komponent för att delas mellan
 * iOS (KeyboardAvoidingView) och Android (plain View + ScrollView).
 * ScrollView med keyboardShouldPersistTaps förhindrar flimmer på Android.
 */
function ModalContent({
  editingQuestion,
  tempText,
  setTempText,
  tempOptions,
  setTempOptions,
  tempCorrect,
  setTempCorrect,
  tempImageUrl,
  imageUploading,
  onPickImage,
  onRemoveImage,
  onSave,
  onDelete,
  onCancel,
  t,
}: ModalContentProps) {
  return (
    <View style={styles.modal}>
      <View style={styles.modalHandle} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.modalScrollContent}
      >
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>
            {t("create.controlLabel", { order: editingQuestion?.order })}
          </Text>
          <Text style={styles.modalBadge}>❓</Text>
        </View>

        <Text style={styles.label}>{t("create.questionLabel")}</Text>
        <TextInput
          style={styles.input}
          placeholder={t("create.questionPlaceholder")}
          placeholderTextColor="#B0BAB2"
          value={tempText}
          onChangeText={setTempText}
          multiline
          blurOnSubmit={false}
          maxLength={500}
        />

        <Text style={styles.label}>{t("create.imageLabel")}</Text>
        {tempImageUrl ? (
          <View style={styles.imagePreviewWrap}>
            <Image
              source={{ uri: tempImageUrl }}
              style={styles.imagePreview}
              resizeMode="cover"
            />
            <TouchableOpacity
              style={styles.imageRemoveBtn}
              onPress={onRemoveImage}
              activeOpacity={0.7}
              disabled={imageUploading}
            >
              <Text style={styles.imageRemoveText}>{t("create.removeImage")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.imagePickBtn}
            onPress={onPickImage}
            activeOpacity={0.7}
            disabled={imageUploading}
          >
            {imageUploading ? (
              <ActivityIndicator size="small" color="#2D7A3A" />
            ) : (
              <Text style={styles.imagePickText}>{t("create.addImage")}</Text>
            )}
          </TouchableOpacity>
        )}

        <Text style={styles.label}>{t("create.optionsLabel")}</Text>
        <Text style={styles.labelHint}>{t("create.optionsHint")}</Text>
        {tempOptions.map((opt, idx) => (
          <View key={idx} style={styles.optionRow}>
            <TouchableOpacity
              style={[
                styles.radioButton,
                tempCorrect === idx && styles.radioSelected,
              ]}
              onPress={() => setTempCorrect(idx)}
            >
              {tempCorrect === idx && <View style={styles.radioInner} />}
            </TouchableOpacity>
            <TextInput
              style={[
                styles.optionInput,
                tempCorrect === idx && styles.optionInputSelected,
              ]}
              placeholder={t("create.optionPlaceholder", { index: idx + 1 })}
              placeholderTextColor="#B0BAB2"
              value={opt}
              returnKeyType="done"
              blurOnSubmit
              maxLength={200}
              onChangeText={(text) => {
                const copy = [...tempOptions];
                copy[idx] = text;
                setTempOptions(copy);
              }}
            />
          </View>
        ))}
        <TouchableOpacity
          onPress={() => setTempOptions([...tempOptions, ""])}
          style={styles.addOptionButton}
        >
          <Text style={styles.addOption}>{t("create.addOption")}</Text>
        </TouchableOpacity>

        <View style={styles.modalButtons}>
          <TouchableOpacity style={styles.deleteBtn} onPress={onDelete}>
            <Text style={styles.deleteBtnText}>{t("common.delete")}</Text>
          </TouchableOpacity>
          <View style={styles.modalButtonsRight}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.saveBtn}
              onPress={onSave}
              activeOpacity={0.8}
            >
              <Text style={styles.saveBtnText}>{t("common.save")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

/**
 * Skapar eller redigerar en tipspromenad.
 *
 * @param route.params.walk - Befintlig promenad att redigera (valfritt).
 *   Om den saknas skapas en ny promenad från scratch.
 */
export default function CreateWalkScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const mapRef = useRef<any>(null);

  // Redigeringsläge: finns det en befintlig promenad som param?
  const existingWalk: Walk | undefined = route.params?.walk;
  const isEditing = !!existingWalk;

  const [title, setTitle] = useState(existingWalk?.title ?? "");
  const [questions, setQuestions] = useState<Question[]>(existingWalk?.questions ?? []);
  const [region, setRegion] = useState<Region | null>(null);
  const [saving, setSaving] = useState(false);

  // Eventläge
  const [isEvent, setIsEvent] = useState(!!existingWalk?.event);
  const [eventStartDate, setEventStartDate] = useState(existingWalk?.event?.startDate ?? "");
  const [eventEndDate, setEventEndDate] = useState(existingWalk?.event?.endDate ?? "");

  // Språk — ny promenad defaultar till "sv"; befintlig promenad utan
  // fältet (skapad före funktionen) behåller "" (inget valt) så att vi
  // inte felaktigt stämplar en okänd promenad som svenska vid nästa save.
  const [language, setLanguage] = useState(
    existingWalk ? (existingWalk.language ?? "") : "sv"
  );

  // Modal för att redigera en fråga
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  // Temporära fält i modalen
  const [tempText, setTempText] = useState("");
  const [tempOptions, setTempOptions] = useState(["", "", ""]);
  const [tempCorrect, setTempCorrect] = useState(0);
  const [tempImageUrl, setTempImageUrl] = useState<string | undefined>(undefined);
  const [imageUploading, setImageUploading] = useState(false);

  // walkId måste vara stabilt under hela redigeringen för att bilduppladdningar
  // ska hamna i rätt Storage-prefix. Genereras vid första mounten om det saknas.
  const walkIdRef = useRef<string>(existingWalk?.id ?? generateId());

  // Frågepanel (visa/dölj lista med alla frågor)
  const [showQuestionList, setShowQuestionList] = useState(false);

  // Frågebatteri-import: lista med ej-placerade batterifrågor + index för nästa
  const [batteryQueue, setBatteryQueue] = useState<BatteryQuestion[]>([]);
  const [batteryName, setBatteryName] = useState<string>("");

  // Uppdatera rubrik i headern beroende på läge
  useEffect(() => {
    navigation.setOptions({
      title: isEditing ? t("create.editTitle") : t("create.createTitle"),
    });
  }, [isEditing, t]);

  useEffect(() => {
    (async () => {
      // Om vi redigerar: centrera kartan på första frågan
      if (existingWalk?.questions?.length) {
        const first = existingWalk.questions[0].coordinate;
        setRegion({
          latitude: first.latitude,
          longitude: first.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
        return;
      }
      try {
        const loc = await getCurrentLocation();
        setRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      } catch (e: any) {
        // Fallback to Stockholm if GPS fails
        setRegion({
          latitude: 59.33,
          longitude: 18.07,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        });
      }
    })();
  }, []);

  // Tryck på kartan -> lägg till ny kontrollpunkt
  // Om vi har batterifrågor i kö placeras nästa batterifråga utan att öppna editor.
  const handleMapPress = (e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;

    // Batteriläge: placera nästa fråga från kön, hoppa över editor
    if (batteryQueue.length > 0) {
      const next = batteryQueue[0];
      const placed = batteryQuestionToQuestion(
        next,
        { latitude, longitude },
        questions.length + 1
      );
      setQuestions([...questions, placed]);
      setBatteryQueue(batteryQueue.slice(1));
      return;
    }

    // Vanligt läge: skapa tom fråga och öppna editor
    const newQuestion: Question = {
      id: generateId(),
      text: "",
      options: ["", "", ""],
      correctOptionIndex: 0,
      coordinate: { latitude, longitude },
      order: questions.length + 1,
    };
    setQuestions([...questions, newQuestion]);
    openEditor(newQuestion);
  };

  /**
   * Öppnar filväljaren och importerar ett frågebatteri (.tipspack-fil).
   * Vid lyckad import sätts batteriets frågor i kön så att skaparen kan
   * placera dem en efter en genom att trycka på kartan. Promenadens titel
   * sätts automatiskt till batteriets namn om titeln är tom.
   */
  const handleImportBattery = async () => {
    try {
      const result = await pickAndParseBattery();
      if (result === null) return; // användaren avbröt

      if (!result.success) {
        Alert.alert(t("create.importError"), result.error);
        return;
      }

      const battery = result.battery;
      setBatteryQueue(battery.questions);
      setBatteryName(battery.name);
      // Auto-fyll titel om tom
      if (!title.trim()) {
        setTitle(battery.name);
      }
      // Sätt språk från batteriet om det finns och inget valts än
      let languageNote = "";
      if (battery.language && !language) {
        setLanguage(battery.language);
        const flag = flagForLanguage(battery.language);
        languageNote = "\n\n" + t("create.batteryLanguageSet", {
          flag: flag || battery.language,
          code: battery.language,
        });
      } else if (!battery.language && !language) {
        languageNote = "\n\n" + t("create.batteryLanguageUnknown");
      }
      Alert.alert(
        t("create.batteryImportedTitle"),
        t("create.batteryImportedMessage", { count: battery.questions.length, name: battery.name }) + languageNote
      );
    } catch (e: any) {
      Alert.alert(t("common.errorTitle"), t("create.importGenericError", { message: e?.message || String(e) }));
    }
  };

  /** Avbryt batteriläge — släng resterande oplacerade frågor. */
  const cancelBatteryMode = () => {
    Alert.alert(
      t("create.cancelBatteryTitle"),
      t("create.cancelBatteryMessage", { count: batteryQueue.length }),
      [
        { text: t("common.no"), style: "cancel" },
        {
          text: t("create.cancelBatteryYes"),
          style: "destructive",
          onPress: () => {
            setBatteryQueue([]);
            setBatteryName("");
          },
        },
      ]
    );
  };

  // Flytta markör (drag & drop)
  const handleMarkerDrag = (questionId: string, e: any) => {
    const { latitude, longitude } = e.nativeEvent.coordinate;
    setQuestions(
      questions.map((q) =>
        q.id === questionId ? { ...q, coordinate: { latitude, longitude } } : q
      )
    );
  };

  // Öppna redigeringsmodal
  const openEditor = (question: Question) => {
    setEditingQuestion(question);
    setTempText(question.text);
    setTempOptions([...question.options]);
    setTempCorrect(question.correctOptionIndex);
    setTempImageUrl(question.imageUrl);
    setModalVisible(true);
  };

  // Välj och ladda upp en bild till den fråga som redigeras.
  const handlePickImage = async () => {
    if (!editingQuestion) return;
    setImageUploading(true);
    try {
      const url = await pickAndUploadQuestionImage(
        walkIdRef.current,
        editingQuestion.id
      );
      if (url) setTempImageUrl(url);
    } catch (e: any) {
      Alert.alert(t("create.imageUploadError"), e?.message ?? String(e));
    } finally {
      setImageUploading(false);
    }
  };

  // Ta bort vald bild (både lokalt i state och ur Storage).
  const handleRemoveImage = async () => {
    if (!editingQuestion) return;
    setTempImageUrl(undefined);
    // Best-effort – vi bryr oss inte om filen redan var borta.
    deleteQuestionImage(walkIdRef.current, editingQuestion.id).catch(() => {});
  };

  // Spara fråga från modal
  const saveQuestion = () => {
    if (!editingQuestion) return;
    if (!tempText.trim()) {
      Alert.alert(t("common.errorTitle"), t("create.errorNoQuestion"));
      return;
    }
    if (tempOptions.some((o) => !o.trim())) {
      Alert.alert(t("common.errorTitle"), t("create.errorNoOptions"));
      return;
    }
    setQuestions(
      questions.map((q) =>
        q.id === editingQuestion.id
          ? {
              ...q,
              text: tempText,
              options: tempOptions,
              correctOptionIndex: tempCorrect,
              imageUrl: tempImageUrl,
            }
          : q
      )
    );
    setModalVisible(false);
    setEditingQuestion(null);
    setTempImageUrl(undefined);
  };

  // Ta bort fråga
  const deleteQuestion = (id: string) => {
    setQuestions(
      questions
        .filter((q) => q.id !== id)
        .map((q, i) => ({ ...q, order: i + 1 }))
    );
    setModalVisible(false);
  };

  /**
   * Flyttar en fråga uppåt eller nedåt i listan och uppdaterar ordernummer.
   * @param id - ID för frågan som ska flyttas
   * @param direction - "up" eller "down"
   */
  const moveQuestion = (id: string, direction: "up" | "down") => {
    const idx = questions.findIndex((q) => q.id === id);
    if (idx === -1) return;
    const newIdx = direction === "up" ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= questions.length) return;

    const reordered = [...questions];
    const temp = reordered[idx];
    reordered[idx] = reordered[newIdx];
    reordered[newIdx] = temp;

    // Uppdatera order-numren så de speglar ny position
    setQuestions(reordered.map((q, i) => ({ ...q, order: i + 1 })));
  };

  // Spara hela promenaden (skapar ny eller uppdaterar befintlig)
  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert(t("common.errorTitle"), t("create.errorNoTitle"));
      return;
    }
    if (questions.length === 0) {
      Alert.alert(t("common.errorTitle"), t("create.errorNoQuestions"));
      return;
    }
    if (questions.some((q) => !q.text.trim())) {
      Alert.alert(t("common.errorTitle"), t("create.errorEmptyQuestion"));
      return;
    }

    setSaving(true);
    try {
      const walk: Walk = {
        // Vid redigering: behåll ursprungligt ID, skapare och datum. Nytt ID
        // tas från walkIdRef (genererat vid mount) så att ev. redan
        // uppladdade frågebilder ligger under rätt walks/{id}/-prefix.
        id: existingWalk?.id ?? walkIdRef.current,
        title: title.trim(),
        questions,
        createdBy: existingWalk?.createdBy ?? user?.uid ?? "unknown",
        createdAt: existingWalk?.createdAt ?? Date.now(),
        // Utelämna language helt om inget valts (t.ex. gamla promenader
        // som öppnats för redigering utan att skaparen angett språk).
        ...(language ? { language } : {}),
        ...(isEvent && eventStartDate && eventEndDate
          ? { event: { startDate: eventStartDate, endDate: eventEndDate } }
          : {}),
      };

      // Spara till Firebase (setDoc upserts automatiskt)
      await saveWalk(walk);

      // Spara lokalt
      await saveWalkLocally({
        walk,
        savedAt: Date.now(),
        qrData: createQRData(walk),
      });

      // Bokför "skapad promenad" första gången walk-id ses. Idempotent
      // i tjänsten, så redigering av en befintlig promenad räknas inte
      // dubbelt. Fel sväljs — stats är inte affärskritiskt.
      if (!existingWalk) {
        recordWalkCreation(walk.id).catch(() => {});
      }

      const qrData = createQRData(walk);
      navigation.navigate("ShowQR", { walk, qrData });
    } catch (e: any) {
      Alert.alert(t("common.errorTitle"), t("create.savingError", { message: e.message }));
    } finally {
      setSaving(false);
    }
  };

  if (!region) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#2D7A3A" />
        <Text style={styles.loadingText}>{t("create.loadingLocation")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Title Input */}
      <View style={styles.titleBar}>
        <TextInput
          style={styles.titleInput}
          placeholder={t("create.titlePlaceholder")}
          placeholderTextColor="#B0BAB2"
          value={title}
          onChangeText={setTitle}
          maxLength={200}
        />
      </View>

      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        onPress={handleMapPress}
        showsUserLocation
        showsMyLocationButton
      >
        {questions.map((q, idx) => (
          <Marker
            key={q.id}
            coordinate={q.coordinate}
            title={t("create.controlLabel", { order: idx + 1 })}
            description={q.text || t("create.markerEditHint")}
            draggable
            onDragEnd={(e: any) => handleMarkerDrag(q.id, e)}
            onCalloutPress={() => openEditor(q)}
            onPress={() => openEditor(q)}
          >
            <View style={styles.markerContainer}>
              <View
                style={[
                  styles.marker,
                  q.text ? styles.markerComplete : styles.markerIncomplete,
                ]}
              >
                <Text style={styles.markerText}>{idx + 1}</Text>
              </View>
              <View style={styles.markerTail} />
            </View>
          </Marker>
        ))}
      </MapView>

      {/* Floating info pill — visar olika text i batteriläge */}
      {batteryQueue.length > 0 ? (
        <TouchableOpacity
          style={[styles.infoPill, styles.infoPillBattery]}
          onPress={cancelBatteryMode}
          activeOpacity={0.85}
        >
          <Text style={styles.infoPillText} numberOfLines={1}>
            {t("create.batteryRemaining", {
              count: batteryQueue.length,
              text: batteryQueue[0].text.slice(0, 40) + (batteryQueue[0].text.length > 40 ? "…" : ""),
            })}
          </Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.infoPill}>
          <Text style={styles.infoPillText}>
            {questions.length === 0
              ? t("create.tapToAddHint")
              : t("create.controlsAdded", { count: questions.length })}
          </Text>
        </View>
      )}

      {/* Bottom panel */}
      <View style={styles.bottomPanel}>

        {/* Importera frågebatteri (visas bara när inga frågor finns och vi inte redigerar) */}
        {!isEditing && questions.length === 0 && batteryQueue.length === 0 && (
          <TouchableOpacity
            style={styles.importBatteryButton}
            onPress={handleImportBattery}
            activeOpacity={0.8}
          >
            <Text style={styles.importBatteryIcon}>📋</Text>
            <View style={styles.importBatteryContent}>
              <Text style={styles.importBatteryTitle}>{t("create.importBatteryTitle")}</Text>
              <Text style={styles.importBatterySubtitle}>{t("create.importBatteryDesc")}</Text>
            </View>
            <Text style={styles.importBatteryArrow}>›</Text>
          </TouchableOpacity>
        )}

        {/* Frågelista-toggle */}
        {questions.length > 0 && (
          <TouchableOpacity
            style={styles.questionListToggle}
            onPress={() => setShowQuestionList(!showQuestionList)}
            activeOpacity={0.7}
          >
            <View style={styles.questionListToggleLeft}>
              <View style={styles.questionCountBadge}>
                <Text style={styles.questionCountText}>{questions.length}</Text>
              </View>
              <Text style={styles.questionListToggleLabel}>
                {showQuestionList ? t("create.hideQuestions") : t("create.showQuestions")}
              </Text>
            </View>
            <Text style={styles.questionListToggleArrow}>
              {showQuestionList ? "▲" : "▼"}
            </Text>
          </TouchableOpacity>
        )}

        {/* Kollapsbar frågelista */}
        {showQuestionList && questions.length > 0 && (
          <ScrollView
            style={styles.questionList}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {questions.map((q, idx) => (
              <View key={q.id} style={styles.questionRow}>
                {/* Ordningsnummer */}
                <View
                  style={[
                    styles.questionRowNum,
                    q.text ? styles.questionRowNumComplete : styles.questionRowNumIncomplete,
                  ]}
                >
                  <Text style={styles.questionRowNumText}>{idx + 1}</Text>
                </View>

                {/* Frågetext */}
                <TouchableOpacity
                  style={styles.questionRowContent}
                  onPress={() => openEditor(q)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.questionRowText} numberOfLines={1}>
                    {q.text || t("create.noQuestionText")}
                  </Text>
                  <Text style={styles.questionRowOptions} numberOfLines={1}>
                    {q.options.filter(Boolean).join(" · ") || t("create.noOptions")}
                  </Text>
                </TouchableOpacity>

                {/* Flytta upp/ned */}
                <View style={styles.questionRowButtons}>
                  <TouchableOpacity
                    style={[styles.moveButton, idx === 0 && styles.moveButtonDisabled]}
                    onPress={() => moveQuestion(q.id, "up")}
                    disabled={idx === 0}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.moveButtonText}>↑</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.moveButton,
                      idx === questions.length - 1 && styles.moveButtonDisabled,
                    ]}
                    onPress={() => moveQuestion(q.id, "down")}
                    disabled={idx === questions.length - 1}
                    activeOpacity={0.6}
                  >
                    <Text style={styles.moveButtonText}>↓</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* Språkväljare */}
        <View style={styles.languageRow}>
          <Text style={styles.languageLabel}>{t("create.language")}</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.languageScroll}
            contentContainerStyle={styles.languageScrollContent}
          >
            {LANGUAGES.map((lang) => (
              <TouchableOpacity
                key={lang.code}
                style={[
                  styles.languagePill,
                  language === lang.code && styles.languagePillSelected,
                ]}
                onPress={() => setLanguage(lang.code)}
                activeOpacity={0.7}
                accessibilityLabel={lang.label}
              >
                <Text style={styles.languageFlag}>{lang.flag}</Text>
                <Text
                  style={[
                    styles.languageCode,
                    language === lang.code && styles.languageCodeSelected,
                  ]}
                >
                  {lang.code}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Event toggle */}
        <TouchableOpacity
          style={styles.eventToggle}
          onPress={() => setIsEvent(!isEvent)}
          activeOpacity={0.7}
        >
          <View
            style={[styles.checkbox, isEvent && styles.checkboxChecked]}
          >
            {isEvent && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.eventToggleText}>{t("create.eventToggle")}</Text>
        </TouchableOpacity>

        {isEvent && (
          <View style={styles.eventDates}>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>{t("create.opens")}</Text>
              <DateField
                value={eventStartDate}
                onChange={(iso) => {
                  setEventStartDate(iso);
                  // Om slutdatum hamnat före nytt startdatum, nollställ
                  // det så att användaren tvingas välja igen.
                  if (eventEndDate && eventEndDate < iso) setEventEndDate("");
                }}
                placeholder={t("create.pickDate")}
              />
            </View>
            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>{t("create.closes")}</Text>
              <DateField
                value={eventEndDate}
                onChange={setEventEndDate}
                placeholder={t("create.pickDate")}
                minimumDate={parseIsoDate(eventStartDate) ?? undefined}
              />
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#F5F0E8" />
          ) : (
            <Text style={styles.saveButtonText}>
              {isEditing ? t("create.saveChanges") : t("create.saveAndCreateQR")}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Question editor modal */}
      {/* Frågeredigeringsmodal
          På iOS: KeyboardAvoidingView med padding lyfter modalen ovanför tgb.
          På Android: ingen KeyboardAvoidingView (orsakar flimmer) — ScrollView
          hanterar scrollning när tangentbordet dyker upp istället. */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
      >
        {Platform.OS === "ios" ? (
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior="padding"
          >
            <ModalContent
              editingQuestion={editingQuestion}
              tempText={tempText}
              setTempText={setTempText}
              tempOptions={tempOptions}
              setTempOptions={setTempOptions}
              tempCorrect={tempCorrect}
              setTempCorrect={setTempCorrect}
              tempImageUrl={tempImageUrl}
              imageUploading={imageUploading}
              onPickImage={handlePickImage}
              onRemoveImage={handleRemoveImage}
              onSave={saveQuestion}
              onDelete={() => editingQuestion && deleteQuestion(editingQuestion.id)}
              onCancel={() => setModalVisible(false)}
              t={t}
            />
          </KeyboardAvoidingView>
        ) : (
          <View style={styles.modalOverlay}>
            <ModalContent
              editingQuestion={editingQuestion}
              tempText={tempText}
              setTempText={setTempText}
              tempOptions={tempOptions}
              setTempOptions={setTempOptions}
              tempCorrect={tempCorrect}
              setTempCorrect={setTempCorrect}
              tempImageUrl={tempImageUrl}
              imageUploading={imageUploading}
              onPickImage={handlePickImage}
              onRemoveImage={handleRemoveImage}
              onSave={saveQuestion}
              onDelete={() => editingQuestion && deleteQuestion(editingQuestion.id)}
              onCancel={() => setModalVisible(false)}
              t={t}
            />
          </View>
        )}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F0E8",
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F0E8",
    gap: 12,
  },
  loadingText: {
    color: "#4A5E4C",
    fontSize: 16,
    fontWeight: "500",
  },

  // Title bar
  titleBar: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F0F0EC",
  },
  titleInput: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 18,
    fontWeight: "600",
    color: "#2C3E2D",
  },

  // Map
  map: {
    flex: 1,
  },
  markerContainer: {
    alignItems: "center",
  },
  marker: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 3,
    borderColor: "#FFFFFF",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 2px 4px rgba(0,0,0,0.2)" },
    }),
  },
  markerComplete: {
    backgroundColor: "#2D7A3A",
  },
  markerIncomplete: {
    backgroundColor: "#E8B830",
  },
  markerText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },
  markerTail: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: "#FFFFFF",
    marginTop: -1,
  },

  // Floating info pill
  infoPill: {
    position: "absolute",
    top: 72,
    alignSelf: "center",
    backgroundColor: "rgba(27,107,53,0.9)",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
      android: { elevation: 4 },
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.15)" },
    }),
  },
  infoPillText: {
    color: "#F5F0E8",
    fontSize: 13,
    fontWeight: "600",
  },
  infoPillBattery: {
    backgroundColor: "rgba(232,184,48,0.95)",
    maxWidth: "85%",
  },

  // Bottom panel
  bottomPanel: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: "#F0F0EC",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
      },
      android: { elevation: 8 },
      web: { boxShadow: "0px -2px 8px rgba(0,0,0,0.06)" },
    }),
  },
  // Importera frågebatteri-knapp
  importBatteryButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF8E7",
    borderWidth: 1.5,
    borderColor: "#E8B830",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 12,
  },
  importBatteryIcon: {
    fontSize: 26,
  },
  importBatteryContent: {
    flex: 1,
  },
  importBatteryTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#7A5A0A",
    marginBottom: 2,
  },
  importBatterySubtitle: {
    fontSize: 12,
    color: "#9A7A1A",
  },
  importBatteryArrow: {
    fontSize: 24,
    color: "#C49A2A",
    fontWeight: "300",
  },
  saveButton: {
    backgroundColor: "#1B6B35",
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: "center",
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    color: "#F5F0E8",
    fontSize: 17,
    fontWeight: "700",
  },

  // Språkväljare
  languageRow: {
    marginBottom: 12,
  },
  languageLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#5A7A5B",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  languageScroll: {
    flexGrow: 0,
  },
  languageScrollContent: {
    gap: 8,
    paddingRight: 4,
  },
  languagePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: "#D4C9B8",
    backgroundColor: "#FFFFFF",
  },
  languagePillSelected: {
    borderColor: "#2D7A3A",
    backgroundColor: "#E8F5E9",
  },
  languageFlag: {
    fontSize: 18,
  },
  languageCode: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7E6C",
  },
  languageCodeSelected: {
    color: "#1B6B35",
  },

  // Event toggle
  eventToggle: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingVertical: 4,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#C4CCC6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: "#2D7A3A",
    borderColor: "#2D7A3A",
  },
  checkmark: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "bold",
  },
  eventToggleText: {
    fontSize: 15,
    color: "#2C3E2D",
    fontWeight: "500",
  },
  eventDates: {
    marginBottom: 12,
    gap: 8,
  },
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  dateLabel: {
    width: 70,
    fontSize: 14,
    color: "#4A5E4C",
    fontWeight: "500",
  },
  dateInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#E8E8E4",
    borderRadius: 10,
    padding: 10,
    fontSize: 14,
    color: "#2C3E2D",
    backgroundColor: "#F5F0E8",
  },

  // Modal
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modal: {
    backgroundColor: "#F5F0E8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 24,
    maxHeight: "85%",
  },
  modalScrollContent: {
    paddingBottom: 32,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D4D4D0",
    alignSelf: "center",
    marginBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#2C3E2D",
  },
  modalBadge: {
    fontSize: 24,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2C3E2D",
    marginBottom: 6,
  },
  labelHint: {
    fontSize: 12,
    color: "#8A9A8D",
    marginBottom: 10,
  },
  input: {
    borderWidth: 1.5,
    borderColor: "#E8E8E4",
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 20,
    minHeight: 70,
    color: "#2C3E2D",
    backgroundColor: "#FFFFFF",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  radioButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: "#C4CCC6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },
  radioSelected: {
    borderColor: "#2D7A3A",
  },
  radioInner: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#2D7A3A",
  },
  optionInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#E8E8E4",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: "#2C3E2D",
    backgroundColor: "#FFFFFF",
  },
  optionInputSelected: {
    borderColor: "#2D7A3A",
    backgroundColor: "#F0F9F3",
  },
  addOptionButton: {
    paddingVertical: 8,
  },
  addOption: {
    color: "#2D7A3A",
    fontWeight: "600",
    fontSize: 14,
  },
  imagePickBtn: {
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#B0BAB2",
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
    backgroundColor: "#FAFAF8",
  },
  imagePickText: {
    color: "#4A5E4C",
    fontSize: 14,
    fontWeight: "600",
  },
  imagePreviewWrap: {
    marginBottom: 8,
  },
  imagePreview: {
    width: "100%",
    height: 180,
    borderRadius: 12,
    backgroundColor: "#F0F0EC",
  },
  imageRemoveBtn: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  imageRemoveText: {
    color: "#B33A3A",
    fontSize: 13,
    fontWeight: "500",
    textDecorationLine: "underline",
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 24,
  },
  modalButtonsRight: {
    flexDirection: "row",
    gap: 10,
  },
  deleteBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  deleteBtnText: {
    color: "#D32F2F",
    fontWeight: "600",
    fontSize: 15,
  },
  cancelBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  cancelBtnText: {
    color: "#8A9A8D",
    fontWeight: "600",
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: "#1B6B35",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  saveBtnText: {
    color: "#F5F0E8",
    fontWeight: "700",
    fontSize: 15,
  },

  // Frågelista
  questionListToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#F0F4F0",
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  questionListToggleLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  questionCountBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#2D7A3A",
    justifyContent: "center",
    alignItems: "center",
  },
  questionCountText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  questionListToggleLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2C3E2D",
  },
  questionListToggleArrow: {
    fontSize: 12,
    color: "#8A9A8D",
  },
  questionList: {
    maxHeight: 220,
    marginBottom: 12,
  },
  questionRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginBottom: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#F0F0EC",
    gap: 10,
  },
  questionRowNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  questionRowNumComplete: {
    backgroundColor: "#2D7A3A",
  },
  questionRowNumIncomplete: {
    backgroundColor: "#E8B830",
  },
  questionRowNumText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700",
  },
  questionRowContent: {
    flex: 1,
  },
  questionRowText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2C3E2D",
    marginBottom: 2,
  },
  questionRowOptions: {
    fontSize: 12,
    color: "#8A9A8D",
  },
  questionRowButtons: {
    flexDirection: "row",
    gap: 4,
  },
  moveButton: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#F0F4F0",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E0E8E0",
  },
  moveButtonDisabled: {
    opacity: 0.3,
  },
  moveButtonText: {
    fontSize: 14,
    color: "#2D7A3A",
    fontWeight: "600",
  },
});
