# Tipspromenaden — Produktstrategi & Roadmap

> Senast uppdaterad: 2026-04-17
> Status: Planeringsdokument — vägkartan kan justeras allt eftersom vi lär oss

---

## Vision

Tipspromenaden är en marknadsplats för **geo-baserade upplevelser**: tipspromenader, cykelturer, naturupplevelser och guidade vandringar. Skapare laddar upp eget innehåll, deltagare köper eller går gratis, och plattformen tar en provision.

På sikt positioneras appen som en **friskvårdstjänst** så företag kan låta anställda använda friskvårdsbidraget hos oss.

---

## Affärsmodell — tre lager

| Lager | Produkt | Pris (riktvärde) | Marginal |
|-------|---------|------------------|----------|
| **Gratis** | Skapa egna frågor & promenader manuellt | 0 kr | — |
| **Köp av innehåll** | Frågebatterier + färdiga promenader | 49–149 kr/styck | 80% till skapare, 20% till plattformen |
| **Pro-konto** | Skapa & sälja eget innehåll, obegränsade promenader | ~99 kr/mån | 100% |
| **B2B-friskvård** | Företagslicens via Benify/Epassi/Actiway | 50–200 kr/anställd/år | 100% |

---

## Strategiska principer

1. **Sälj utanför app-butiken.** Apple/Google tar 30% av in-app-köp. Vi länkar till webb (Stripe Checkout) — fullt tillåtet enligt 2024 års EU-lagstiftning. Nettar ~100% istället för 70%.
2. **Friskvårdsbidragsvinkel = stor moat.** Sverige har ~20 mdr kr/år i friskvårdsbidrag. Få konkurrenter har certifiering. Värt mycket att tidigt jobba mot Skatteverket-kategorisering och förmånsplattformarna.
3. **Marknadsplatsen är värdet — inte enskilda promenader.** Bygg för skapare först, deltagare följer.
4. **Kvalitet före kvantitet.** Bättre att ha 50 superbra upplevelser än 5000 medelmåttiga.

---

## Fasplan

### Fas 1 — Frågebatterier (~1 vecka kod)
**Mål:** Bevisa att folk vill betala för innehåll.

**Funktioner:**
- Importera `.tipspack`-fil (JSON) i CreateWalkScreen
- Skaparen placerar varje fråga genom att trycka på kartan
- Sparas som vanlig promenad efter import

**Försäljning (utanför appen):**
- Sälj 2–3 färdiga frågebatterier via Gumroad eller Stripe-länk
- Köpare laddar ner `.tipspack`-fil → öppnar den i appen
- T.ex. "Stockholms gamla stan – 30 frågor" — 49 kr

**Produkter att skapa själv för Fas 1:**
- Stockholms gamla stan (historia)
- Naturbingo för barn
- En storstad till (Göteborg eller Malmö)

**Success-kriterium:** ≥10 sålda batterier på 4 veckor.

---

### Fas 2 — Färdiga promenader + cykelturer (~2 veckor kod)
**Mål:** Sänk tröskeln helt — köparen behöver inte själv placera frågor.

**Funktioner:**
- Nytt filformat `.tipswalk` med både frågor OCH koordinater
- Stöd för **cykling** som separat aktivitetsläge:
  - Längre tröskel för "närhet till kontrollpunkt" (200–500 m istf 3 m)
  - Notifiering "närmar dig" 200 m innan
  - Eventuellt audio-frågor (text-to-speech)
- Aktivitetstyp som metadata: gång / cykel / löpning

**Försäljning:**
- Sälj färdiga upplevelser per stad/tema
- Pris 79–149 kr (mer värde = högre pris)

**Success-kriterium:** ≥30 sålda upplevelser/månad i slutet av fasen.

---

### Fas 3 — Marknadsplatsen (~3 månader kod)
**Mål:** Externalisera innehållsproduktion. Du blir plattform, inte skapare.

