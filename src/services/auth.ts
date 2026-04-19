/**
 * @file auth.ts
 * @description Autentiseringstjänst för Tipspromenaden-appen.
 *
 * Hanterar inloggning och utloggning via Firebase Authentication.
 * Stödjer två inloggningsmetoder:
 * - **Google OAuth** – för skapare som vill spara promenader till Drive.
 * - **Anonym inloggning** – för deltagare som bara vill gå en promenad.
 *
 * Alla funktioner är tunna omslag runt Firebase Auth SDK och returnerar
 * den egna `AppUser`-typen istället för Firebase-specifika klasser.
 */

import {
  signInWithCredential,
  signInAnonymously,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut as firebaseSignOut,
  deleteUser as firebaseDeleteUser,
  User,
} from "firebase/auth";
import { auth } from "../config/firebase";
import { deleteAllDataForUser } from "./firestore";

/**
 * Applikationens representation av en inloggad användare.
 * Är en förenklad version av Firebase `User`-objektet med bara
 * de fält som appen behöver.
 */
export type AppUser = {
  /** Firebase UID – unikt identifieringsnummer för användaren. */
  uid: string;
  /** Användarens visningsnamn från Google-kontot, eller `null` för anonyma användare. */
  displayName: string | null;
  /** Användarens e-postadress, eller `null` för anonyma användare. */
  email: string | null;
  /** URL till användarens profilbild från Google, eller `null` för anonyma användare. */
  photoURL: string | null;
  /** `true` om användaren är anonym (deltagare), `false` om inloggad med Google (skapare). */
  isAnonymous: boolean;
};

/**
 * Prenumererar på förändringar i autentiseringsstatus.
 * Anropar `callback` direkt med nuvarande användare (eller `null`) och
 * sedan igen varje gång användaren loggar in eller ut.
 *
 * @param callback - Funktion som anropas med den aktuella användaren.
 *                   Tar emot `null` om ingen användare är inloggad.
 * @returns En avprenumerationsfunktion – anropa den för att sluta lyssna.
 *
 * @example
 * const unsubscribe = onAuthChange((user) => {
 *   if (user) {
 *     console.log('Inloggad:', user.displayName);
 *   } else {
 *     console.log('Utloggad');
 *   }
 * });
 * // Senare, rensa lyssnaren:
 * unsubscribe();
 */
export function onAuthChange(callback: (user: AppUser | null) => void) {
  return onAuthStateChanged(auth, (firebaseUser: User | null) => {
    if (firebaseUser) {
      callback({
        uid: firebaseUser.uid,
        displayName: firebaseUser.displayName,
        email: firebaseUser.email,
        photoURL: firebaseUser.photoURL,
        isAnonymous: firebaseUser.isAnonymous,
      });
    } else {
      callback(null);
    }
  });
}

/**
 * Loggar in en deltagare anonymt utan krav på Google-konto.
 * Anonyma användare kan delta i promenader men inte skapa eller spara dem.
 * Firebase skapar ett temporärt konto med ett unikt UID.
 *
 * @returns Den inloggade anonyma användaren.
 * @throws Kastar ett Firebase-fel om inloggningen misslyckas (t.ex. nätverksfel).
 *
 * @example
 * const user = await signInAnonymousUser();
 * console.log('Anonym UID:', user.uid);
 */
export async function signInAnonymousUser(): Promise<AppUser> {
  const result = await signInAnonymously(auth);
  return {
    uid: result.user.uid,
    displayName: null,
    email: null,
    photoURL: null,
    isAnonymous: true,
  };
}

/**
 * Loggar in en skapare med ett Google-konto via ett ID-token.
 * ID-token hämtas från Google OAuth-flödet i `LoginScreen` och
 * används för att autentisera mot Firebase med Google-uppgifter.
 *
 * @param idToken - Google ID-token från OAuth-flödet.
 * @returns Den inloggade Google-användaren med namn, e-post och profilbild.
 * @throws Kastar ett Firebase-fel om token är ogiltig eller utgången.
 *
 * @example
 * // I LoginScreen efter ett lyckat OAuth-flöde:
 * const user = await signInWithGoogle(idToken);
 * console.log('Inloggad som:', user.displayName);
 */
export async function signInWithGoogle(idToken: string): Promise<AppUser> {
  const credential = GoogleAuthProvider.credential(idToken);
  const result = await signInWithCredential(auth, credential);
  return {
    uid: result.user.uid,
    displayName: result.user.displayName,
    email: result.user.email,
    photoURL: result.user.photoURL,
    isAnonymous: false,
  };
}

/**
 * Raderar den inloggade användarens konto och all kopplad data (GDPR).
 *
 * Steg:
 * 1. Raderar alla promenader skapade av användaren, inklusive sessioner och
 *    deltagardokument i subkollektionerna.
 * 2. Raderar deltagarens egen post i sessionen som hen befinner sig i (om
 *    `currentSessionId` skickas in).
 * 3. Raderar Firebase Auth-kontot.
 *
 * Obs: deltagardokument i andra sessioner (t.ex. promenader skapade av andra
 * där användaren deltagit) raderas **inte** automatiskt eftersom vi inte
 * indexerar deltagande på användarnivå. Användaren kan radera dem manuellt
 * från respektive session, eller så kvarstår de pseudonymt med valt namn.
 *
 * Om Firebase kräver "recent login" (felkod `auth/requires-recent-login`)
 * kastas felet vidare så att UI:t kan be användaren logga in igen.
 *
 * @param currentSessionId – Valfritt: ID för en session där användaren just
 *   är aktiv deltagare; det egna deltagardokumentet raderas då också.
 */
export async function deleteAccountAndData(
  currentSessionId?: string
): Promise<void> {
  const u = auth.currentUser;
  if (!u) throw new Error("Ingen användare är inloggad.");
  const uid = u.uid;

  // Steg 1: rensa data ägd av användaren (no-op för anonyma som inte skapat
  // någon promenad, men kostar bara en tom query).
  await deleteAllDataForUser(uid);

  // Steg 2: ta bort den egna deltagarposten i pågående session, om angiven.
  if (currentSessionId) {
    try {
      const { db } = await import("../config/firebase");
      const { doc, deleteDoc } = await import("firebase/firestore");
      await deleteDoc(doc(db, "sessions", currentSessionId, "participants", uid));
    } catch (e) {
      console.log("Kunde inte radera egen deltagarpost:", e);
    }
  }

  // Steg 3: rensa lokal stats — annars läcker historik mellan konton
  // när nästa användare loggar in på samma enhet.
  try {
    const { clearStats } = await import("./stats");
    await clearStats();
  } catch (e) {
    console.log("Kunde inte rensa lokal stats:", e);
  }

  // Steg 4: radera Firebase Auth-kontot.
  await firebaseDeleteUser(u);
}

/**
 * Loggar ut den aktuellt inloggade användaren (Google eller anonym).
 * Efter utloggning anropas `onAuthChange`-lyssnarna med `null`.
 *
 * @returns En Promise som löses när utloggningen är klar.
 * @throws Kastar ett Firebase-fel om utloggningen misslyckas.
 *
 * @example
 * await signOut();
 * console.log('Utloggad');
 */
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth);
}
