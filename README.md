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
| **react-native-maps** | 1.27.2 | Kartvisning pa nativa plattformar |
| **Leaflet** (via WebView) | — | Kartvisning pa webben |
| **expo-location** | ~55.1 | GPS-positionering |
| **expo-camera** | ~55.0 | QR-kodsskanning |
| **expo-document-picker** | ~55.0 | Importera frgebatterier (.tipspack) |
| **expo-file-system** | ~55.0 | Lasa/skriva filer (legacy-API i SDK 55) |
| **expo-sharing** | ~55.0 | Dela genererade QR-koder |
| **react-native-qrcode-svg** | ^6.3 | QR-kodsgenerering |
| **AsyncStorage** | 2.2 | Lokal lagring (offline-stod) |
| **React Navigation** | ^7 | Navigering mellan skarmar |
| **Firebase App Distribution** | — | Distribuera APK till testare |

---

## Arkitekturovrsikt

```
tipspromenaden-app/
|
+-- App.tsx                  # Rotkomponent: navigation och AuthProvider
+-- index.ts                 # Entrypoint for Expo
+-- app.json                 # Expo-konfiguration (permissions, app-ID, ikoner)
+-- eas.json                 # EAS Build-konfiguration (Android APK/AAB)
+-- package.json
+-- tsconfig.json
|
+-- assets/                  # Ikoner och splash-skarm (PNG-filer)
|
+-- src/
    |
    +-- config/
    |   +-- firebase.ts      # Firebase-initialisering och export av db/auth
    |
    +-- context/
    |   +-- AuthContext.tsx  # React Context for inloggningsstatus (useAuth-hook)
    |
    +-- types/
    |   +-- index.ts         # Alla TypeScript-typer: Walk, Session, Participant, etc.
    |
    +-- services/            # All extern kommunikation
    |   +-- auth.ts              # Firebase Auth: Google-login, anonym login, utloggning
    |   +-- firestore.ts         # Firestore CRUD + realtidsprenumerationer
    |   +-- questionBattery.ts   # Importera och validera .tipspack-frgebatterier
    |   +-- offlineSync.ts       # Bakgrundssynkning av offline-svar till Firebase
    |   +-- storage.ts           # AsyncStorage: lokala promenader + offline-ko
    |
    +-- utils/
    |   +-- location.ts      # Haversine-avstand, GPS-tillstand, positionsbevakning
    |   +-- qr.ts            # QR-data kodning/avkodning, ID-generering
    |
    +-- components/
    |   +-- MapViewWeb.tsx   # Leaflet-kartkomponent for webbplatformen
    |
    +-- screens/
        +-- HomeScreen.tsx         # Startsida: mina promenader, QR-skanning
        +-- LoginScreen.tsx        # Google OAuth-inloggning for skapare
        +-- CreateWalkScreen.tsx   # Skapa/redigera promenad med karta och fragor
        +-- ActiveWalkScreen.tsx   # GPS-baserad promenad for deltagare
        +-- JoinWalkScreen.tsx     # Ange namn och anslut till session
        +-- ScanQRScreen.tsx       # Kameraskanning av QR-kod
        +-- ShowQRScreen.tsx       # Visa QR-kod for skaparen att dela
        +-- LeaderboardScreen.tsx  # Realtidstopplista under promenad
        +-- ResultsScreen.tsx      # Slutresultat nar promenad ar klar
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
  id:          string        -- Unikt ID (base-36 tidsstampel + slump)
  title:       string        -- Promenadtiteln
  description: string?       -- Valfri beskrivning
  createdBy:   string        -- Firebase UID for skaparen
  createdAt:   number        -- Unix-tidsstampel (ms)
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
      order: number  -- Ordningsnummer (1, 2, 3...)
    }
  ]
```

### Samling: `sessions`

Varje dokument representerar en aktiv omgang av en promenad.

```
sessions/{sessionId}
  id:          string              -- Unikt ID
  walkId:      string              -- Referens till walks/{walkId}
  status:      "waiting" | "active" | "completed"
  createdAt:   number              -- Unix-tidsstampel (ms)
  participants: [                  -- Inbaddad array (uppdateras live)
    {
      id:          string          -- Firebase UID (anonym eller Google)
      name:        string          -- Deltagarens valda namn
      score:       number          -- Antal ratta svar
      completedAt: number?         -- Unix-tidsstampel nar klar
      answers: [
        {
          questionId:          string
          selectedOptionIndex: number
          correct:             boolean
          answeredAt:          number
        }
      ]
    }
  ]
```

> **Obs:** Firestore-dokumentstorleksgranser ar 1 MB. For promenader med manga deltagare
> kan det vara aktuellt att flytta `participants` till en undresamling i framtiden.

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

