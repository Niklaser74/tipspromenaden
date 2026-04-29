# Bibliotek / Discovery — designnotat

Planerad feature för att bläddra och söka i ett publikt bibliotek av
tipspromenader skapade av andra användare. Stort scope, planerad i
flera iterationer.

Fångad 2026-04-28 efter diskussion. Sätts igång när:
1. Det finns 20+ skapade walks att fylla biblioteket med
2. v1.2.0 är ute och stabilt hos testarna
3. App Check (M5) är på plats — public read av walks gör attackytan
   större och App Check är vårt första försvar

---

## Motivation

Idag är walks privata: ägaren ser sina egna, andra ser bara walks de
fått en QR-kod till. Det fungerar för testfasen men skalar inte —
nya användare har inget att göra första gången de öppnar appen om de
inte fått en QR av någon. Ett genomsökbart bibliotek av publicerade
walks gör appen själv-bärande.

---

## Datamodell

Nya fält på `Walk` (alla optional för bakåtkompabilitet):

```ts
interface Walk {
  // ... befintliga fält ...

  /** Skaparen har medvetet publicerat walken till biblioteket. Default: false. */
  public?: boolean;

  /** Stadnamn, manuellt eller via reverse-geocoding av centroid. */
  city?: string;

  /** Län eller kommun. Som city — auto eller manuellt. */
  region?: string;

  /** Mittpunkt av frågekoordinaterna. Beräknas vid save. */
  centroid?: { latitude: number; longitude: number };

  /**
   * Bbox runt frågorna. Förenklar geo-query: vi kan fråga "ge mig
   * walks vars bbox överlappar mitt nuvarande bbox" istället för att
   * räkna haversine på alla.
   */
  bounds?: {
    minLat: number; maxLat: number;
    minLng: number; maxLng: number;
  };

  /**
   * Ämnesområden frågorna täcker. MULTI eftersom en walk om Hammar-
   * dammen ofta blandar geografi + naturvetenskap + lokalhistoria.
   * Kontrollerad lista (se SUBJECTS-konstant nedan), inte fri text —
   * annars splittas filtreringen av stavfel.
   */
  subjects?: string[];

  /** Målgruppens ålderskategori. SINGLE value. */
  ageRating?: "barn" | "ungdom" | "vuxen" | "familj";
}
```

Konstantlista (i `src/constants/subjects.ts`):

```ts
export const SUBJECTS = [
  { id: "natur",       emoji: "🌿", labelKey: "subject.natur" },
  { id: "historia",    emoji: "🏛️", labelKey: "subject.historia" },
  { id: "geografi",    emoji: "🗺️", labelKey: "subject.geografi" },
  { id: "teknik",      emoji: "💡", labelKey: "subject.teknik" },
  { id: "popkultur",   emoji: "🎬", labelKey: "subject.popkultur" },
  { id: "spraklit",    emoji: "📚", labelKey: "subject.spraklit" },
  { id: "idrott",      emoji: "⚽", labelKey: "subject.idrott" },
  { id: "konstmusik",  emoji: "🎨", labelKey: "subject.konstmusik" },
  { id: "matdryck",    emoji: "🍎", labelKey: "subject.matdryck" },
  { id: "allmant",     emoji: "🧠", labelKey: "subject.allmant" },
] as const;
```

Åldersnivå (kommentar för CreateWalk-UI):

```
barn    — ca 4-9 år, enkla frågor, mycket bilder
ungdom  — ca 10-15 år, mellansvårt, skol-anknutet
vuxen   — 16+, pubquiz-nivå
familj  — designat för blandade åldrar (7-åring + farmor)
```

`familj` är medvetet egen kategori, inte "alla åldrar" — signalerar att
frågorna är designade för att fungera när olika åldrar går tillsammans.

---

## Säkerhetsregler

I `firestore.rules`:

```
match /walks/{walkId} {
  // Läs: ägaren OCH alla andra om walken är publik
  allow read: if request.auth != null
              && (resource.data.createdBy == request.auth.uid
                  || resource.data.public == true);

  // Skriv: oförändrat — bara ägaren
  allow create: if /* ... existing ... */;
  allow update: if /* ... existing ... */
                && hasValidWalkShape(request.resource.data);
}
```

`hasValidWalkShape` utökas med:
- `subjects`: list (om satt), max 5 element, varje element i SUBJECTS-listan
- `ageRating`: string (om satt), in {"barn", "ungdom", "vuxen", "familj"}
- `city`: string max 60 tecken, regex utan HTML-tecken (samma som participant.name)
- `region`: string max 60 tecken
- `centroid`, `bounds`: numbers inom Sveriges realistiska intervall (lat 55-69, lng 11-25)

---

## UI / UX

### Ny flik i HomeScreen

Tre flikar nu (idag två: Mina, Sparade):

```
[Mina]  [Sparade]  [Bibliotek]   ← ny
```

### Bibliotek-flikens innehåll

