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
- **EAS Update** för OTA-patchar (appVersion-policy; native-ändringar kräver manuell `version`-bump)
- Kartor: `react-native-maps` på native, Leaflet via WebView på web
- i18n: `expo-localization` + egen hook i `src/i18n/`, locales i `src/locales/{sv,en}.json`

## Arkitektur i korthet

```
src/
├── config/firebase.ts          # Firebase-init, exporterar db/auth/storage
│                               # OBS: auth init:as via initializeAuth +
│                               # getReactNativePersistence(AsyncStorage) på
│                               # native — annars förloras login vid varje
│                               # cold start (firebase/auth defaultar till
│                               # in-memory på RN). Web kör default getAuth.
├── context/AuthContext.tsx     # useAuth() — user + loading; triggar walkSync på login
├── types/index.ts              # Walk, Session, Participant, Question, SavedWalk, m.m.
├── i18n/                       # useTranslation(), setLanguage(), useLanguageChoice()
├── locales/                    # sv.json (primär), en.json
├── constants/                  # languages, deepLinks (APP_SCHEME + buildWalkLink)
├── hooks/useMapType.ts         # Toggle standard/hybrid/terrain, persistas i AsyncStorage
├── utils/                      # location, qr, date, shareWalk
├── components/                 # MapViewWeb (Leaflet), MapTypeToggle, DateField, ErrorBoundary
├── services/                   # All extern I/O — inga React-beroenden här
└── screens/                    # En fil per skärm, useNavigation() för routing

scripts/                        # Node/PS-helpers utanför app-bundlet
├── update-all.mjs              # `npm run update:all` — OTA till båda branches
└── strip-readonly.ps1          # Tar bort read-only-flagga (OneDrive-artefakt) före build
```

**Utils värda att känna till:**
- `qr.ts` → `parseQRData()` accepterar **tre format**: JSON från QR-kod,
  deep link `tipspromenaden://walk/<id>`, eller rått walkId. Samma kodväg
  hanterar alltså både kameraskanning och inklistring av delade länkar.
- `shareWalk.ts` → `Share.share()` med en delningsbar text som innehåller
  titel + deep link + bart walkId (sista är fallback när länken inte är
  klickbar i Messenger/SMS) + Play Store-länk.
- `location.ts` → `watchPosition(callback, tier)` med `tier: "precise" |
  "battery"`. Precise = `BestForNavigation` + 1s, battery = `High` + 5s.
  Används av `ActiveWalkScreen` med zoom-baserad växling: ovan
  latitudeDelta 0.02 → battery (panning/överblick), under → precise.

### Services-lagret (viktigt)

- `auth.ts` — Google Sign-In (native) / popup (web), anonym login, `onAuthChange`
- `firestore.ts` — CRUD + realtidsprenumerationer; alla Firestore-anrop bor här.
  `saveWalk()` kör en rekursiv `stripUndefined()` innan `setDoc`, eftersom
  Firestore avvisar `undefined`-värden ("Unsupported field value: undefined")
  och optional-fält som `Question.imageUrl` lätt blir explicit `undefined`
  via spread/import. Lägg motsvarande scrub i nya save-funktioner.
- `storage.ts` — AsyncStorage: `SavedWalk[]` + offline-kö
- `walkSync.ts` — Hämtar egna walks från Firestore vid login, mergar in i lokal lista.
  Körs en gång per uid per app-körning från `AuthContext`. Viktigt efter
  Play Store-installation eftersom AsyncStorage då är tom.
- `walkTags.ts` — Privata taggar per walk (AsyncStorage `walk_tags_v1`).
  Varje mutation bumpar `updatedAt` och triggar en push-hook.
- `walkTagsSync.ts` — Synkar tagg-storen till `users/{uid}/meta/walkTags`
  i Firestore. Debouncad auto-push efter lokala ändringar,
  `pullWalkTagsFromCloud()` vid login och från "Återställ promenader"-knappen.
  Last-write-wins på doc-nivå via `updatedAt`.
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

users/{uid}/meta/walkTags                 # Privat, endast ägaren
  catalog: Tag[], byWalk: Record<walkId, tagId[]>, updatedAt
