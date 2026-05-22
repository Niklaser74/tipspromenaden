# Marketing-mappen

Generatorer för printbart och digitalt marknadsmaterial för
Tipspromenaden. Alla scripten är fristående Node-program — inga
runtime-deps för mobilappen. Stilen kallas **"Friluft Folio"**
(se `design-philosophy.md`) och regleras av `BRAND.md` (svensk
varumärkesguide; `BRAND.pdf` är den printbara versionen).

## Snabbstart

```bash
cd docs/marketing
npm install                 # napi-rs/canvas + pdfkit + pdf-lib + pdfjs-dist
node build-flyer.mjs        # eller annan generator (lista nedan)
```

Output-filer hamnar i samma mapp. Vissa scripten kopierar inte
automatiskt vidare — t.ex. `build-og-image.mjs` ger en PNG som
du sedan manuellt kopierar till `tipspromenaden-web/public/og-image.png`
och pushar.

## Beroenden — externa font-filer

**OBS:** alla canvas-baserade scripten läser typsnitt (Lora,
Instrument Sans) från en sökväg i Claude Codes lokala skill-cache:

```
$APPDATA/Claude/local-agent-mode-sessions/skills-plugin/<UUID>/.../canvas-design/canvas-fonts
```

Detta är fragilt — sökvägen kan ändras om Claude Code uppdateras
eller installeras om. Om du får `ENOENT` på font-laddning:

1. Sök efter `canvas-fonts`-katalogen under `$APPDATA/Claude/`
2. Uppdatera `FONTS`-konstanten överst i varje `.mjs`-script

`build-brand-pdf.mjs` är undantaget — den drar Lora + Instrument
Sans från Google Fonts via CDN i HTML-mallen, så font-vägen ovan
behövs inte för PDF-bygget.

## Scripten — vad varje gör

### Tryckt material

| Script | Output | Användning |
|---|---|---|
| `build-flyer.mjs` | `flygblad-tipspromenaden.pdf` + `.png` | A5-flygblad, ena sidan |
| `build-flyer-2up.mjs` | `flygblad-tipspromenaden-2up.pdf` | 2 A5 på A4 — sparar papper vid utskrift |
| `build-flyer-bifold.mjs` | `flygblad-tipspromenaden-bifold.pdf` | Vikbart A4 (fyra ytor) |
| `build-flyer-hammardammen.mjs` | `flygblad-hammardammen.pdf` + 2up + `.png` | Lokal variant — Hammardammen, två-stegs-QR-flöde |
| `build-brand-pdf.mjs` | `BRAND.pdf` | Renderar `BRAND.md` till print-PDF med brand-CSS via headless Chrome. Kräver Chrome/Chromium installerat. |
| `build-brand-pack.mjs` | `tipspromenaden-brand-pack-YYYY-MM-DD.zip` | Bunt med BRAND.pdf + ikoner + bilder + flygblad — delas med partners. |

### Digitalt material

| Script | Output | Användning |
|---|---|---|
| `build-og-image.mjs` | `og-image.png` (1200×630) | Open Graph-bild för link-previews. Kopiera till `tipspromenaden-web/public/og-image.png`. |
| `build-qr.mjs` | `qr-bli-testare.png` | QR-kod som pekar på `https://tipspromenaden.app/get-app` (smart-redirect Android→Play / iPhone→stod). Bakas in i flygblad och social-bilder. |
| `build-social-onepager.mjs` | `social-onepager-bli-testare.png` (4:5) + `square-bli-testare.png` (1:1) + `story-bli-testare.png` (9:16) | Bli-testare-värvning till FB/IG/LinkedIn/Stories. |
| `build-social-launch.mjs` | `social-launch-4x5.png` + `square.png` + `story.png` | **Lanseringsbanner** (2026-05-21) — "Android live på Play Store + iOS-testpiloter sökes". Tre format i en körning. |

### Verktyg

| Script | Output | Användning |
|---|---|---|
| `preview-pdf.mjs` | PNG-preview av en PDF-sida | Sanity-check av PDF-output innan tryck. Tar PDF-filnamn som argument. |

## När du bygger ett nytt script

Designprinciper enligt `BRAND.md` + `design-philosophy.md` — kort:

- **Bakgrund:** `#F5F0E8` (cream)
- **Primärfärg:** `#1B6B35` (forest green) — bara för rubrik, CTA-block, en accent
- **Accentfärg:** `#E8B830` (yellow) — sparsamt
- **Headlines:** `LoraBold` (serif)
- **Body:** `InstSans` (sans-serif)
- **Eyebrows:** `InstSansBold` versaler med tracking
- **Komposition:** generösa marginaler, lugn vertikal rytm, en hairline-rule räcker som separator
- **Copy:** inga utropstecken, inga dekorativa emojis (📱🍎 OK som funktions-indikator)

Kopiera strukturen från ett existerande script (t.ex. `build-social-launch.mjs`) och variera output-format/copy. Helper-funktionerna (`makeRenderer`, `drawStatusCard`, `drawCta`, `wrapText`, `roundRect`) är inte centralt biblioteksgjorda — varje script duplicerar dem för att hållas fristående. Acceptabelt så länge antalet scripten är begränsat (~10).

## Att INTE committa

- `node_modules/` — gitignored
- `_brand-build/` (mellanlager för `build-brand-pdf.mjs`) — gitignored
- Tillfälliga preview-PNGs från `preview-pdf.mjs`

Slutprodukter (PDF + PNG) **committas** så folk har dem utan att behöva köra build-stegen.

## Kvar att städa upp

Se ROADMAP-punkten "Slug-sanering vid tipspack-upload" — INTE relaterat, ignorera. Marketing-mappen har en separat liten ROADMAP-punkt i huvudfilen:

- Många generatorer återanvänder helper-funktioner via copy-paste. När antalet generatorer växer över ~10 är det dags att bryta ut `_lib/canvas-helpers.mjs`.