```
┌──────────────────────────────────────────┐
│ [🔍 Sök på titel, ort, region...    ]    │
├──────────────────────────────────────────┤
│ Ämne                                     │
│ 🌿 🏛️ 🗺️ 💡 🎬 📚 ⚽ 🎨 🍎 🧠            │
│ (chips, multi-select, AND-filter)        │
├──────────────────────────────────────────┤
│ Ålder                                    │
│ 👶 Barn   🧒 Ungdom   👨 Vuxen   👨‍👩‍👧 Familj │
│ (chips, single-select)                   │
├──────────────────────────────────────────┤
│ Sortera: Närmast │ Nyast │ Populärast    │
├──────────────────────────────────────────┤
│ 🗺️ Skogspromenad i Bergviken             │
│    📍 Falun · 🌿🏛️ · 12 frågor · 1.2 km │
│                                          │
│ 🗺️ Tipspromenad runt Slottet             │
│    📍 Stockholm · 🏛️🗺️ · 8 frågor      │
│ ...                                      │
└──────────────────────────────────────────┘
```

### CreateWalk — publish-blocket

Ny sektion längst ned i CreateWalkScreen, inom en collapsable card:

```
┌─ 📢 Publicera till biblioteket ──────────┐
│                                          │
│ [×] Visa min promenad i biblioteket      │
│                                          │
│ ▾ När påslaget krävs:                    │
│                                          │
│ Stad      [Falun                  ]      │
│ Region    [Dalarna                ]      │
│ Ämne      🌿 🏛️ 🗺️ 💡 🎬 (väl ja flera) │
│ Ålder     👶 🧒 👨 👨‍👩‍👧 (välj en)        │
│                                          │
│ ⓘ Andra användare kan se promenadens     │
│   titel, frågor och plats.               │
└──────────────────────────────────────────┘
```

Validering vid save: om `public == true` måste `city`, `subjects` (≥1)
och `ageRating` vara satta. Annars visas "Fyll i metadata för att
publicera".

---

## Implementationsiterationer

### Iteration 1 — MVP (≈ 4-6h, OTA-bart om ingen native-dep)

- Lägg `public`, `city`, `region`, `subjects`, `ageRating` på Walk-typen
- Uppdatera `hasValidWalkShape` + `firestore.rules` (read public)
- `services/firestore.ts`: ny funktion `subscribePublicWalks(filter)`
  som kör `query(walks, where("public", "==", true), ...)` plus
  klient-side filter på subjects/ageRating/text. Realtid via onSnapshot
  så biblioteket uppdateras när någon publicerar.
- HomeScreen: ny flik "Bibliotek". Återanvänd `walkCard`-rendering.
- CreateWalkScreen: publish-blocket
- i18n-strängar (subjects, ageRating, library-rubriker)
- `src/constants/subjects.ts`

Klient-side filter funkar bra upp till ~500 publika walks. Sen behöver
vi gå vidare till iter 3.

### Iteration 2 — Geo-sök (~3h, OTA-bart)

- Beräkna `centroid` + `bounds` vid `saveWalk` från question-koordinater
- Lägg till "Inom X km från mig"-slider i Bibliotek-fliken
- Klient-side haversine-filter mot `centroid`
- Reverse geocoding av `centroid` via `expo-location`'s
  `reverseGeocodeAsync` så `city`/`region` kan auto-fyllas i CreateWalk

### Iteration 3 — Skala upp (~2-4h beroende på val)

När biblioteket har 500+ walks räcker inte klient-side filter:
- Antingen Algolia/Typesense (paid, enkel sök, $$ vid skalning)
- Eller Firestore + composite index på (subjects array-contains, ageRating, language) +
  geohash-fält (`geofirestore` eller egen) för geo-bbox
- Popularity-ranking baserat på `sessionsCount` på walk-dokumentet
  (uppdateras via Cloud Function vid sessionStart)

---

## Migrationer

Alla nya fält är optional → ingen migration krävs. Befintliga walks
fortsätter fungera, dyker bara inte upp i biblioteket förrän skaparen
opt-in:ar via "Publicera"-toggle.

---

## Öppna frågor

- **Moderering** — vad gör vi om någon publicerar olämpligt innehåll?
  MVP: rapport-knapp som mejlar admin. Senare: flagging-system,
  auto-osynliggör vid X rapporter.
- **Ägarskap efter publicering** — om skaparen raderar sitt konto, vad
  händer med deras publika walks? Förslag: behåll men sätt
  `createdBy = "anonymous"` så de inte försvinner från biblioteket.
- **Lokala vs globala walks** — bör biblioteket per default visa walks
  inom rimligt avstånd, eller alla? Förslag: inom 50 km om GPS finns,
  annars alla. Toggle "Visa hela Sverige".
- **Språk-filter** — mata in `language` i filtret? Förmodligen ja —
  visa default walks i användarens språk, men låt dem expandera.

---

## När vi börjar bygga

Läs:
1. Det här dokumentet (datamodell + iterationsplan)
2. `firestore.rules` (för att se hur walks-läsregeln behöver utökas)
3. `src/screens/HomeScreen.tsx` (för flik-pattern + walkCard-rendering
   som ska återanvändas)
4. `src/services/firestore.ts` (för subscribe-pattern)
