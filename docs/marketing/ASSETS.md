# Marknadsmaterial — referensguide

Komplett katalog över genererat material i `docs/marketing/` med
användningsfall, plattform-matriser och CLI-kommandon för att
regenerera. För brand-regler se `BRAND.md`. För teknisk översikt av
hur scripten fungerar se `README.md`.

---

## Snabb plattform → fil-matris

| Plattform | Rekommenderad fil | Format | Storlek |
|---|---|---|---|
| **Instagram feed-post** | `social-walk-animation.mp4` | 1080×1350 video | 110 KB |
| **Instagram Reels/Stories** | `social-walk-stories.mp4` | 1080×1920 video | 120 KB |
| **Instagram inläggsbild (statisk)** | `social-dual-launch-4x5.png` | 1080×1350 PNG | ~700 KB |
| **Facebook feed-post (video)** | `social-walk-animation.mp4` | 1080×1350 video | 110 KB |
| **Facebook feed-post (statisk)** | `social-dual-launch-4x5.png` | 1080×1350 PNG | ~700 KB |
| **LinkedIn-post** | `social-dual-launch-square.png` | 1080×1080 PNG | ~700 KB |
| **LinkedIn-video** | `social-walk-animation.mp4` | 1080×1350 video | 110 KB |
| **Twitter/X-post** | `social-walk-animation.gif` el. `.mp4` | varierar | 5.9 MB / 110 KB |
| **GitHub README** | `walk-animation.gif` (utan banner-frame) | 480×854 GIF | 1.6 MB |
| **Email-signatur / nyhetsbrev** | `walk-animation.gif` | 480×854 GIF | 1.6 MB |
| **Webb hero på `tipspromenaden.app`** | `social-walk-animation.mp4` | 1080×1350 video | 110 KB |
| **Discord/Slack inline-embed** | GIF-variant av samma motiv | varierar | varierar |
| **Print-flygblad A5** | `flygblad-tipspromenaden.pdf` | A5 PDF | varierar |
| **Print-flygblad bifold** | `flygblad-tipspromenaden-bifold.pdf` | A4 viken PDF | varierar |
| **OG-image för länkdelning** | `og-image.png` | 1200×630 PNG | varierar |

---

## Filkatalog

### A. Walk-animations (anim-fokus, mindre branding)

Levande illustration av en hel walk: karta → kontroll → fråga → svar →
nästa kontroll. 8-sek loop. För kontexter där produkten är hjälten
utan att texten konkurrerar.

| Fil | Dim | Storlek | Använd |
|---|---|---|---|
| `walk-animation.gif` | 480×854 | 1.6 MB | GitHub README, email-signaturer, små embed |
| `walk-animation-fun.gif` | 480×854 | 1.6 MB | Skämt-poster där "Tipspromenaden" är rätt svar |
| `walk-animation-fun-frame80.png` | 480×854 | ~120 KB | Frame-preview av feedback-fasen |

**Generera med:**
```bash
cd docs/marketing
node build-walk-animation.mjs
# Med anpassad fråga:
node build-walk-animation.mjs \
  --question="Din fråga?" \
  --options="A,B,C,D" \
  --correct=2 \
  --output=walk-anpassad.gif
```

### B. Social-walk-animations (release-fokus + walk-anim i ramen)

Telefon-frame med walk-animation centrerad, ramat in av eyebrow,
headline, huvudbudskap, tack-rad, QR-kod och footer. Skapad för
release-firanden där appen som helhet är subjektet — animationen
är supporting evidence.

| Fil | Format | Dim | Storlek | Tema | Använd |
|---|---|---|---|---|---|
| `social-walk-animation.gif` | feed | 1080×1350 | 5.9 MB | dark (cream) | FB/IG feed (om MP4 inte funkar) |
| `social-walk-animation.mp4` | feed | 1080×1350 | 110 KB | dark | **FB/IG/LinkedIn feed-video** |
| `social-walk-animation-light.gif` | feed | 1080×1350 | 5.9 MB | light (vit) | Alt-design för poster mot mörk bg |
| `social-walk-animation-fun.gif` | feed | 1080×1350 | 5.9 MB | dark | Skämt-version, "internets roligaste app" |
| `social-walk-stories.gif` | stories | 1080×1920 | 6.2 MB | dark | IG/FB Stories (om MP4 inte funkar) |
| `social-walk-stories.mp4` | stories | 1080×1920 | 120 KB | dark | **IG Reels/Stories** |
| `social-walk-stories-light.gif` | stories | 1080×1920 | 6.0 MB | light | Stories alt-design |

**Generera med:**
```bash
node build-social-walk-animation.mjs
# Standardflaggor:
node build-social-walk-animation.mjs \
  --format=feed \            # eller --format=stories
  --theme=dark \             # eller --theme=light
  --output=valfritt.gif \
  --mp4                      # även MP4-export

# Skapa custom-variant:
node build-social-walk-animation.mjs \
  --format=stories \
  --theme=light \
  --question="Anpassad fråga?" \
  --options="Alt1,Alt2,Alt3,Alt4" \
  --correct=0 \
  --output=social-stories-custom.gif \
  --mp4
```

