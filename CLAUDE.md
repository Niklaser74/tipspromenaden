# CLAUDE.md

Kontextfil för AI-assistenter (Claude Code, Claude Agent SDK) som arbetar i
detta repo. Komplement till README.md — här står det **hur projektet faktiskt
är byggt och varför**, inte hur man kör det.

## Vad är Tipspromenaden?

Mobil- och webbapp för att skapa och delta i tipspromenader. Skaparen ritar
kontrollpunkter på en karta, kopplar frågor till varje punkt och delar en
QR-kod. Deltagare skannar QR-koden, går till kontrollpunkterna med GPS och
svarar på frågorna där.

Marknad: Sverige först (svensk UI-default, `sv-SE` i Play Console). App-ID
`com.tipspromenaden.app`, Play-projekt `tipspromenaden-491207`.

## Stack

- **Expo SDK 55** + React Native 0.83 + React 19 + TypeScript 5.9
- **Firebase**: Firestore (data), Auth (Google + anonym), Storage (frågebilder)
- **EAS Build** för Android AAB/APK, `appVersionSource: "remote"`, `autoIncrement: true`
- **EAS Update** för OTA-patchar (fingerprint-policy)
- Kartor: `react-native-maps` på native, Leaflet via WebView på web
- i18n: `expo-localization` + egen hook i `src/i18n/`, locales i `src/locales/{sv,en}.json`

## Arkitektur i korthet

```
src/
├── config/firebase.ts          # Firebase-init, exporterar db/auth/storage
├── context/AuthContext.tsx     # useAuth() — user + loading; triggar walkSync på login
├── types/index.ts              # Walk, Session, Participant, Question, SavedWalk, m.m.
├── i18n/                       # useTranslation(), setLanguage(), useLanguageChoice()
├── locales/                    # sv.json (primär), en.json
├── constants/                  # languages, deepLinks
├── utils/                      # location (haversine, GPS), qr (QR-payload), date
├── components/                 # MapViewWeb (Leaflet), DateField, ErrorBoundary
├── services/                   # All extern I/O — inga React-beroenden här
└── screens/                    # En fil per skärm, useNavigation() för routing
```

### Services-lagret (viktigt)

- `auth.ts` — Google Sign-In (native) / popup (web), anonym login, `onAuthChange`
- `firestore.ts` — CRUD + realtidsprenumerationer; alla Firestore-anrop bor här
- `storage.ts` — AsyncStorage: `SavedWalk[]` + offline-kö
- `walkSync.ts` — Hämtar egna walks från Firestore vid login, mergar in i lokal lista.
  Körs en gång per uid per app-körning från `AuthContext`. Viktigt efter
  Play Store-installation eftersom AsyncStorage då är tom.
- `walkRefresh.ts` — Refresh av en enskild walk från molnet (t.ex. efter edit)
- `offlineSync.ts` — Synkar offline-svar var 30:e sekund
- `questionBattery.ts` — Validerar och importerar `.tipspack`-filer
- `questionImage.ts` — Laddar upp frågebilder till Firebase Storage
- `stats.ts` — Lokal statistik (antal skapade promenader, m.m.)

## Datamodell (Firestore)

```
walks/{walkId}                            # Publik läsning, ägaren skriver
  id, title, createdBy (uid), createdAt,
  language?, event? { startDate, endDate },
  questions[] { id, text, options[], correctOptionIndex, coordinate, imageUrl?, order }

sessions/{sessionId}                      # Publik läsning, signed-in kan create/update
  id, walkId, status ∈ {waiting, active, completed}, createdAt

sessions/{sessionId}/participants/{uid}   # Doc-id MÅSTE == auth.uid
  id, name, score, answers[], completedAt?
```

Deltagare är en **undresamling**, inte en array inbäddad i session-dokumentet.
Det är ett medvetet val: undviker 1 MB-gränsen och gör realtidssubscribe
granulärare.

## Säkerhetsmodell

Se `firestore.rules` och `storage.rules` för bindande sanning.

Principer:
- **Walks**: skapas endast av Google-inloggade (icke-anonyma). Ägaren kan
  uppdatera/radera. `hasValidWalkShape` capar title ≤ 200, questions ≤ 200.
- **Sessions**: vem som helst inloggad (inkl. anonym) kan skapa, men `walkId`
  måste peka på en existerande walk (`exists()`-check). Status-uppdateringar
  är **framåtriktade bara** (`waiting→active→completed`), vilket hindrar
  återuppväckning av avslutade sessioner.
- **Participants**: doc-id måste matcha `auth.uid`. Score ≤ `answers.size()`
  (trivialt fusk-skydd; full validering kräver Cloud Functions).
- **Storage**: endast icke-anonyma kan skriva frågebilder, max 2 MB, `image/*`.

