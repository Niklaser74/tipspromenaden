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
- Sensorer: `expo-sensors` (Pedometer för stegräkning),
  `expo-screen-orientation` (telefon låst portrait, surfplatta fri rotation)

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
├── hooks/
│   ├── useMapType.ts           # Toggle standard/hybrid/terrain, persistas i AsyncStorage
│   └── usePedometer.ts         # Pedometer-wrap: tillgänglighet + permission + steps
├── utils/                      # location, qr, date, shareWalk
├── components/                 # MapViewWeb (Leaflet), MapTypeToggle, DateField,
│                               # ErrorBoundary, WalkActionsMenu (bottom-sheet
│                               # för sekundära walk-actions i HomeScreen)
├── services/                   # All extern I/O — inga React-beroenden här
└── screens/                    # En fil per skärm, useNavigation() för routing
                                # WalkInsightsScreen = skaparens statistik per walk
                                #   (sessions, deltagare, snittpoäng, snittsteg,
                                #   per-fråga svarsfördelning)
                                # StatsScreen = användarens egna lokala statistik

scripts/                        # Node/PS-helpers utanför app-bundlet
├── update-all.mjs              # `npm run update:all` — OTA till båda branches
└── strip-readonly.ps1          # Legacy från OneDrive-tiden — tar bort read-only-flagga
                                # före build. Ej längre nödvändig sedan repot
                                # flyttades till `C:/dev/`. Kvar för säkerhets skull.
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
  Innehåller också `getWalkInsights(walkId)` som aggregerar alla sessioner +
  deltagare till en `WalkInsights`-payload (totals, snittpoäng, snittsteg,
  per-fråga svarsfördelning). Driver `WalkInsightsScreen`.
- `storage.ts` — AsyncStorage: `SavedWalk[]` + offline-kö (`PendingSyncData`,
  som även bär `steps?` så stegräknarvärden överlever offline-tillstånd)
- `walkDraft.ts` — Autospar för pågående walk-redigering. Debouncad save
  (1 s) av draft till AsyncStorage `walk_draft_<walkId>`. CreateWalkScreen
  läser vid mount och erbjuder restore/discard. Rensas efter lyckad save.
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
  id, name, score, answers[], completedAt?, steps?

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

**Accepterade designval (inte buggar — dokumenterade efter sec-review 2026-04-30):**
- **Walks är publikt läsbara via id.** `firestore.rules: allow read: if true` på `walks/{walkId}` är medvetet — QR-delning kräver det. Den klient-side `where("public","==",true)` i `getPublicWalks` är endast för listning, inte säkerhet. Konsekvens: vem som helst med en walk-id kan läsa hela walken inkl. facit. ID:n är 96-bit random så fishing av id:n är inte realistiskt.
- **Score-validering är klient-side.** `firestore.rules` cappar bara `score <= answers.size()`. En motiverad fuskare kan toppa topplistan. Acceptabelt på hobby-skala; flytta till Cloud Function om tävlingar blir aktuella.
- **Tipspack-storage är publikt läsbar oavsett `isPublic`-flagga.** "Hemlig länk"-läget är obscurity (slug är genererat från filnamn), inte auth.

**Återstår att aktivera (manuellt i konsolerna):**
- **Firebase App Check** — kräver `@react-native-firebase/app-check` (native
  Play Integrity-provider, inte JS SDK). Webbappen är inte deployad så
  reCAPTCHA-vägen är irrelevant just nu. Lägg till i nästa build-cykel som
  kräver ny AAB ändå. Se roadmappen nedan. **Hot utan App Check:** anonyma
  klienter kan spamma `participants` eller skapa endless sessions →
  Firestore-kostnadsbomb. Sätt budget-alert i GCP som mitigation.
- **Cloud Function för 90-dagars auto-radering** av anonyma sessioner —
  privacy-policyn lovade detta tidigare; lovade nu UI-knappen istället för
  att inte hänga ut oimplementerade löften.

**Play Console-deklarationer som följer ACTIVITY_RECOGNITION:**
Stegräkningen kräver `android.permission.ACTIVITY_RECOGNITION` (Android 10+).
Det triggar i sin tur två Play Console-formulär som behöver fyllas i innan
AAB:n kan publiceras:
- **App-innehåll → Hälsoappar** ("Health features"). Ja, vi visar hälso-/
  fitness-data (steg). Nej till medicinska påståenden / Health Connect-skriv.