**Funktioner:**
- Premium-konto (Pro): 99 kr/mån för att kunna sälja innehåll
- Skapare laddar upp via webb-dashboard (eller direkt i appen)
- Identitetsverifiering (BankID via Stripe)
- Stripe Connect för utbetalningar
- Recensioner & betyg (1–5 stjärnor)
- Sökning: stad, längd, svårighet, kategori, betyg
- Rapportera olämpligt innehåll
- Refund-policy (t.ex. "30 dagar nöjd-eller-pengarna-tillbaka" om 0% av frågorna besvarats)

**Provisionssatser:**
- Start: **20% till plattformen** (kompetitivt vs Etsy 6–12%, App Store 15–30%)
- Justeras baserat på volym och konkurrenssituation

**Success-kriterium:** ≥50 aktiva betalande Pro-skapare.

---

### Fas 3.5 — Tokensystem (efter Fas 1 är validerad)

**Förutsättning:** ≥10 sålda tipspacks så att vi vet vad folk är villiga att
betala. Innan dess är ekonomin omöjlig att kalibrera — för generösa tokens
kannibaliserar Fas 1-försäljningen, för stingy genererar de inget engagemang.

**Mål:** Belöna engagemang utan att underminera betald försäljning. Skapa
en valuta som B2B-kunder kan ladda upp till sina anställda.

#### Intjäning

| Aktivitet | Tokens | Anti-fusk |
|---|---|---|
| Slutföra ny promenad (unik walkId) | 50 | En gång per promenad/användare |
| 100% rätt-bonus | +25 | Per promenad |
| Skapa promenad (≥10 frågor) | 100 | Utbetalas först när 3 unika deltagare gått den (förhindrar fake-walks) |
| Andra går din promenad | 5 per deltagare | Cap 50/promenad/månad |
| Daglig streak | 10/dag, max 70/vecka | Server-tid, inte enhetstid |
| Bjuda in vän som registrerar sig | 100 | Per ny användare |

#### Utgifter

| Vara | Tokens | Motsvarar krpris |
|---|---|---|
| Tipspack | 500 | 49 kr |
| Tipswalk standard | 1000 | 99 kr |
| Tipswalk premium | 1500 | 149 kr |

Med dessa siffror behöver en aktiv deltagare ~10 slutförda promenader för
att tjäna ihop ett gratis tipspack. Premium-innehåll förblir till största
delen betalmodell.

#### Tekniska krav

- **Cloud Function** för tilldelning (klienten kan inte tilldela själv)
- **Token-saldo + transaktionslogg** i Firestore
  (`users/{uid}/tokens` + `users/{uid}/tokenLog/{txId}`)
- **Utgångsdatum** på tokens (förslag: 6 mån) — undvik hamstring och
  inflationsrisk om systemet senare justeras
- **Daglig cap** för att stoppa exploit-bots
- **Inte överförbar** mellan konton (hindrar svartmarknad)

#### Smart kombination med Pro-kontot

Pro-konto inkluderar 1500 tokens/månad — gör Pro mer attraktivt och
ger en transparent växelkurs som visar att tokens har monetärt värde.

#### B2B/friskvårdsvinkel — det starkaste argumentet

Företag köper "wellness-krediter" och delar ut till anställda. Anställd får
X tokens/månad att handla för. Det här är faktiskt huvudskälet att bygga
tokensystemet — företaget vill inte att anställda ska se varandras
betalkort, och tokens är ett naturligt mellanlager. Förmånsplattformarna
(Benify m.fl.) gillar också paketerade krediter snarare än lösa belopp.

---

### Fas 4 — B2B & friskvård (parallellt med Fas 3)
**Mål:** Företagsförsäljning som hävstång.

**Aktiviteter:**
- Kontakta förmånsplattformar (Benify, Epassi, Actiway, Wellnet)
- Få Skatteverket-godkännande som friskvårdstjänst
- Säljmaterial och företagsdemo
- Företagsadmin: dashboard för HR att se aktivitet (anonymiserad)
- Företagsspecifika promenader (t.ex. "Walk-and-talks runt huvudkontoret")

