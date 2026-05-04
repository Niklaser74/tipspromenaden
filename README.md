# Tipspromenaden

En mobilapp (och webbapp) for att skapa och delta i GPS-baserade tipspromenader med flervalsfragor. Skaparen placerar ut kontrollpunkter pa en karta, kopplar fragor till varje punkt och delar en QR-kod med deltagarna. Deltagarna skannar koden, vandrar till kontrollpunkterna och besvarar fragorna pa plats. Resultaten visas i realtid i en topplista.

Appen ar byggd med React Native/Expo och fungerar bade som nativapp (iOS/Android via Expo Go eller byggt APK/IPA) och som webbapplikation.

---

## Skarmbilder

> _Skarmbilder laggs till har._

| Startsida | Skapa promenad | Aktiv promenad | Topplista |
|-----------|---------------|----------------|-----------|
| _(bild)_  | _(bild)_      | _(bild)_       | _(bild)_  |

---

## Teknikstack

| Teknologi | Version | Anvandning |
|-----------|---------|------------|
| **React Native** | 0.83.2 | Mobilgranssnitt (iOS/Android) |
| **Expo SDK** | 55 | Byggverktyg, native API:er, OTA-uppdateringar |
| **React** | 19.2.0 | UI-bibliotek |
| **TypeScript** | 5.9 | Typsaker JavaScript |
| **Firebase Firestore** | ^12 | Realtidsdatabas for promenader och sessioner |
| **Firebase Auth** | ^12 | Inloggning (Google OAuth + anonym) |
| **Firebase Storage** | ^12 | Lagring av fragebilder |
| **@react-native-google-signin/google-signin** | — | Native Google-inloggning (Android) |
| **react-native-maps** | 1.27.2 | Kartvisning pa nativa plattformar |
| **Leaflet** (via WebView) | — | Kartvisning pa webben |
| **expo-location** | ~55.1 | GPS-positionering |
| **expo-camera** | ~55.0 | QR-kodsskanning |
| **expo-document-picker** | ~55.0 | Importera fragebatterier (.tipspack) |
| **expo-file-system** | ~55.0 | Lasa/skriva filer (legacy-API i SDK 55) |
| **expo-sharing** | ~55.0 | Dela genererade QR-koder |
| **expo-localization** | ~55.0 | Sprakdetektering for i18n |
| **expo-sensors** | ~55.0 | Pedometer for stegrakning under aktiv promenad |
| **expo-screen-orientation** | ~55.0 | Portrait-las pa telefon, fri rotation pa surfplatta |
| **expo-crypto** | ~15.0 | Kryptografiskt sakra ID:n (generateId) |
| **expo-speech** | ~14.0 | TTS-upplasning av fragetexter |
| **react-native-qrcode-svg** | ^6.3 | QR-kodsgenerering |
| **AsyncStorage** | 2.2 | Lokal lagring (offline-stod) |
| **React Navigation** | ^7 | Navigering mellan skarmar |
| **EAS Build + Update** | — | Byggd distribution (AAB/APK) + OTA-patchar |
| **Google Play Console** | — | Distribution till testare (internt/stangt test) och produktion |

---

## Arkitekturovrsikt