- **Permissions declaration / Datasäkerhet** kan be om kompletteringar i
  samband med upload — Play Console-UI:t guidar dig då igenom dem. Manuell
  upload via konsolen accepterar oftare än `eas submit`-API:n eftersom UI:t
  prompar för kvarvarande svar i realtid.

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
- **Release-notes vid VARJE uppdatering (HÅRT KRAV)**: så fort en
  uppdatering når användarna — `eas build` + Play Console-submit ELLER
  `eas update`/`npm run update:all` — MÅSTE release notes skrivas på
  **både svenska och engelska**, max 500 tecken per språk. Detta är
  inte valbart och inte beroende av "om det är en stor release". Även
  små buggfixar och OTA-pushar får en post.

  Format: bullet-lista, användar-orienterat ("du ser nu…"),
  inte tekniskt ("vi bytte initializeAuth…"). Lägg ÖVERST i
  `docs/play-store-listing.md` under `## "What's new"-texter per
  release` i omvänd kronologisk ordning. Notera om det är AAB-release
  (går till Play Console) eller bara OTA (loggas bara — Play Console
  ser ingen OTA).

  **Workflow vid release:** (1) skriv release notes före submit/update,
  (2) committa noterna i samma commit som triggar release om möjligt,
  (3) submit/update, (4) påminn användaren att klistra in i Play Console
  vid AAB-uppladdning.

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
- **Stegräkning** — `usePedometer(enabled)`-hooken i `ActiveWalkScreen`
  prenumererar på enhetens hårdvaru-stegräknare när session är etablerad.
  Steg sparas i `Participant.steps` vid varje answer-update och visas i
  ActiveWalk (live), Results, Leaderboard och WalkInsights (snittsteg).
  Saknas sensor eller ACTIVITY_RECOGNITION-permission → fältet utelämnas
  tyst, inga UI-fel. Native-permission deklarerad i `app.config.js` +
  Health Apps-deklaration i Play Console.
- **Autospar i CreateWalk** — `services/walkDraft.ts` sparar utkast
  (titel, frågor, event, språk) debouncat 1 s till AsyncStorage. Vid mount
  erbjuder skärmen "Återställ / Börja om" om en draft finns för walkId.
  Rensas efter lyckad `saveWalk`. Drafter äldre än cloud-`updatedAt` ses
  som skräp och raderas tyst.
- **Walk Insights** (skaparens statistik) — `WalkInsightsScreen` nås via
  chart-bar-knappen på egna walks i HomeScreen. Visar sessioner, deltagare,
  snittpoäng, snittsteg + per-fråga svarsfördelning med grön höjdpunkt på
  rätt option. One-shot-fetch på focus, inte realtid (refresh via pull).
- **Overflow-meny på walk-rader** — `components/WalkActionsMenu.tsx` är
  ett bottom-sheet med sekundära actions (Insights, Topplista, Tags,
  Byt namn, Ta bort). Synliga primära knappar i kortet är bara Dela +
  Redigera/QR (för skapare) + ⋯. Tidigare 5–8 ikon-knappar per rad blev
  visuellt rörigt — overflow-menyn skalar bättre när nya funktioner kommer.
- **Surfplatte-landscape + splitvy** — `app.config.js` har `orientation:
  "default"` och App.tsx låser portrait på telefoner (shortest-side <
  600 dp) men låter surfplattor rotera fritt. CreateWalkScreen byter
  layout till split (karta vänster + 380 px sidopanel höger) när
  `useWindowDimensions().width >= 900`; fråge­listan auto-expanderas i det
  läget. Andra skärmar är portrait-tunade men funktionellt OK i landscape.
- **Swipe-down dismiss** — frågeredigerings-modalen i CreateWalkScreen
  stängs genom att dra handle/header nedåt (>120 px eller snabb flick).
  PanResponder triggar bara på tydligt vertikal nedåt-gest så form-fält
  förblir interaktiva.

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

### Projektplats: `C:/dev/tipspromenaden-app/`

Projektet ligger på lokal disk **utanför OneDrive** sedan 2026-04-29.
Tidigare bodde det i `OneDrive/.../tipspromenaden/tipspromenaden-app/`
vilket triggade två olika buggar:

- `eas build` fastnade i PREPARE_PROJECT med korrupta tar-arkiv (Files-
  On-Demand-placeholders rehydrerades mitt i tar-körningen).
- `eas update` (OTA) timeoutade på asset-uploaden eftersom OneDrive
  försökte synka upp .hbc-bundlarna samtidigt som EAS-CLI strömmade
  dem till Expo — file-handle-krock.

