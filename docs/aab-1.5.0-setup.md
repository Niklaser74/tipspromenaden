# AAB 1.5.0 — Setup-guide

Bygg-cykel för version `1.5.0`. Två native-features aktiveras i den här
AAB:n: **App Check Stage 2** (Play Integrity) och **Android App Links**
(verifierad `https://tipspromenaden.app/walk/*`-handling).

iOS-bygge är **inte** med — separat beslut, separat AAB-cykel om/när
Apple Developer Program aktiveras.

---

## Innan `eas build`

### 1. Hämta `google-services.json` från Firebase Console

Krävs av `@react-native-firebase/app` för att initiera native Firebase-SDK:n
(används för Play Integrity-token-fetchen).

1. Öppna https://console.firebase.google.com/project/tipspromenaden-491207/settings/general
2. Under **Your apps** → välj Android-appen `com.tipspromenaden.app`
3. Klicka **google-services.json** → ladda ner
4. Placera filen i app-roten: `C:\dev\tipspromenaden-app\google-services.json`
5. **Inte committas** — den ligger i `.gitignore`. Backup på säker plats om du
   vill slippa ladda ner igen.

### 2. Aktivera Play Integrity API i Google Cloud Console

1. Öppna https://console.cloud.google.com/apis/library/playintegrity.googleapis.com?project=tipspromenaden-491207
2. Klicka **Enable**
3. Vänta ~1 min tills aktiveringen propagerar

### 3. Registrera Play Integrity-providern i Firebase Console

1. Öppna https://console.firebase.google.com/project/tipspromenaden-491207/appcheck/apps
2. Hitta Android-appen i listan → klicka pennan / **Manage**
3. Välj provider **Play Integrity**
4. Klicka **Save**
5. Bekräfta att providern står som **Active** med status **Monitoring**
   (Enforce slås på senare när vi sett att tokens kommer fram)

### 4. (Endast första gången) Lägg till Play Integrity-tokens i `assetlinks.json`

Den här filen ligger redan på `tipspromenaden.app/.well-known/assetlinks.json`
med två SHA-256-fingerprints — verifiera att båda är aktuella:

- En för **upload-keystore** (din lokala signing-keystore)
- En för **Play App Signing-keystore** (Google Plays signering)

Hämta båda via:
```bash
cd C:/dev/tipspromenaden-app
eas credentials --platform android
```

Välj `production` → **Push Notifications** är inte relevant; titta efter
**App Signing Key** + **Upload Key**. Båda visar SHA-256-fingerprint.

Jämför mot `tipspromenaden-web/public/.well-known/assetlinks.json`. Om
någon saknas, addera + redeploya webben.

---

## Build + submit

```bash
cd C:/dev/tipspromenaden-app
eas build -p android --profile internal
# Vänta ~15-20 min
eas submit -p android --latest
```

`autoIncrement: true` på `internal`-profilen → versionCode rullas
automatiskt. `version` i `app.config.js` är redan bumpad till `1.5.0`.

---

## Efter installation på testpilot-enhet

### Verifiera App Check

1. Öppna appen, logga in
2. Öppna https://console.firebase.google.com/project/tipspromenaden-491207/appcheck/products
3. Under **Cloud Firestore** → fliken **Metrics** ska du se requests
   uppdelat på "verified" vs "unverified". Native-trafik från den nya
   AAB:n ska visa som **verified**. (Webb-trafik från Stage 1 dito.)

Om allt ser rent ut i monitor mode i 1-2 veckor — flippa till **Enforce**
i Firebase Console under **Cloud Firestore** + **Cloud Storage**.

### Verifiera Android App Links

1. Skicka en `https://tipspromenaden.app/walk/<id>`-länk till testpilots
   telefon (t.ex. via SMS från en annan enhet)
2. Tryck på länken
3. **Förväntat:** appen öppnas direkt utan "Öppna med..."-dialog
4. **Inte förväntat:** browser öppnas med fallback-sidan — då har
   verifieringen failat. Kolla:
   ```
   adb shell pm get-app-links com.tipspromenaden.app
   ```
   ska visa `verified` på `tipspromenaden.app`.

---

## Rollback om något knasar

App Check är icke-fatal — `try/catch` i `src/config/firebase.ts` gör att
appen fungerar oförändrat även om Play Integrity-tokens failar.

Om en värre regression dyker upp efter installation:
1. OTA-updaten kan inte rulla bakåt en native-ändring
2. Bygg en **emergency AAB** med `version: "1.5.1"` där App Check-init
   är wrappad bakom en `false`-flagga
3. Submit:a som hotfix till internal track

---

## Klart-checklista

- [ ] `google-services.json` på plats lokalt
- [ ] Play Integrity API enabled i GCP
- [ ] Play Integrity-provider registrerad i Firebase Console
- [ ] `assetlinks.json` på webben innehåller båda SHA-256:erna
- [ ] `eas build -p android --profile internal` → körd, klar
- [ ] `eas submit -p android --latest` → submitad till Play Console
- [ ] Release notes klistrad in i Play Console "What's new"
- [ ] Verifierad på minst en testpilot-enhet