```

Deltagare är en **undresamling**, inte en array inbäddad i session-dokumentet.
Det är ett medvetet val: undviker 1 MB-gränsen och gör realtidssubscribe
granulärare.

## Säkerhetsmodell

Se `firestore.rules` och `storage.rules` för bindande sanning.

Principer:
- **Walks**: skapas endast av Google-inloggade (icke-anonyma). Ägaren kan
  uppdatera/radera. `hasValidWalkShape` capar title ≤ 200, questions ≤ 200,
  description ≤ 2000.
- **Sessions**: vem som helst inloggad (inkl. anonym) kan skapa, men `walkId`
  måste peka på en existerande walk (`exists()`-check). Status-uppdateringar
  är **framåtriktade bara** (`waiting→active→completed`), vilket hindrar
  återuppväckning av avslutade sessioner.
- **Participants**: doc-id måste matcha `auth.uid`. Score ≤ `answers.size()`,
  `answers.size()` ≤ 300 (taket hindrar att man inflaterar svarslistan
  godtyckligt). Namn-regex blockerar HTML-tecken (`<>"'`` `) som skydd
  mot XSS-yta i framtida render-kod. **Sessionen får inte vara `completed`**
  — efter avslutat spel är topplistan fryst.
- **Storage**: endast icke-anonyma kan skriva frågebilder, max 2 MB, `image/*`,
  och `walks/{walkId}.createdBy` måste matcha skribentens uid (kollas via
  `firestore.get` i storage.rules — utan denna check kan vem som helst
  Google-inloggad skriva över andras frågebilder eftersom path:en är
  publikt känd från `imageUrl`-fältet).

Kvarstående svaghet: klient-uträknad score kan fortfarande inflateras upp till
`min(answers.size(), 300)`. Full validering mot facit kräver Cloud Functions
(roadmap). Reglernas tak gör attacken småskalig — full motåtgärd kräver
serverside-bedömning av varje svar.

**Återstår att aktivera (manuellt i konsolerna):**
- **Firebase App Check** — kräver `@react-native-firebase/app-check` (native
  Play Integrity-provider, inte JS SDK). Webbappen är inte deployad så
  reCAPTCHA-vägen är irrelevant just nu. Lägg till i nästa build-cykel som
  kräver ny AAB ändå. Se roadmappen nedan.
- **Service-account-rotation** — `google-service-account.json` ligger i
  OneDrive-synkad mapp. Flytta ut och rotera nyckeln i GCP om det finns
  minsta tveksamhet om OneDrive-läckage.

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

## Funktioner värda att veta om

- **Karttyp-toggle** — knapp på `ActiveWalkScreen` och `CreateWalkScreen`
  cyklar standard → hybrid → terräng. Native använder `react-native-maps`
  `mapType`-prop. Web swappar Leaflet-tile-layers via postMessage (Esri
  World Imagery + Reference för hybrid, OpenTopoMap för terräng). Valet
  persistas via `useMapType()` (AsyncStorage).
- **Återanvänd positioner** — knapp i `CreateWalkScreen` när det är en
  fräsch ny promenad. Hämtar `getSavedWalks()` (innehåller egna walks +
  sparade andras) och kopierar koordinater till tomma frågeslots i en ny
  walk. När man sedan importerar ett `.tipspack` matchas frågorna mot
  tomma positioner i ordning, resten köas (`batteryQueue`).
- **Klistra in länk** — på `ScanQRScreen` (under kameraöverlayen) finns
  en knapp som öppnar en modal där man kan klistra in en delad länk
  eller ett walk-id. Workaround tills universal-https-länkar finns.
- **OTA debug-rad** — `SettingsScreen` visar `channel · rt {runtimeVersion} ·
  {updateId}` (sista 8 tecken). Används för att verifiera vilken bundle som
  faktiskt körs när en OTA är publicerad — `updateId` ändras efter
  dubbel-cold-start (Expo laddar i bakgrunden, aktiverar nästa start).
- **Radera konto & data** — knapp i `SettingsScreen` (under "Konto"). Kräver
  typad bekräftelse ("RADERA") för att undvika oavsiktlig klick. Kallar
  `deleteAccount()`-flödet i `services/auth.ts` som tar bort både Firebase-
  Auth-användaren och relaterad data. Tidigare låg knappen på Home — flyttad
  till Settings för att ge den mindre framträdande plats.

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

**`eas update` (OTA) drabbas också** — fast på ett annat sätt. När `eas
update` har exporterat dist/ börjar OneDrive synka upp de nya .hbc-
bundlarna (~3.6 MB var) till molnet samtidigt som EAS-CLI försöker
strömma upp dem till Expo. File handles krockar och uploaden timeoutar
med "Asset processing timed out for assets". Symptom: assetmap.json
går igenom på sekunder, sedan dör de stora .hbc-filerna.

**Fix före varje OTA-publicering från OneDrive-sökvägen:**
högerklicka OneDrive-ikonen i systray → "Pausa synkning 2 timmar".
Sedan kör `npm run update:all -- --message "..."`. Återaktivera
synken efteråt.

