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
- **Webbplats:** https://tipspromenaden.app
- **Integritetspolicy-URL:** https://tipspromenaden.app/integritet
- **Användarvillkor-URL:** https://tipspromenaden.app/villkor (klistra in i Play Console-fältet "Terms of Service")

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

### OTA 2026-05-04 — Standard-karta tillbaka till Apple/Google + kompaktare Skapa-vy

**Svenska (sv-SE):**
```
OTA till runtime 1.4.0:
• "Karta"-vyn använder nu Apple/Google Maps igen — OpenStreetMap blockade vissa tiles. Terräng-vyn behåller OpenTopoMap där stigarna syns bra.
• Skapa-promenad: aktivitetstyp, event och publicera är nu samlade under en kollapsbar "⚙️ Inställningar"-rad. Frigör mer kartyta så du ser var du sätter dina kontroller.
```

**English (en-US):**
```
OTA to runtime 1.4.0:
• The "Map" view is back to Apple/Google Maps — OpenStreetMap was blocking some tiles. The Terrain view keeps OpenTopoMap where trails show up nicely.
• Create-walk view: activity type, event and publish are now grouped under a collapsible "⚙️ Settings" row. Frees up more map space so you can see where you're placing your controls.
```

---

### OTA 2026-05-03 (natt II) — Fix: spara-knapp utanför skärmen i Skapa-vyn

**Svenska (sv-SE):**
```
OTA till runtime 1.4.0:
• Buggfix: när man slog på event + publicera samtidigt i Skapa-vyn hamnade spara-knappen utanför skärmen och gick inte att nå. Bottenpanelen är nu scrollbar med max 60 % av höjden.
```

**English (en-US):**
```
OTA to runtime 1.4.0:
• Bug fix: when both event and publish toggles were on in the Create view, the save button ended up below the screen edge and was unreachable. The bottom panel is now scrollable with a max height of 60%.
```

---

### OTA 2026-05-03 (natt) — OSM-tiles på native = stigar i appen

**Svenska (sv-SE):**
```
OTA till runtime 1.4.0:
• Karta i appen visar nu samma stigar som webbsidan! Vi byter från Google/Apple Maps till OpenStreetMap-tiles ("standard") och OpenTopoMap ("terräng") på native — bra för cykel- och vandringsrutter där små stigar är viktiga.
• Hybrid (satellit) är oförändrad.
```

**English (en-US):**
```
OTA to runtime 1.4.0:
• The map in the app now shows the same trails as the website! We switched from Google/Apple Maps to OpenStreetMap tiles ("standard") and OpenTopoMap ("terrain") on native — great for cycling and hiking routes where small trails matter.
• Hybrid (satellite) view is unchanged.
```

---

### OTA 2026-05-03 (sen kväll) — Cykelläge

**Svenska (sv-SE):**
```
OTA till runtime 1.4.0:
• Nytt cykelläge när du skapar en promenad! Välj "🚲 Cykel" i Skapa-vyn så får promenaden 50 m trigger-zon (istället för 15 m), bredare kartzoom och en förvarning ~100 m innan kontrollen så du hinner stanna.
• Rutt-linje på kartan visar nu ordningen mellan kontrollpunkterna under promenaden — gäller både gång och cykel.
• 🚲-badge på cykel-promenader i listor och bibliotek.
```

**English (en-US):**
```
OTA to runtime 1.4.0:
• New bike mode when creating a walk! Pick "🚲 Bike" in the Create view and the walk gets a 50 m trigger zone (vs 15 m), wider map zoom, and a heads-up vibration ~100 m before each checkpoint so you can slow down in time.
• Route line on the map now shows the order between checkpoints during the walk — for both walking and biking.
• 🚲 badge on bike walks in lists and library.
```

---

### OTA 2026-05-03 (kväll) — Hjälpsida + länkar till hemsidan

**Svenska (sv-SE):**
```
OTA till runtime 1.4.0:
• Ny "Så funkar det"-guide på tipspromenaden.app/sa-funkar-det med instruktioner för både deltagare och skapare (på svenska + engelska).
• Inställningar → Om appen har nu länkar till hemsidan, hjälpguiden och webb-skaparen — så du lätt hittar resurserna utanför appen.
```

**English (en-US):**
```
OTA to runtime 1.4.0:
• New "How it works" guide at tipspromenaden.app/sa-funkar-det with instructions for both participants and creators (in Swedish + English).
• Settings → About now has links to the website, the help guide and the web-based walk creator — so you can easily find resources outside the app.
```

---

### OTA 2026-05-03 — App nu på 8 språk