```
tipspromenaden-app/
|
+-- App.tsx                  # Rotkomponent: navigation och AuthProvider
+-- index.ts                 # Entrypoint for Expo
+-- app.config.js            # Dynamisk Expo-config (laser GOOGLE_MAPS_API_KEY fran .env)
+-- eas.json                 # EAS Build-konfiguration (Android AAB/APK, autoIncrement)
+-- firestore.rules          # Firestore-sakerhetsregler (se sakerhetsavsnittet)
+-- storage.rules            # Firebase Storage-regler (fragebilder)
+-- firebase.json            # Firebase CLI-konfig (pekar ut regelfilerna)
+-- package.json
+-- tsconfig.json
+-- CLAUDE.md                # AI-assistentkontext (projektstruktur, konventioner)
|
+-- assets/                  # Ikoner, splash, feature graphic, skarmdumpar
|   +-- icon-source.svg          # Kalla for app-ikonen (T-junction)
|   +-- feature-graphic.svg      # Kalla for Play Store feature graphic (1024x500)
|   +-- render-icons.py          # Genererar alla PNG-varianter fran SVG-kallorna
|
+-- docs/                    # Publicerad dokumentation (GitHub Pages)
|   +-- privacy-policy.md        # Integritetspolicy
|   +-- account-deletion.md      # Kontoradering enligt Play-krav
|   +-- play-store-listing.md    # Butiksinformation
|
+-- src/
    |
    +-- config/
    |   +-- firebase.ts      # Firebase-initialisering och export av db/auth/storage
    |
    +-- context/
    |   +-- AuthContext.tsx  # React Context for inloggningsstatus; triggar walkSync vid login
    |
    +-- types/
    |   +-- index.ts         # Alla TypeScript-typer: Walk, Session, Participant, SavedWalk, etc.
    |
    +-- i18n/
    |   +-- index.ts         # useTranslation(), setLanguage(), useLanguageChoice()
    |
    +-- locales/             # Oversattningar
    |   +-- sv.json              # Primart sprak
    |   +-- en.json
    |
    +-- constants/
    |   +-- languages.ts     # Stodda sprak + flaggor
    |   +-- deepLinks.ts     # Deep-link-prefix och hjalpfunktioner
    |
    +-- services/            # All extern I/O — inga React-beroenden har
    |   +-- auth.ts              # Google-login (native + web), anonym login, onAuthChange
    |   +-- firestore.ts         # Firestore CRUD + realtidsprenumerationer
    |   +-- storage.ts           # AsyncStorage: lokala promenader + offline-ko
    |   +-- walkSync.ts          # Merge-synk av egna walks fran Firestore vid login
    |   +-- walkRefresh.ts       # Refresh av en enskild walk fran molnet
    |   +-- offlineSync.ts       # Bakgrundssynkning av offline-svar till Firebase
    |   +-- questionBattery.ts   # Importera och validera .tipspack-fragebatterier
    |   +-- questionImage.ts     # Ladda upp fragebilder till Firebase Storage
    |   +-- stats.ts             # Lokal anvandarstatistik
    |
    +-- utils/
    |   +-- location.ts      # Haversine-avstand, GPS-tillstand, positionsbevakning
    |   +-- qr.ts            # QR-data kodning/avkodning, ID-generering
    |   +-- date.ts          # Datumparsning/-formatering
    |
    +-- components/
    |   +-- MapViewWeb.tsx   # Leaflet-kartkomponent for webbplatformen
    |   +-- DateField.tsx    # Datum-input for eventlage
    |   +-- ErrorBoundary.tsx
    |
    +-- screens/
        +-- HomeScreen.tsx         # Startsida: mina promenader, QR-skanning
        +-- LoginScreen.tsx        # Google OAuth-inloggning for skapare
        +-- CreateWalkScreen.tsx   # Skapa/redigera promenad med karta och fragor
        +-- ActiveWalkScreen.tsx   # GPS-baserad promenad for deltagare
        +-- JoinWalkScreen.tsx     # Ange namn och anslut till session
        +-- OpenWalkScreen.tsx     # Oppna promenad via deep-link eller QR
        +-- ScanQRScreen.tsx       # Kameraskanning av QR-kod
        +-- ShowQRScreen.tsx       # Visa QR-kod for skaparen att dela
        +-- LeaderboardScreen.tsx  # Realtidstopplista under promenad
        +-- ResultsScreen.tsx      # Slutresultat nar promenad ar klar
        +-- StatsScreen.tsx        # Anvandarens egen statistik
        +-- SettingsScreen.tsx     # Sprakval, molnsynk, version
```

### Dataflode

```
[Skapare]
  --> LoginScreen (Google OAuth)
  --> CreateWalkScreen (rita kontrollpunkter pa karta, lagg till fragor)
  --> [valfritt] pickAndParseBattery() --> .tipspack-fil med fardiga fragor
  --> saveWalk() --> Firestore "walks"
  --> ShowQRScreen (generera QR-kod med walkId)

[Deltagare]
  --> ScanQRScreen (skanna QR-kod)
  --> JoinWalkScreen (ange namn, anonym inloggning)
  --> findActiveSession() / createSession() --> Firestore "sessions"
  --> ActiveWalkScreen (GPS-navigation, besvara fragor)
  --> updateParticipant() --> Firestore "sessions"
  --> ResultsScreen (visa personligt resultat)

[Topplista]
  --> subscribeToSession() --> realtidsuppdateringar fran Firestore
```

