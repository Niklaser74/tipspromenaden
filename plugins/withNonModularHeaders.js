/**
 * Config-plugin: gör @react-native-firebase byggbart på iOS med
 * `use_frameworks! :linkage => :static` (satt via expo-build-properties).
 *
 * Patchar den genererade Podfile:n (Expo managed → ingen incheckad
 * Podfile) med TVÅ saker:
 *
 * 1. `$RNFirebaseAsStaticFramework = true` överst i Podfile:n.
 *    Officiell RNFirebase-fix för pod install-felet:
 *      [!] The following Swift pods cannot yet be integrated as static
 *      libraries: FirebaseCoreInternal depends upon GoogleUtilities,
 *      which does not define modules.
 *    Globalen måste sättas innan targets/use_frameworks.
 *
 * 2. CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES = YES på alla
 *    Pods-targets, injicerat i det BEFINTLIGA `post_install`-blocket
 *    (CocoaPods tillåter bara ett). Adresserar det EFTERFÖLJANDE Xcode-
 *    felet:
 *      include of non-modular header inside framework module 'RNFBApp.*'
 *      [-Werror,-Wnon-modular-include-in-framework-module]
 *
 * Idempotent (hoppar över om markörerna redan finns). OBS: Podfile är
 * Ruby → kommentarer med '#', inte '//'.
 */
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const TOP_MARKER = "# RNFirebaseAsStaticFramework";
const TOP_SNIPPET = `${TOP_MARKER}\n$RNFirebaseAsStaticFramework = true\n`;

const POST_MARKER = "# withNonModularHeaders";
const POST_SNIPPET = `
    ${POST_MARKER}
    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        c.build_settings['CLANG_ALLOW_NON_MODULAR_INCLUDES_IN_FRAMEWORK_MODULES'] = 'YES'
      end
    end`;

module.exports = function withNonModularHeaders(config) {
  return withDangerousMod(config, [
    "ios",
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfile, "utf8");

      // 1. $RNFirebaseAsStaticFramework högst upp (före allt annat).
      if (!contents.includes(TOP_MARKER)) {
        contents = `${TOP_SNIPPET}${contents}`;
      }

      // 2. CLANG_ALLOW i befintliga post_install-blocket.
      if (!contents.includes(POST_MARKER)) {
        const anchor = /post_install do \|installer\|/;
        if (!anchor.test(contents)) {
          throw new Error(
            "withNonModularHeaders: ingen 'post_install do |installer|' i " +
              "Podfile — Expo-mallen kan ha ändrats, plugin måste uppdateras."
          );
        }
        contents = contents.replace(anchor, (m) => `${m}${POST_SNIPPET}`);
      }

      fs.writeFileSync(podfile, contents);
      return cfg;
    },
  ]);
};
