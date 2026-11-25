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

// ─── App Check Stage 2: native Play Integrity för Android ────────────
// JS SDK:n vi använder för Firestore/Auth/Storage skickar en App Check-
// token som header på varje request. Native-attestationen (Play Integrity)
// hämtas via @react-native-firebase/app-check och bryggas in via en
// CustomProvider — JS SDK ber om token, vi ber native, native ber Play
// Integrity, returvärdet skickas tillbaka.
//
// Web: ingen App Check här (tipspromenaden-web kör eget reCAPTCHA
// Enterprise i src/lib/firebase.ts). iOS: skippas tills DeviceCheck-
// providern är konfigurerad i Stage 3.
//
// Reaktiverad 2026-05-13 för 1.8.0 efter att build 17-kraschen
// reattribuerats till välkomst-animationen (SVG-text på Android), inte
// App Check. Misslyckad init är icke-fatal — appen funkar oförändrat,
// bara att requests saknar App Check-tokens (= rejectas först när
// Firebase Console flippas till Enforce). Logga warning, gå vidare.
//
// OBS (upptäckt 2026-11-25): fram till dess skickade appen ALDRIG någon
// token. Native-modulen har ingen provider förrän man konfigurerar en
// ("ReactNativeFirebaseAppCheckProvider not configured"), så `getToken`
// kastade varje gång och felet svaldes. Play Integrity konfigureras nu i
// `ensureNativeAppCheck()` — men bara på begäran, av den som faktiskt
// behöver en token (AI-frågorna, som är enda App Check-tvingade anropet).
// Alla andra kör precis som förut, utan token. Flytta anropet till
// uppstarten först när det är belagt på enhet att Play Integrity
// fungerar; det krävs innan Firestore/Storage kan sättas till Enforce.
let nativeAppCheckReady = false;
let nativeAppCheckPromise: Promise<boolean> | null = null;
let lastAppCheckErrorText: string | null = null;

/** Senaste felet från native App Check, för felsökning i UI:t. */
export function lastAppCheckError(): string | null {
  return lastAppCheckErrorText;
}

/**
 * Konfigurerar Play Integrity i native-modulen (en gång). `false` på allt
 * som inte är Android och om konfigureringen misslyckas — då försöker
 * nästa anrop igen.
 */
export function ensureNativeAppCheck(): Promise<boolean> {
  if (Platform.OS !== "android") return Promise.resolve(false);
  if (!nativeAppCheckPromise) {
    nativeAppCheckPromise = (async () => {
      try {
        const rnfb = await import("@react-native-firebase/app-check");
        const appCheck = rnfb.default();
        const rnProvider = appCheck.newReactNativeFirebaseAppCheckProvider();
        rnProvider.configure({ android: { provider: "playIntegrity" } });
        await appCheck.initializeAppCheck({
          provider: rnProvider,
          isTokenAutoRefreshEnabled: true,
        });
        nativeAppCheckReady = true;
        return true;
      } catch (e) {
        lastAppCheckErrorText = `configure: ${(e as Error)?.message ?? String(e)}`;
        console.warn("[firebase] native App Check configure failed:", e);
        nativeAppCheckPromise = null;
        return false;
      }
    })();
  }
  return nativeAppCheckPromise;
}

if (Platform.OS === "android") {
  try {
    const provider = new CustomProvider({
      getToken: async (): Promise<AppCheckToken> => {
        if (!nativeAppCheckReady) {
          throw new Error("native App Check not configured");
        }
        try {
          const rnfb = await import("@react-native-firebase/app-check");
          const result = await rnfb.default().getToken(true);
          lastAppCheckErrorText = null;
          // Native-modulen returnerar bara `{ token: string }` — ingen
          // expiration. Default Firebase TTL för Play Integrity-tokens
          // är ~1 h, så vi sätter 50 min för att refresh:as i god tid.
          return {
            token: result.token,
            expireTimeMillis: Date.now() + 50 * 60 * 1000,
          };
        } catch (e) {
          lastAppCheckErrorText = `getToken: ${(e as Error)?.message ?? String(e)}`;
          throw e;
        }
      },
    });
    initializeAppCheck(app, {
      provider,
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    console.warn("[firebase] App Check init failed (non-fatal):", e);
  }
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