---

## Firebase-datastruktur

### Samling: `walks`

Varje dokument representerar en promenad skapad av en inloggad anvandare.

```
walks/{walkId}
  id:          string        -- Unikt ID (base-36 tidsstampel + crypto-bytes)
  title:       string        -- Promenadtiteln
  description: string?       -- Valfri beskrivning
  language:    string?       -- ISO 639-1 (sv, en) - visas som flagg-emoji
  createdBy:   string        -- Firebase UID for skaparen
  createdAt:   number        -- Unix-tidsstampel (ms)
  updatedAt:   number?       -- Unix-tidsstampel (ms) for senaste edit
  event: {                   -- Valfritt eventlage
    startDate: string        -- ISO-datum, t.ex. "2025-06-01"
    endDate:   string
  }?
  questions: [               -- Array av kontrollpunkter
    {
      id:                 string
      text:               string   -- Fragetexten
      options:            string[] -- Svarsalternativ (vanligen 3 st)
      correctOptionIndex: number   -- Index for ratt svar (0-baserat)
      coordinate: {
        latitude:  number
        longitude: number
      }
      order:    number    -- Ordningsnummer (1, 2, 3...)
      imageUrl: string?   -- Valfri bild i Firebase Storage
    }
  ]
```

### Samling: `sessions`

Varje dokument representerar en aktiv omgang av en promenad. Deltagare ligger
i en undersamling `participants/` — inte som inbaddad array — for att komma
runt 1 MB-gransen och for granulara realtidsprenumerationer.

```
sessions/{sessionId}
  id:          string              -- Unikt ID
  walkId:      string              -- Referens till walks/{walkId}
  status:      "waiting" | "active" | "completed"
  createdAt:   number              -- Unix-tidsstampel (ms)

sessions/{sessionId}/participants/{participantId}
  id:          string              -- Maste matcha auth.uid (Firestore-regel)
  name:        string              -- Deltagarens valda namn (regex blockerar HTML-tecken)
  score:       number              -- Antal ratta svar (cap: <= answers.length)
  completedAt: number?             -- Unix-tidsstampel nar klar
  steps:       number?             -- Antal steg fran enhetens hardvaru-stegraknare
  answers: [
    {
      questionId:          string
      selectedOptionIndex: number
      correct:             boolean
      answeredAt:          number
    }
  ]
```

### Privat: `users/{uid}/meta/walkTags`

Anvandarens egna walk-taggar. Sparas privat och syns bara for agaren.

```
users/{uid}/meta/walkTags
  catalog:  Tag[]                   -- Alla skapade taggar (id + namn + farg)
  byWalk:   Record<walkId, tagId[]> -- Vilka taggar varje walk har
  updatedAt: number                 -- Sist andrad (last-write-wins-konflikt)
```

Realtidssubscribe sker via `subscribeToSession()` i `src/services/firestore.ts`,
som lyssnar pa bade sessionsdokumentet och dess `participants`-subkollektion
och sammanfogar resultaten till ett `Session`-objekt med inbaddad
`participants`-array for klienten.

---

## Sakerhetsmodell

Reglerna committas i [`firestore.rules`](./firestore.rules) och
[`storage.rules`](./storage.rules). Principerna:

- **Walks**: skapas endast av Google-inloggade (icke-anonyma). Bara agaren
  kan uppdatera/radera. `hasValidWalkShape` capar titel <= 200,
  questions <= 200, description <= 2000.
- **Sessions**: vem som helst inloggad (inkl. anonyma deltagare) kan skapa
  en session, men `walkId` maste peka pa en faktisk walk
  (`exists()`-check). Statusuppdateringar ar **framatriktade bara**
  (`waiting -> active -> completed`), sa en avslutad session kan inte
  aterupplivas eller rullas tillbaka.
