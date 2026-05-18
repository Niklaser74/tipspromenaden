// Dynamisk Expo-config. Läser hemligheter från process.env så att de inte
// committas i git. I lokal dev kan du sätta variablerna i en .env-fil
// (inte committad), och i EAS Build sätts de via `eas secret:create`.
//
// Variabler som förväntas:
//   GOOGLE_MAPS_API_KEY – Google Maps-nyckel (samma för Android + iOS)

module.exports = () => ({
  expo: {
    name: "tipspromenaden-app",
    slug: "tipspromenaden-app",
    scheme: "tipspromenaden",
    version: "1.8.0",
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
      supportsTablet: true,
      // buildNumber ägs av EAS (appVersionSource: "remote" +
      // autoIncrement i eas.json) — sätt inte manuellt här.
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
      infoPlist: {
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
      "@react-native-google-signin/google-signin",
      "@react-native-community/datetimepicker",
      // App Check Stage 2 — Play Integrity-provider för native.
      // `@react-native-firebase/app` injicerar Firebase-native-SDK:n
      // (kräver `googleServicesFile` nedan) och `app-check`-plugen
      // registrerar Play Integrity. JS SDK:n hämtar tokens via en
      // CustomProvider som bryggar mot native — se src/config/firebase.ts.
      "@react-native-firebase/app",
      "@react-native-firebase/app-check",
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
        sv: "Fix: i biblioteket kunde en fliks text försvinna när man valde den (Android), tills appen startades om. Flikarna renderas nu korrekt.",
        en: "Fix: in the library a tab's text could disappear when selected (Android) until the app was restarted. Tabs now render correctly.",
      },
    },
  },
});
