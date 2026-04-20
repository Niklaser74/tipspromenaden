// Expo config plugin som placerar Google Play Console-verifierings-token
// (adi-registration.properties) i Android-APK:ns assets-mapp.
//
// Används för att registrera paketnamn com.tipspromenaden.app mot vårt
// utvecklarkonto. När verifieringen är klar kan pluginen tas bort.
//
// Se: https://github.com/android/security-samples/tree/main/AndroidDeveloperVerificationAPKSigningExample

const { withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withAdiRegistration(config, { token }) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const assetsDir = path.join(
        config.modRequest.platformProjectRoot,
        "app",
        "src",
        "main",
        "assets"
      );
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(
        path.join(assetsDir, "adi-registration.properties"),
        token
      );
      return config;
    },
  ]);
};
