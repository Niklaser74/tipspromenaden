// React Native autolinking-config.
//
// @react-native-firebase/app + app-check finns ENBART för att brygga
// native Play Integrity (App Check) på Android — se src/config/firebase.ts
// där init:en är gated bakom `Platform.OS === "android"`. iOS använder
// vanliga JS firebase-SDK:n (firestore/auth/storage) och importerar
// aldrig @react-native-firebase i runtime.
//
// På iOS orsakade RNFirebase + `use_frameworks! :linkage => :static`
// en kaskad av Xcode-fel (non-modular headers, RCTBridgeModule-modul-
// import, implicit-int) utan att tillföra någon funktion. Vi stänger
// därför av iOS-autolinking för dessa pods helt. App Check förblir
// Android-only precis som koden redan förutsätter.
module.exports = {
  dependencies: {
    "@react-native-firebase/app": {
      platforms: { ios: null },
    },
    "@react-native-firebase/app-check": {
      platforms: { ios: null },
    },
  },
};