**Prismodell:**
- 49 kr/anställd/år för obegränsad åtkomst till alla promenader
- Eller "credits" — 5 promenader/anställd/år för 100 kr

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

## Innehållsskydd & betalning av `.tipspack` (framtida)

### Grundsanningar

1. **DRM går alltid att knäcka.** Målet är att göra okontrollerad spridning *obekväm*, inte omöjlig. Om inte Spotify och Kindle lyckas hindra 100% lär vi heller inte göra det.
2. **Största skyddet är appens värde.** Innehåll utan kartan, GPS-triggers och topplista är halvt värde. Samma princip som varför ingen piratkopierar Duolingos ordlistor — appen *är* produkten.
3. **UX-kostnad för DRM drabbar betalande kunder, inte pirater.** Lägg minimalt med DRM-lager för lägsta friktion.
4. **Prisnivå 49–149 kr = impulsköp.** Casual sharing-beteendet är "visa kompisen så han ser vad det är", inte organiserad piratering.

### Distributionsmodeller — spektrum från naivt till tungt

| Modell | Hur det funkar | Skydd | Offline? | Arbete | Lämplig för |
|---|---|---|---|---|---|
| **A. Öppen fil + hederssystem** | `.tipspack` skickas som-det-är | ⭐ | ✅ | 0 | Gratis-innehåll |
| **B. Watermarkad fil** | Köparens mail inbäddad i filen | ⭐⭐ | ✅ | 1 dag | **MVP för betalning** |
| **C. Cloud-levererat innehåll** | Inget filformat — content hämtas från Firestore efter köp | ⭐⭐⭐⭐ | 🟡* | ~1 vecka | När volym > 500 köp |
| **D. Krypterat paket + licensserver** | Fil krypterad, nyckel efter köp-verifiering | ⭐⭐⭐⭐⭐ | ✅ | ~2 veckor | Förmodligen aldrig |

*Cloud-modellen cachar lokalt efter första nedladdning → offline funkar efter första användning.

### Fas A — Watermarkad fil (rekommenderad start)

Köp → Cloud Function genererar unik kopia → e-post till köpare.

```json
{
  "format": "tipspack",
  "version": "1.1",
  "name": "Visby medeltid",
  "license": {
    "purchaseId": "ord_7a3f...",
    "buyerEmail": "lisa@example.com",
    "issuedAt": "2026-04-17T10:23:45Z",
    "hash": "sha256:..."
  },
  "questions": [...]
}
```

**Viktigt:**
- Mail visas synligt i JSON så köparen *vet* att det finns där → självbromsar spridning
- Appen visar "Köpt av Lisa" i info-dialogen när filen öppnas
- Socialt tryck > teknisk barriär

**Vad som behövs:**
- Cloud Function (Blaze-plan, ~2 kr/mån för vår skala) som Gumroad/Stripe webhookar
- Utöka `validateBattery()` — acceptera men inte kräv `license`-fältet (bakåtkompat)
- Landningssida "Jag har köpt — ladda ner"

**GDPR:** köparens mail i filen kräver transparent information i köpflödet ("Din mail bäddas in för att förhindra spridning"), legal basis = avtal (inte samtycke), möjlighet att begära ny fil med hashad identifierare.

### Fas B — Cloud-levererat innehåll (när vi har volym)

1. Köp → aktiveringskod via mail (eller djuplänk)
2. Appen verifierar kod mot Cloud Function → får `walkId` + lästillstånd
3. Firestore-regel: `allow read if exists(/purchases/{uid}_{walkId})`
4. Firestore-cache → offline efter första användning

**Fördelar:**
- Exakt analytics — vem har spelat vad
- Innehållsuppdateringar når alla köpare automatiskt
- Kan erbjuda "30-dagars tillgång", abonnemang, etc.
- Återkallelse vid chargeback är trivialt

**Nackdelar:**
- Ingen "ladda ner för offline" förrän appen öppnats minst en gång
- Beroende av backend (mitigeras av befintligt Firestore-cache + offline-läge)