(Permanent lösning: flytta projektet ut ur OneDrive — se roadmap.)

### OTA: appVersion-policy + båda branches

`runtimeVersion.policy: "appVersion"` i `app.config.js` — runtime är
literal `"1.0.0"` (= `version`-fältet). Tidigare körde vi `"fingerprint"`
men det drev isär: EAS-build-servern och `eas update` lokalt hashade
olika filuppsättningar, så varje build/publicering fick olika runtime-
hash och OTA:er nådde aldrig fram. appVersion ger deterministisk
matchning mellan miljöer.

**Konsekvens:** när native-lagret ändras (nytt expo-paket, plugin,
permissions, app-icon, splash, etc) MÅSTE `version` bumpas manuellt i
`app.config.js` + en ny AAB byggas. JS-only-patchar går som vanligt
via `eas update`.



`eas.json` binder varje build-profil till en EAS-channel:
- `preview` → `channel: "preview"`
- `internal` → `channel: "internal"`
- `production` → `channel: "production"`

Channel-namnet bakas in i AAB:n vid build-tid. En installerad app lyssnar
**bara** på OTA-updates publicerade till sin channel. Att flytta en AAB i
Play Console (t.ex. från internal track till closed testing) påverkar inte
channel — AAB:n är fysiskt samma fil, med samma inbakade channel.

Eftersom vi normalt bygger med `--profile internal` för testare men
också har produktions-builds i omlopp, publicera alltid till **båda**
branches:

```bash
npm run update:all -- --message "Beskrivning av ändringen"
```

Scriptet (`scripts/update-all.mjs`) kör `eas update --branch internal` +
`eas update --branch production` i följd. Använd bara en enskild branch
om du medvetet vill hålla tillbaka en förändring från en kanal.

## Nästa steg / roadmap

Idéer och planerade förbättringar, grovt prioriterat. Inga hårda deadlines —
plocka det som passar när tillfälle ges.

**Kod / app:**
- Cloud Functions för score-validering — flytta poängberäkningen serverside
  så att klient-inflaterad score inte går igenom. Kräver Firebase Functions-setup.
- **Firebase App Check** — lägg till `@react-native-firebase/app-check` som
  native dep, konfigurera Play Integrity i Firebase-konsolen, initiera i
  `src/config/firebase.ts`. Kräver ny AAB-build (inte OTA). Aktivera
  "Monitoring" i konsolen, vänta tills all legitim trafik syns som *verified*,
  slå sedan på Enforce. (Web App i konsolen finns men appen har ingen publik
  web-deployment — reCAPTCHA-provider är inte relevant just nu.)
- `assetlinks.json` på `tipspromenaden.se` när domänen registrerats, så att
  deep-links verifieras av Android och intent-hijacking stängs ner.
- Statistik-vy för skaparen: antal deltagare per session, genomsnittlig poäng,
  svarsfördelning per fråga. Data finns redan i `sessions/*/participants`.
- Exportera resultat som CSV/PDF efter avslutad session.

**Distribution / drift:**
- Få 12+ testare i stängt test i 14 dagar → öppnar prod-track för API-push.
- Registrera `tipspromenaden.se` + peka DNS mot en enkel landningssida med
  app-länkar och `assetlinks.json`.
- Flytta projektet ut ur OneDrive permanent (eller konfigurera OneDrive att
  exkludera repo-mappen) så `eas build` kan köras direkt utan `/c/dev/`-kopian.

## Kända begränsningar / icke-blockerare

(Punkterna nedan är *accepterade* svagheter just nu — fixar finns på
roadmappen ovan, men ingen blockerar v1.)

- Deep-link-prefix `tipspromenaden://` är custom-scheme — auto-länkas inte
  i Messenger/SMS. `assetlinks.json` + `https://tipspromenaden.se` löser
  detta när domänen finns. Workaround idag: "Klistra in länk"-knappen i
  ScanQRScreen + bart walkId i delningsmeddelandet.
- Score-fusk: klient räknar poäng (se säkerhetsmodellen).
- OneDrive-sökväg bryter `eas build` (se OneDrive-buggen). OTA opåverkad.

## Filer att läsa först för ny kontext

1. `firestore.rules` — säkerhetsmodellen
2. `src/types/index.ts` — datamodellen i kod
3. `src/context/AuthContext.tsx` — auth-flödet och walk-syncen
4. `src/services/firestore.ts` — all datatrafik
5. `app.config.js` + `eas.json` — bygg- och miljökonfiguration
