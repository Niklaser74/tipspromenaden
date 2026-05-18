/**
 * Config-plugin: tillåt non-modular includes i framework-moduler.
 *
 * @react-native-firebase + `use_frameworks! :linkage => :static`
 * (krävs av RNFirebase, satt via expo-build-properties) ger Xcode-
 * fel:
 *   include of non-modular header inside framework module
 *   'RNFBApp.*': React-Core/React/RCTConvert.h
 *   [-Werror,-Wnon-modular-include-in-framework-module]
 *
 * `-Werror` gör varningen fatal. Fixen är att sätta
 * CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES på alla
 * Pods-targets. Expo managed-projekt har ingen incheckad Podfile, så
 * vi patchar den genererade Podfile:n efter prebuild och injicerar en
 * loop i den BEFINTLIGA `post_install`-blocket (CocoaPods tillåter
 * bara ett post_install — vi får inte lägga till ett andra).
 *
 * Robust nog: Expo:s Podfile-mall för en given SDK har en stabil
 * `post_install do |installer|`-rad. Vi infogar direkt efter den och
 * är idempotenta (hoppar över om patchen redan finns).
 */
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

// OBS: Podfile är Ruby → kommentar med '#', inte '//'.
const MARKER = "# withNonModularHeaders";
const SNIPPET = `
    ${MARKER}
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        c.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
    end`;

module.exports = function withNonModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfile = path.join(
        cfg.modRequest.platformProjectRoot,
        "Podfile"
      );
      let contents = fs.readFileSync(podfile, "utf8");

      if (contents.includes(MARKER)) return cfg; // idempotent

      const anchor = /post_install do \|installer\|/;
      if (!anchor.test(contents)) {
        throw new Error(
          "withNonModularHeaders: hittade ingen 'post_install do |installer|' " +
            "i Podfile — Expo-mallen kan ha ändrats, plugin behöver uppdateras."
        );
      }
      contents = contents.replace(
        anchor,
        (m) => `${m}${SNIPPET}`
      );
      fs.writeFileSync(podfile, contents);
      return cfg;
    },
  ]);
};