**Firestore-regler** (for utveckling – stram at for produktion):

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /walks/{walkId} {
      allow read: if true;
      allow write: if request.auth != null && !request.auth.token.firebase.sign_in_provider.matches('anonymous');
    }
    match /sessions/{sessionId} {
      allow read, write: if request.auth != null;
    }
  }
}
```

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

Appen anvander inga `.env`-filer for narvarande. Konfiguration sker direkt i:

| Fil | Vad konfigureras |
|-----|-----------------|
| `src/config/firebase.ts` | Firebase-projektkoppling |
| `src/screens/LoginScreen.tsx` | Google OAuth klient-ID |
| `app.json` | App-ID, versioner, permissions, ikoner |
| `eas.json` | Byggprofiler for EAS |

For en produktionssattning rekommenderas att flytta kanslighetsdata till Expo-miljuvariabler
med `expo-constants` och `app.config.js` istallet for `app.json`.

---

## Funktionslista

### Skapare (krav: Google-inloggning)

- Skapa tipspromenader med valfritt antal kontrollpunkter
- Placera kontrollpunkter interaktivt pa en interaktiv karta (react-native-maps / Leaflet)
- Lagg till fragor med 3 svarsalternativ per kontrollpunkt
- Redigera och ta bort kontrollpunkter
- Generera QR-kod for deltagare att skanna
- Importera fardiga frgebatterier (`.tipspack`-fil) och placera fragorna pa kartan en efter en
- Visa realtidstopplista under pagaende promenad
- Eventlage: samla resultat fran flera grupper under ett datumintervall

### Deltagare (inget konto kravs)

- Skanna QR-kod med kameran eller via webblasaren
- Ange valfritt visningsnamn
- Navigera med GPS till kontrollpunkterna pa en karta
- Besvara fragor nar man befinner sig nara en kontrollpunkt
- Se resultat direkt efter varje svar
- Se slutresultat och ranking nar promenaden ar klar
- Offline-stod: svar sparas lokalt om internet saknas och synkas nar anslutning aterstalls

### Allman

- Funkar som webbapp (Chrome/Edge/Firefox)
- Funkar som nativapp pa Android (via Expo Go eller byggt APK)
- Realtidsuppdateringar i topplistan via Firestore-prenumerationer
- Bakgrundssynkning av offline-svar var 30:e sekund

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

### Expo Go och SDK 55-kompatibilitet

Expo Go i App Store/Google Play stoder vanligen bara den senaste stabila SDK-versionen
(SDK 52 vid projektets skapande). SDK 55 kravde en **development build** for att testa
nativa funktioner (kamera, GPS) pa en fysisk enhet.

**Losning:** Bygg en development build med EAS:

```bash
eas build --profile development --platform android
```

### GPS kraver HTTPS pa webben

Webblasarens Geolocation API vagar neka GPS-atkomst pa sidor som serveras over HTTP
(ej localhost). Detta paverkar produktionsdriftsattning pa HTTP-servrar.

**Losning:** Se till att webbappen serveras over HTTPS, t.ex. via Cloudflare, Vercel eller
GitHub Pages med HTTPS aktiverat.

### Stor promenad och Firestore-dokumentgrans

Firestore-dokument far vara maximalt 1 MB. Om en session far valdigt manga deltagare
(hundratals) kan dokumentstorleken narma sig gransen.

**Losning (framtida):** Flytta `participants`-arrayen till en undresamling
`sessions/{sessionId}/participants/{participantId}`.

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

## Distribution till testare (Firebase App Distribution)

APK-byggen distribueras till testgruppen `testers` via Firebase App Distribution.

**Engangskonfiguration:**

```bash
npm install -g firebase-tools
firebase login
```

I Firebase Console (`tipspromenaden-491207`) finns gruppen `testers`. Lagg till
testares e-postadresser dar – de far en inbjudan med installationslank.

**Distribuera senaste EAS-bygget:**

```powershell
# Hamtar senaste fardiga APK fran EAS och pushar till testers-gruppen
C:\Users\niklas.eriksson\tipspromenaden-build\distribute.ps1 -Latest -Notes "Beskrivning av byggen"
```

Skriptet anvander `firebase appdistribution:distribute` med Android-app-ID
`1:851934058818:android:6e53f1eea6ac6005f610db`.

---

## Framtida utveckling (Roadmap)

Den fullstandiga produktstrategin – inklusive marknadsplatsen for frgebatterier,
hela promenader (`.tipswalk`), cykelturer och B2B-friskvardsspar – finns i
[ROADMAP.md](./ROADMAP.md).

Kortsiktiga tekniska forbattringar:

- [ ] Flytta deltagare till Firestore-undresamling for battre skalbarhet
- [ ] Push-aviseringar (Expo Notifications) nar en deltagare avslutar
- [ ] Bildstod for kontrollpunkter (ta foto pa platsen)
- [ ] Tidsbegransning per fraga
- [ ] iOS-stod via EAS Build (kravs Apple Developer Program)
- [ ] Stod for flera sprak (i18n)
- [ ] Flytta kanslighetsdata till Expo-miljuvariabler

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
