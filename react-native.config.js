// React Native autolinking-config.
//
// @react-native-firebase/app-check används ENBART på Android (Play
// Integrity). src/config/firebase.ts importerar det dynamiskt först
// inuti `if (Platform.OS === "android")` — på iOS körs den koden
// aldrig. iOS App Check (DeviceCheck/App Attest) är "Stage 3" och inte
// konfigurerat.
//
// På iOS kompilerar app-check:s Objective-C inte med
// `use_frameworks! :linkage => :static` (RNFBAppCheckModule.h kan inte
// importera RCTBridgeModule via RNFBApp-umbrellan → kaskad av
// implicit-int/expected ')'-fel). Eftersom modulen ändå är död kod på
// iOS stänger vi av iOS-autolinking för just den.
//
// `@react-native-firebase/app` BEHÅLLS på iOS — den bygger korrekt med
// $RNFirebaseAsStaticFramework=true och är basberoendet. Bara
// app-check exkluderas, kirurgiskt.
module.exports = {
  dependencies: {
    "@react-native-firebase/app-check": {
      platforms: { ios: null },
    },
  },
};
