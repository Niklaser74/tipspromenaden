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
  Keyboard,
  Platform,
  ActivityIndicator,
  Image,
  useWindowDimensions,
  Animated,
  PanResponder,
} from "react-native";
import MapView, { Marker, Polyline } from "../components/MapViewWeb";
import MapTypeToggle from "../components/MapTypeToggle";
import MapAttribution from "../components/MapAttribution";
import { useMapType } from "../hooks/useMapType";
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
import { walkCentroid } from "../utils/walkGeo";
import { generateId, createQRData } from "../utils/qr";
import { WALK_CATEGORIES, type WalkCategory } from "../constants/categories";
import { saveWalk } from "../services/firestore";
import { saveWalkLocally, getSavedWalks, displayWalkTitle } from "../services/storage";
import type { SavedWalk } from "../types";
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
import {
  saveDraft,
  loadDraft,
  clearDraft,
  type WalkDraft,
} from "../services/walkDraft";
import { useTranslation } from "../i18n";

/**
 * Lyssnar på tangentbordets visning och returnerar dess pixel-höjd
 * (0 när dolt). Används för att skjuta upp innehåll i modaler där
 * KeyboardAvoidingView + animationType="slide" + statusBarTranslucent
 * bryter ihop på Android (flimmer/överlapp). Vi sätter höjden som
 * bottenpadding på ScrollView istället — uppdateras endast när
 * tangentbordet visas/döljs så ingen render-loop uppstår.
 */
function useKeyboardHeight(): number {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    // På iOS ger willShow exakt timing med animationen; på Android finns
    // inte willShow, så vi faller tillbaka på didShow.
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setHeight(e.endCoordinates?.height ?? 0);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setHeight(0));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  return height;
}

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
  // När tangentbordet öppnas: lägg dess höjd som extra bottenpadding så
  // att fokuserade fält i botten av modalen kan scrollas upp ovanför det.
  // Plus 16 px luft så att fältet inte klistras direkt mot tgb-kanten.
  const kbHeight = useKeyboardHeight();

  // Swipe-down-to-dismiss på handle + header. translateY följer fingret
  // medan man drar nedåt; vid release över tröskel (eller snabb flick)
  // animeras modalen ut och onCancel triggas. PanResponder anropar bara
  // onMove när rörelsen är klart vertikal nedåt — tap på fält fungerar
  // som vanligt, och horizontal swipe ignoreras helt.
  const translateY = useRef(new Animated.Value(0)).current;
  const dismissPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        const fastFlick = g.vy > 1.2;
        const farEnough = g.dy > 120;
        if (fastFlick || farEnough) {
          Animated.timing(translateY, {
            toValue: 800,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            translateY.setValue(0); // återställ för nästa öppning
            onCancel();
          });
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 4,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        // T.ex. om systemet kapar gesten (notifikation kommer in) — fjädra
        // tillbaka istället för att lämna modalen halvvägs nere.
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  return (
    <Animated.View style={[styles.modal, { transform: [{ translateY }] }]}>
      {/* Handle-zon — extra padding ger ett ~28 px touchområde att dra
          fingret nedåt på även om själva handle-strecket bara är 4 px tjockt. */}
      <View
        style={styles.modalHandleZone}
        {...dismissPanResponder.panHandlers}
      >
        <View style={styles.modalHandle} />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.modalScrollContent,
          kbHeight > 0 && { paddingBottom: kbHeight + 16 },
        ]}
      >
        <View
          style={styles.modalHeader}
          {...dismissPanResponder.panHandlers}
        >
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
    </Animated.View>
  );
}

/**
 * Skapar eller redigerar en tipspromenad.
 *
 * @param route.params.walk - Befintlig promenad att redigera (valfritt).
 *   Om den saknas skapas en ny promenad från scratch.
 */