Känd begränsning: klient-uträknad score kan inflateras upp till antal svar.
Dokumenterat, inte avsett att fixas i v1.

## Konventioner

- **Språk**: all UI-text ska gå via `t("key")`. Nya strängar läggs i `src/locales/sv.json`
  och `en.json` samtidigt. Kommentarer i kod är på svenska (befintlig stil);
  committs/PR-titlar på engelska.
- **File headers**: nya services/context-filer börjar med JSDoc `@file`-block
  som förklarar ansvar och användning (se `AuthContext.tsx`, `walkSync.ts`).
- **Inga `any` om det går** — projektet kör strict TypeScript.
- **Imports**: relativa, inte path-aliased. Explicit `.tsx`/`.ts`-ändelser utelämnas.
- **Styling**: `StyleSheet.create` sist i filen; färger inline med hex (ingen
  theme-fil — medveten enkelhet).
- **Plattformsskillnader**: `Platform.OS === "ios"` / `"android"` / `"web"`,
  ofta via `Platform.select`. Se `CreateWalkScreen.tsx`-modalen för ett
  typiskt exempel (KeyboardAvoidingView enbart på iOS).

## Byggflöde

```
eas build -p android --profile preview     # APK för sideload
eas build -p android --profile production  # AAB för Play
```

`eas.json` har `autoIncrement: true` på `internal` och `production` så
versionCode rullas automatiskt. `appVersionSource: "remote"` betyder att
EAS-servern äger versionCode-tillståndet — kolla med
`eas build:version:get -p android`.

Play Store-spår: **Internt test** visar "(unreviewed)" + ingen innehålls-
klassificering → Family Link blockerar. **Stängt test** ger riktig granskning
och klassificering — använd det för riktiga testare.

### OneDrive-buggen (drabbar ENDAST `eas build`)

Projektet ligger på en OneDrive-synkad sökväg. När `eas build` komprimerar
projektet för uppladdning blir tar-arkivet korrupt (troligen pga. Files-
On-Demand-placeholders som rehydreras mitt i tar-körningen). Bygget kör
då fast i **PREPARE_PROJECT**-fasen med fel som:

```
tar: src/screens: Cannot mkdir: Permission denied
tar: src/screens/HomeScreen.tsx: Cannot open: No such file or directory
tar: Exiting with failure status due to previous errors
```

**Fix:** bygg från en kopia på lokal disk utanför OneDrive.

```bash
# Första gången (eller efter längre paus)
mkdir -p /c/dev
cp -r "/c/Users/<user>/OneDrive - .../tipspromenaden-app" /c/dev/tipspromenaden-app

# node_modules kopieras brutet — kör om install
cd /c/dev/tipspromenaden-app
# Radera via cmd (PowerShell/bash kan fastna på långa path-längder i node_modules):
cmd //c "rmdir /s /q C:\dev\tipspromenaden-app\node_modules"
npm install

# Därefter: bygg alltid härifrån
cd /c/dev/tipspromenaden-app
eas build -p android --profile production --non-interactive --no-wait

# Submit kan också köras härifrån när bygget är klart:
eas submit -p android --id <build-id> --non-interactive --profile internal
```

**Viktigt:** nya commits ska fortfarande göras i OneDrive-kopian (det är
"sanningen"). Innan nästa build: synka över ändringar till `/c/dev/`-
kopian, t.ex. med `git pull` eller `robocopy` av källfiler (inte
`node_modules`).

**`eas update` (OTA) drabbas INTE** — kan köras direkt från OneDrive-
sökvägen utan problem. OneDrive-buggen träffar bara den tar-baserade
uppladdningen i `eas build`.

## Kända begränsningar / icke-blockerare

- `generateId()` i `src/utils/qr.ts` använder `Math.random()` (ca 48 bits).
  Låg prio, men byt till `expo-crypto.getRandomBytesAsync` vid tillfälle.
- Deep-link-prefix `https://tipspromenaden.se` är oregistrerad hos Google
  (ingen `assetlinks.json` på domänen). Intent-hijacking möjlig i teorin;
  domänen är inte publik idag så låg praktisk risk.
- Score-fusk (se säkerhetsmodellen).
- OneDrive-synkade sökvägar bryter `eas build` (se "OneDrive-buggen" under
  Byggflöde). OTA (`eas update`) påverkas inte.

## Filer att läsa först för ny kontext

1. `firestore.rules` — säkerhetsmodellen
2. `src/types/index.ts` — datamodellen i kod
3. `src/context/AuthContext.tsx` — auth-flödet och walk-syncen
4. `src/services/firestore.ts` — all datatrafik
5. `app.config.js` + `eas.json` — bygg- och miljökonfiguration