- **Participants**: dokumentets ID maste matcha `auth.uid`. Score <=
  `answers.size()` och `answers.size()` <= 300 — taket hindrar att
  svarslistan inflateras godtyckligt. Namn-regex blockerar HTML-tecken
  (`<>"'`) som skydd mot framtida XSS-yta. **Sessionen far inte vara
  `completed`** — efter avslutat spel ar topplistan fryst.
- **Storage**: endast icke-anonyma anvandare kan ladda upp fragebilder,
  max 2 MB, bara `image/*`-typer. Och `walks/{walkId}.createdBy` maste
  matcha skribentens uid (kollas via `firestore.get` i storage.rules) —
  utan denna check kan vem som helst Google-inloggad skriva over andras
  fragebilder eftersom path:en ar publikt kand fran `imageUrl`-faltet.

Klientside finns komplementara begransningar:

- `CreateWalkScreen` capar input med `maxLength`: titel 200, frageText 500,
  alternativ 200 — matchar Firestore-reglernas installningar.
- `generateId()` anvander `expo-crypto.getRandomBytes(12)` — 96 bitars
  entropi. Byttes fran `Math.random()` for att fa kryptografiskt sakra
  ID:n som inte gar att gissa.
- Maps API-nyckeln ar restriktionsbunden till Android-paketet
  `com.tipspromenaden.app` + SHA-1 i Google Cloud Console.

Kanda begransningar som inte ar blockerare:

- Score beraknas klientside och kan inflateras upp till `min(answers.size(),
  300)`. Full motatgard kraver Cloud Functions (roadmap).
- Deep-link-prefixet `tipspromenaden://` ar custom-scheme; auto-lankas
  inte i Messenger/SMS. `assetlinks.json` pa `tipspromenaden.app` loser
  detta nar domanen ar registrerad.
- App Check ar inte aktiverat an — kraver `@react-native-firebase/app-check`
  som native dep och en ny AAB-build.

---

## Forutsattningar

Innan du kan kora eller bygga appen behover du:

- **Node.js** >= 18 (LTS rekommenderas)
- **npm** >= 9
- **Expo CLI**: `npm install -g expo-cli`
- **EAS CLI** (for att bygga APK/IPA): `npm install -g eas-cli`
- **Git**
- **Firebase-konto** med ett Firestore-projekt
- **Google Cloud-konto** med OAuth 2.0-klientuppgifter
- **Expo Go** (mobil) – for att testa pa fysisk enhet utan att bygga

---

## Installationsguide

### 1. Hamta koden

```bash
git clone <repo-url> tipspromenaden-app
cd tipspromenaden-app
```

Eller ladda ned och packa upp ZIP-arkivet manuellt.

### 2. Installera beroenden

```bash
npm install
```

### 3. Konfigurera Firebase