**Svenska (sv-SE):**
```
OTA till runtime 1.4.0:
• Appen är nu översatt till alla 8 språk vi stödjer för frågor: svenska, engelska, tyska, norsk, dansk, finska, franska och spanska.
• Välj språk under Inställningar → Språk, eller låt appen följa systemspråket.
• Översättningarna är AI-genererade — hör av dig om något låter konstigt på ditt språk!
```

**English (en-US):**
```
OTA to runtime 1.4.0:
• The app is now translated into all 8 languages we support for questions: Swedish, English, German, Norwegian, Danish, Finnish, French and Spanish.
• Pick your language under Settings → Language, or let the app follow your system language.
• Translations are AI-generated — let us know if anything sounds off in your language!
```

---

### OTA 2026-04-30 (sen kväll II) — "Nära mig"-sortering

**Svenska (sv-SE):**
```
OTA till runtime 1.4.0:
• Ny "📍 Nära mig"-knapp på Promenader-fliken i biblioteket. Slå på så sorteras listan med närmast walk först + avstånd visas på varje kort.
• Kräver platsåtkomst första gången (frågar via systemets standardpopup).
```

**English (en-US):**
```
OTA to runtime 1.4.0:
• New "📍 Near me" button on the Walks tab in the library. Toggle on to sort by nearest walk first + show distance on each card.
• Requires location access on first use (asked via system standard popup).
```

---

### OTA 2026-04-30 (sen kväll) — Publika promenader i biblioteket

**Svenska (sv-SE):**
```
OTA till runtime 1.4.0:
• Bibliotek-fliken har nu en flik för "Promenader" — bläddra publika tipspromenader som andra användare delat och spela dem direkt.
• Publicera dina egna: i CreateWalk hittar du "Publicera till bibliotek"-toggle. Ange stad och kategori så blir den lättare att hitta.
• Filtrera på kategori (Natur/Stad/Historia/Barn/Cykel/Mat/Kultur/Annat) eller sök fritext.
```

**English (en-US):**
```
OTA to runtime 1.4.0:
• The library now has a "Walks" tab — browse public quiz walks shared by other users and play them directly.
• Publish your own: in CreateWalk you'll find a "Publish to library" toggle. Add a city and category to make it discoverable.
• Filter by category (Nature/City/History/Kids/Cycling/Food/Culture/Other) or search free-text.
```

---

### OTA 2026-04-30 (kväll) — Bibliotek i appen

**Svenska (sv-SE):**
```
OTA till runtime 1.4.0:
• Ny "Hitta frågor"-knapp på startsidan öppnar ett bibliotek med färdiga frågebatterier — både kuraterade och uppladdade av andra användare.
• Sök på titel, beskrivning eller författare. Filtrera på språk.
• Frågorna är dolda by default — tryck "Förhandsgranska" för att se dem, "Använd" för att starta en ny promenad med batteriet.
```

**English (en-US):**
```
OTA to runtime 1.4.0:
• New "Find questions" button on the home screen opens a library of ready-made question packs — both curated and uploaded by other users.
• Search by title, description or author. Filter by language.
• Questions are hidden by default — tap "Preview" to see them, "Use" to start a new walk with the pack.
```

---

### OTA 2026-04-30 (sen kväll) — Vibration vid frågezon + skärm vaken

**Svenska (sv-SE):**
```
OTA till runtime 1.4.0:
• Telefonen vibrerar med en distinkt 3-pulsig signal när du kommer in i en frågans område — slipper gå förbi när mobilen är i fickan eller man pratar med någon.
• Skärmen håller sig vaken under hela aktiva promenaden så GPS-spårning och vibration fungerar tillförlitligt. Wake-locket släpps automatiskt när du navigerar bort eller stänger appen.
```

**English (en-US):**
```
OTA to runtime 1.4.0:
• The phone vibrates with a distinct 3-pulse signal when you enter a question's range — no more walking past when the phone is in your pocket or you're chatting.
• Screen stays awake during the active walk so GPS tracking and vibration work reliably. Wake-lock releases automatically when you navigate away or close the app.
```

---

### OTA 2026-04-30 (kväll) — TTS muted som default

**Svenska (sv-SE):**
```
OTA till runtime 1.4.0: text-to-speech läser inte längre upp frågor
automatiskt vid första visning. Default är nu tyst — slå på via
headset-knappen (🔇 → 🎧) i frågemodalen.
```

**English (en-US):**
```
OTA to runtime 1.4.0: text-to-speech no longer reads questions aloud
automatically when first shown. Default is now silent — turn on via
the headset button (🔇 → 🎧) in the question modal.
```

---

### OTA 2026-04-30 (eftermiddag) — Fix: radera redan-raderad walk