### C. Statiska launch-bannrar (dual-platform-firande)

Statiska bilder från dagen då båda plattformarna är live. Friluft
Folio-paletten, "NU LIVE · ANDROID OCH iOS"-eyebrow, plattformspillar,
QR-kod, tack-rad.

| Fil | Dim | Använd |
|---|---|---|
| `social-dual-launch-4x5.png` | 1080×1350 | FB/IG feed-statisk |
| `social-dual-launch-square.png` | 1080×1080 | LinkedIn-post-statisk |
| `social-dual-launch-story.png` | 1080×1920 | IG Stories-statisk |
| `social-dual-launch-copy.md` | — | Färdiga inläggstexter per plattform |

**Generera med:**
```bash
node build-social-dual-launch.mjs
```

### D. Tidigare social-bannrar (kvar för bakåt-ref)

| Fil | Vad | Status |
|---|---|---|
| `social-launch-4x5.png` | Android-only-launch (2026-05-17) | ⚠️ Inaktuell sedan iOS-launch |
| `social-launch-square.png` | Samma, kvadrat | ⚠️ Inaktuell |
| `social-launch-story.png` | Samma, Stories | ⚠️ Inaktuell |
| `social-onepager-bli-testare.png` | Testpilot-värvning | ⚠️ Inaktuell (testperioden klar) |
| `social-square-bli-testare.png` | Samma, kvadrat | ⚠️ Inaktuell |
| `social-story-bli-testare.png` | Samma, Stories | ⚠️ Inaktuell |

Behåll filerna ifall vi vill referera till lansering-resan i en
retrospektiv.

### E. Print-material

| Fil | Vad |
|---|---|
| `flygblad-tipspromenaden.pdf` | A5 enkelsida |
| `flygblad-tipspromenaden-2up.pdf` | 2 × A5 på A4 (sparar papper vid utskrift) |
| `flygblad-tipspromenaden-bifold.pdf` | Vikbart A4, 4 ytor |
| `flygblad-tipspromenaden.png` | Samma som A5-PDF:en, rasterad |
| `flygblad-hammardammen.pdf` | Lokal variant — Hammardammen |
| `flygblad-hammardammen-2up.pdf` | Hammardammen 2-up |
| `flygblad-hammardammen.png` | Hammardammen rasterad |

**Generera med:** `node build-flyer.mjs` / `build-flyer-2up.mjs` / `build-flyer-bifold.mjs` / `build-flyer-hammardammen.mjs`

### F. QR-koder

| Fil | Pekar på |
|---|---|
| `qr-bli-testare.png` | `tipspromenaden.app/get-app` (smart redirect) |
| `qr-hammardammen.png` | Variant för Hammardammen-promenaden |

QR pekar **alltid** på `/get-app` — sidan upptäcker OS och routar
automatiskt (Android → Play Store, iPhone → App Store).

**Generera med:** `node build-qr.mjs`

### G. Övrigt

| Fil | Vad |
|---|---|
| `og-image.png` | Open Graph 1200×630 för länkdelningar — kopiera till `tipspromenaden-web/public/og-image.png` |
| `BRAND.md` + `BRAND.pdf` | Varumärkesguide |
| `design-philosophy.md` | "Friluft Folio"-designfilosofi |
| `tipspromenaden-brand-pack-2026-05-06.zip` | Komplett brand-paket för partners |
| `README.md` | Teknisk översikt över marketing-mappen |

---

## Embed-snippets per kontext

### HTML (webbsida med autoplay)

```html
<!-- MP4 är förstaval — kräver alla fyra attribut för iOS-autoplay -->
<video
  src="/social-walk-animation.mp4"
  autoplay
  muted
  loop
  playsinline
  width="540"
  poster="/social-walk-animation-poster.jpg"
></video>

<!-- GIF som fallback (eller för IE/äldre kontexter) -->
<img
  src="/social-walk-animation.gif"
  alt="Tipspromenaden — så fungerar appen"
  width="540"
/>
```

### Markdown (GitHub README)

```markdown
![Tipspromenaden — så fungerar appen](docs/marketing/walk-animation.gif)
```

MD-renderingar accepterar inte `<video>`-taggar för säkerhet, så
GIF är enda vägen.

### Email-signatur

GIF är enda vägen — de flesta mejlklienter (Gmail, Outlook) blockerar
video. Använd `walk-animation.gif` (1.6 MB, liten nog för signatur).

### Instagram-post (publicering)

1. Öppna IG → ny post
2. Välj **MP4** från Photos (`social-walk-animation.mp4`)
3. IG accepterar direkt, ingen konvertering
4. Inläggstext från `social-dual-launch-copy.md` → Instagram-sektion

### Instagram Stories

