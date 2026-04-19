---
name: create-tipspack
description: Skapar en .tipspack-fil (frågebatteri för Tipspromenaden-appen) från ett ämne, en plats eller en lista med fakta. Använd när användaren vill generera ett nytt frågebatteri – t.ex. "skapa ett tipspack om Visby", "gör ett frågebatteri om svenska kungar", "10 frågor om fotboll-VM 1958".
---

# Skapa .tipspack-frågebatteri

Den här skillen genererar en `.tipspack`-fil i Tipspromenaden-appens format. Filen
kan importeras i CreateWalkScreen där skaparen sedan placerar varje fråga på en
GPS-punkt på kartan.

## Filformat

```json
{
  "format": "tipspack",
  "version": "1.0",
  "name": "<kort namn på batteriet>",
  "description": "<en mening om innehållet>",
  "author": "<författare, t.ex. 'Niklas Eriksson' eller 'Tipspromenaden AB'>",
  "language": "<ISO 639-1-kod, t.ex. 'sv', 'en', 'de', 'no', 'da', 'fi', 'fr', 'es'>",
  "questions": [
    {
      "text": "<frågetext>",
      "options": ["<alt 1>", "<alt 2>", "<alt 3>", "<alt 4>"],
      "correctOptionIndex": 0
    }
  ]
}
```

Källan på sant: `src/services/questionBattery.ts` i samma repo. Validera mot den
om du är osäker på fältnamn.

## Hårda regler (validatorn avvisar annars)

1. `format` MÅSTE vara strängen `"tipspack"`.
2. `version` MÅSTE vara strängen `"1.0"` (om inget annat sägs).
3. `name` MÅSTE vara en icke-tom sträng.
4. `questions` MÅSTE vara en icke-tom array.
5. Varje fråga MÅSTE ha:
   - `text`: icke-tom sträng
   - `options`: array med **minst 2** strängar, alla icke-tomma
   - `correctOptionIndex`: heltal `0 <= i < options.length`

## Språkregler

- Lägg alltid med `language` som en ISO 639-1-kod som speglar vilket språk
  frågorna faktiskt är skrivna på. Appen använder det för att automatiskt
  sätta promenadspråket och visa rätt flagga i listor.
- Fråga alltid användaren vilket språk frågorna ska vara på (se arbetsflödet
  nedan) — gissa inte. Språkvalet är viktigare än det verkar: det styr
  vilken flagga som visas i appen och hur batteriet kategoriseras.
- Stödda koder (visa dessa som alternativ när du frågar):
  🇸🇪 `sv` · 🇬🇧 `en` · 🇩🇪 `de` · 🇳🇴 `no` · 🇩🇰 `da` · 🇫🇮 `fi` · 🇫🇷 `fr` · 🇪🇸 `es`
- `language` MÅSTE stämma överens med frågespråket — skriv inte `"sv"` om
  frågorna är på engelska.

## Stilregler för frågorna

- **Antal alternativ:** standardisera på 4 om inget annat sägs (3 funkar också).
- **Längd på alternativ:** håll dem korta och jämförbara — undvik att rätt svar är
  uppenbart längre än distraktorerna.
- **Distraktorer ska vara plausibla**, inte uppenbart fel. Helst i samma kategori
  som rätt svar (årtal vs årtal, namn vs namn).
- **Variera `correctOptionIndex`** så att rätt svar inte alltid ligger på samma
  position. Sikta på ungefär jämn fördelning över 0–3.
- **En fråga ska ha exakt ett rätt svar.** Inga "alla ovanstående".
- **Skriv på det språk som bekräftats i steg 1.** Håll dig konsekvent — blanda
  inte språk i samma batteri.
- **Faktagranska** — sätt inte ihop frågor du är osäker på. Hellre färre frågor
  än felaktiga frågor. Om du måste gissa, säg det till användaren och be om
  verifiering.
- **Undvik dubbletter** och frågor som testar samma fakta från olika håll.
- **Sikta på 10 frågor** om inget antal anges.

## Filnamn och placering

- Filändelse: `.tipspack` (inte `.json`, även om innehållet är JSON).
- Filnamn: lowercase, bindestreck, inga åäö i själva filnamnet om möjligt
  (t.ex. `visby-medeltid.tipspack`, inte `Visby Medeltid.tipspack`).
- Placera filen i `examples/` i repot om det är ett demo-/exempelpack, annars
  fråga användaren var den ska sparas (Downloads, OneDrive-roten osv. är vanligt
  för testning eftersom de ska kunna väljas i mobilens filhanterare).

## Arbetsflöde

1. **Ta in input och fråga om språk.** Om användaren inte angett vilket språk
   frågorna ska vara på — fråga alltid. Visa flaggalternativen kort och vänta
   på svar innan du genererar något. Exempel på hur du frågar:

   > Vilket språk ska frågorna vara på?
   > 🇸🇪 sv · 🇬🇧 en · 🇩🇪 de · 🇳🇴 no · 🇩🇰 da · 🇫🇮 fi · 🇫🇷 fr · 🇪🇸 es

   Undantag: om användaren redan angett språk explicit ("gör det på engelska",
   "english questions") eller om det är uppenbart av kontexten (användaren
   skriver på tyska och frågar om ett tyskt ämne) — välj direkt och berätta
   vilket du valde. Be om övriga förtydliganden (antal frågor, ämne) bara om
   det verkligen är oklart.

2. **Generera frågorna** på det valda språket. Faktagranska medan du skriver.
   Om en fråga är osäker — släng den och välj en annan vinkel hellre än att gissa.

3. **Variera rätt-svar-positionerna.** Räkna efter innan du sparar — om alla 10
   har `correctOptionIndex: 0` är det fel, blanda om.

4. **Validera mentalt mot reglerna ovan** innan du skriver filen. Kontrollera
   särskilt att `language`-koden stämmer med det faktiska frågespråket.

5. **Skriv filen** med Write-verktyget. JSON ska vara läsbart formaterat (2
   spaces indent).

6. **Rapportera tillbaka** till användaren: filsökväg, antal frågor, vilket
   språk du satte, kort sammanfattning av temat. Nämn om du var osäker på
   någon fråga.

## Mall att fylla i

Använd detta som utgångspunkt — ändra namn, beskrivning, frågor:

```json
{
  "format": "tipspack",
  "version": "1.0",
  "name": "",
  "description": "",
  "author": "Niklas Eriksson",
  "language": "sv",
  "questions": [
    {
      "text": "",
      "options": ["", "", "", ""],
      "correctOptionIndex": 0
    }
  ]
}
```

## Exempel på bra fråga

```json
{
  "text": "Vilket år grundades Stockholm enligt Erikskrönikan?",
  "options": ["1187", "1252", "1350", "1397"],
  "correctOptionIndex": 1
}
```

Notera: alla alternativ är årtal i samma århundradeintervall — distraktorerna är
plausibla, inte uppenbart fel.

## Exempel på dålig fråga (gör inte så här)

```json
{
  "text": "Vad är huvudstaden i Sverige?",
  "options": ["Stockholm", "En stad i Norge", "Banan", "Vet ej"],
  "correctOptionIndex": 0
}
```

Problem: distraktorerna är inte plausibla, frågan är trivial, och rätt svar är
uppenbart längst.

## Referens

- Validatorn: `src/services/questionBattery.ts`
- Färdigt exempel: `examples/stockholms-gamla-stan.tipspack`
- Var importen sker i appen: `src/screens/CreateWalkScreen.tsx`
  (sök efter `handleImportBattery`)