export default function CreateWalkScreen() {
  const { mapType, cycleMapType } = useMapType();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { user } = useAuth();
  const { t } = useTranslation();
  const mapRef = useRef<any>(null);

  // Redigeringsläge: finns det en befintlig promenad som param?
  const existingWalk: Walk | undefined = route.params?.walk;
  const isEditing = !!existingWalk;

  // Vid deep-link-import: föreslå batteriets namn som titel. Användaren
  // kan ändra direkt — inputen är fokuserbar i sidopanelen.
  const [title, setTitle] = useState(
    existingWalk?.title ?? route.params?.pendingBatteryName ?? ""
  );
  const [questions, setQuestions] = useState<Question[]>(existingWalk?.questions ?? []);
  const [region, setRegion] = useState<Region | null>(null);
  const [saving, setSaving] = useState(false);

  // Eventläge
  const [isEvent, setIsEvent] = useState(!!existingWalk?.event);

  const [isPublic, setIsPublic] = useState(!!existingWalk?.public);
  const [city, setCity] = useState(existingWalk?.city ?? "");
  const [category, setCategory] = useState<WalkCategory | "">(
    existingWalk?.category ?? ""
  );
  // Aktivitetstyp — walk är default, bike är opt-in. Påverkar trigger-
  // tröskel (15 m → 50 m) och kartzoom under själva promenaden.
  const [activityType, setActivityType] = useState<"walk" | "bike">(
    existingWalk?.activityType ?? "walk"
  );
  const [eventStartDate, setEventStartDate] = useState(existingWalk?.event?.startDate ?? "");
  const [eventEndDate, setEventEndDate] = useState(existingWalk?.event?.endDate ?? "");
  // Sammanslaget "Inställningar"-block för att inte ta upp kartytan i
  // onödan. Kollapsat default — användaren expanderar bara om hen vill
  // ändra något utöver titel + frågor + språk. Auto-expanderas vid
  // redigering om någon avancerad inställning redan är aktiv så
  // användaren ser direkt vad som är på.
  const [showSettings, setShowSettings] = useState(
    !!existingWalk?.event ||
      !!existingWalk?.public ||
      existingWalk?.activityType === "bike"
  );

  // Språk — ny promenad defaultar till "sv" (eller batteriets språk om
  // vi öppnats via deep link med pendingBatteryLanguage); befintlig
  // promenad utan fältet (skapad före funktionen) behåller "" (inget
  // valt) så att vi inte felaktigt stämplar en okänd promenad som
  // svenska vid nästa save.
  const [language, setLanguage] = useState(
    existingWalk
      ? (existingWalk.language ?? "")
      : (route.params?.pendingBatteryLanguage ?? "sv")
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

  // Splitvy på bredskärm: surfplatte-landscape får map vänster + sidopanel
  // höger istället för att stapla vertikalt. Tröskeln 900 px täcker
  // surfplatte-landscape men inte telefon-landscape (där portrait-låsning
  // ändå kickar in via App.tsx). useWindowDimensions uppdateras vid rotation.
  const { width: screenWidth } = useWindowDimensions();
  const isWide = screenWidth >= 900;
  // I splitvy är panelen alltid synlig och bred nog att visa frågelistan
  // direkt — toggle:n behövs bara i kompakt läge.
  const showList = isWide ? questions.length > 0 : showQuestionList;

  // Frågebatteri-import: lista med ej-placerade batterifrågor + index för nästa.
  // Init-värdet kommer från `route.params.pendingBattery` om det finns,
  // dvs. när användaren öppnat appen via deep link `tipspromenaden://tipspack/<slug>`
  // (OpenTipspackScreen replace:ar hit med batteriet förladdat). I övriga fall
  // tomt och fylls via "Importera frågebatteri"-knappen.
  const pendingBattery: BatteryQuestion[] | undefined =
    route.params?.pendingBattery;
  const pendingBatteryName: string | undefined = route.params?.pendingBatteryName;
  const pendingBatteryLanguage: string | undefined =
    route.params?.pendingBatteryLanguage;

  const [batteryQueue, setBatteryQueue] = useState<BatteryQuestion[]>(
    pendingBattery ?? []
  );
  const [batteryName, setBatteryName] = useState<string>(pendingBatteryName ?? "");

  // Återanvänd positioner från en tidigare promenad: picker-modal + källa.
  // När `reusedFromTitle` är satt har vi laddat in tomma kontroller på en
  // befintlig promenads koordinater — nästa batteri-import fyller dem i ordning.
  const [reusePickerVisible, setReusePickerVisible] = useState(false);
  const [reuseCandidates, setReuseCandidates] = useState<SavedWalk[]>([]);
  const [reusedFromTitle, setReusedFromTitle] = useState<string | null>(null);

  // Autospar (draft) — hydratedRef hindrar att första render fyr:ar en
  // save innan vi hunnit ladda ev. lagrad draft. Debounce-timer rensas
  // när komponenten unmountar.
  const hydratedRef = useRef(false);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Uppdatera rubrik i headern beroende på läge
  useEffect(() => {
    navigation.setOptions({
      title: isEditing ? t("create.editTitle") : t("create.createTitle"),
    });
  }, [isEditing, t]);

  // Mount: kolla om en lokal draft existerar för detta walkId. För nya
  // promenader: erbjud restore om något hittades. För redigering: bara
  // restore om draften är NYARE än senaste molnsave (annars är "draft"
  // sannolikt en uråldrig session vi glömt rensa).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const walkId = walkIdRef.current;
      const draft = await loadDraft(walkId);
      const draftStaleVsCloud =
        draft && existingWalk?.updatedAt
          ? draft.savedAt <= existingWalk.updatedAt
          : false;
      const restore = (d: WalkDraft) => {
        setTitle(d.title);
        setQuestions(d.questions);
        setLanguage(d.language ?? "");
        setIsEvent(d.isEvent);
        setEventStartDate(d.eventStartDate);
        setEventEndDate(d.eventEndDate);
      };
      if (!cancelled && draft && !draftStaleVsCloud) {
        Alert.alert(
          t("create.draftFoundTitle"),
          t("create.draftFoundMessage"),
          [
            {
              text: t("create.draftDiscard"),
              style: "destructive",
              onPress: () => {
                clearDraft(walkId).catch(() => {});
                hydratedRef.current = true;
              },
            },
            {
              text: t("create.draftRestore"),
              onPress: () => {
                restore(draft);
                hydratedRef.current = true;
              },
            },
          ],
          { cancelable: false }
        );
      } else {
        if (draft && draftStaleVsCloud) {
          // Draft är äldre än cloud-versionen — rensa tyst, det är skräp.
          clearDraft(walkId).catch(() => {});
        }
        hydratedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
    // walkIdRef.current och existingWalk är stabila för komponentens
    // livstid, så tom dep-lista är korrekt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced autospar — efter 1 s utan ändring sparas draft till
  // AsyncStorage. Sparar inte förrän hydration är klar (annars skriver
  // vi över ett ev. ej-restoradt draft direkt vid mount).
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    draftSaveTimer.current = setTimeout(() => {
      saveDraft({
        id: walkIdRef.current,
        title,
        questions,
        language: language || undefined,
        isEvent,
        eventStartDate,
        eventEndDate,
        savedAt: Date.now(),
      });
    }, 1000);
    return () => {
      if (draftSaveTimer.current) {
        clearTimeout(draftSaveTimer.current);
        draftSaveTimer.current = null;
      }
    };
  }, [title, questions, language, isEvent, eventStartDate, eventEndDate]);

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
      setBatteryName(battery.name);

      // Om vi har pre-laddade tomma kontroller (via "återanvänd positioner")
      // fyller vi dem i ordning innan resten köas. Tomma = text är trim-tom.
      const emptyIndices: number[] = [];
      questions.forEach((q, i) => {
        if (!q.text.trim()) emptyIndices.push(i);
      });
      const toFillCount = Math.min(emptyIndices.length, battery.questions.length);
      let filledCount = 0;
      if (toFillCount > 0) {
        const filled = [...questions];
        for (let i = 0; i < toFillCount; i++) {
          const bq = battery.questions[i];
          const idx = emptyIndices[i];
          filled[idx] = {
            ...filled[idx],
            text: bq.text,
            options: [...bq.options],
            correctOptionIndex: bq.correctOptionIndex,
          };
        }
        setQuestions(filled);
        filledCount = toFillCount;
      }
      setBatteryQueue(battery.questions.slice(filledCount));

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
      // Meddelandet varierar beroende på om batteriet auto-matchades mot
      // pre-laddade positioner (reuse-flöde) eller köades som vanligt.
      const baseMessage =
        filledCount > 0
          ? t("create.batteryMatchedMessage", {
              matched: filledCount,
              remaining: battery.questions.length - filledCount,
              name: battery.name,
            })
          : t("create.batteryImportedMessage", {
              count: battery.questions.length,
              name: battery.name,
            });
      Alert.alert(t("create.batteryImportedTitle"), baseMessage + languageNote);
    } catch (e: any) {
      Alert.alert(t("common.errorTitle"), t("create.importGenericError", { message: e?.message || String(e) }));
    }
  };

  /**
   * Öppnar picker-modal för att återanvända positioner från en lokalt sparad
   * promenad. Varje kontrollpunkts koordinat kopieras in som en tom fråga,
   * så att skaparen sedan kan importera ett nytt frågebatteri (som matchas
   * automatiskt i ordning) eller fylla i frågorna manuellt.
   */
  const openReusePicker = async () => {
    try {
      const walks = await getSavedWalks();
      const candidates = walks.filter((sw) => (sw.walk.questions?.length ?? 0) > 0);
      if (candidates.length === 0) {
        Alert.alert(t("create.reuseNoneTitle"), t("create.reuseNoneMessage"));
        return;
      }
      // Sortera på senast sparad först — matchar HomeScreen-intuitionen.
      candidates.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
      setReuseCandidates(candidates);
      setReusePickerVisible(true);
    } catch (e: any) {
      Alert.alert(t("common.errorTitle"), e?.message || String(e));
    }
  };

  /**
   * Laddar in en befintlig promenads positioner som tomma kontroller.
   * Centrerar kartan på första positionen. Nya walkId:n skapas automatiskt
   * via walkIdRef (gäller bara ny promenad, inte redigering).
   */
  const applyReusedPositions = (source: Walk) => {
    // Om det finns batterifrågor i kö parar vi ihop dem med källans
    // koordinater så att skaparen får en komplett promenad direkt.
    // Eventuella överskott (fler positioner än frågor, eller tvärtom)
    // hanteras: extra positioner blir tomma kontroller, extra frågor
    // ligger kvar i kön så de kan placeras manuellt på kartan.
    const sourceCoords = source.questions.map((q) => ({ ...q.coordinate }));
    const hasBattery = batteryQueue.length > 0;
    const matchCount = hasBattery
      ? Math.min(sourceCoords.length, batteryQueue.length)
      : 0;

    const merged: Question[] = [];
    for (let i = 0; i < matchCount; i++) {
      merged.push(
        batteryQuestionToQuestion(batteryQueue[i], sourceCoords[i], i + 1)
      );
    }
    for (let i = matchCount; i < sourceCoords.length; i++) {
      merged.push({
        id: generateId(),
        text: "",
        options: ["", "", ""],
        correctOptionIndex: 0,
        coordinate: sourceCoords[i],
        order: i + 1,
      });
    }

    setQuestions(merged);
    if (hasBattery) {
      setBatteryQueue(batteryQueue.slice(matchCount));
    }
    setReusedFromTitle(source.title);
    setReusePickerVisible(false);

    // Centrera kartan på första positionen så skaparen ser var de landar.
    if (merged.length > 0) {
      const first = merged[0].coordinate;
      setRegion({
        latitude: first.latitude,
        longitude: first.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }

    if (hasBattery) {
      Alert.alert(
        t("create.reuseSuccessTitle"),
        t("create.reuseAndFillSuccessMessage", {
          matched: matchCount,
          remaining: batteryQueue.length - matchCount,
          extra: Math.max(0, sourceCoords.length - matchCount),
          name: source.title,
        })
      );
    } else {
      Alert.alert(
        t("create.reuseSuccessTitle"),
        t("create.reuseSuccessMessage", {
          count: merged.length,
          name: source.title,
        })
      );
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
      // Centroid används av biblioteket för "nära mig"-sortering — beräknas
      // bara när walken faktiskt publiceras, inte slösat på privata sparar.
      const centroid = isPublic
        ? walkCentroid({ questions } as Walk)
        : null;

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
        ...(isPublic
          ? {
              public: true,
              ...(city.trim() ? { city: city.trim() } : {}),
              ...(category ? { category } : {}),
              ...(centroid ? { centroid } : {}),
            }
          : {}),
        // Spara bara aktivitetstyp om != default ("walk"). Håller äldre
        // promenader bakåtkompatibla — saknas fältet räknas det som walk.
        ...(activityType !== "walk" ? { activityType } : {}),
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

      // Walk:en är nu i molnet + lokalt — autospar-draft är inte längre
      // relevant. Tar bort tyst, fel blockerar inte navigationen.
      clearDraft(walk.id).catch(() => {});

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

      {/* Map + sidopanel — column på telefon, row på surfplatta-landscape.
          mapWrap fungerar som ankare för de absolut-positionerade overlay:erna
          så att MapTypeToggle och InfoPill hamnar inom kartans hörn även när
          panelen ligger till höger. */}
      <View style={[styles.mainArea, isWide && styles.mainAreaRow]}>
      <View style={[styles.mapWrap, isWide && styles.mapWrapWide]}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={region}
        onPress={handleMapPress}
        showsUserLocation
        showsMyLocationButton
        mapType={mapType}
      >
        {/* Förhandsvisning av rutten — streckad linje mellan kontrollerna
            i nuvarande ordning. Hjälper skaparen se hur deltagaren rör
            sig genom promenaden. Bara om vi har ≥ 2 frågor. */}
        {questions.length >= 2 && (
          <Polyline
            coordinates={questions.map((q) => q.coordinate)}
            strokeColor="rgba(27,107,53,0.6)"
            strokeWidth={3}
            lineDashPattern={[8, 6]}
          />
        )}
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

      {/* Karttyp-toggle */}
      <MapTypeToggle
        mapType={mapType}
        onPress={cycleMapType}
        style={styles.mapTypeToggle}
      />
      <MapAttribution mapType={mapType} />

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
      </View>{/* end mapWrap */}

      {/* Bottom panel (sidopanel i splitvy) — ScrollView så att hela
          innehållet (toggles, fält, save-knappen) går att nå när
          panelen växer (event + publicera + kategorier kan tillsammans
          bli högre än viewport). Den inre questionList-ScrollView:n
          har egen maxHeight (220px) så nestade scroll-fall undviks. */}
      <ScrollView
        style={[styles.bottomPanel, isWide && styles.sidePanel]}
        contentContainerStyle={styles.bottomPanelContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
      >

        {/* Två CTA på fräsch ny promenad (inga frågor, inte redigering):
            Importera frågebatteri + Återanvänd positioner. Reuse-knappens
            subtitle byter beskrivning beroende på om ett batteri redan
            är köat — samma action, två kontexter, en knapp. */}
        {!isEditing && questions.length === 0 && (
          <>
            {batteryQueue.length === 0 && (
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
            <TouchableOpacity
              style={styles.reusePositionsButton}
              onPress={openReusePicker}
              activeOpacity={0.8}
            >
              <Text style={styles.importBatteryIcon}>📍</Text>
              <View style={styles.importBatteryContent}>
                <Text style={styles.reusePositionsTitle}>{t("create.reuseTitle")}</Text>
                <Text style={styles.reusePositionsSubtitle}>
                  {batteryQueue.length > 0
                    ? t("create.reuseWithBatteryDesc")
                    : t("create.reuseDesc")}
                </Text>
              </View>
              <Text style={styles.reusePositionsArrow}>›</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Banner när positioner är återanvända men inga frågor satta än.
            Knappen bredvid gör det lätt att direkt importera ett tipspack
            som fyller de tomma positionerna i ordning. */}
        {reusedFromTitle && questions.some((q) => !q.text.trim()) && (
          <View style={styles.reusedBanner}>
            <Text style={styles.reusedBannerText}>
              {t("create.reusedBanner", { name: reusedFromTitle })}
            </Text>
            <TouchableOpacity
              style={styles.reusedBannerButton}
              onPress={handleImportBattery}
              activeOpacity={0.8}
            >
              <Text style={styles.reusedBannerButtonIcon}>📋</Text>
              <Text style={styles.reusedBannerButtonText}>
                {t("create.importBatteryTitle")}
              </Text>
              <Text style={styles.reusedBannerButtonArrow}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Frågelista-toggle — döljs i splitvy där listan alltid syns */}
        {questions.length > 0 && !isWide && (
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

        {/* Kollapsbar frågelista (alltid synlig i splitvy).
            I splitvy får listan växa fritt så att den fyller panelen
            mellan ev. banner och save-knappen — istället för fixed 220 px. */}
        {showList && questions.length > 0 && (
          <ScrollView
            style={[styles.questionList, isWide && styles.questionListWide]}
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

        {/* Inställningar-block — kollapsbart för att frigöra kartyta.
            Innehåller aktivitetstyp + event + publicera. Visar en sammanfattning
            (badges för aktiva inställningar) i kollapsat läge. */}
        <TouchableOpacity
          style={styles.settingsToggleRow}
          onPress={() => setShowSettings((s) => !s)}
          activeOpacity={0.7}
        >
          <Text style={styles.settingsToggleText}>
            ⚙️ {t("create.settingsBlockLabel")}
          </Text>
          <View style={styles.settingsBadges}>
            {activityType === "bike" && (
              <Text style={styles.settingsBadge}>🚲</Text>
            )}
            {isEvent && <Text style={styles.settingsBadge}>📅</Text>}
            {isPublic && <Text style={styles.settingsBadge}>🌐</Text>}
            <Text style={styles.settingsToggleChevron}>
              {showSettings ? "▾" : "▸"}
            </Text>
          </View>
        </TouchableOpacity>

        {showSettings && (
        <View style={styles.settingsBlock}>
        {/* Aktivitetstyp — walk eller bike. Påverkar trigger-tröskel
            och kartzoom under själva promenaden. Kompakt segmented
            control istället för checkbox eftersom det är ett 1-av-2
            val, inte på/av. */}
        <Text style={styles.sectionLabel}>{t("create.activityTypeLabel")}</Text>
        <View style={styles.activityTypeRow}>
          {(["walk", "bike"] as const).map((type) => {
            const active = activityType === type;
            return (
              <TouchableOpacity
                key={type}
                onPress={() => setActivityType(type)}
                style={[
                  styles.activityTypeChip,
                  active && styles.activityTypeChipActive,
                ]}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.activityTypeChipText,
                    active && styles.activityTypeChipTextActive,
                  ]}
                >
                  {type === "walk" ? "🚶" : "🚲"}{" "}
                  {t(
                    type === "walk"
                      ? "create.activityTypeWalk"
                      : "create.activityTypeBike"
                  )}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        {activityType === "bike" && (
          <Text style={styles.activityTypeHint}>
            {t("create.activityTypeBikeHint")}
          </Text>
        )}

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

        {/* Publicera till bibliotek */}
        <TouchableOpacity
          style={styles.eventToggle}
          onPress={() => setIsPublic(!isPublic)}
          activeOpacity={0.7}
        >
          <View
            style={[styles.checkbox, isPublic && styles.checkboxChecked]}
          >
            {isPublic && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.eventToggleText}>
            {t("create.publishToggle")}
          </Text>
        </TouchableOpacity>

        {isPublic && (
          <View style={styles.publishFields}>
            <Text style={styles.publishWarning}>
              {t("create.publishWarning")}
            </Text>

            <View style={styles.dateRow}>
              <Text style={styles.dateLabel}>{t("create.cityLabel")}</Text>
              <TextInput
                style={styles.cityInput}
                value={city}
                onChangeText={setCity}
                placeholder={t("create.cityPlaceholder")}
                placeholderTextColor="#8A9A8D"
                maxLength={100}
              />
            </View>

            <Text style={styles.sectionLabel}>{t("create.categoryLabel")}</Text>
            <View style={styles.categoryRow}>
              {WALK_CATEGORIES.map((cat) => {
                const active = category === cat;
                return (
                  <TouchableOpacity
                    key={cat}
                    onPress={() => setCategory(active ? "" : cat)}
                    style={[
                      styles.categoryChip,
                      active && styles.categoryChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        active && styles.categoryChipTextActive,
                      ]}
                    >
                      {t(`category.${cat}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
        </View>
        )}{/* end settings block */}

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
      </ScrollView>{/* end bottomPanel/sidePanel */}
      </View>{/* end mainArea */}

      {/* Question editor modal */}
      {/* Frågeredigeringsmodal
          På iOS: KeyboardAvoidingView med padding lyfter modalen ovanför tgb.
          På Android: ingen KeyboardAvoidingView (orsakar flimmer) — ScrollView
          hanterar scrollning när tangentbordet dyker upp istället. */}

      {/* Återanvänd-positioner-picker */}
      <Modal
        visible={reusePickerVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={() => setReusePickerVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.reusePickerModal}>
            <Text style={styles.reusePickerTitle}>{t("create.reusePickerTitle")}</Text>
            <Text style={styles.reusePickerHint}>{t("create.reusePickerHint")}</Text>
            <ScrollView style={styles.reusePickerList}>
              {reuseCandidates.map((sw) => (
                <TouchableOpacity
                  key={sw.walk.id}
                  style={styles.reusePickerItem}
                  onPress={() => applyReusedPositions(sw.walk)}
                  activeOpacity={0.7}
                >
                  <View style={styles.reusePickerItemContent}>
                    <Text style={styles.reusePickerItemTitle} numberOfLines={1}>
                      {displayWalkTitle(sw)}
                    </Text>
                    <Text style={styles.reusePickerItemMeta}>
                      {t("create.reusePickerMeta", {
                        count: sw.walk.questions.length,
                      })}
                    </Text>
                  </View>
                  <Text style={styles.reusePickerItemArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.reusePickerCancel}
              onPress={() => setReusePickerVisible(false)}
              activeOpacity={0.7}
            >
              <Text style={styles.reusePickerCancelText}>{t("common.cancel")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent
        statusBarTranslucent
      >
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

  // Splitvy-wrappers — flex column på smal skärm (default), row på bred
  mainArea: {
    flex: 1,
  },
  mainAreaRow: {
    flexDirection: "row",
  },
  // mapWrap är defaultcontainer för kartan + dess overlays. På smal skärm
  // beter det sig som att kartan vore direkt-barn (overlays positioneras
  // mot screenens topp via absolute). På bred skärm ger det kartan en egen
  // flex:1 så den delar utrymmet med sidopanelen.
  mapWrap: {
    flex: 1,
  },
  mapWrapWide: {
    flex: 1,
  },
  // Sidopanel-stil — overlay:as ovanpå bottomPanel-stilarna i splitvy.
  // Fast bredd så att kartan fortfarande får merparten av skärmen, men
  // tillräckligt bred för att frågelistan ska vara läsbar.
  sidePanel: {
    width: 380,
    flex: undefined,
    maxHeight: undefined,
    flexGrow: 1,
    borderTopWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: "#F0F0EC",
  },

  // Map
  map: {
    flex: 1,
  },
  mapTypeToggle: {
    position: "absolute",
    top: 72,
    right: 16,
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

  // Floating info pill — placerad UNDER mapTypeToggle (som ligger på
  // top:72) så de inte kolliderar i kollapsat läge. På smal skärm är
  // pill:n centrerad horisontellt så den syns även om toggle ligger i
  // höger kant.
  infoPill: {
    position: "absolute",
    top: 124,
    alignSelf: "center",
    maxWidth: "92%",
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

  // Bottom panel — ScrollView. På smal skärm tar den max 60% av höjden
  // så kartan alltid behåller minst 40% och panelens egna innehåll
  // (toggles + save-knapp) blir scrollbart om det inte ryms. flexGrow:0
  // gör att panelen bara växer till sitt innehåll upp till maxHeight.
  // I splitvy (sidePanel) override:as detta — då får panelen full höjd.
  bottomPanel: {
    backgroundColor: "#FFFFFF",
    flexGrow: 0,
    maxHeight: "60%",
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
  // Padding flyttad hit eftersom ScrollView vill ha det på
  // contentContainerStyle, inte på själva komponenten.
  bottomPanelContent: {
    padding: 20,
    paddingBottom: 32,
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
  reusePositionsButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#EAF2E8",
    borderWidth: 1.5,
    borderColor: "#1B6B35",
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 12,
  },
  reusePositionsTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#1B4A22",
    marginBottom: 2,
  },
  reusePositionsSubtitle: {
    fontSize: 12,
    color: "#2D7A3A",
  },
  reusePositionsArrow: {
    fontSize: 24,
    color: "#2D7A3A",
    fontWeight: "300",
  },
  reusedBanner: {
    backgroundColor: "#EAF2E8",
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  reusedBannerText: {
    color: "#1B4A22",
    fontSize: 13,
    fontWeight: "600",
  },
  reusedBannerButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#C8DCC0",
  },
  reusedBannerButtonIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  reusedBannerButtonText: {
    flex: 1,
    color: "#1B4A22",
    fontSize: 14,
    fontWeight: "700",
  },
  reusedBannerButtonArrow: {
    fontSize: 20,
    color: "#2D7A3A",
    fontWeight: "300",
  },
  reusePickerModal: {
    backgroundColor: "#F5F0E8",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: "auto",
    padding: 24,
    paddingBottom: 36,
    maxHeight: "80%",
  },
  reusePickerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2C3E2D",
    marginBottom: 4,
  },
  reusePickerHint: {
    fontSize: 13,
    color: "#5A6B5B",
    marginBottom: 16,
  },
  reusePickerList: {
    maxHeight: 400,
  },
  reusePickerItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    gap: 12,
  },
  reusePickerItemContent: {
    flex: 1,
  },
  reusePickerItemTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: "#2C3E2D",
    marginBottom: 2,
  },
  reusePickerItemMeta: {
    fontSize: 12,
    color: "#5A6B5B",
  },
  reusePickerItemArrow: {
    fontSize: 22,
    color: "#2D7A3A",
  },
  reusePickerCancel: {
    alignItems: "center",
    paddingVertical: 14,
    marginTop: 8,
  },
  reusePickerCancelText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#5A6B5B",
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
  publishFields: {
    marginTop: 4,
    marginBottom: 12,
    gap: 10,
    paddingHorizontal: 4,
  },
  publishWarning: {
    fontSize: 12,
    color: "#8A6F00",
    backgroundColor: "#FFF8DC",
    borderWidth: 1,
    borderColor: "#F0E0A0",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    lineHeight: 16,
  },
  cityInput: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: "#E8E8E4",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    color: "#2C3E2D",
    backgroundColor: "#F5F0E8",
  },
  categoryRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#D9D2C2",
    backgroundColor: "#F5F0E8",
  },
  categoryChipActive: {
    backgroundColor: "#1B6B35",
    borderColor: "#1B6B35",
  },
  categoryChipText: {
    fontSize: 13,
    color: "#4A5E4C",
  },
  categoryChipTextActive: {
    color: "#F5F0E8",
    fontWeight: "600",
  },
  // "⚙️ Inställningar"-expander — kompakt rad i kollapsat läge så att
  // panelen inte tar upp halva skärmen i onödan. Badges visar vilka
  // inställningar som redan är aktiva (🚲, 📅, 🌐) så användaren ser
  // status utan att behöva expandera.
  settingsToggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E0DDD3",
    backgroundColor: "#FAF8F2",
  },
  settingsToggleText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#2C3E2D",
  },
  settingsBadges: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  settingsBadge: {
    fontSize: 14,
  },
  settingsToggleChevron: {
    fontSize: 14,
    color: "#8A9A8D",
    marginLeft: 6,
    fontWeight: "600",
  },
  settingsBlock: {
    paddingTop: 6,
    paddingBottom: 4,
  },
  // Etiketter för fristående sektioner (ovanför chips, picker etc).
  // Använder INTE dateLabel:s fasta width:70 eftersom långa svenska/
  // tyska/finska ord (t.ex. "Aktivitetstyp", "Aktivitätstyp") bryts då.
  sectionLabel: {
    fontSize: 14,
    color: "#4A5E4C",
    fontWeight: "500",
    marginTop: 4,
  },
  activityTypeRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 6,
    marginBottom: 4,
  },
  activityTypeChip: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#D9D2C2",
    backgroundColor: "#F5F0E8",
    alignItems: "center",
  },
  activityTypeChipActive: {
    backgroundColor: "#1B6B35",
    borderColor: "#1B6B35",
  },
  activityTypeChipText: {
    fontSize: 14,
    color: "#4A5E4C",
  },
  activityTypeChipTextActive: {
    color: "#F5F0E8",
    fontWeight: "600",
  },
  activityTypeHint: {
    fontSize: 12,
    color: "#8A9A8D",
    fontStyle: "italic",
    marginTop: 4,
    marginBottom: 8,
    paddingHorizontal: 4,
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
  modalHandleZone: {
    paddingTop: 4,
    paddingBottom: 16,
    alignItems: "center",
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D4D4D0",
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
  questionListWide: {
    flex: 1,
    maxHeight: undefined,
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