### Fas C — Kryptering

Rekommenderas inte. Android-appar kan dekompileras, nyckelmaterial extraheras, smärtan för legitima användare när något går fel är aldrig värt det.

### Särskilda fall att planera för

**1. Marknadsplats (skapare säljer)**
- Stripe Connect för utbetalningar (månatlig payout > 200 kr)
- `sales/{saleId}` i Firestore med `creatorId`, `buyerId`, `amount`, `creatorCut`
- Cloud Function triggad på Stripe webhook

**2. Gifting / presentkort**
- Fas B-arkitekturen löser det naturligt: köparen får kod, skickar till mottagaren som aktiverar på egen telefon

**3. Chargebacks**
- Stripe webhook → Cloud Function raderar `purchases/{uid}_{walkId}` → tillgång försvinner (Fas B) eller loggas som blacklisted (Fas A)

**4. Företagslicenser (friskvård)**
- Group purchase: admin får X licenskoder, distribuerar internt
- Admin-dashboard med aktiveringsstatistik per anställd

### Rekommenderad fasordning

1. **Fas 1 i affärsplanen + Fas A-DRM** — watermarkad fil + Gumroad/Stripe-länk. Testa säljbarhet.
2. **När ≥500 betalda nedladdningar eller första pirat-incident** — migrera till Fas B (cloud-levererat).
3. **Fas C övervägs bara om B-modellen misslyckas** — bör inte hända.

### Milstolpar som triggar nästa steg

| Händelse | Åtgärd |
|---|---|
| Första 10 köpen | Verifiera Fas A-flödet end-to-end |
| 100 köpare | Lansera Stripe Connect för skapar-intäktsdelning |
| 500 köpare eller pirat-incident | Börja migrera till Fas B |
| Första företagslicens | Bygg admin-dashboard |
| > 5000 köpare | Utvärdera behov av automatiserade chargeback-flöden |

---

## Risker & motåtgärder

| Risk | Sannolikhet | Påverkan | Motåtgärd |
|------|-------------|----------|-----------|
| Apple/Google nekar app pga in-app-köp utanför deras system | Medel | Hög | Använd web-redirect för betalningar (lagligt sedan 2024) |
| Inget innehåll → ingen användning | Hög | Hög | Producera 5–10 högkvalitativa promenader själv som seed |
| Friskvård-godkännande tar för lång tid | Medel | Medel | Börja kontakta Skatteverket parallellt med Fas 1 |
| Konkurrent kopierar | Låg | Medel | Varumärke + community + B2B-relationer = moat |
| GPS-noggrannhet för dålig | Låg | Hög | Justerbar tröskel, tillåt manuell "jag är här"-knapp som backup |

---

## Konkurrentanalys (kort)

| App | Fokus | Vår fördel |
|-----|-------|-----------|
| **Komoot** | Ruttplanering cykel/vandring | Vi har gamification (frågor + poäng) |
| **AllTrails** | Naturleder | Vi är lokalt/svenskt, mer urban-fokus |
| **Geocaching** | Hitta gömda objekt | Vår innehåll är edukativt, inte sökande |
| **GuruWalk** | Stadsguider med människa | Vi är självgående, tillgängligt 24/7 |
| **Tipspromenad** (klassisk papperversion) | Skola/förening | Vi är digitalt, automatisk poäng |

---

## Nästa konkreta steg

1. **Vi (nu):** Implementera `.tipspack`-import i appen
2. **Du:** Producera ditt första frågebatteri för försäljning
3. **Du:** Sätt upp Gumroad-sida för försäljning
4. **Vi:** Iterera baserat på första testet

---

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
   - Integritetspolicy-URL (se `docs/privacy-policy.md`, hosta på GitHub Pages eller tipspromenaden.se)
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
  Associated Domains (`applinks:tipspromenaden.se`) så att QR-länkar öppnar appen
  direkt från Safari/Kamera-appen utan prompt. Kräver `apple-app-site-association`-fil
  på tipspromenaden.se.
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
