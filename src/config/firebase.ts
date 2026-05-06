/**
 * @file firebase.ts
 * @description Initialisering och konfiguration av Firebase för Tipspromenaden-appen.
 *
 * Den här filen skapar en Firebase-appinstans och exporterar de tjänster som
 * används i resten av applikationen: Firestore (databas) och Authentication (auth).
 *
 * Konfigurationsvärdena är specifika för Firebase-projektet "tipspromenaden-491207".
 * Byt ut dessa värden om du vill koppla appen till ett eget Firebase-projekt –
 * se installationsguiden i README.md.
 */

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
import {
  initializeAppCheck,
  CustomProvider,
  type AppCheckToken,
} from "firebase/app-check";
import { getFirestore } from "firebase/firestore";
// @ts-ignore — getReactNativePersistence finns i firebase/auth runtime men
// saknas i typdeklarationerna i firebase v12. Känd öppen issue.
import { getAuth, initializeAuth, getReactNativePersistence, Auth } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: "AIzaSyAbXpylv6YBCeoEo_dpbcZDwMJjweJM7e4",
  authDomain: "tipspromenaden-491207.firebaseapp.com",
  projectId: "tipspromenaden-491207",
  storageBucket: "tipspromenaden-491207.firebasestorage.app",
  messagingSenderId: "851934058818",
  appId: "1:851934058818:web:80445e3367abf097f610db",
};

const app = initializeApp(firebaseConfig);

// ─── App Check Stage 2: TILLFÄLLIGT AVSTÄNGD ────────────────────────
// Build 17 startade upp men kraschade på testpilot-enheter. App Check
// init är mest troliga boven (enda nya native-modulen). Disablad här
// som emergency OTA på runtime 1.5.0 så appen kommer igång; permanent
// fix kräver att vi reproducerar och felsöker native-laddningen.
//
// För att återinföra: ta bort early-return:en nedan + den tomma re-
// importen, och kolla diff:en i git mot commit 5880a89 för att se
// CustomProvider-koden.
const APP_CHECK_DISABLED = true;
if (!APP_CHECK_DISABLED && Platform.OS === "android") {
  // Tidigare App Check-init här. Kommenterat ut tills vi vet
  // varför Play Integrity-providern kraschar appen vid uppstart.
  void initializeAppCheck;
  void CustomProvider;
}

/** Firestore-databasinstansen som används för att läsa och skriva promenader, sessioner och deltagare. */
export const db = getFirestore(app);

/**
 * Firebase Authentication-instansen.
 *
 * VIKTIGT: På React Native defaultar `firebase/auth` till **in-memory**-
 * persistens om man bara kör `getAuth(app)`. Resultat: användaren loggas
 * ut vid varje kall-start eftersom token inte överlever app-restart.
 * Lösningen är att explicit koppla AsyncStorage via `initializeAuth +
 * getReactNativePersistence`. På web används default browser-persistens
 * via `getAuth`.
 */
export const auth: Auth =
  Platform.OS === "web"
    ? getAuth(app)
    : initializeAuth(app, {
        persistence: getReactNativePersistence(AsyncStorage),
      });

/** Firebase Storage-instansen som används för att ladda upp/hämta bilder till frågor. */
export const storage = getStorage(app);

export default app;
