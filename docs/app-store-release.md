# iOS App Store — publikt släpp (checklista + förberett material)

Nuläge: 1.9.1 build 21 verifierad på TestFlight (intern) — Apple-login
fungerar. Detta dokument
har allt som behövs för att gå från TestFlight → publik App Store-
release. Mekaniskt material är förberett här; stegen markerade
**[DU]** kräver inloggning i App Store Connect.

Komplement till `docs/ios-setup.md` (bygg/credentials) och
`docs/play-store-listing.md` (Play-metadata, mycket text återanvänds).

---

## ✅ Guideline 4.8 — LÖST & VERIFIERAT via Plan B (Sign in with Apple)

Plan B implementerad 2026-05-19, verifierad på TestFlight 2026-05-20
(1.9.1 build 21) — Apple-login fungerar end-to-end på iPhone. Appen
har nu BÅDE Sign in with Apple, Google-login OCH anonymt deltagarläge.
`auth.ts signInWithApple` + Apples officiella knapp i LoginScreen
(iOS 13+). Apple-provider aktiverad i Firebase Console 2026-05-20.

---

## 1. App Review-anteckningar  **[förberett — klistra in vid submit]**

App Store Connect → version → "App Review Information" → Notes
(engelska, det är granskaren läser):

```
Tipspromenaden is a GPS quiz-walk app (Swedish "tipspromenad").

NO LOGIN REQUIRED TO USE THE APP:
The core experience — scanning/opening a walk and answering questions
at GPS checkpoints — works fully anonymously. Tap "Skanna QR" or open
a shared walk link; no account is needed.

Sign-in is OPTIONAL (only for creators who make/own walks). We offer
Sign in with Apple, Google, AND a no-account anonymous path — so
Guideline 4.8 is fully satisfied.

To review the creator flow, use Sign in with Apple or any Google
account, or test a ready-made walk anonymously from the in-app
library ("Bibliotek" → "Upptäck").

GPS is required to unlock questions at checkpoints — please test
outdoors or with a simulated location near a walk's checkpoints.
Apple Maps is used on iOS.

Contact: support@tipspromenaden.app
```

(Demo-konto behövs inte tack vare anonymt läge — men erbjud ett
Google-test­konto om granskaren ändå frågar.)

### Utökad version som användes vid Guideline 2.1(a) info-needed (2026-05-21)

Vid återinlämning efter rejection där Apple bad om demo-data
(QR-kod, AR-marker) — kompletterad med konkreta simulator-koordinater
och en dedikerad engelsk demo-walk vid Apple Park, Cupertino. Demo-
walken skapades via `scripts/create-review-demo-walk.mjs` (admin SDK,
kringgår appens tap-to-place-flöde för koordinater).

```
Tipspromenaden is a GPS quiz-walk app (Swedish "tipspromenad").

NO LOGIN REQUIRED TO USE THE APP:
The core experience — scanning/opening a walk and answering questions
at GPS checkpoints — works fully anonymously.

Sign-in is OPTIONAL (only for creators who make/own walks). We offer
Sign in with Apple, Google, AND a no-account anonymous path — so
Guideline 4.8 is fully satisfied.

==================================================================
DEMO WALK FOR REVIEW
==================================================================

A dedicated English demo walk has been created at Apple Park, Cupertino
(three quick questions). You can access it three ways:

1. SCAN THE QR CODE (attached to this submission)

2. PASTE THE URL into Safari, then tap "Open in Tipspromenaden":
   https://tipspromenaden.app/walk/<WALK_ID>

3. BROWSE THE LIBRARY (no QR/URL needed):
   Open the app → "Bibliotek" tab → "Upptäck" → search "App Review Demo"

==================================================================
HOW TO TRIGGER QUESTIONS IN SIMULATOR
==================================================================

Questions unlock when GPS is within 15 meters of a checkpoint. In the
iOS Simulator menu, set:

  Features → Location → Custom Location
    Latitude:  37.3348
    Longitude: -122.0089

This places the device at the demo walk's first checkpoint (the main
entrance of Apple Park). After starting the walk, the question modal
will open automatically within a few seconds.

For checkpoints 2 and 3, the app shows the distance to the next
checkpoint at the top of the active walk screen — update the custom
location to:
  Checkpoint 2: 37.33301, -122.00688 (Apple Visitor Center)
  Checkpoint 3: 37.33186, -122.03067 (Infinite Loop)

==================================================================

GPS, Apple Maps and standard HTTPS are the only system-level features
used. No tracking, no third-party analytics, no advertising SDKs.

Contact: support@tipspromenaden.app
```

Bifoga också QR-kodbilden (genererad t.ex. via qr-code-generator.com
från demo-walkens URL) i Attachment-fältet under App Review Notes
i ASC.

### Skapa demo-walk inför nästa info-needed

```
# Behöver du en ny demo-walk (t.ex. annan kontinent eller annat språk):
node scripts/create-review-demo-walk.mjs --from-walk=<någon walk-id du äger>

# Skriptet returnerar nya walkens ID + first-checkpoint-koordinater
# som du klistrar in i Notes-texten ovan.
```

## 2. App Store-listing-metadata  **[förberett]**

