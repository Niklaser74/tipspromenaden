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
    version: "1.0.0",
    // EAS Update (OTA) — fingerprint-policy: EAS hashar native-lagret och
    // serverar bara updates till binaries med samma fingerprint. Fel-säkrare
    // än "appVersion" eftersom JS-only-patchar automatiskt undviker gamla
    // byggen om vi lägger till/ändrar en native-modul.
    runtimeVersion: {
      policy: "fingerprint",
    },
    updates: {
      url: "https://u.expo.dev/c2f369b6-e07e-401c-a53b-1dc69443e4b7",
    },
    orientation: "portrait",
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
      // TEMP: för Play Console-paketnamnsregistrering. Tas bort efter att
      // verifieringen gått igenom — filen behövs bara i verifierings-APK:n.
      [
        "./plugins/withAdiRegistration",
        { token: "DSV2RH2REXKS6AAAAAAAAAAAA" },
      ],
    ],
    extra: {
      eas: {
        projectId: "c2f369b6-e07e-401c-a53b-1dc69443e4b7",
      },
    },
  },
});
