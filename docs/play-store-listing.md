# Google Play Store-listing

Utkast till metadata för Play Console. Kopiera in i respektive fält.
Appen är tvåspråkig — lägg båda språken i Play Console (svenska som standard,
engelska som "English (United States)").

---

## Grundinfo

- **App-namn:** Tipspromenaden
- **Kort beskrivning (80 tecken):** Digital tipspromenad med GPS, frågor och topplista — skapa eller delta.
- **Kategori:** Underhållning (alt. Utbildning, Spel → Trivia)
- **Taggar:** tipspromenad, quiz, GPS, utomhus, familj, friskvård
- **Kontakt-e-post:** tipspromenaden.app@gmail.com
- **Webbplats:** https://tipspromenaden.se (när den finns — annars GitHub-repo eller hoppa över)
- **Integritetspolicy-URL:** https://niklaser74.github.io/tipspromenaden/privacy-policy

---

## Full beskrivning (svenska)

```
Tipspromenaden gör den klassiska folkrörelseklassikern digital.

📍 GPS-styrda kontroller
Gå till en plats — appen kollar din position och öppnar frågan
automatiskt när du är framme. Ingen manuell scanning, inga papperslappar.

❓ Quizfrågor längs vägen
Varje kontroll har en fråga med flera svarsalternativ. Läs eller låt
appen läsa upp frågan för dig medan du går.

🏆 Topplista i realtid
Se hur du ligger till mot andra som gör samma promenad. Barnen älskar
att tävla om bästa tiden kombinerat med flest rätt.

🗺️ Skapa dina egna promenader
Bygg en tipspromenad med egna frågor och kontroller i kartan. Dela med
en QR-kod — andra scannar och kan delta direkt.

📦 Färdiga frågebatterier
Importera professionellt producerade frågeset via .tipspack-filer
(t.ex. naturkunskap, svensk historia, barnfrågor).

✨ Designad för utomhusbruk
Stora knappar, hög kontrast, fungerar utan hörlurar. Svenska och
engelska röstuppläsning. Helt gratis under testperioden.

Perfekt för:
• Familjeutflykten
• Barnkalaset
• Klassresan
• Friskvårdsdagen på jobbet
• Scoutmötet
• Slumpmässiga söndagspromenader
```

## Full beskrivning (English)

```
Tipspromenaden brings the classic Swedish walking-quiz tradition into the
smartphone age.

📍 GPS-triggered checkpoints
Walk to a location — the app detects your position and opens the question
automatically when you arrive. No manual scanning, no paper slips.

❓ Quiz questions along the way
Each checkpoint has a multiple-choice question. Read it yourself or let
the app read it aloud while you keep walking.

🏆 Live leaderboard
See how you stack up against everyone else doing the same walk. Kids love
racing for the best combination of time and correct answers.

🗺️ Create your own walks
Build a quiz walk with your own questions and checkpoints on the map.
Share with a QR code — others scan and join instantly.

📦 Ready-made question packs
Import professionally produced question sets via .tipspack files
(nature, Swedish history, kids' trivia, and more).

✨ Built for the outdoors
Large buttons, high contrast, works without headphones. Voice-over in
Swedish and English. Free during the testing period.

Perfect for:
• Family outings
• Birthday parties
• School trips
• Corporate wellness days
• Scout meetings
• Random Sunday walks
```

---

## "What's new"-texter per release

Konvention: vid varje meningsfull release (AAB-build eller större OTA-push)
skriver vi en kort förändringstext på **både svenska och engelska**, max
500 tecken per språk (Play-gränsen). Klistras in i Play Console under
respektive release ("What's new in this version" per språk).

Hålls i omvänd kronologisk ordning. Senaste överst.

---

### Senaste — Walk insights, autospar, auth-persist, save-fix (april 2026)

**Svenska (sv-SE):**
```
• Skapare ser nu statistik per promenad: deltagare, snittpoäng och svarsfördelning per fråga.
• Autospar: dina pågående promenader sparas medan du skriver — slipp tappa jobb om appen stängs.
• Du behöver inte logga in om vid varje omstart längre.
• Tangentbordet täcker inte längre svarstextrutan.
• Fixad sparbugg som drabbade vissa promenader.
```

**English (en-US):**
```
• Creators now see stats per walk: participants, average score and answer distribution per question.
• Autosave: your in-progress walk drafts persist as you edit — no more losing work if the app closes.
• You no longer need to sign in again after every restart.
• Keyboard no longer covers the answer text field.
• Fixed a save bug that affected some walks.
```

---

## Grafik — krav och förslag

| Asset | Krav | Status / förslag |
|-------|------|------------------|
| App-ikon | 512×512 PNG, 32-bit | Använd `assets/icon.png` (uppskala om < 512) |
| Feature-grafik | 1024×500 PNG/JPG | Skapa: grön bakgrund (#1a5c2e), app-namn + skärmdump av quiz-vyn |
| Screenshots telefon | Minst 2, max 8, 16:9 eller 9:16, 320–3840 px | Ta från byggd APK: (1) startsidan, (2) kartan i CreateWalk, (3) ActiveWalk med fråga, (4) Leaderboard |
| Screenshots surfplatta (valfritt) | Samma krav, 7"/10" | Hoppa över för V1 |
| Promo-video (valfritt) | YouTube-länk | Hoppa över för V1 |

---

## Content rating-svar

Inget av nedanstående förekommer i appen — alla svar: **Nej**.

- Våld
- Sexuellt innehåll
- Svordomar
- Kontrollerade substanser
- Gambling / hasardspel
- Skräckinnehåll
- Användargenererat innehåll delat publikt (quiz-frågor delas via QR, inte publik feed)

Platsdata (GPS) ska markeras: **används endast under pågående promenad, sparas inte på server**.

Förväntat betyg: **3+ / Alla åldrar (PEGI 3 / ESRB Everyone)**

---

## Data-säkerhetsformulär

Play kräver detaljerat formulär om datainsamling. Svar för Tipspromenaden:

| Datatyp | Samlas in? | Delas? | Syfte | Valbart? |
|---------|-----------|--------|-------|----------|
| Platsinfo (precis) | Ja | Nej | App-funktionalitet (hitta kontroller) | Obligatoriskt för användning |
| Användar-ID (Firebase UID) | Ja | Nej | App-funktionalitet, analys | Obligatoriskt |
| Namn (valt smeknamn) | Ja | Nej | App-funktionalitet (visas i topplista) | Obligatoriskt |
| E-post | Endast om användaren loggar in med Google | Nej | Kontoinloggning | Valfritt |
| Användning / interaktioner | Nej (ingen analytics-pixel) | — | — | — |
| Krascher / diagnostik | Nej (kan läggas till senare med Expo crashlytics) | — | — | — |

**Säkerhet:** Data krypteras i transit (HTTPS/TLS via Firebase). Användare kan
begära radering via support-e-post.

---

## Testare — intern testning

Lägg till testarnas Google-konton (samma som används i Family Link):

- [barn 1]@gmail.com
- [barn 2]@gmail.com
- [barn 3]@gmail.com
- [din egen som fallback]

Opt-in-URL skapas av Play Console när testspåret är aktivt.
Skicka URL:en till testarna — de öppnar den i telefonens webbläsare medan
de är inloggade med rätt Google-konto, accepterar testningen, och
appen dyker upp i deras Play Store.

Föräldern godkänner installationen **en gång** i Family Link.
Efter det kommer uppdateringar automatiskt.