**Svenska (sv-SE) — endast EAS Update-loggen:**
```
OTA till runtime 1.4.0: deleteWalkCompletely kollar nu med getDoc om
walk-doc:et fortfarande finns innan deleteDoc anropas. Tidigare gav
permission-denied när walken redan raderats via webben (firestore.rules
kan inte verifiera ownership när resource är null). Användare kan nu
rensa lokala "spöken" av walks som finns kvar i AsyncStorage efter att
de raderats någon annanstans.
```

---

### OTA 2026-04-30 — Användar-uppladdade pack i deep-link

**Svenska (sv-SE) — endast EAS Update-loggen, går inte till Play Console:**
```
OTA till runtime 1.4.0: tipspromenaden://tipspack/<slug> fungerar nu
även för användar-uppladdade tipspacks. Provar curated-fil först,
faller tillbaka på Firestore + Firebase Storage.
```

---

### v1.4.0 — Snabb-import av frågebatterier (april 2026)

**Svenska (sv-SE):**
```
• Färdiga frågebatterier öppnas nu direkt i appen från tipspromenaden.app/tipspack — klicka "Öppna i appen" på paketet, så hoppar du rakt in i karta-läget med alla frågor förladdade.
• Tidigare behövde du ladda ner filen och importera manuellt — det går fortfarande att göra, men nu är det ett klick istället för fyra.
• Mindre fixar.
```

**English (en-US):**
```
• Question packs now open directly in the app from tipspromenaden.app/tipspack — tap "Open in app" on a pack and you'll jump straight into placement mode with all questions preloaded.
• Previously you had to download the file and import manually — that still works, but now it's one tap instead of four.
• Minor fixes.
```

---

### v1.3.0 — Klickbara delningslänkar (april 2026)

**Svenska (sv-SE):**
```
• Delningslänkar är nu klickbara i Messenger, SMS och iMessage. Tidigare visade de bara som vanlig text — nu får mottagaren en snygg förhandsvisning med titel och bild.
• När appen är installerad öppnas promenaden direkt utan omväg via webbläsaren (Android App Links).
• Renare delningstext: bara titeln och en länk istället för fyra olika fält.
• Mindre fixar för bilduppladdning på frågor.
```

**English (en-US):**
```
• Share links are now clickable in Messenger, SMS, and iMessage. Previously they appeared as plain text — now recipients see a clean preview with title and image.
• When the app is installed, walks open directly without going through the browser first (Android App Links).
• Cleaner share message: just the title and a link, no four-line fallback.
• Minor fixes to question-image uploads.
```

---

### OTA 2026-04-29 — Klickbara länkar för v1.2.0

**Svenska (sv-SE) — endast för EAS Update-loggen, går inte till Play Console:**
```
OTA till runtime 1.2.0: förenklat share-meddelande (titel + en https-länk
istället för fyra rader fallback) + buildWalkLink genererar https-länkar
mot tipspromenaden.app/walk/<id>. Ger v1.2.0-testare klickbara länkar i
Messenger redan innan de uppdaterar till 1.3.0-AAB. Web-fallback öppnar
appen via custom-scheme för 1.2.0-installationer.
```

---

### v1.2.0 — Stegräkning (april 2026)

**Svenska (sv-SE):**
```
• Stegräknare: appen räknar nu hur många steg du tar under en promenad och visar det i resultaten och topplistan.
• Som skapare ser du även snittsteg per klar deltagare i statistikvyn.
• Kräver behörigheten "Fysisk aktivitet" första gången du startar en promenad.
```

**English (en-US):**
```
• Step counter: the app now tracks how many steps you take during a walk and shows it on the results and leaderboard.
• Creators also see average steps per finisher in the insights view.
• Requires the "Physical activity" permission the first time you start a walk.
```

---

### v1.1.0 — Surfplatte-läge (april 2026)

**Svenska (sv-SE):**
```
• Surfplattor stödjer nu landscape-läge — perfekt för att skapa promenader på en större skärm.
• Telefoner är fortfarande låsta till porträtt eftersom layouterna är optimerade för det.
```

**English (en-US):**
```
• Tablets now support landscape mode — perfect for creating walks on a larger screen.
• Phones remain locked to portrait since the layouts are tuned for that orientation.
```

---

### Walk insights, autospar, auth-persist, save-fix (april 2026)

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

**Användargenererat innehåll delat publikt: JA** — sedan v1.4.0 har biblioteket
en publik flik med användar-uppladdade tipspack och promenader användare opt-in:at
publicera. Moderationsmekanism: rapport-knapp på varje publik post i biblioteket
mejlar tipspromenaden.app@gmail.com. Användarvillkoren ger oss rätt att utan
förvarning ta bort innehåll som bryter mot reglerna.

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
