# AI-genererade frågor — backend (Cloud Functions)

Betaltjänst: en inloggad skapare köper krediter via Stripe och genererar
frågebatterier med Claude. Webben (`tipspromenaden-web`, `/skapa`) är
första klienten; appen använder samma callable i ett senare steg.

All kod ligger i `functions/`. Firestore-reglerna för `billing/` ligger i
`firestore.rules`.

## Översikt

| Funktion | Typ | Vad den gör |
|---|---|---|
| `generateQuestions` | callable | Drar krediter, anropar Claude, returnerar ett tipspack. Återbetalar vid fel. |
| `createCheckoutSession` | callable | Skapar en Stripe Checkout Session för ett kreditpaket och returnerar `url`. Köper som användarens egen Stripe Customer, skapar kvittofaktura med moms och samlar in adress + ev. org-/momsnummer. |
| `stripeWebhook` | HTTP | Tar emot `checkout.session.completed` (lägger till krediter) och `charge.refunded` (drar tillbaka dem). |

Region `europe-north1`, `maxInstances: 10`. App Check krävs på callables
(avstängt i emulatorn).

### Data

```
billing/{uid}                { credits, recentGenerations[], stripeCustomerId?, updatedAt }
billing/{uid}/ledger/{id}    generation: id = requestId
                               { type:"generation", status: reserved|consumed|refunded,
                                 delta:-N, mode, result?, usage?, error? }
                             köp: id = Stripe Checkout Session-id
                               { type:"purchase", status:"granted", delta:+N,
                                 packId, amountTotal, currency }
                             återbetalning: id = refund_<chargeId>
                               { type:"refund", status:"reversed", delta:-N,
                                 creditsReversed, removedTotal, uncollected }
```

Vid återbetalning dras krediterna proportionellt mot återbetalt belopp.
Saldot blir aldrig negativt: har användaren redan förbrukat krediterna
dras det som finns, och resten hamnar i `uncollected` för manuell koll.

Klienten får **läsa** sitt eget `billing/{uid}` och sin `ledger`. Den får
inte **skriva** någonting där; det gör bara Admin SDK.

### Kostnad per generering (krediter)

- 1 kredit: tema eller egen text, upp till 15 frågor.
- +1 kredit om det är fler än 15 frågor.
- Platsläget kostar 2 krediter i grunden, eftersom det gör webbsökning.

Logiken finns i `functions/src/request.ts` → `creditCost()`.

### Modell

- Modellen är `claude-opus-5-5` med effort `medium`. Båda sätts i `functions/src/config.ts`.
- Thinking är alltid på för den modellen, så kostnaden styrs med effort.
- Anropen skickar `fallbacks: "default"`. Nekar säkerhetsfiltret en förfrågan körs den då om på en annan modell.
- Platsläget sker i två steg:
  1. Webbsökning, som ger ett faktablad med käll-URL:er.
  2. Structured output. Webbsökningens citat går inte att kombinera med structured output, därav uppdelningen.
- Kostnad i USD loggas per anrop (`usage` på ledger-raden och i loggen).

## Klientkontrakt (för webben och senare appen)

```ts
import { getFunctions, httpsCallable } from "firebase/functions";
const functions = getFunctions(app, "europe-north1");

const generate = httpsCallable(functions, "generateQuestions", { timeout: 300_000 });
const { data } = await generate({
  mode: "topic",            // "topic" | "text" | "place"
  prompt: "Svenska kungar", // krävs för topic, valfria önskemål annars (≤500)
  sourceText: undefined,    // krävs för text (200–20 000 tecken)
  place: undefined,         // krävs för place: { name, lat?, lng? }
  count: 10,                // 5–30
  language: "sv",           // sv en de no da fi fr es
  difficulty: "medium",     // easy | medium | hard
  audience: "mixed",        // kids | adults | mixed
  requestId: crypto.randomUUID(), // samma id vid retry → inget dubbeldrag
});
// data = { battery: QuestionBattery, notes: [{ explanation, sourceUrl }],
//          creditsLeft, cost }
```

- `battery` är ett giltigt tipspack, redan kontrollerat med `validateBattery`.
  - Skicka det in i befintlig import.
  - Svarsalternativen blandas inte på servern. Det gör `shuffleQuestionOptions` i importflödet.
- `notes[i]` hör till `battery.questions[i]` och visas bara för skaparen.
- Fel kommer som `FunctionsError` med `details.reason`:

| reason | code | Visa |
|---|---|---|
| `no-credits` | failed-precondition | Köp-dialogen (`details.credits`, `details.cost`) |
| `rate-limited` | resource-exhausted | "Vänta en stund" |
| `in-progress` | aborted | "Genereringen pågår redan" |
| `anonymous` | permission-denied | Inloggning |
| `generation-failed` | internal / unavailable | Felet, och att krediten är återbetald |