| Fält | Värde |
|---|---|
| Namn | Tipspromenaden |
| Underrubrik (30 tecken) | GPS-quizpromenad utomhus |
| Kategori (primär) | Games → Trivia (alt. Entertainment) |
| Kategori (sekundär) | Education |
| Support-URL | https://tipspromenaden.app/stod |
| Marknads-URL | https://tipspromenaden.app |
| Integritetspolicy-URL | https://tipspromenaden.app/integritet |
| Copyright | © 2026 Niklas Eriksson |
| Kontakt | support@tipspromenaden.app |

Beskrivning + keywords: återanvänd "Full beskrivning (svenska/English)"
ur `docs/play-store-listing.md` (redan produktionskorrekt: "finns på
Google Play" → byt till neutralt "gratis" för App Store-versionen, se
not nedan). Keywords (100 tecken, kommaseparerat, ingen blankt efter
komma): `tipspromenad,quiz,gps,promenad,utomhus,familj,frågesport,
karta,barn,event`

> **Not:** App Store-beskrivningen bör inte säga "finns på Google
> Play". Använd samma feature-text men byt sista raden till
> "Gratis." / "Free." En iOS-specifik beskrivnings-variant ligger
> sist i detta dokument.

## 3. App Privacy ("nutrition label")  **[DU fyller i ASC — svar förberedda]**

Baserat på `docs/privacy-policy.md`. App Store Connect → App Privacy.
Appen spårar INTE användare över appar/sajter → "Data Not Used to
Track You". Inga annonser, ingen tredjeparts-analytics.

| Datatyp | Samlas? | Syfte | Kopplad till identitet? |
|---|---|---|---|
| Precise Location | Ja | App Functionality (lås upp frågor vid checkpoint) | Ja (kopplad till deltagar-UID) |
| Email Address | Ja (endast Google-login) | App Functionality (ägarskap av promenader) | Ja |
| Name | Ja (Google display-namn / självvalt smeknamn) | App Functionality (topplista) | Ja |
| User ID | Ja (Firebase anonymt/Google UID) | App Functionality | Ja |
| User Content (svar, skapade promenader) | Ja | App Functionality | Ja |
| Fitness (stegantal) | Ja, valfritt (behörighet) | App Functionality (visa steg i resultat) | Ja |
| Diagnostics/Analytics | **Nej** | — | — |
| Identifiers for tracking / Ads | **Nej** | — | — |

Tredjelandsöverföring (Firebase/USA, SCC) hanteras i
integritetspolicyn — App Privacy-labeln frågar inte om det.

## 4. Screenshots  **[DU — kräver enhet/simulator]**

Apple kräver iPhone-screenshots i **6.9"** (1320×2868 el. 2868×1320)
**och** 6.5" (1242×2688). iPad valfritt (appen stödjer surfplatta —
nice-to-have). Play-screenshotsen har fel dimensioner — ta nya via
iOS-simulator eller din iPhone. Förslag på 5 vyer: Hem, Aktiv
promenad (karta+fråga), Resultat/konfetti, Bibliotek, Skapa-promenad.

## 5. Övrigt före submit

- Export compliance: ✅ klart (`ITSAppUsesNonExemptEncryption: false`).
- Age rating-formulär: inget olämpligt → 4+ (samma som Play 3+).
- Bygg: build 12 räcker, eller bygg nytt (`npm run build:ios:production`
  + `npm run submit:ios:production` — production-profil för App Store).
- **iOS App Check Stage 3 (DeviceCheck)** och **Universal Links** är
  INTE blockerare — skjuts till efter launch (ROADMAP).

## 6. Submit-flöde  **[DU]**

1. ASC → din app → (+) Version eller använd 1.8.0
2. Fyll metadata (§2), App Privacy (§3), ladda upp screenshots (§4)
3. Välj build (12 eller nyare), fyll App Review Notes (§1)
4. Submit for Review. Första review: **1–3 dygn, kan neka.**
5. Vid godkänt: släpp manuellt eller phased release (7 dagar).
6. 4.8 är redan löst (Sign in with Apple finns) — ingen Plan B kvar.
   Glöm INTE: aktivera Apple-providern i Firebase Console först (se
   4.8-sektionen överst), annars failar Apple-login i review.

## 7. iOS App Store-beskrivning (sv) — färdig att klistra

```
Tipspromenaden gör den klassiska folkrörelseklassikern digital.

📍 GPS-styrda kontroller
Gå till en plats — appen öppnar frågan automatiskt när du är framme.

❓ Quizfrågor längs vägen
Flervalsfrågor vid varje kontroll. Läs själv eller låt appen läsa upp.

🏆 Topplista i realtid
Se hur du ligger till mot andra som gör samma promenad.

🗺️ Skapa egna promenader
Bygg med egna frågor och kontroller, dela med QR-kod.

📚 Bibliotek
Hitta publika promenader nära dig, filtrera på kategori och språk.

📴 Fungerar offline
Svaren sparas lokalt och synkas när du är online igen.

🚲 Cykelläge · 👣 Stegräkning · 🌍 8 språk

Inget konto krävs för att delta — gratis.
```

(Engelsk variant: spegla "Full beskrivning (English)" i
`play-store-listing.md`, byt sista raden till "No account needed to
play — free.")
