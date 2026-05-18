# iOS-setup (TestFlight → App Store)

Förarbetet i koden är gjort (commit som introducerar denna fil):

- `app.config.js` → `ios.bundleIdentifier = "com.tipspromenaden.app"`
  (samma reverse-DNS som Android), `infoPlist`-användningssträngar för
  plats/kamera/rörelse, `supportsTablet: true`.
- `eas.json` → `internal` + `production` har nu `ios.autoIncrement`.
  iOS-bygget får alltså sitt `buildNumber` från EAS precis som Android
  (`appVersionSource: "remote"`).

Allt nedan kräver ett **Apple-konto** och kan inte göras härifrån.
Stegen i ordning, med realistiska väntetider.

---

## 1. Apple Developer Program (flaskhalsen — börja här)

1. Gå till <https://developer.apple.com/programs/enroll/>.
2. Logga in med (eller skapa) ett **Apple-ID**. Använd ett konto du
   äger långsiktigt — det blir ägare till appen. Rekommendation: ett
   dedikerat konto, inte ditt privata, t.ex. knutet till
   `support@tipspromenaden.app`.
3. Välj enrollment-typ:
   - **Individuell** (privatperson) — snabbast, ingen D-U-N-S. Appen
     listas under ditt namn. Räcker för hobbyprojektet.
   - **Organisation** — kräver D-U-N-S-nummer + verifiering, tar
     längre. Bara om appen ska stå under ett företagsnamn.
4. Betala **99 USD/år**.
5. Apple gör identitetsverifiering. Individuell: oftast 24–48 h.
   Org: kan ta en vecka+.

Du kan inte göra något av nedan förrän detta är godkänt.

---

## 2. App Store Connect — app-record

När Developer-kontot är aktivt:

1. Gå till <https://appstoreconnect.apple.com> → **My Apps** → **+** →
   **New App**.
2. Fyll i:
   - Platform: **iOS**
   - Name: **Tipspromenaden**
   - Primary language: **Swedish**
   - Bundle ID: välj **com.tipspromenaden.app** (skapas i
     Certificates/Identifiers om det inte finns — se steg 3, eller låt
     EAS skapa det åt dig i steg 4).
   - SKU: valfri unik sträng, t.ex. `tipspromenaden-ios`.
3. Anteckna appens **ascAppId** (det numeriska id:t i URL:en när du
   öppnar appen i App Store Connect) — behövs i steg 6.

---

## 3. (Valfritt) Certificates/Identifiers

EAS kan sköta certifikat och provisioning automatiskt i steg 4, så
detta steg behövs normalt **inte** manuellt. Hoppa över om du inte vet
att du behöver något särskilt.

---

## 4. Koppla Apple-kontot till EAS + första bygget

Från `C:/dev/tipspromenaden-app/`:

```
eas build -p ios --profile internal
```

- EAS frågar efter Apple-ID första gången och loggar in mot Apple.
- EAS skapar/hämtar bundle-ID, distributions­certifikat och
  provisioning-profil automatiskt (`eas credentials` om du vill se/
  ändra senare).
- Cloud-bygget tar ~15–25 min. Resultat: en `.ipa`.

> Bundle-ID måste vara **com.tipspromenaden.app** överallt (app.config,
> App Store Connect, EAS) — annars matchar inte provisioning.

---

## 5. TestFlight — få ut den till testare

Ladda upp `.ipa` till TestFlight:

```
eas submit -p ios --profile internal --latest
```

(Första gången frågar EAS efter App Store Connect-uppgifter — se
steg 6 för icke-interaktiv variant.)

Två testnivåer:

| Nivå | Apple-review? | Hur |
|---|---|---|
| **Interna testare** (≤100) | **Nej** | Lägg till personer som "Users" i App Store Connect-teamet, lägg dem i en intern TestFlight-grupp. Build tillgänglig så fort den processats (~5–30 min). |
| **Externa testare** (≤10 000) | Ja, **Beta App Review** ~1 dygn (första bygget; sen oftast snabbt) | Skapa en extern grupp, fyll i "Test Information" (beta-beskrivning, kontakt), aktivera publik länk eller bjud in via mejl. |

**Rekommendation:** börja med **interna testare** — noll review, appen i
en iPhone inom timmar efter steg 4–5. Lägg externa senare när du vill
nå bredare.

---

## 6. Icke-interaktiv submit (när allt funkar)

För att slippa interaktiva prompts, skapa en **App Store Connect API-
nyckel** (App Store Connect → Users and Access → Integrations → Keys),
ladda ner `.p8`-filen, och lägg i `eas.json` under `submit`:

