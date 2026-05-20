# Tipspromenaden — Produktstrategi & Roadmap

> Senast uppdaterad: 2026-05-20 — **Sign in with Apple verifierad på
> TestFlight** (1.9.1 build 21; Apple-login fungerar end-to-end →
> Guideline 4.8 löst via Plan B, inte bara åberopad)
> Status: **Hobbyprojekt** — vi bygger för hantverket och för att göra något bra,
> inte för att tjäna pengar. Driftkostnader ligger på ~120 kr/år så det finns
> ingen press på intäkter. Affärsmodell-tabellen finns kvar nedan men är
> *lagrat tänkande* ifall vinkeln återkommer; den styr inte aktiv utveckling.
>
> **MILSTOLPE: appen är i produktion på Google Play.** 1.8.0 (build 22)
> submittad till produktionsspåret 2026-05-16, världsomspännande
> distribution (177 länder), under/efter Google-review. App Check Stage 2
> (Play Integrity) aktiverat i Monitor-läge. Enforce-flippen kalender-
> schemalagd 22 maj.
>
> **Aktivt just nu:** ingenting — allt levererat och deployat. Senaste pass
> (2026-05-17, runtime 1.8.0): tre buggfix-OTA:er — (1) `stats.ts` lost-
> update-mutex, (2) `updateParticipant` stripUndefined (svar nådde aldrig
> Firestore — deltagar-doc fast i join-state, saknades i topplista +
> WalkInsights), (3) LibraryScreen-flik-text försvann på Android (emoji +
> etikett i samma `<Text>` med dynamisk färg korrumperade native glyf-
> cache). Diagnostik-script `inspect-walk.mjs` tillagt. Tidigare
> (2026-05-15/16): App Check Stage 2 reaktiverad + smoke-testad, kontakt-
> mejl → @tipspromenaden.app (support/privacy/legal), Play Store-
> beskrivning omskriven, `preflight-release.mjs`-gate för AAB-submit,
> security.txt + HSTS + SSL-härdning på webben. Tidigare (2026-05-11/13,
> runtime 1.6.0–1.7.0): offline-läge iter 1, bantad startsida + 4-flikars
> bibliotek, update-notifier, perf-pass, OTA-gate. Tidigare
> (2026-05-05/06): full webb-admin (`/admin`) med moderation, statistik,
> batch-upload + skapa/redigera tipspack, flygblad-generator, smart
> `/get-app`-redirect, engelska översättningar (Fas 1+2), PayPal på /stod,
> CSP-fix för Firebase Auth-popup. Tidigare (2026-05-04): säkerhetspass 2 +
> bibliotek-hang fix. iOS-bygge **övervägs** (~1 100 kr/år löpande Apple
> Developer-avgift — ej beslutat). Förslag på nästa drag i "Nästa
> konkreta steg".

---

## Vision

Tipspromenaden är ett **GPS-baserat quiz-promenadverktyg** för Sverige —
gratis att använda, lätt att skapa egna promenader, lätt att hitta promenader
andra delat. Fokus ligger på **hantverk och kvalitet** snarare än marknadsplats
och provision. Vi bygger för oss själva, för familj och vänner, och för
människor som råkar tycka att det är kul.

På längre sikt: möjlighet att också rikta sig till friskvårds-/B2B-segmentet
om värdet växer organiskt — men det är inte vad som styr roadmappen.

---

## Konkurrenter (april 2026)

Marknaden har redan etablerade aktörer. Vi konkurrerar därför inte head-on
utan fokuserar på **hantverk + nischfunktioner** där vi kan vara klart
bättre än alternativen.

