# Supporter-tacksidan — admin-formulär på webben (spec)

Appen har en tacksida (Inställningar → "Tack till våra supportrar" →
`SupportersScreen`) som listar namn på personer som stöttat projektet.
Namnen läses från Firestore-doc:et **`config/supporters`**.

Det här dokumentet beskriver formuläret som ska byggas i
`tipspromenaden-web` (repo:t är ett syskon till app-repot) på
`/admin`-sidan, som en ny flik/sektion bredvid Events och moderering.

## Doc-format (`config/supporters`)

```jsonc
{
  "names": ["Anna Andersson", "Bertil B", "Cilla C"],  // visas i denna ordning
  "message": {                                          // VALFRI — ersätter appens
    "sv": "Egen intro-text på svenska",                 // default-intro om satt
    "en": "Custom intro in English"
  },
  "updatedAt": 1751673600000                            // Date.now() vid skrivning
}
```

- `names` — hela listan skrivs varje gång (ersätt, inte append). Appen
  trimmar och cappar varje namn till 100 tecken klient-side, men håll
  dem korta redan i formuläret.
- `message` — utelämna helt om default-texten ska användas. Appen
  fallbackar `en → sv` och vice versa.

## Säkerhetsregler

**Ingen regeländring behövs.** `firestore.rules` har redan:

```
match /config/{docId} {
  allow read: if true;
  allow write: if isSignedIn() && isAdmin();
}
```

dvs. samma mönster som `config/appUpdate` — publik läsning (appen läser
utan inloggning), endast admin-UID:n (samma `ADMIN_UIDS` som webbens
`src/lib/admin.ts`) får skriva.

## Föreslagen UI på /admin

- **Textarea** med ett namn per rad (enklast att redigera/sortera om) →
  splitta på radbrytning, trimma, filtrera tomma rader → `names`.
- Två valfria textfält för `message.sv` / `message.en` (lämna tomma →
  fältet utelämnas ur doc:et).
- Spara-knapp → `setDoc(doc(db, "config", "supporters"), payload)`
  (utan merge, så borttagna fält inte spökar kvar) med
  `updatedAt: Date.now()`.
- Vid load: `getDoc` och för-ifyll formuläret med nuvarande lista.

## Brygga tills formuläret finns

App-repots `scripts/set-supporters.mjs` skriver samma doc från CLI
(kräver `firebase-admin-key.json` i repo-roten):

```
node scripts/set-supporters.mjs --names "Anna Andersson, Bertil B"
node scripts/set-supporters.mjs --file supporters.txt   # ett namn per rad
```

## Framtida idé

Webben kan visa samma lista på en publik `/tack`-sida — den läser
samma doc (publik read), så ingen extra backend behövs.