```jsonc
"submit": {
  "internal": {
    "android": { ... },           // befintligt
    "ios": {
      "ascApiKeyPath": "./asc-api-key.p8",
      "ascApiKeyId": "<KEY_ID>",
      "ascApiKeyIssuerId": "<ISSUER_ID>",
      "appleTeamId": "<TEAM_ID>"
    }
  },
  "production": {
    "android": { ... },           // befintligt
    "ios": {
      "ascApiKeyPath": "./asc-api-key.p8",
      "ascApiKeyId": "<KEY_ID>",
      "ascApiKeyIssuerId": "<ISSUER_ID>",
      "appleTeamId": "<TEAM_ID>"
    }
  }
}
```

**Gitignore `asc-api-key.p8`** (lägg till i `.gitignore` — samma princip
som `google-service-account.json` / `firebase-admin-key.json`). Den får
ALDRIG committas.

---

## 7. Saker att veta för just denna app

- **App Check Stage 3 (iOS DeviceCheck)** är inte konfigurerad.
  `src/config/firebase.ts` hoppar medvetet över iOS App Check → iOS-
  bygget kör utan App Check först. Helt OK för TestFlight-test;
  konfigurera DeviceCheck-provider innan publik iOS-release om
  Enforce ska gälla iOS.
- **Universal Links** (`apple-app-site-association`) är förberedd på
  webben men inte aktiverad. Kräver `associatedDomains` i app.config
  + verifiering. Kan vänta till efter testfasen — custom-scheme
  `tipspromenaden://` funkar för delade länkar under tiden.
- **Push-notiser**: ej aktuellt än (Evenemang Fas 2 på roadmap är
  lokal-only `expo-notifications`, ingen APNs-setup krävs).
- **Full App Store-review** (publik release) är den strikta, kan-
  avvisa-review:n — den behövs INTE för TestFlight. Ta den när
  testfasen känns klar.

---

## Realistisk tidslinje (från noll)

| Steg | Tid |
|---|---|
| 1. Developer-enrollment | 24–48 h (individuell), väntar på Apple |
| 2. App-record i ASC | ~15 min |
| 4. EAS-credentials + iOS-build | ~30 min setup + ~20 min build |
| 5. Interna testare | minuter efter processning, **ingen review** |
| 5. Externa testare (om aktuellt) | +~1 dygn engångs Beta App Review |

**Nästan all väntetid är Apple-enrollment, inte TestFlight.**

---

## iOS bring-up: lösta byggfel (2026-05-18, 10 försök)

Första iOS-bygget krävde 10 försök. Varje lager dokumenterat här så
nästa Expo-SDK-uppgradering / native-cykel inte återupptäcker dem.
Ändringarna finns i `app.config.js`, `react-native.config.js`,
`plugins/withNonModularHeaders.js`, `package.json`.

| # | Fas | Fel | Fix |
|---|-----|-----|-----|
| 1 | Prebuild | `@react-native-firebase/app` saknade iOS-config | `GoogleService-Info.plist` (committad) + `ios.googleServicesFile` |
| 2 | Prebuild | RNFirebase kräver static frameworks | `expo-build-properties` `ios.useFrameworks: "static"` |
| 3 | Prebuild | `EACCES mkdir .expo/web` (Windows read-only-attribut i upload-tar) | bygg via `npm run build:ios:*` (kör `strip-readonly` först — som Android) |
| 4 | Install pods | `No podspec found for react-native-google-maps` | Ta bort `ios.config.googleMapsApiKey` → iOS kör Apple Maps |
| 5 | Install pods | Podfile-plugin skrev `//`-kommentar (ogiltig Ruby) | Ruby-kommentar `#` |
| 6 | Install pods | `Swift pods cannot be integrated as static libraries` (FirebaseCoreInternal/GoogleUtilities) | `$RNFirebaseAsStaticFramework = true` överst i Podfile (via plugin) |
| 7 | Run fastlane (Xcode) | non-modular header `RNFBApp.*` `-Werror` | `CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES` (via plugin, post_install) |
| 8 | Run fastlane (Xcode) | hela `@react-native-firebase/app-check` ObjC bröts under static frameworks | Exkludera **enbart app-check** på iOS: `react-native.config.js` (pod) + `EAS_BUILD_PLATFORM`-villkor i app.config.js (plugin). app-check är dödkod på iOS (firebase.ts gated på Android). `/app` behålls. |

**Felsökningsteknik:** EAS:s "Unknown error. See logs of the X
phase" är värdelös. Hämta riktiga loggen programmatiskt:
`eas build:view <id> --json` → `logFiles[]` (signerade URL:er, 900 s)
för fas-loggar, `artifacts.xcodeBuildLogsUrl` för Xcode-felen.
`fetch()` + grep på `error:` / `[!]`.

**Princip:** RNFirebase finns bara för Android Play Integrity App
Check. JS `firebase`-SDK:n sköter Firestore/Auth/Storage på båda
plattformar. På iOS ska app-check aldrig länkas. Rör inte den
balansen vid uppgraderingar.