Båda är borta nu. Bygg och OTA körs direkt från `C:/dev/tipspromenaden-app/`
utan workarounds. Den gamla OneDrive-kopian är omdöpt till
`tipspromenaden-app-OLD-DO-NOT-EDIT-2026-04-29/` och kan raderas när som
helst — sanningen ligger i GitHub + `C:/dev/`.

Backup av gammal state innan flytt: `C:/Users/niklas.eriksson/_archive/`.

### OTA: appVersion-policy + båda branches

`runtimeVersion.policy: "appVersion"` i `app.config.js` — runtime läses
dynamiskt från `version`-fältet (just nu `"1.3.0"`). Tidigare körde vi `"fingerprint"`
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
- `assetlinks.json` på `tipspromenaden.app` (domänen är reggad hos Cloudflare
  Registrar 2026-04). Verifierar Android App Links och stänger ner
  intent-hijacking. Kräver: SHA256 från upload-keystore + `intentFilters`
  i `app.config.js` för `https://tipspromenaden.app/walk/*` + bumpa
  `version` (native-ändring → ny AAB) + uppdatera `parseQRData()` och
  `buildWalkLink()` att använda `https://`-formatet.
- Exportera resultat som CSV/PDF efter avslutad session.
- Per-skärm landscape-finputs (Active/Results/Leaderboard) — orientation är
  redan unlock:ad, layouterna är funktionellt OK i landscape men inte tunade.

**Distribution / drift:**
- Få 12+ testare i stängt test i 14 dagar → öppnar prod-track för API-push.
  Testare onboardas via Google Group `tipspromenaden-testers` — se
  `docs/testpiloter-google-group.md`. Ett klick per godkännande, gruppen
  funkar också som distributionslista för uppdateringar.
- **Webbsida på `tipspromenaden.app`** (domänen reggad hos Cloudflare Registrar):
  hostas på **Cloudflare Pages** (gratis, samma konsol som registrar/DNS,
  auto-HTTPS, git-deploy). Stack: **Astro + Tailwind** för låg JS-vikt och
  Lighthouse 100. Eget repo `tipspromenaden-web` (sibling till app-repot).
  Initialt innehåll:
    - `index.astro` — hero, Play Store-badge, screenshots, 3 features
    - `/walk/[id]` — smart redirect: detekterar OS, försöker `tipspromenaden://`,
      fallback till Play Store. Behövs tills App Links verifieras (se ovan).
    - `public/.well-known/assetlinks.json` — Android App Links
    - `public/.well-known/apple-app-site-association` — förberett för iOS
    - Privacy policy + Terms of Service (Play Store kräver)
  Senare användningsområden: publik resultat-delning (`/result/{sessionId}`),
  publik promenadkatalog (`/upptack`), skaparportal i webb (react-native-web-build),
  blogg/press kit, Stripe-checkout om premiumplaner blir aktuellt.

**Marknadsföring:**
- `docs/marketing/` innehåller printbara flygblad i flera varianter
  (single A5, 2-up A4, bifold A4, plus en lokal Hammardammen-variant
  med två-stegs-QR-flöde: bli testare → starta promenaden). Bygg om
  via `node build-flyer.mjs` etc. Designfilosofi: "Friluft Folio".

## Kända begränsningar / icke-blockerare

(Punkterna nedan är *accepterade* svagheter just nu — fixar finns på
roadmappen ovan, men ingen blockerar v1.)

- Deep-link-prefix `tipspromenaden://` är custom-scheme — auto-länkas inte
  i Messenger/SMS. `assetlinks.json` + `https://tipspromenaden.app` löser
  detta när domänen finns. Workaround idag: "Klistra in länk"-knappen i
  ScanQRScreen + bart walkId i delningsmeddelandet.
- Score-fusk: klient räknar poäng (se säkerhetsmodellen).

## Filer att läsa först för ny kontext

1. `firestore.rules` — säkerhetsmodellen
2. `src/types/index.ts` — datamodellen i kod
3. `src/context/AuthContext.tsx` — auth-flödet och walk-syncen
4. `src/services/firestore.ts` — all datatrafik
5. `app.config.js` + `eas.json` — bygg- och miljökonfiguration
6. `docs/play-store-listing.md` — store-metadata + bilingual release-notes
7. `docs/testpiloter-google-group.md` — testpilot-onboarding (Google Group → Play)