| App | Modell | Skala | Differentierar mot oss |
|---|---|---|---|
| **Tipsrundan** ([tipsrundan.se](https://tipsrundan.se)) | Helt gratis | 4.6★, 6 200+ reviews | Etablerad, bredare feature-set inkl. video-frågor + fritext-svar |
| **Korpen Tipspromenader** | Föreningsbunden | 60-årig institutionell relation | Friskvårdsbidrags-rätten genom Korpen |
| **Quiz-walk** ([quiz-walk.se](https://www.quiz-walk.se)) | Oklart, troligen B2C | Mindre, finns | Skola/utbildning |
| **Xrundan** ([xrundan.com](https://www.xrundan.com)) | Nationella quiz | Mindre nisch | Tävlings-/eventfokus |

**Var vi vill vara klart bättre** (ordnat efter "hög effekt × byggbart"):

1. **Cykelläge** — längre tröskel för kontroller, audio-frågor (TTS),
   notifiering "närmar dig" 200 m innan, längre rutter (5–30 km). Tipsrundan
   är gång-fokuserad. Här finns en lucka.
2. **Audio-first / hands-free** — TTS-uppläsning är redan implementerad;
   vidareutveckla mot riktig hands-free med BT-headset, ev. röststyrt svar.
3. **Tablet/landscape-layout** — split-vy karta + sidopanel vid skapande.
   Ingen konkurrent har detta.
4. **Skapar-insights** — per-fråga svarsfördelning, snittsteg, snittpoäng.
   Tipsrundan har tracking i realtid men inte fördröjd analys.
5. **Offline-kvalitet** — tipspromenader sker i naturen där täckning är
   variabel. Bli klart bäst på offline-flöde.
6. **Stegräkning** — redan implementerad. Ger appen en hälsovinkel som
   alternativen saknar.

---

## Affärsmodell — *lagrat (ej aktivt)*

Tabellen nedan är historisk planering. Inga av dessa lager är aktivt under
utveckling så länge projektet är hobbyläge. Kvar som referens om det skulle
visa sig finnas en lucka i framtiden.

| Lager | Produkt | Pris (riktvärde) | Marginal |
|-------|---------|------------------|----------|
| **Gratis** | Skapa egna frågor & promenader manuellt | 0 kr | — |
| **~~Köp av innehåll~~** | ~~Frågebatterier + färdiga promenader~~ | ~~49–149 kr/styck~~ | ~~80/20~~ |
| **~~Pro-konto~~** | ~~Skapa & sälja eget innehåll~~ | ~~~99 kr/mån~~ | ~~100%~~ |
| **B2B-friskvård** | Företagslicens via Benify/Epassi/Actiway | 50–200 kr/anställd/år | 100% (om det blir aktuellt) |

Strykningarna ovan reflekterar att Tipsrundan redan ger bort skapelseverktyget
gratis — köp-av-innehåll och pro-konto är inte realistiska intäktslager när
basverktyget är gratis och etablerat hos konkurrenten. B2B-friskvård lämnas
öppen som "kanske, om ett företag knackar på" snarare än aktiv strategi.

---

## Strategiska principer (omformulerat för hobbyläge)

1. **Hantverket först.** Bygg för att det är roligt och för att göra något bra,
   inte för att monetära. Om det leder till intäkter en dag är det bonus.
2. **Differentiera där alternativen är svaga.** Cykel, audio, tablet,
   offline, insights — inte head-on mot Tipsrundans gång-fokus.
3. **Kvalitet före kvantitet.** Bättre att ha 50 superbra promenader än
   5000 medelmåttiga.
4. **Frihet från "monetär logik".** Vi kan bygga konstiga features bara för
   att de är roliga, utan att fråga "går den att monetära?"

---

## Fasplan

Faserna nedan är den ungefärliga ordningen vi bygger features i, **inte**
deadlines. Vi plockar det som passar humöret, och success-kriterier är
användar-orienterade ("kul att använda?") snarare än kommersiella.

### Fas 1 — `.tipspack`-import ✅ delvis klart
**Mål:** Skapare kan importera ett färdigt frågebatteri (JSON) och
placera frågorna på kartan. Underlättar att skapa nya promenader när man
har en fråge-uppsättning, inklusive paket genererade via `create-tipspack`-
skill.

**Funktioner:**
- Importera `.tipspack`-fil (JSON) i CreateWalkScreen ✅
- Skaparen placerar varje fråga genom att trycka på kartan ✅
- "Återanvänd positioner"-knapp för att kopiera koordinater från befintlig walk ✅
- Sparas som vanlig promenad efter import ✅

**Användbart att producera:**
- Stockholms gamla stan (historia)
- Naturbingo för barn
- En storstad till (Göteborg eller Malmö)
- Fritids-/familjepaket — som det Karatekids-pack vi redan har

---

### Fas 2 — Cykelläge + längre rutter — ✅ MVP klart 2026-05-03
**Mål:** Stötta cykling som separat aktivitetsläge — där Tipsrundan är
svagast och vi kan vara klart bättre.

**Funktioner (originalplan):**
- Aktivitetstyp som metadata: `walk` / `bike` / `run`
- **Cykelläge-UX:**
  - Längre tröskel för "närhet till kontrollpunkt" (50–200 m istf 15 m)
  - Notifiering "närmar dig" 200 m innan
  - Större kartzoom default
  - Pausläge (vid trafikljus etc)
- ✅ Audio-frågor via TTS (`expo-speech`) — implementerat 2026-04-17
- Eventuellt nytt filformat `.tipswalk` med både frågor OCH koordinater
  (för att kunna dela färdiga rutter direkt utan placeringssteg)
- Linje-ritning på karta — visa rutten som polyline mellan kontrollerna

Detaljerad MVP-plan finns under "Cykelläge — pågående implementation" nedan.

**Success-kriterium:** Vi själva tycker det är roligare att göra en
cykel-quiz än att gå en gång-quiz. Familjen testar och ger feedback.

---

### Fas 3 — Fritt bibliotek (publika promenader) ✅ klart april–maj 2026
**Mål:** Discovery — låt användare frivilligt dela sina promenader så
andra kan hitta och köra dem. **Inget kommersiellt lager**, inga
köp/utbetalningar/Pro-konton — bara opt-in publicering och bra
filtrering.

**Levererat (Iteration 1 + 2):**
- ✅ `public`, `city`, `category`, `centroid` på Walk
- ✅ Bibliotek-flik i HomeScreen + LibraryScreen med fritext + kategori-chips
- ✅ Förhandsgranskning av frågor (utan svarsalternativ) före nedladdning
- ✅ V1-signaler: completion-count + avg-score
- ✅ Iteration 2: "📍 Nära mig"-sortering med distans på varje kort
- ✅ Rapportera-knapp för olämpligt innehåll
- ✅ Säkerhetsdialog vid första bibliotek-körning

Detaljerad spec finns kvar under "Bibliotek (publika promenader)" nedan
för referens.

**Kärna:**
- `public?: boolean` på Walk — skaparen opt-in:ar
- Filtrering: fritext / kategori / avstånd / sortering
- Kvalitetssignaler:
  - **V1** (ingen extra data — finns redan): completion-count, avg-poäng
  - **V2** (1 helg): ❤️-knapp för "den här var bra"
  - V3 (5★ + reviews): **uttryckligen utelämnad** — för låg volym för att
    fungera bra, för dyr i moderation, demotiverande för skapare
- Ingen identitetsverifiering, ingen BankID, ingen Stripe Connect

**Success-kriterium:** Familj och vänner hittar och kör promenader gjorda
av andra utan att skaparen behövde dela en QR-kod.

---

### Fas 4 — B2B/friskvård *(om det blir aktuellt)*

Lämnas öppen som möjlighet snarare än aktiv plan. Om ett företag knackar
på för walk-and-talks, kickoff-events eller friskvårdsbidrag — då
aktiveras detta. Inget vi jagar proaktivt så länge projektet är hobby.

**Om aktuellt — vad som behövs:**
- Skatteverket-godkännande som friskvårdstjänst (~3–6 mån process)
- Företagsadmin-dashboard för HR (anonymiserad aktivitet)
- Säljmaterial och företagsdemo
- Eventuell licensmodell — t.ex. 49 kr/anställd/år flat eller per-event

---

## Tekniska anteckningar

### Filformat `.tipspack` (Fas 1)
```json
{
  "format": "tipspack",
  "version": "1.0",
  "name": "Stockholms gamla stan",
  "description": "30 frågor om Stadsholmens historia",
  "author": "Tipspromenaden AB",
  "questions": [
    {
      "text": "Vilket år grundades Stockholm?",
      "options": ["1252", "1350", "1100", "1523"],
      "correctOptionIndex": 0
    }
  ]
}
```

Inga koordinater — skaparen placerar dem själv vid import.

### Filformat `.tipswalk` (Fas 2)
Samma som `.tipspack` plus:
- `activityType`: `"walk" | "bike" | "run"`
- `questions[].coordinate`: `{latitude, longitude}`
- `proximityThresholdMeters`: tröskel för aktivitet (default: 3 för walk, 200 för bike)

### Cykelläge — UX-skillnader
- Större kartzoom default
- "Närmar dig kontroll om 200 m"-notis (vibration + ljud)
- ✅ Frågor kan vara audio-only (text-to-speech via `expo-speech`) — **implementerat 2026-04-17**
- Längre rutter (5–30 km istf 0.5–3 km)
- Pausläge (vid trafikljus etc)

### Röststyrt svar via headset (uppskjutet)
Cyklisten ska kunna svara handsfree. Två implementationsvägar som övervägs:

**Alt A — On-device STT (`@react-native-voice/voice`)**
- Kräver dev-build (har vi redan via EAS)
- Gratis, fungerar offline
- Lyssnar efter siffror "1–4" → hög precision även i blåst
- ~2 timmars arbete

**Alt B — Whisper API (molnbaserad)**
- ~$0,006/minut audio → försumbart
- Utmärkt svensk igenkänning även av långa fraser
- Kräver OpenAI-nyckel (hanteras via EAS Secret) eller Cloud Function-proxy (Blaze-plan)
- ~4 timmars arbete

**Beslut:** Vänta tills TTS-funktionen använts ett tag — den räcker kanske själv ("peka på svaret när du stannar"). Om användare efterfrågar det, kör Alt A med siffer-inmatning först.

### Bilder i frågor — ✅ implementerat 2026-04-17
- `expo-image-picker` + `expo-image-manipulator` (komprimerar till max 1600px, JPEG 70%)
- Firebase Storage på path `walks/{walkId}/questions/{qid}.jpg`
- Storage-regler: bara skaparen skriver, alla läser, max 2 MB, bara image/*
- Visas i ActiveWalkScreen ovanför frågetexten

**Uppskjutet:** stöd för bilder i `.tipspack`-filer (kräver base64-encoding eller separat CDN).

---

## Innehållsskydd & betalning av `.tipspack` — *arkiverat (ej aktivt)*

Hela detta avsnitt är historisk planering från när vi tänkte sälja
`.tipspack`-filer kommersiellt. Sedan beslutet att gå hobby-läge är
ingen DRM-strategi aktiv — `.tipspack`-filer är fria att dela mellan
människor. Avsnittet finns kvar som referens om en monetärisering
återkommer.

<details>
<summary>Klicka för att läsa det arkiverade tankegodset</summary>

### Grundsanningar (lagrat)

1. DRM går alltid att knäcka. Målet är att göra okontrollerad spridning *obekväm*, inte omöjlig.
2. Största skyddet är appens värde. Innehåll utan kartan, GPS-triggers och topplista är halvt värde.
3. UX-kostnad för DRM drabbar betalande kunder, inte pirater.
4. Prisnivå 49–149 kr = impulsköp. Casual sharing-beteendet är "visa kompisen", inte organiserad piratering.

### Distributionsmodeller (lagrat)

| Modell | Hur det funkar | Skydd | Arbete | Lämplig för |
|---|---|---|---|---|
| **A. Öppen fil + hederssystem** | `.tipspack` skickas som-det-är | ⭐ | 0 | Gratis-innehåll (= där vi är nu) |
| **B. Watermarkad fil** | Köparens mail inbäddad i filen | ⭐⭐ | 1 dag | MVP för betalning |
| **C. Cloud-levererat innehåll** | Content hämtas från Firestore efter köp | ⭐⭐⭐⭐ | ~1 vecka | När volym > 500 köp |
| **D. Krypterat paket + licensserver** | Fil krypterad, nyckel efter köp-verifiering | ⭐⭐⭐⭐⭐ | ~2 veckor | Förmodligen aldrig |

Modell A är vad vi de facto kör nu i hobby-läget. B/C/D är inte aktuella
så länge vi inte säljer något.

### Stripe Connect / utbetalningar (lagrat)

Inte relevant tills monetärisering återkommer. Sparat:
- `sales/{saleId}` med creator/buyer/amount/creatorCut
- Stripe webhook → Cloud Function
- Chargeback-flöde via webhook

</details>

---

## Bibliotek (publika promenader)

**Fritt** bibliotek där skapare opt-in:ar promenader så andra användare
kan upptäcka, filtrera och köra dem. Inget kommersiellt — inga köp,
inga utbetalningar, inga Pro-konton. Bara discovery och bra filtrering.

Egen flik i HomeScreen vid sidan om "Mina" och "Sparade".

### Datamodell — nya fält på `Walk`

- `public?: boolean` — skaparen opt-in:ar till biblioteket
- `centroid?: { latitude, longitude }` — beräknas från frågekoordinater (mittpunkt)
- `bounds?: { minLat, maxLat, minLng, maxLng }` — för geo-sökning
- `city?: string` — manuellt angivet av skaparen (kan auto-fyllas via reverse geocoding av centroid)
- `region?: string` — län eller kommun
- `category?: string` — begränsad enum, t.ex. `"natur" | "stad" | "historia" | "barn" | "cykel" | ...`

`firestore.rules` uppdateras: alla får läsa walks där `public == true` även utan ägarskap.

### UI / flöde

**HomeScreen — ny flik "Bibliotek":**
- Sökrad: fritext (matchar title + city + region)
- Kategori-chips
- Avstånd-slider ("inom X km från mig" — kräver geo-bbox-query)
- Sortering: nyast / populärast (= antal slutförda) / närmast / mest gillade (V2)
- Tryck på walk → samma flöde som idag (preview + spara/starta)

**CreateWalkScreen:**
- "Publicera till biblioteket"-toggle (default av)
- Om på: fält för stad + kategori + ev. beskrivning
- Liten varning: "Andra användare kan se din promenad"

### Kvalitetssignaler — V1 + V2, inte V3

Genomtänkt val efter konkurrentanalys: 5★-betyg + reviews ger orättvisa
siffror vid låg volym, drar moderation-overhead, demotiverar skapare via
brigading. Vi hoppar över det och bygger lättviktiga signaler.

**V1 — implicit + minimal social proof (Iteration 1, ingen extra data):**
- "**Gått av N personer**" — räknare baserad på sessions/finishers (vi har redan datat)
- "**Genomsnittlig score: X/Y**" — vi räknar redan ut det i WalkInsights
- Sortering "Populärast" = fler-än-N-finishers
- Sortering "Närmast mig" — kräver centroid (Iteration 2)

**V2 — ❤️-knapp (när V1 inte räcker, ~1 helg):**
- Ett-tap "den här var bra"-knapp på walk-kort + WalkPreview
- Antal hjärtan visas som badge
- Sortering "Mest gillade"
- Inga kommentarer, inga 1-stjärnor → inget att modera utöver befintlig
  rapportering

**V3 — fullt review-system: uttryckligen utelämnad.** Hobbyprojekt är
inte värt moderation-overheaden, och 5-stjärniga betyg vid låg volym
gör mer skada än nytta.

### Tekniska val

| Sökdimension | Hur | Kostnad |
|---|---|---|
| Title-sökning | Klient-side filter efter att ha hämtat alla public walks | Enkelt, OK upp till ~500 walks. Sen krävs Algolia/Typesense. |
| Geografisk | Geohash-index i Firestore + bbox-query | Funkar bra. Kräver lib eller egen geohash-funktion. |
| Stad/region | Exakt match på sträng | Enklast. Kräver konsekvent stavning ("Stockholm" inte "stockholm"). Kan auto-fyllas via reverse geocoding. |
| Kategori | Enum-fält | Trivialt. |

### Iterationer

**Iteration 1 — MVP (~4–6 h, OTA-bart):**
- Lägg `public`, `city`, `category` på Walk
- Bygg "Bibliotek"-flik med fritext + kategori-filter
- Klient-side filter (vi ligger långt under 500 walks idag)
- Visa V1-signaler: completion-count + avg-score per walk
- Inga geo-sökningar än
- Rapportera-knapp på walk-kort (för olämpligt innehåll)

**Iteration 2 (~3 h):**
- Lägg till `centroid` + "Inom X km från mig"-slider
- Auto-fyll `city` via reverse geocoding av centroid
- "Spara till mina" utan att starta

**Iteration 3 (~1 helg, om V1 inte räcker som kvalitetssignal):**
- ❤️-knapp + sortering "Mest gillade"
- Skapar-profilsida ("Walks av Niklas")

**Iteration 4 (när det skalat upp — kanske aldrig):**
- Algolia/Typesense för riktig fuzzy-sök
- Popularity-ranking med tidsavtagande (recency + volume)

### När börja

Bygg när det är roligt. ~5–10 publika walks räcker för att få ett
användbart bibliotek; inget hårt krav på "20+" som tidigare. App Check
är inte ett hårt krav men trevligt att ha innan vi öppnar publika reads.

---

## Risker & motåtgärder (hobby-läge)

| Risk | Sannolikhet | Påverkan | Motåtgärd |
|------|-------------|----------|-----------|
| GPS-noggrannhet för dålig | Låg | Hög | Justerbar tröskel, tillåt manuell "jag är här"-knapp som backup |
| Tipsrundan/konkurrent lägger till feature vi differentierar på | Medel | Medel | Vi är i hobby-läge — inget akut. Pivota till annan nisch om det händer |
| App Check inte aktiverat → public read av walks blir attack-yta | Medel (när biblioteket lanseras) | Låg-Medel | Aktivera App Check i nästa AAB-cykel innan biblioteket öppnas |
| Privat data (display-name, e-post-username) på publika topplistor | Låg | Medel | Privacy-fält som default-deltagarnamn (se post-V1-bucket) |
| Inaktivitet — projektet dör för att ingen orkar | Medel | Låg (det är hobby) | Det är OK. Fungerar fortsatt för existerande användare oavsett. |

(Tidigare risker som "Apple/Google nekar pga in-app-köp" och
"Friskvård-godkännande dröjer" är inte längre relevanta i hobby-läget.)

---

## Bredare konkurrenslandskap (referensapp jämfört med oss)

Konkurrent-tabellen i sektionen "Konkurrenter" överst täcker
*direkt* konkurrens (svenska tipspromenad-appar). Tabellen nedan är
bredare friluft/discovery-appar för referens när vi tänker UX:

| App | Fokus | Var vi är annorlunda |
|-----|-------|---------------------|
| **Komoot** | Ruttplanering cykel/vandring | Vi har gamification (frågor + poäng) |
| **AllTrails** | Naturleder | Vi är svenskt + urban-vänligt |
| **Geocaching** | Hitta gömda objekt | Vårt innehåll är edukativt, inte söka-objekt |
| **GuruWalk** | Stadsguider med människa | Vi är självgående, tillgängligt 24/7 |
| **Strava** | Träning + sociala | Vi är upplevelse, inte prestation |

---

## Cykelläge — MVP levererat (maj 2026)

**Levererat 2026-05-03 (runtime 1.4.0 OTA):**

| # | Komponent | Status |
|---|-----------|--------|
| 1 | `Walk`-typ | ✅ `activityType?: "walk" \| "bike"` (default walk om saknas — bakåtkompatibelt) |
| 2 | CreateWalkScreen | ✅ Picker för aktivitetstyp, samlat under kollapsbar "⚙️ Inställningar"-sektion |
| 3 | ActiveWalkScreen | ✅ Dynamisk trigger-tröskel via `getActivityConfig()` (15 m walk, 50 m bike) |
| 4 | ActiveWalkScreen | ✅ "Närmar dig"-vibration (en puls) vid approaching-tröskeln (100 m bike), en gång per kontroll |
| 5 | MapView | ✅ Större initial zoom för bike (latitudeDelta 0.02), extra ring som visar approaching-zon |
| 6 | MapView | ✅ Polyline mellan kontrollpunkter — gäller både walk och bike (streckad grön linje) |
| 7 | Walk-kort | ✅ 🚲-badge bredvid språkflagga på bike-walks i HomeScreen + LibraryScreen |
| 8 | i18n | ✅ `create.activityTypeLabel/Walk/Bike/BikeHint` översatt i alla 8 språk |

Implementationen ligger i `src/constants/activityType.ts` (config per typ)
+ ändringar i ActiveWalkScreen, CreateWalkScreen, HomeScreen, LibraryScreen,
MapViewWeb (Polyline-stöd lagt till samtidigt — gäller både plattformar).

**Bonus levererat samtidigt (inte i ursprunglig MVP):**
- ✅ OpenTopoMap-tiles via `react-native-maps` UrlTile på native när
  mapType="terrain" — ger samma stigvisning som webbsidan har.
  MapAttribution-komponent för CC-BY-SA-attribution.

**Iteration 2 (om/när det blir aktuellt):**
- Pausläge (vid trafikljus) — trickigt UX, vänta tills familjen testat
- `.tipswalk`-filformat med både frågor OCH koordinater — separat arbete
- Validering av rutt-längd (5–30 km för bike) — onödigt, låt skaparen bestämma
- Filter "bara cykel-walks" i biblioteket — lägg till om det blir många bike-walks
- `"run"` som aktivitetstyp — samma UX som walk, ingen vinst i att lägga till än

**Success-kriterium MVP (att verifiera under cykeltest):** Trigger-zonen
på 50 m räcker i normal cykelfart (~20 km/h). Approaching-pulsen vid
100 m kommer i tid att stanna. Polylinjen hjälper navigeringen.

---

## Levererat sedan roadmap-skrivningen (april–maj 2026)

Följande är inte beskrivet i fasplanen ovan men har levererats:

- ✅ **Onboarding-flöde** — 3-stegs intro vid första cold start
  (vad det är, hur du börjar, tipsar om biblioteket). "Visa intro
  igen"-knapp i Settings för att trigga manuellt.
- ✅ **App Check Stage 1 (web)** — reCAPTCHA Enterprise-baserad
  verifiering av Firestore-/Storage-anrop från webbsidan, monitor mode
  (loggar utan att blocka). Stage 2 (Play Integrity för native) väntar
  på nästa EAS-build.
- ✅ **Google Maps på webben** — `/skapa`:s standard-vy använder nu
  Google Maps via leaflet.gridlayer.googlemutant istället för OSM,
  matchar mobilappen. Hybrid (Esri-satellit) och Terräng (OpenTopoMap)
  är oförändrade.
- ✅ **Cykelläge MVP** (Fas 2) — `Walk.activityType: "walk" | "bike"`,
  dynamisk trigger-tröskel, approaching-vibration, bredare zoom,
  polyline mellan kontroller, 🚲-badge i listor
- ✅ **OpenTopoMap-tiles på native** för terrain-vyn — samma stigar
  syns nu i appen som på webbsidan
- ✅ **"Mina paket"-flik i biblioteket** — inloggade användare ser och
  hanterar uppladdade tipspacks (publika + hemliga länkar) direkt i appen
- ✅ **App översatt till 8 språk** (sv/en/de/no/da/fi/fr/es) — i18n-system
  med fallback till svenska, system-språk som default
- ✅ **Hjälpsida på hemsidan** (`/sa-funkar-det`) bilingual sv/en — guide
  för deltagare och skapare; länkad från Inställningar → Om appen
- ✅ **Länkar i appen till hemsidan** — Hemsida, Så funkar det, Skapa på
  webben i Settings → Om appen
- ✅ **GDPR/ToS-pass** — integritetspolicy, användarvillkor, "Radera mina
  data" för anonyma användare, säkerhetsdialog för bibliotek
- ✅ **Säkerhetspass 1** (2026-04-30) — walkId-validering, sessions-completion-skydd,
  npm audit fixes, e-post-prefix-läckage adresserat
- ✅ **Säkerhetspass 2** (2026-05-04) — full review av båda repon (web + app):
  - Web: HTTP-headers via `public/_headers` på Cloudflare Pages (CSP,
    X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy),
    striktare regex på `/walk/<id>` (samma som 404.astro), SRI-pin på
    unpkg-leaflet-pluginen, `.gitignore` `.env*` wildcard,
    `rel="noopener noreferrer"` på externa länkar
  - App: `http://`-prefix bort ur QR/paste-parsern (bara `https://`
    accepteras nu), `babel-plugin-transform-remove-console` strippar
    console-anrop från produktions-bundeln
  - GCP: månadsbudget-alert aktiverad på `tipspromenaden-491207`
    (50/90/100% trösklar) som mitigation tills App Check Stage 2 är på
- ✅ **Bibliotek-hang fix** (2026-05-04) — Frågebatterier-fliken kunde
  fastna i evig laddning. Två lager: `tipspackLibrary.fetchUploaded`
  parallelliserade `getDownloadURL` med `Promise.allSettled` + per-källa-
  timeouts, och `LibraryScreen.useEffect` deps korrigerade (`[t]` ledde
  till loop som avbröt fetch via cancelled-flagga). Hård 15 s failsafe
  som tvingar `packs/walks` från `null` till `[]` om något skulle hänga.
- ✅ **Code review-pass** — walkCentroid utbruten, WALK_CATEGORIES delad
  konstant, distance pre-compute, getPublicWalks limit
- ✅ **Tag-system** för promenader — `manageTags`-skärm, taggar per walk,
  filtrering på Mina-fliken
- ✅ **Hemsida på Cloudflare Pages** med deep-links via `/walk/<id>`
- ✅ **Score-card-PNG-delning** — Leaderboard + Results har snyggt
  delningskort med QR-kod
- ✅ **Trigger-tröskel justerad** från ~3 m till 15 m efter fält-tester
- ✅ **Webb-admin på `/admin`** (2026-05-05) — login-gated på UID, fyra
  flikar (Översikt / Walks / Tipspacks / Sessioner). Översikt visar
  counts + topp-10 walks efter sessioner. Walks-fliken: alla walks
  med expanderbar fråga+facit-vy, mini-karta (Leaflet med 🔍 Granska-
  toggle som slår på drag/zoom), datum för skapad + senast utförd.
  Tipspacks-fliken: curated + uppladdade i en lista, expanderbar med
  facit, redigera/skapa-modal med full frågeeditor, batch-upload-zon
  (drop N filer, sekvensiell upload med per-fil-status). Sessions-
  fliken: 50 senaste.
- ✅ **Moderation-flagga** (2026-05-05) — `moderation/hidden` Firestore-
  doc med arrays av walkId/slug. App och webb filtrerar bort flaggade
  items från publika listor (best-effort: tomt set vid läsfel).
  Admin togglar via 🚩 Göm-knappen i `/admin`.
- ✅ **Flygblad-generator i admin** (2026-05-05) — A5-printbart
  flygblad i Friluft Folio-stil per walk. Modal med språkväljare
  (sv/en), walk-titel + antal kontroller, två QR-kort, print-CSS för
  pixel-perfekt PDF-output via browserns Skriv ut.
- ✅ **/get-app smart redirect** (2026-05-05) — Android → testpilot-
  Google-Group, iPhone → /stod, desktop → val. En enda QR fungerar
  för båda OS:n istället för två separata.
- ✅ **Engelska översättningar Fas 1** (2026-05-05) — hela
  marknadssidan (`/en/`, `/en/support`, `/en/how-it-works`,
  `/en/tipspack`), språkväxlare top-right, bilingual 404 +
  walk-redirect.
- ✅ **Engelska översättningar Fas 2** (2026-05-05) — `/skapa`-
  creatorn på `/en/skapa`. Login, walks-lista, walk-editor, fråge-
  formulär, dela/upload-dialoger, "Mina tipspacks". Datum/tid följer
  locale.
- ✅ **PayPal på /stod** (2026-05-05) — för utländska supportrar
  som inte kan Swisha. Egen QR i grön palett + tap-knapp till
  `paypal.me/niklaser3d`. Visuellt sekundärt jämfört med Swish.
- ✅ **CSP-fix för Firebase Auth** (2026-05-05) — `apis.google.com`
  + `accounts.google.com` lagda i CSP så desktop-browsers slutar få
  `auth/internal-error` vid Google-login. Telefonen funkade redan
  via en annan kodväg.
- ✅ **/tipspack inline-script-fix** (2026-05-05) — Astro/Rolldown
  bundlade `<script>` till en `type="module"` som tystade allt JS
  på sidan (copy-link + förhandsgranska). Fixad genom byte till
  `<script is:inline>` med block-kommentarer (Astro kollapsar
  newlines i raw-scripts → `//`-kommentarer åt upp resten).
- ✅ **Förhandsgranska tipspack-frågor** (2026-05-05) — på alla
  tipspack-listor (curated `/tipspack`, publika user-uploaded,
  Mina paket både i app och webb-admin). Visar bara frågetext
  utan svar för att inte spoila spelet.
- ✅ **Förenklingar i delning/import/återanvändning** (2026-05-05)
  — central `tipspackValidator.ts` (en kopia per repo, byte-för-byte
  identisk), `shareContent.ts`-fasad för all delning, slå ihop
  reuse-knappens tre UI-tillstånd till en, slå ihop "Mina paket"
  till chip-filter i Frågebatterier-fliken.
- ✅ **Animerad resultatscen** (2026-05-05) — count-up score,
  fyllande procent-bar, konfetti-overlay vid ≥70%. Pure RN
  Animated, OTA-bart, ingen prestandakostnad.
- ✅ **Update-notifier** (2026-05-11, AAB 1.6.0) — Firestore-doc
  `config/appUpdate` styr en native-modal vid app-start om
  `nativeBuildVersion < latestBuild`, `minBuild` ger tvingande läge
  (icke-dismissable). OTA-banner med release notes från
  `extra.releaseNotes` i bundeln. Admin-script `set-app-update.mjs`
  bumpar docen + release notes per release. Krävs `firebase-admin-key.json`
  lokalt (gitignored, Firebase Admin SDK-nyckel).
- ✅ **Startsida + 4-flikars bibliotek** (2026-05-11 OTA på 1.6.0) —
  HomeScreen bantad från 1781 → 523 rader, all walk-list-logik flyttad
  till `components/MyWalksList.tsx`. LibraryScreen har nu **Mina ·
  Upptäck · Event · Paket** i tabs. HomeTabs reorderad till Library ←
  HomeMain → Stats. Bibliotek-knappen på startsidan visar badge med
  antal sparade promenader.
- ✅ **Perf-pass** (2026-05-11 OTA) — `getPublicWalks` får 15-min
  TTL-cache + inflight-dedup, parallell GPS+Firestore-fetch på HomeScreen
  cold-start, `refreshAllSavedWalks` throttlad till 1×/5 min,
  delad `formatDistance`-util mellan Home + Library.
- ✅ **OTA-gate i `update-all.mjs`** (2026-05-11) — vägrar publicera
  om `extra.releaseNotes` inte rörts i HEAD-commiten. Adresserar
  bug där bannern stannade på första texten vid 5+ OTA:er i rad.
  Bypass-flagga finns för medvetna undantag.
- ✅ **Säkerhetspass 3** (2026-05-11) — validering av
  `config/appUpdate.playStoreUrl` mot prefix `https://play.google.com/`
  innan `Linking.openURL` (försvar-på-djupet mot komprometterat
  admin-konto).
- ✅ **App Check Stage 2 (native Play Integrity)** (2026-05-15, AAB
  1.8.0/build 21) — `@react-native-firebase/app-check` CustomProvider-
  brygga reaktiverad i `src/config/firebase.ts` efter att build 17-
  kraschen reattribuerats till välkomst-animationen. Smoke-testad via
  preview APK före submit. Monitor-läge tills legit trafik verifierats,
  sen Enforce. Kontakt-mejl bytt till @tipspromenaden.app-domänen
  (support@ / privacy@ / legal@) samtidigt.
- ✅ **Automatiskt offline-läge iter 1** (2026-05-13, AAB 1.7.0) —
  `@react-native-community/netinfo` + `useOnlineStatus()`-hook + gul
  `OfflineBanner` med antal köade svar, pre-cachning av frågebilder
  till `FileSystem.documentDirectory` vid `saveWalkLocally()`,
  graceful `findActiveSession()` (returnerar null vid `unavailable`/
  `deadline-exceeded` istället för throw). Kart-tiles offline återstår
  som iter 2.

---

## Nästa konkreta steg

Plocka det som passar humöret. Förslag i grov ordning:

1. **Cykeltest av cykelläget** — verifiera 50 m trigger + 100 m approaching
   i verklig fart. Justera efter behov.
2. **App Check Stage 2 (native) — AKTIVERAT i 1.8.0 (build 21), Monitor-läge.**
   Reaktiverad 2026-05-15 efter att build 17-kraschen reattribuerats
   till välkomst-animationen (inte App Check). Smoke-testad via preview
   APK — ingen krasch. Play Integrity-tokens skickas nu på varje
   Firestore/Storage-request. **Återstår:** verifiera i Firebase Console
   att legitim trafik syns som *verified* i Monitor en stund, sen flippa
   Firestore + Storage till **Enforce** (samordnas med web Stage 1, se
   punkt 13).
3. **iOS-build** — ✅ KLART & VERIFIERAT. 1.8.0 build 12 + 1.9.1
   build 21 på TestFlight (Sign in with Apple). Apple Developer
   (individuell), ASC API-nyckel, EAS-credentials på Expo-servern.
   iOS = Apple Maps, App Check Android-only. **Sign in with Apple
   (Plan B, 1.9.1)** → Guideline 4.8 löst, inte bara åberopad;
   Apple-provider aktiverad i Firebase Console 2026-05-20. Native-
   bygget krävde manuell Sign-In-with-Apple-capability-toggle i
   Apple Developer Portal + rensning av cachad provisioning profile
   i Expo Dashboard + `EXPO_APPLE_TEAM_TYPE=INDIVIDUAL` env-var —
   recept i `docs/ios-setup.md` §6b + #9. Apple-login verifierad
   på iPhone 2026-05-20. **Återstår före publik App Store-release**
   (alla [DU]-steg, dokumenterade i `docs/app-store-release.md`):
   screenshots 6.9"/6.5", App Privacy-label, metadata, submit för
   review. Post-launch (ej blockerare):
   Universal Links, iOS App Check Stage 3 (DeviceCheck).
4. **Ljudeffekter + haptics** — ✅ KLART 1.9.0.
5. **Pause & resume — proaktiva entry-points** — basics (auto-resume
   via JoinWalkScreen + hydrerad ActiveWalkScreen) gjort 2026-05-20
   som OTA. Kvar: (a) chip i `MyWalksList` "Pågående · 5/10 · Fortsätt"
   som best-effort kollar `findActiveSession` per egen-sparad walk
   och visar live-progress; (b) banner i `HomeScreen` "Du har en
   pågående promenad" som genväg utan att gå via biblioteket.
   Båda kan skickas som OTA. Lågprio tills vi sett att basics används.
6. **Accessibility-pass** — VoiceOver/TalkBack-labels.
7. **Bibliotek Iteration 3** — ❤️-knapp + skapar-profilsida (bara om
   V1-signaler känns för svaga).
8. **Bibliotek Iteration 4 — kart-vy ("Upptäck på karta")** — ✅
   KLART 2026-05-20 (V1). Sub-toggle "📋 Lista / 📍 Karta" i Upptäck;
   `LibraryMapView` med hand-rullad grid-bucketing-klustring (tre
   nivåer baserat på latitudeDelta), pin per walk på `centroid`,
   preview-kort vid pin-tap. Convex/concave hull-polygon ej i V1
   (vänta tills datat visar att det behövs).
9. **`.tipswalk`-filformat** — paket med både frågor OCH koordinater för
   delning av färdiga rutter (Fas 2 fortsättning).
10. **Pausläge för cykelläge** — vid trafikljus etc, beroende på cykeltest-feedback.
11. **Slug-sanering vid tipspack-upload** — befintlig upload tillåter
    spaces och &-tecken i slug (`djur & natur`) → fula procent-encodade
    URL:er. Sanitera till hyphen-form vid upload på webben.
12. **Cloud Function för score-validering** — flytta poäng-uträkning
    serverside så klient-inflaterad score inte går igenom. Kvarvarande
    accepterad svaghet enligt sec-review 2026-05-04. Kräver Firebase
    Functions-setup (Blaze-plan, men gratis-tier räcker för hobby-volym).
13. **Astro 5→6 major bump på webben** — uppskjuten. Den enda Astro-CVE
    som finns (`GHSA-j687-52p2-xcff`, `define:vars` XSS) påverkar oss
    inte praktiskt eftersom vi inte använder `define:vars`. Bumpen
    kostar 1–3 h och kan bryta Cloudflare Pages-byggen. Gör när Astro 6
    varit ute ≥1 månad och alla `@astrojs/*`-integrations är v6-klara,
    eller när vi ändå rör build-pipelinen.
14. **App Check Stage 1 → Enforce** — när Stage 2 (native Play Integrity)
    är på och vi sett Monitor-läget gå rent ett tag, flippa både
    Firestore och Storage från Monitor till Enforce i Firebase Console.
15. **Slug-byte vid redigering av tipspack** — admin-editor:n låser
    slug i edit-läge eftersom byte är en flytt-operation (kopiera +
    radera + uppdatera referenser). Lägg till om behov uppstår.
16. **E-post-username-läckage på topplista** — `JoinWalkScreen` föreslår
    `user.email.split("@")[0]` som default när displayName saknas.
    Edge case (Google-inlogg sätter normalt displayName) men fixa via
    tom default eller hjälptext "Detta visas på topplistan".
15. **Evenemang Fas 2 — påminnelse-notiser** — när en användare tappar
    "Påminn mig" på ett event-kort, schemalägg en lokal notification
    24h innan via `expo-notifications`. Native dep, kräver ny AAB-cykel.
    Lokal-only (ingen Cloud Function-backend) håller det enkelt.
16. **Offline iter 2 — kart-tiles offline** — ✅ KLART & VERIFIERAT på
    enhet 2026-05-19 (OTA på runtime 1.8.0). Ingen MapLibre-swap behövdes: `react-native-maps`
    `UrlTile` har redan inbyggd disk-cache (`tileCachePath` +
    `offlineMode`) i det länkade native-lagret → JS-only, OTA-bart, INGEN
    ny AAB. `services/mapTileCache.ts` för-cachar OpenTopoMap-tiles för
    walkens bbox från `saveWalkLocally()`; `ActiveWalkScreen` läser
    cachen offline. Endast terräng-laget cachas (Google/Apple-baskartan
    får inte proxas; OSM blockerar app-trafik). Detaljer i CLAUDE.md
    "Offline-kartor (iter 2)". Ev. framtid: Settings-knapp som kallar
    `clearAllMapTiles()` + "ladda ner det här området"-UI.
17. **Evenemang Fas 3 — event-topplista** — separat aggregerad topplista
    för en walk under sitt event-fönster (event.startDate–endDate).
    Visar deltagare som spelat under den tiden, sorterat på score → tid.
    Kan landa antingen som ny topplista i appen eller delningsbar
    `tipspromenaden.app/event/<walkId>`-sida på webben. OTA-bart
    om vi gör det i appen, eller kräver bara nya routes på webben.
18. **Sekventiella frågor** — opt-in-toggle per walk: "Frågor måste
    besvaras i ordning". När på: bara fråga 1 är aktiv tills den är
    besvarad, sedan unlockas 2, osv. Bra för storytelling-walks där
    ordningen bär narrativet. OTA-bart, ny `sequential?: boolean`
    på Walk + ändring i ActiveWalkScreens trigger-logik.
19. **Edge-to-edge för Android 15** (Play Console-rekommendation, 1.8.0)
    — Android 15 tvingar edge-to-edge (appen ritar bakom system-barer).
    Vi har redan safe-area-insets på de stora skärmarna men Play
    flaggar fortfarande utfasade edge-to-edge-API:er. Låg prio,
    kosmetiskt på Android 15. Kräver native-cykel (ny AAB).
20. **Orienterings­stöd för stora skärmar** (Play Console-rekommendation,
    1.8.0) — Play vill att appen stödjer fri rotation/resize på stora
    skärmar. Vi låser **medvetet** telefoner till portrait men låter
    surfplattor rotera (App.tsx `applyOrientationLock`). Att lyfta
    portrait-låset på telefon skulle kräva per-skärm-landscape-finputs
    (Active/Results/Leaderboard är portrait-tunade). Delvis giltig men
    medvetet designval — låg prio. (Play-rek #2 "bild-i-bild" är
    irrelevant för en GPS-quizapp och ignoreras permanent.)
21. **Marknadsförings-creative: testpilot → nedladdning** —
    `docs/marketing/build-flyer*.mjs` + `build-social-onepager.mjs`
    är byggda runt testpilot-värvning (rubriker "TESTPILOTER SÖKES",
    steg "Bli testare → Ask to join", filnamn `*-bli-testare.png`).
    QR:n pekar redan rätt sen 2026-05-17 (`build-qr.mjs` →
    `/get-app`), så befintliga tryck funkar funktionellt. Men copy +
    layout speglar fortfarande sluten test. Kräver creative-pass:
    nya rubriker/steg-copy, ev. filnamn, och layout-verifiering genom
    att faktiskt köra generatorerna (tunga deps: `canvas`/`pdfkit`,
    ej i package.json — installeras vid behov). Icke-deployat, ingen
    brådska — gör när nya tryck/social-assets faktiskt behövs.

---

22. **Mörkt tema** — LÅGT PRIO, stort. Kodbasen har MEDVETET
    ingen theme-fil (CLAUDE.md: "färger inline med hex — medveten
    enkelhet"): ~81 unika hex-färger inline över 17 skärmar +
    komponenter. Riktig dark mode = införa theme.ts + useTheme() +
    systematisk migrering skärm-för-skärm, fler arbetspass, hög
    regressionsrisk. Halvt mörkt läge ser buggigt ut. Skjuts ned
    medvetet 2026-05-19 — gör som dedikerat tema-projekt om/när det
    känns värt risken, inte som kvälls-plock.

## Google Play-distribution (krävs för Family Link-barn)

Sidoinstallation av APK fungerar inte på barnens telefoner eftersom **Family Link
blockerar "okänd källa"-installation**. Endast Play Store-appar kan installeras,
och varje installation kräver förälderns godkännande i Family Link.
**Enda vägen för Android-test är därför Google Play intern testning.**

### Steg

1. **Google Play Developer-konto** — 25 USD engångsavgift
2. **ID-verifiering** — sedan 2023 krav; tar 1–3 dagar
3. **AAB-build** via `eas build -p android --profile internal` (se `eas.json`)
4. **Play Console-setup:**
   - Ladda upp AAB till intern testspåret
   - Fyll i store listing (sv + en) — se `docs/play-store-listing.md`
   - Content rating-formulär (svar: inget olämpligt innehåll → 3+)
   - Integritetspolicy-URL (se `docs/privacy-policy.md`, hosta på GitHub Pages eller tipspromenaden.app)
   - 2–8 screenshots + feature-grafik 1024×500 + app-ikon 512×512
5. **Lägg till testarnas Google-konton** (barnens Family Link-konton) i testlistan
6. **Skicka opt-in-länk** — föräldern godkänner i Family Link, installation sker via Play Store
7. **Uppdateringar** flödar automatiskt via Play Store — inga fler APK-filer att skicka

### Fördelar jämfört med sidoinstall

- Family Link-kompatibel
- Play Protect klagar inte
- Signering sköts av Play App Signing
- Uppdateringar automatiska, ingen manuell APK-distribution
- Samma väg används sedan för produktionsrelease (flytta bara spår → öppen/produktion)

---

## iOS-build plan (~1 vecka)

Android-APK är först ut eftersom testarna (familjen) har Android. iOS kräver
mer förarbete. Estimat: ca en veckas kalendertid, mycket väntan på Apple.

- **Apple Developer Program** — 99 USD/år, kräver D-U-N-S eller personligt konto
- **Bundle-ID** — registrera `se.tipspromenaden.app` (eller motsvarande) i App Store Connect
- **Provisioning** — låt EAS sköta certifikat och profil automatiskt (`eas credentials`)
- **eas.json iOS-profil** — lägg till `preview`- och `production`-profiler för iOS med `simulator: false`
- **TestFlight** — `eas submit --platform ios` för intern distribution till testare (upp till 100 personer utan review)
- **Universal Links** — komplettera nuvarande `tipspromenaden://`-schema med
  Associated Domains (`applinks:tipspromenaden.app`) så att QR-länkar öppnar appen
  direkt från Safari/Kamera-appen utan prompt. Kräver `apple-app-site-association`-fil
  på tipspromenaden.app.
- **App Store-review** — först vid publik release; TestFlight-interna builds slipper full review

---

## Helg-testfeedback (fylls efter familjens test)

Bucket för observationer från första riktiga fälttestet med Android-APK.
Kategorier att logga:

- **Buggar** — krascher, tomma skärmar, sync-problem
- **UX-friktion** — var fastnar barnen? Vilka steg förstår de inte?
- **GPS-noggrannhet** — träffas kontrollerna konsekvent? Behöver tröskeln justeras?
- **TTS-kvalitet** — låter uppläsningen naturlig på svenska? Rätt tempo?
- **Önskemål** — vad frågar barnen efter som inte finns?

_(tom — fylls på söndag kväll/måndag)_

---

## Post-V1 fält-polish bucket

Identifierat men uppskjutet tills efter första riktiga testrundan:

- **Score-card PNG** — delningsbild med resultat + QR-kod för andra att testa samma promenad
- **Animerad resultatvideo** — kort mp4/gif med score-reveal, delbart till sociala medier
- **Onboarding-flöde** — 3-stegs intro första gången appen öppnas (hur GPS funkar, hur man joinar, hur man delar)
- **Ljudeffekter** — pling vid rätt svar, subtil "fel"-ton, completion-jingel
- **Haptics** — vibration vid kontroll-ankomst och vid rätt/fel svar (iOS Taptic Engine, Android VibrationEffect)
- **Mörkt tema** — respektera `useColorScheme()`, särskilt viktigt för kvällspromenader
- **Offline-robusthet** — bättre indikering när sync väntar, retry-logik för deltagaruppdateringar
- **Accessibility-pass** — VoiceOver/TalkBack-labels, kontrastkontroll, större text-stöd
- **Privacy: e-post-username som default-deltagarnamn** — `JoinWalkScreen` föreslår `user.email.split("@")[0]` när inloggad användare saknar `displayName`. Om personen trycker "Starta" utan att redigera hamnar email-username på den publikt läsbara topplistan. Edge case (Google-inlogg sätter alltid displayName), men fixa genom att antingen lämna fältet tomt vid email-fallback eller visa hjälptext "Detta visas på topplistan" under fältet.
