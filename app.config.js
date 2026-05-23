// Dynamisk Expo-config. Läser hemligheter från process.env så att de inte
// committas i git. I lokal dev kan du sätta variablerna i en .env-fil
// (inte committad), och i EAS Build sätts de via `eas secret:create`.
//
// Variabler som förväntas:
//   GOOGLE_MAPS_API_KEY – Google Maps-nyckel (samma för Android + iOS)

// @react-native-firebase/app-check används bara på Android (Play
// Integrity; src/config/firebase.ts gated på Platform.OS==='android').
// På iOS kompilerar dess Objective-C inte med static frameworks och
// är dessutom död kod. Vi exkluderar därför app-check-PLUGINEN på
// iOS-byggen (podden exkluderas i react-native.config.js). `/app`
// behålls på båda — den byggs korrekt med $RNFirebaseAsStaticFramework.
// EAS sätter EAS_BUILD_PLATFORM per bygge; lokalt (dev) odefinierat →
// behandlas som icke-iOS (ofarligt, plugin no-op:ar på iOS-pod-frånvaro).
const appCheckPlugins =
  process.env.EAS_BUILD_PLATFORM === "ios"
    ? []
    : ["@react-native-firebase/app-check"];

module.exports = () => ({
  expo: {
    name: "tipspromenaden-app",
    slug: "tipspromenaden-app",
    scheme: "tipspromenaden",
    version: "1.9.1",
    // EAS Update (OTA) — appVersion-policy: runtimeVersion = `version`-
    // fältet ovan ("1.0.0"). Både build-servern och `eas update` räknar ut
    // samma värde, vilket ger stabil matchning för OTA-delivery.
    // Fingerprint-policyn drev isär mellan EAS-build-miljön och lokal
    // miljö — updates landade aldrig på installerade builds. Med
    // appVersion: när native-lagret ändras (nytt expo-paket, plugin,
    // permissions) MÅSTE vi manuellt bumpa `version` ovan + bygga ny AAB.
    // JS-only-patchar går som vanligt via `eas update`.
    runtimeVersion: {
      policy: "appVersion",
    },
    updates: {
      url: "https://u.expo.dev/c2f369b6-e07e-401c-a53b-1dc69443e4b7",
      // Vid app-start: vänta upp till 5 s på att ladda ner och aktivera
      // en ny OTA innan vi faller tillbaka på den inbakade bundeln.
      // Default är 0 ms vilket innebär att en nyss-publicerad OTA inte
      // syns förrän användaren startat om appen två gånger (första
      // starten laddar ner i bakgrunden, andra aktiverar). Med 5000
      // får majoriteten med bra nät uppdateringen direkt; dåligt nät
      // betyder upp till 5 s extra startup men appen startar alltid.
      //
      // OBS: detta är en NATIVE-config — kräver ny AAB-build för att
      // träda i kraft. Installerade enheter behåller default tills de
      // installerar en build som har den nya inställningen.
      fallbackToCacheTimeout: 5000,
    },
    // "default" tillåter alla orienteringar på native-nivå. Runtime-koden
    // (App.tsx) låser sedan TELEFONER till portrait via expo-screen-
    // orientation, medan SURFPLATTOR får rotera fritt. Tablet-detektering
    // sker via skärmens kortaste sida (>= 600 dp = surfplatte-kategori
    // enligt Android-konventionen).
    orientation: "default",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      // Samma reverse-DNS som Android-paketet — håller deep links,
      // analytics och Firebase-config konsekventa över plattformar.
      // Måste matcha bundle-ID:t som registreras i App Store Connect.
      bundleIdentifier: "com.tipspromenaden.app",
      // Firebase iOS-config — krävs av @react-native-firebase/app under
      // iOS-prebuild (motsvarar android.googleServicesFile). Hämtas från
      // Firebase Console → iOS-app med bundle com.tipspromenaden.app →
      // ladda ner GoogleService-Info.plist till repo-roten. Inga
      // hemligheter (apiKey/appId/projectId är publika; säkerhet via
      // rules + App Check) — committas medvetet precis som
      // google-services.json, så EAS-cloud-buildern hittar filen.
      googleServicesFile: "./GoogleService-Info.plist",
      supportsTablet: true,
      // buildNumber ägs av EAS (appVersionSource: "remote" +
      // autoIncrement i eas.json) — sätt inte manuellt här.
      //
      // INGEN googleMapsApiKey här med flit: sätts den drar
      // react-native-maps in `react-native-google-maps`-podspec:en →
      // `pod install` failar ("No podspec found for
      // react-native-google-maps"), och Google Maps iOS-SDK:n är
      // dessutom inkompatibel med `useFrameworks: static` som RNFirebase
      // kräver. iOS använder därför Apple Maps (react-native-maps
      // default-provider — alla features funkar: markers, polylines,
      // cirklar, position). Android behåller Google Maps via
      // android.config.googleMaps nedan.
      infoPlist: {
        // Appen använder bara standard-HTTPS/TLS → undantagen från
        // amerikansk export-krypteringsreglering. `false` gör att App
        // Store Connect inte frågar om krypterings-compliance vid varje
        // bygge. Sätt till true bara om egen icke-standard-krypto införs.
        ITSAppUsesNonExemptEncryption: false,
        // iOS kräver explicita användningssträngar för varje behörighet
        // appen begär — annars App Store-reject. Android deklarerar
        // motsvarande via permissions-arrayen nedan.
        NSLocationWhenInUseUsageDescription:
          "Tipspromenaden använder din position för att låsa upp frågor när du kommer fram till en kontrollpunkt.",
        NSCameraUsageDescription:
          "Kameran används för att skanna QR-koder till promenader.",
        NSMotionUsageDescription:
          "Rörelsedata används för att räkna dina steg under en promenad.",
      },
    },
    android: {
      package: "com.tipspromenaden.app",
      // Firebase Android-config — krävs av @react-native-firebase/app
      // för att initiera native Firebase-SDK:n. Filen genereras i
      // Firebase Console → Project Settings → Apps → Android → ladda
      // ner google-services.json. Filen är gitignore:ad — placera i
      // repo-roten innan `eas build`.
      googleServicesFile: "./google-services.json",
      adaptiveIcon: {
        backgroundColor: "#1a5c2e",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      permissions: [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "CAMERA",
        "android.permission.CAMERA",
        // ACTIVITY_RECOGNITION krävs för Pedometer (stegräknare) på
        // Android 10+. På äldre versioner används STEP_COUNTER-sensorn
        // utan extra permission. Vi vill veta hur många steg deltagaren
        // tagit under en aktiv promenad — sparas i Participant.steps.
        "android.permission.ACTIVITY_RECOGNITION",
      ],
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY,
        },
      },
      // Android App Links: när autoVerify=true installeras appen, hämtar
      // Android automatiskt https://tipspromenaden.app/.well-known/assetlinks.json
      // och verifierar att SHA256 i den matchar den signerade APK:n. Vid
      // matchning blir appen DEFAULT-handler för https://tipspromenaden.app/walk/*
      // utan användarval (ingen "Open with…"-dialog). Vid icke-match faller
      // OS:et tillbaka på normal browser-öppning, vilket ger smart-fallback
      // via 404.astro på webbsidan.
      //
      // Den befintliga `scheme: "tipspromenaden"`-konfigen ovan skapar
      // separata intent-filter för custom-scheme-länkar (tipspromenaden://walk/*)
      // — bevaras för bakåtkompat med redan delade länkar.
      intentFilters: [
        {
          action: "VIEW",
          autoVerify: true,
          data: [
            {
              scheme: "https",
              host: "tipspromenaden.app",
              pathPrefix: "/walk/",
            },
          ],
          category: ["BROWSABLE", "DEFAULT"],
        },
      ],
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-web-browser",
      "expo-sharing",
      "expo-localization",
      // iOS: iosUrlScheme = REVERSED_CLIENT_ID ur GoogleService-Info.plist.
      // Registrerar URL-schemat i Info.plist så Google-OAuth-callbacken
      // kan återvända till appen. Utan detta failar iOS-login (Android
      // opåverkat — matchar via paketnamn+SHA-1).
      [
        "@react-native-google-signin/google-signin",
        {
          iosUrlScheme:
            "com.googleusercontent.apps.851934058818-vntp0ne3gitui95nohlgn8v97los155h",
        },
      ],
      "@react-native-community/datetimepicker",
      // Sign in with Apple (iOS). Plugin lägger entitlementet
      // com.apple.developer.applesignin. Krav enligt App Store
      // Guideline 4.8 (appen erbjuder Google-login). Android opåverkat
      // (plugin är no-op där). KRÄVER att Apple-providern aktiveras i
      // Firebase Console (Authentication → Sign-in method → Apple) —
      // se docs/app-store-release.md. EAS lägger till "Sign In with
      // Apple"-capability på App ID:t vid nästa iOS-build.
      "expo-apple-authentication",
      // App Check Stage 2 — Play Integrity-provider (native, Android).
      // RNFirebase används bara för App Check; JS firebase-SDK:n sköter
      // Firestore/Auth/Storage på båda plattformar. Se src/config/firebase.ts.
      "@react-native-firebase/app",
      // app-check: Android-only (tom på iOS-bygge — se appCheckPlugins).
      ...appCheckPlugins,
      // RNFirebase kräver static frameworks på iOS.
      [
        "expo-build-properties",
        {
          ios: {
            useFrameworks: "static",
          },
        },
      ],
      // Podfile-patch: $RNFirebaseAsStaticFramework = true (officiell
      // RNFirebase-fix för "Swift pods cannot be integrated as static
      // libraries" — FirebaseCoreInternal/GoogleUtilities) +
      // CLANG_ALLOW_NON_MODULAR_INCLUDES (efterföljande -Werror).
      // Körs efter expo-build-properties.
      "./plugins/withNonModularHeaders",
    ],
    extra: {
      eas: {
        projectId: "c2f369b6-e07e-401c-a53b-1dc69443e4b7",
      },
      // Release notes som följer med varje JS-bundle. Vid varje `eas update`/
      // `npm run update:all`: uppdatera detta block i samma commit som
      // triggar OTA-publiceringen. När bundeln aktiveras på enheten
      // läser UpdateNotifier denna text och visar en banner en gång per
      // updateId. Max ~4 rader text — håll det användarorienterat.
      // För AAB-uppdateringar styrs notes istället från Firestore-docen
      // `config/appUpdate` (fältet `releaseNotes.sv / .en`).
      releaseNotes: {
        sv: "Ny tumme upp/ner-fråga efter slutförd promenad. Om du svarar tumme ner får du säga vad som inte var bra (frågorna, kontrollernas placering, eller gränssnittet). Skaparen kan se feedbacken och förbättra sin promenad.",
        en: "New thumbs up/down prompt after finishing a walk. Thumbs down opens a follow-up where you can tell us what didn't work (questions, checkpoint placement, or app interface). The creator can read the feedback and improve their walk.",
      },
    },
  },
});
