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

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
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

/** Firestore-databasinstansen som används för att läsa och skriva promenader, sessioner och deltagare. */
export const db = getFirestore(app);

/** Firebase Authentication-instansen som används för inloggning och utloggning. */
export const auth = getAuth(app);

/** Firebase Storage-instansen som används för att ladda upp/hämta bilder till frågor. */
export const storage = getStorage(app);

export default app;
