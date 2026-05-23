# Social media-poster för dual-launch (Android + iOS)

Tre poster — Facebook, Instagram (feed + stories), LinkedIn. Bilderna
ligger bredvid: `social-dual-launch-4x5.png` (FB/IG-feed),
`social-dual-launch-square.png` (LinkedIn), `social-dual-launch-story.png`
(IG/FB-stories).

Smart QR-trick: alla bilder har EN QR-kod som pekar på
`tipspromenaden.app/get-app` — sidan upptäcker OS och routar till rätt
store automatiskt. Android-användare öppnar Play Store, iPhone-
användare öppnar App Store.

---

## Facebook (feed) — använd `social-dual-launch-4x5.png`

```
🌳 Idag är det officiellt: Tipspromenaden finns både i Google Play
OCH App Store!

Det började som ett kvällsprojekt: "tänk om man kunde digitalisera
folkrörelseklassikern tipspromenad — utan papper, med GPS som
unlockar frågor när man kommer fram till kontrollerna." Sex månader
senare står vi här. På båda mobilerna.

Ett stort tack till varenda testpilot som rapporterade buggar,
föreslog förbättringar, satt på det första utkastet av frågor och
hängde med när vi labbade med cykelläge, audio-frågor och offline-
kartor. Det är ni som gjort att appen känns färdig.

Som lanseringspresent har vi byggt SJU färdiga promenader på kända
svenska platser:

📍 Skansen — En runda i världens äldsta friluftsmuseum
📍 Gamla stan, Stockholm — 800 år av historia
📍 Drottningholm — UNESCO och kungens hemvist
📍 Slottsskogen, Göteborg — Göteborgs gröna lunga
📍 Visby ringmur — Medeltidens hjärta
📍 Pildammsparken, Malmö — Malmös hjärta
📍 Falu koppargruva — Världens äldsta gruva

Plus sex helt nya frågebatterier för dig som vill skapa egna
promenader i din egen stad — Astrid Lindgren, svensk natur, svenska
slott, 80-talet, svensk musikexport och svenska uppfinnare.

🔍 Sök "Tipspromenaden" i App Store eller Google Play
🔗 Eller besök tipspromenaden.app (QR-koden i bilden funkar för
   båda mobiler — den hittar din enhet automatiskt)

Gratis. Inget konto krävs. Skapad i Sverige.

#tipspromenaden #frilufts­liv #gps #quiz #svenska­appar
```

---

## Instagram (feed) — använd `social-dual-launch-4x5.png`

Lättare ton, fler emojis, kortare paragrafer för mobil-läsning.

```
🌳 Idag firar vi: Tipspromenaden är nu live på BÅDA plattformarna!

Android sedan ett par veckor, iOS från idag.

Ett enormt tack till alla testpiloter som hjälpt oss komma hit. 🙏

🎁 Lanseringspresent: sju färdiga promenader på kända platser
runtom i Sverige — Skansen, Gamla stan, Drottningholm, Slottsskogen,
Visby, Pildammsparken, Falu koppargruva.

📚 Plus sex nya frågebatterier att importera när du skapar din
egen promenad — Astrid Lindgren, svensk natur, slott, 80-talet,
musik­exporten och uppfinnare.

📲 Skanna QR-koden i bilden — den hittar din mobil automatiskt
🔗 tipspromenaden.app

Gratis · Inget konto behövs · Skapad i Sverige

#tipspromenaden #friluftsliv #gps #quiz #frilufts­quiz #utomhus
#promenad #familj #stockholm #göteborg #malmö #svenskaappar
```

---

## LinkedIn — använd `social-dual-launch-square.png`

Mer professionell ton, story om resan, ingen smörjelse.

```
Idag, sex månader efter första commiten, är Tipspromenaden live
på både Google Play och App Store.

Vad det är: ett GPS-baserat verktyg för att skapa och delta i
tipspromenader. Skaparen ritar kontrollpunkter på en karta, kopplar
frågor till varje punkt och delar en QR-kod. Deltagaren går till
platsen — appen unlockar frågan när GPS säger man är framme.

Vad jag lärt mig av att bygga det här:

→ Hobbyprojekt utan deadline ger bättre produkt än sprintad
   leverans. Vi hann säga "nej, det löser inte det riktiga
   problemet" till tre eller fyra features som hade förflackat
   upplevelsen.

→ Native-deps på iOS (Firebase + statiska frameworks + App Check)
   är inte triviala — 10 byggfel mellan första submit och slutgod-
   kännande. Dokumentera varje fix; nästa person sparar timmar.

→ Curated launch-content är värt 10x den investerade tiden. Vi
   skeppar med sju färdiga promenader och sex frågebatterier; en
   ny användare har något att göra inom 60 sekunder från install.

→ Smart QR (en QR-kod, OS-detektering på en server-sidlös sida)
   är en oproportionerligt elegant detalj — användarna behöver
   inte tänka.

Stack: React Native (Expo SDK 55) + Firebase + Astro (webben) +
Cloudflare Pages. Allt open source-vänligt och hobby-skala.

Stort tack till alla testpiloter — ni har gjort den klar.

🔗 tipspromenaden.app
🍏 App Store: apps.apple.com/se/app/id6770503457
🤖 Google Play: play.google.com/store/apps/details?id=com.tipspromenaden.app

(QR-koden i bilden router automatiskt till rätt store baserat på
din mobiltyp — vi tycker det är professionellt.)

#mobileapp #reactnative #firebase #indiedev #sweden
```

---

## Instagram Stories — använd `social-dual-launch-story.png`

Stories har bara plats för 1-2 rader text + sticker. Använd Story-
bildens egen text + sticker-knapp till länken.

**Sticker:**
- "Link sticker" → `https://tipspromenaden.app/get-app`
- Etikett: "Hämta appen 🌳"

**Text-overlay (svenska):**
```
Nu på båda plattformarna 🎉
Tack till alla testare ❤️
```

**Text-overlay (engelska):**
```
Now on both platforms 🎉
Thanks to all our testers ❤️
```

---

## Tidpunkt-rekommendation

Posta på morgonen (8-10 sv-tid) den dag du trycker Release på App
Store — Apple aktiverar URL:en parallellt så när någon klickar
direkt fungerar det. Annars riskerar du "404 — appen finns inte"
under 1-2 timmar.

Bästa volyma: FB-grupp om friluftsliv lokalt, IG-stories från ditt
eget konto, LinkedIn-text på din profil + valfri delning i indie-dev-
grupper. Plus ev. en tweet om du är där.

---

## Filer

- `social-dual-launch-4x5.png` — 1080×1350 (FB/IG feed)
- `social-dual-launch-square.png` — 1080×1080 (LinkedIn)
- `social-dual-launch-story.png` — 1080×1920 (IG/FB Stories)
- `qr-bli-testare.png` — fristående QR (legacy filnamn, innehållet
  pekar på `/get-app`-smart-redirecten)