Skapa ett Firebase-projekt pa [console.firebase.google.com](https://console.firebase.google.com):

1. Skapa nytt projekt (t.ex. "min-tipspromenad")
2. Aktivera **Firestore Database** (vald region nara ditt omrade)
3. Aktivera **Authentication** och aktivera providererna:
   - **Google**
   - **Anonym**
4. Kopiera projektkonfigurationen fran **Projektstallningar > Allman > Din app**

Oppna `src/config/firebase.ts` och ersatt konfigurationen:

```typescript
const firebaseConfig = {
  apiKey: "DIN_API_NYCKEL",
  authDomain: "ditt-projekt.firebaseapp.com",
  projectId: "ditt-projekt-id",
  storageBucket: "ditt-projekt.firebasestorage.app",
  messagingSenderId: "DITT_SENDER_ID",
  appId: "DIN_APP_ID",
};
```

**Firestore-regler** committas i filen [`firestore.rules`](./firestore.rules) och
deployas med `firebase deploy --only firestore:rules`. De ar produktions-
harda; kopiera dem som de ar i ditt eget Firebase-projekt. Se avsnittet
[Sakerhetsmodell](#sakerhetsmodell) for vad reglerna garanterar.

### 4. Konfigurera Google OAuth

1. Ga till [console.cloud.google.com](https://console.cloud.google.com)
2. Aktivera **Google Identity** for ditt projekt
3. Skapa **OAuth 2.0-klientuppgifter** av typen _Webbapplikation_
4. Lagg till godkanda omdirigerings-URI:er:
   - `http://localhost:8081` (lokal utveckling)
   - Din produktions-URL (om du deployar)
5. Kopiera **klient-ID** och oppna `src/screens/LoginScreen.tsx`:

```typescript
const GOOGLE_WEB_CLIENT_ID = "DITT_KLIENT_ID.apps.googleusercontent.com";
```

### 5. Kora appen i webblasaren

```bash
npx expo start --web
```

Oppna `http://localhost:8081` i webblasaren. Google-inloggning och de flesta funktioner fungerar direkt.

> **OBS om GPS pa webben:** Webblasarens Geolocation API kraver HTTPS. Pa localhost fungerar
> GPS i Chrome och Edge, men inte i alla webblasare. Pa en offentlig HTTP-domian fungerar det inte alls.

### 6. Kora pa fysisk enhet (Expo Go)

```bash
npx expo start
```

1. Installera **Expo Go** pa din telefon (App Store / Google Play)
2. Skanna QR-koden som visas i terminalen med kameran (iOS) eller Expo Go-appen (Android)

> **OBS:** Expo Go stoder Expo SDK 52. Denna app anvander SDK 55. Du kan behova anvanda
> en **development build** istallet. Se nasta avsnitt.

### 7. Bygga nativapp (EAS Build)

```bash
# Logga in pa Expo-kontot
eas login

# Konfigurera projektet (forsta gangen)
eas build:configure

# Bygga Android APK (for direktinstallation)
eas build --platform android --profile preview

# Bygga Android AAB (for Google Play)
eas build --platform android --profile production
```

> **Kand begransning pa Windows med OneDrive:**
> EAS CLI kan misslyckas om projektet ligger i en OneDrive-synkad mapp pa grund av
> langa sokvagsnamn och specialtecken. Flytta projektet till t.ex. `C:\projekt\tipspromenaden`
> om du far sokvagsrelaterade fel under bygget.

---

## Miljokonfiguration

Konfiguration lases fran dynamisk `app.config.js` som i sin tur laser fran
`process.env`. For lokal utveckling lagger du en `.env`-fil i projekt-
roten (gitignored):

```
GOOGLE_MAPS_API_KEY=AIza...
```

For EAS-byggen satts samma variabler med `eas secret:create`.

| Fil | Vad konfigureras |
|-----|-----------------|
| `src/config/firebase.ts` | Firebase-projektkoppling (publika webb-nycklar, OK att committa) |
| `app.config.js` | App-ID, versioner, permissions, ikoner, sekretesss-variabler fran `.env` |
| `eas.json` | Byggprofiler for EAS (internal/preview/production + autoIncrement) |
| `.env` | Kansliga nycklar (Maps API-nyckel) — **ej committad** |
| `firestore.rules` | Sakerhetsregler for Firestore |
| `storage.rules` | Sakerhetsregler for Firebase Storage |

---

## Funktionslista

### Skapare (krav: Google-inloggning)

- Skapa tipspromenader med valfritt antal kontrollpunkter
- Placera kontrollpunkter interaktivt pa en karta (react-native-maps / Leaflet)
- Lagg till fragor med 3 svarsalternativ per kontrollpunkt
- Bifoga en bild till valfri fraga (laddas upp till Firebase Storage)
- Ange sprak pa promenaden (sv/en/de/no/da/fi/fr/es) for korrekt UI hos deltagare
- Valj **aktivitetstyp** (gang eller cykel). Cykellage: 50 m trigger
  istallet for 15 m, "narmar dig"-vibration vid 100 m, bredare kartzoom,
  🚲-badge i listor.
- Redigera och ta bort kontrollpunkter; andra ordning pa fragor
- Generera QR-kod for deltagare att skanna
- Importera fardiga fragebatterier (`.tipspack`-fil) och placera fragorna pa kartan en efter en
- Visa realtidstopplista under pagaende promenad
- Eventlage: samla resultat fran flera grupper under ett datumintervall
- Publicera till bibliotek: opt-in publicering med stad + kategori sa
  andra hittar din promenad
- Automatisk molnsynk av egna promenader vid inloggning (terapporterar promenader efter
  ny-installation eller telefonbyte)
- Hantera uppladdade `.tipspack`-filer (publika + hemliga lankar) via
  fliken "Mina paket" i biblioteket

### Deltagare (inget konto kravs)

- Skanna QR-kod med kameran eller via webblasaren
- Ange valfritt visningsnamn
- Navigera med GPS till kontrollpunkterna pa en karta (visas med rutt-
  linje mellan kontrollerna)
- Besvara fragor nar man befinner sig nara en kontrollpunkt
- Se ratt svar i 3,5 sekunder efter varje svar
- Se slutresultat och ranking nar promenaden ar klar
- Offline-stod: svar sparas lokalt om internet saknas och synkas nar anslutning aterstalls

### Allman

- Funkar som webbapp (Chrome/Edge/Firefox) och som nativapp pa Android
- Stod for **8 sprak** via i18n (`src/locales/`): svenska, engelska, tyska,
  norsk, dansk, finska, franska, spanska. Foljer systemets sprak som default.
- Karttyper: standard (Apple/Google Maps), terrang (OpenTopoMap — visar
  stigar bra), satellit (Apple/Google)
- Realtidsuppdateringar i topplistan via Firestore-prenumerationer
- Bakgrundssynkning av offline-svar var 30:e sekund
- OTA-uppdateringar via EAS Update (appVersion-policy, JS-only-patchar utan ombygge)

---

## Anvandningsguide

### For skaparen

1. **Logga in** med Google via inloggningsskarmen
2. Tryck **"Skapa ny promenad"** pa startsidan
3. Ge promenaden ett namn och en beskrivning
4. Tryck pa kartan for att lagga till en kontrollpunkt
5. Fyll i fragetexten och svarsalternativ, markera ratt svar
6. Upprepa for alla kontrollpunkter
   - **Alternativ:** tryck **"Importera frgebatteri"** och valj en `.tipspack`-fil. Sedan racker det att trycka pa kartan en gang per fraga – frgan placeras automatiskt pa den punkten i ordning.
7. Tryck **"Spara"** – promenaden sparas i Firestore
8. Tryck **"Visa QR-kod"** och visa/dela koden med deltagarna
9. Overvaka topplistan under **"Topplista"**-fliken

### For deltagaren

1. **Skanna QR-koden** med Expo Go, kameran eller webblasaren
2. Ange ditt **namn** pa anslutningsskarmen
3. En karta oppnas med alla kontrollpunkternas positioner markerade
4. **Ga till** den forsta (eller narmaste) kontrollpunkten
5. Nar du befinner dig inom **50 meter** av punkten las fragen upp automatiskt
6. Valj ditt **svar** (A, B eller C)
7. Fortsatt till nasta punkt tills alla fragen ar besvarade
8. Se ditt **slutresultat** och var du hamnar pa topplistan

---

## Kanda problem och begransningar

### EAS Build pa Windows med OneDrive

EAS CLI (Expo Application Services) kan misslyckas nar projektet ligger i en mapp som
synkas av OneDrive. Detta beror pa att OneDrive skapar lasar pa filer, anvander Unicode
i mappsokvagsnamn och att Windows har en standardgrans pa 260 tecken for sokvagar.

**Losning:** Flytta projektet till en lokal mapp utan OneDrive-synkning, t.ex.:

```
C:\projekt\tipspromenaden\
```

### Expo Go och SDK-kompatibilitet

Expo Go i App Store/Google Play stoder vanligen bara den senaste stabila
SDK-versionen. Projektet ar pa **SDK 55**. Om Expo Go-appen pa din enhet
ar pa en aldre SDK kravs en **development build** for att testa nativa
funktioner (kamera, GPS, native Google Sign-In) pa en fysisk enhet.

**Losning:** Bygg en development build eller en preview-APK med EAS:

```bash
eas build --profile preview --platform android    # APK for sideload
```

### GPS kraver HTTPS pa webben

Webblasarens Geolocation API vagar neka GPS-atkomst pa sidor som serveras over HTTP
(ej localhost). Detta paverkar produktionsdriftsattning pa HTTP-servrar.

**Losning:** Se till att webbappen serveras over HTTPS, t.ex. via Cloudflare, Vercel eller
GitHub Pages med HTTPS aktiverat.

### Stor promenad och Firestore-dokumentgrans

Firestore-dokument far vara maximalt 1 MB. Walks far max 200 fragor enligt
`firestore.rules`, vilket holler titel + fragor val under gransen.
Deltagare lagras redan i subkollektionen `sessions/{sessionId}/participants/{uid}`
sa sessions-dokumentet paverkas inte av antal deltagare.

---

## Frgebatterier (`.tipspack`-format)

Ett frgebatteri ar en JSON-fil som innehaller en samling fragor utan koordinater.
Skaparen importerar filen i CreateWalkScreen och placerar sedan varje fraga pa
kartan i ordning. Detta gor det mojligt att salja eller dela fardiga frgepaket
(t.ex. "Stockholms gamla stan") som koparen kan anvanda i sin egen promenad.

```json
{
  "format": "tipspack",
  "version": "1.0",
  "name": "Stockholms gamla stan",
  "description": "10 fragor om Gamla stans historia",
  "author": "Tipspromenaden AB",
  "questions": [
    {
      "text": "Vilket ar grundades Stockholm?",
      "options": ["1187", "1252", "1350", "1397"],
      "correctOptionIndex": 1
    }
  ]
}
```

Se `examples/stockholms-gamla-stan.tipspack` for ett fullstandigt exempel och
`src/services/questionBattery.ts` for valideringslogiken.

---

## Distribution

### Google Play Console

Appen distribueras via Google Play Console (paket `com.tipspromenaden.app`,
Play-projekt `tipspromenaden-491207`). Tre sparr ar i bruk:

| Spar | Syfte | Granskning | Family Link |
|------|-------|-----------|-------------|
| **Internt test** | Snabba iterationer for utvecklare | Nej — visas som `(unreviewed)` | Blockerad (ingen aldersgrans) |
| **Stangt test** | Testare som Lilly + familjemedlemmar | Ja (nagra timmar till nagra dagar) | OK efter granskning |
| **Produktion** | Publik release | Ja (ar standard Play-granskning) | OK |

Ladda upp AAB fran senaste EAS-bygget under **Testa och lansera**. `eas.json`
har `autoIncrement: true` pa `internal` och `production` sa `versionCode`
rullas automatiskt. Kolla aktuell versionCode med:

```bash
eas build:version:get -p android
```

### OTA-uppdateringar (EAS Update)

JS-only-andringar kan deployas utan ombygge:

```bash
eas update --branch production --message "Beskrivning"
```

Fingerprint-policyn i `app.config.js` ser till att uppdateringen bara gar ut
till byggen med samma native-lager.

### APK for sideload (utveckling)

```bash
eas build --platform android --profile preview   # Bygger APK
```

Installera direkt fran utvecklar-URL:en som EAS skickar.

---

## Framtida utveckling (Roadmap)

Den fullstandiga produktstrategin – inklusive marknadsplatsen for frgebatterier,
hela promenader (`.tipswalk`), cykelturer och B2B-friskvardsspar – finns i
[ROADMAP.md](./ROADMAP.md).

Kortsiktiga tekniska forbattringar:

- [x] Flytta deltagare till Firestore-undresamling for battre skalbarhet
- [x] Bildstod for kontrollpunkter (bifoga bild fran galleri)
- [x] Stod for flera sprak (i18n — svenska och engelska)
- [x] Flytta kanslighetsdata till Expo-miljuvariabler (`app.config.js` + `.env`)
- [x] Produktionsharda Firestore- och Storage-regler
- [ ] Server-side svarsvalidering via Cloud Functions (eliminerar score-fusk)
- [ ] Byt `Math.random()` mot `expo-crypto` i `generateId()`
- [ ] Deep-link-verifiering via `assetlinks.json` pa domanen
- [ ] Push-aviseringar (Expo Notifications) nar en deltagare avslutar
- [ ] Tidsbegransning per fraga
- [ ] iOS-stod via EAS Build (kravs Apple Developer Program)

---

## Licens

MIT License

Copyright (c) 2025 Niklas Eriksson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