1. Öppna IG → Stories
2. Välj **MP4** (`social-walk-stories.mp4`)
3. Lägg på sticker → "Länk" → `https://tipspromenaden.app/get-app`
4. Etikett: "Hämta appen 🌳" eller liknande

---

## Branding — kortregler

**Färgpalett (Friluft Folio):**
- Background: `#F5F0E8` (cream) / `#FFFFFF` (light variant)
- Forest green: `#1B6B35` (primär)
- Green dark: `#1B3D2B` (rubriker, CTA-bg)
- Text: `#2C3E2D` (body)
- Sage: `#8A9A8D` (sekundär text)
- Yellow: `#E8B830` (accent — sparsamt)

**Typografi:**
- Headlines: `Lora Bold` (serif)
- Body: `Instrument Sans` (sans-serif)
- Eyebrows: `Instrument Sans Bold` versaler med tracking

**Ton:**
- Inga utropstecken i marknadstext (förutom "RÄTT!"-feedback inne i appen)
- Inga dekorativa emojis (🎉🚀🔥). Funktions-emoji (📱🍎🌳📍) OK
- Forest green som enda "skrikande" färg. Gult sparsamt som accent.

**Copy-stilen:**
- Korta, lugna meningar
- "Du" snarare än "Ni"
- "Promenad" inte "vandring" eller "spel"
- Säg "tipspromenad" (med litet t) som koncept, "Tipspromenaden" (med stort T) som produkt

---

## Vad scripten kräver

```bash
# I docs/marketing/:
npm install
# Drar in: @napi-rs/canvas, gif-encoder-2, ffmpeg-static, pdfkit, pdf-lib

# Font-paket från Claude Code skill-cache:
# $APPDATA/Claude/local-agent-mode-sessions/skills-plugin/<UUID>/.../canvas-design/canvas-fonts
# Innehåller Lora-Bold.ttf, Lora-Italic.ttf, InstrumentSans-*.ttf
# Om font-laddning failar (ENOENT) — uppdatera FONTS-konstanten i scripten.
```

---

## Vanliga uppgifter

### "Posta release-firandet på social media"

1. Använd `social-dual-launch-copy.md` för texten (FB / IG / LinkedIn / Stories)
2. Använd MP4 om plattformen accepterar (IG/FB feed, IG Reels, LinkedIn): `social-walk-animation.mp4` (feed) eller `social-walk-stories.mp4` (Stories)
3. Använd GIF eller statisk PNG som fallback

### "Lägg upp på webbens hero"

```html
<video src="/walk-animation.mp4" autoplay muted loop playsinline></video>
```
Kopiera `social-walk-animation.mp4` till `tipspromenaden-web/public/`.

### "Skapa en ny variant av animationen för X-tillfälle"

```bash
node build-social-walk-animation.mjs \
  --format=stories \
  --theme=light \
  --question="X-relaterad fråga" \
  --options="Alt1,Alt2,Tipspromenaden,Alt4" \
  --correct=2 \
  --output=social-walk-stories-X.gif \
  --mp4
```

### "Posta i email-signatur"

Använd `walk-animation.gif` (480×854, 1.6 MB). Mindre format, autoplay i Gmail/Outlook.

### "Lägg i GitHub README"

```markdown
![Tipspromenaden](docs/marketing/walk-animation.gif)
```

### "Skicka tryckbar version till tryckeri"

Använd PDF-erna. `flygblad-tipspromenaden.pdf` för A5 enkelsida.
`flygblad-tipspromenaden-bifold.pdf` för vikbart A4 (4 ytor — fram,
bak, insida vänster, insida höger).

---

## Översikt över alla generator-scripts

| Script | Genererar |
|---|---|
| `build-walk-animation.mjs` | walk-animation.gif (anim, 480×854) |
| `build-social-walk-animation.mjs` | social-walk-animation.gif/mp4 + alla varianter |
| `build-social-dual-launch.mjs` | social-dual-launch-*.png (statiska launch-bannrar) |
| `build-social-launch.mjs` | (Inaktuell — Android-only-launchen) |
| `build-social-onepager.mjs` | (Inaktuell — testpilot-värvning) |
| `build-flyer.mjs` | flygblad-tipspromenaden.pdf + .png |
| `build-flyer-2up.mjs` | flygblad-tipspromenaden-2up.pdf |
| `build-flyer-bifold.mjs` | flygblad-tipspromenaden-bifold.pdf |
| `build-flyer-hammardammen.mjs` | Hammardammen-flygblad (lokal variant) |
| `build-og-image.mjs` | og-image.png (1200×630 för länkdelningar) |
| `build-qr.mjs` | qr-bli-testare.png + qr-hammardammen.png |
| `build-brand-pdf.mjs` | BRAND.pdf från BRAND.md |
| `build-brand-pack.mjs` | tipspromenaden-brand-pack-YYYY-MM-DD.zip |

---

Uppdaterat: 2026-05-24