Köp:

```ts
const checkout = httpsCallable(functions, "createCheckoutSession");
const { data } = await checkout({ packId: "pack10" }); // pack10 | pack30
location.href = data.url; // retur: /skapa?kop=ok&session_id=… eller ?kop=avbrutet
```

Saldot läses live med `onSnapshot(doc(db, "billing", uid))`.

## Setup (en gång)

1. **Blaze-plan** på `tipspromenaden-491207`. Lägg till en budget-alert för Cloud Functions.
2. **Anthropic:**
   - Skapa en API-nyckel.
   - Sätt en månatlig utgiftsgräns i Anthropic Console.
   - Lägg in nyckeln:
     ```
     cd functions && npx firebase functions:secrets:set ANTHROPIC_API_KEY --project tipspromenaden-491207
     ```
3. **Stripe:**
   - Aktivera kort och Swish (Settings → Payment methods).
   - Skapa två priser i SEK: 10 krediter (t.ex. 49 kr) och 30 krediter (t.ex. 119 kr). Notera deras `price_…`-id:n.
   - Lägg in nyckeln: `npx firebase functions:secrets:set STRIPE_SECRET_KEY`.
   - Moms, välj ett av två sätt:
     - **Stripe Tax** (räknar rätt moms även för kunder i andra EU-länder, kostar en avgift per transaktion): aktivera Stripe Tax och sätt `STRIPE_AUTOMATIC_TAX=true`.
     - **Fast momssats**: skapa en Tax Rate i Dashboard (Product catalog → Tax rates), t.ex. "Moms 25 %", *inclusive*, land SE. Sätt `STRIPE_TAX_RATE_ID=txr_…`.
     - Utan någon av dem får kvitton och fakturor ingen momsrad. Det är bara rätt om du inte är momsregistrerad.
   - Priserna ska vara inklusive moms (`tax_behavior: inclusive`), eftersom konsumentpriser i Sverige anges med moms.
   - Kvitton: Settings → **Customer emails** → slå på *Successful payments*. Kvittofakturan (PDF med moms) skapas av Checkout och mejlas automatiskt.
   - Lägg in företagsnamn, adress och momsregistreringsnummer under Settings → **Business details** och **Invoices** — de trycks på kvittot.
4. **Första deploy** frågar efter parametrarna och sparar dem i `functions/.env.tipspromenaden-491207`:
   - `STRIPE_PRICE_PACK_10`
   - `STRIPE_PRICE_PACK_30`
   - `STRIPE_AUTOMATIC_TAX`
   - `STRIPE_TAX_RATE_ID` (tom om Stripe Tax används)
   - `WEB_BASE_URL`
5. **Webhook:** Stripe Dashboard → Developers → Webhooks.
   - Lägg till endpoint `https://europe-north1-tipspromenaden-491207.cloudfunctions.net/stripeWebhook`.
   - Välj händelserna `checkout.session.completed`, `checkout.session.async_payment_succeeded` och `charge.refunded`.
   - Lägg in signeringsnyckeln: `npx firebase functions:secrets:set STRIPE_WEBHOOK_SECRET`.
6. **Villkor och integritetspolicy:**
   - Villkoren behöver text om krediter och ångerrätt för digitalt innehåll.
   - Integritetspolicyn ska ta upp Anthropic som biträde och att text behandlas i USA.

## Deploy

```
cd functions && npm run build
npx firebase deploy --only functions,firestore:rules --project tipspromenaden-491207
```

`firebase.json` kör `npm run build` som predeploy. Det steget kopierar
`src/services/tipspackValidator.ts` till `functions/src/shared/`
(`scripts/sync-shared.mjs`), så validatorn är samma som i appen.

## Test

```
cd functions
npm test               # enhetstester: validering av indata, kreditkostnad, JSON → tipspack
npm run test:emulator  # kreditlogiken mot Firestore-emulatorn (kräver Java)
```

Med Stripe i testläge:

```
stripe listen --forward-to localhost:5001/tipspromenaden-491207/europe-north1/stripeWebhook
```

Köp med testkortet `4242 4242 4242 4242`. Kontrollera att krediterna läggs
till exakt en gång, även med `stripe events resend <id>`.

## Kvar att göra

- Webb-UI: `AiGenerateDialog`, `BuyCreditsDialog`, CSP `connect-src`.
- Eval-set med ~20 promptar. Jämför effort `low` och `medium` och gör en faktagranskning.
- Faktura för skolor/föreningar (Stripe Invoicing) och prenumerationen Pro (Stripe Billing).
- Appen (fas 3): samma callable, inga köplänkar i appen.
