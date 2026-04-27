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
    version: "1.2.0",
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
      supportsTablet: true,
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
    },
    android: {
      package: "com.tipspromenaden.app",
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
    ],
    extra: {
      eas: {
        projectId: "c2f369b6-e07e-401c-a53b-1dc69443e4b7",
      },
    },
  },
});
