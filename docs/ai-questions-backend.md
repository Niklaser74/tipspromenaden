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
| `createInvoice` | callable | Skickar en faktura (30 dagar netto) för ett större kreditpaket till en skola eller förening. Krediterna kommer när fakturan är betald. |
| `createProCheckout` | callable | Checkout för Pro-prenumerationen (månad eller år). |
| `createPortalSession` | callable | Öppnar Stripes kundportal: kort, plan, uppsägning, kvitton. |
| `cleanupDeletedUserBilling` | Auth onDelete (1st gen) | När ett konto raderas: säger upp Pro, makulerar obetalda kreditfakturor och raderar `billing/{uid}` med `ledger/`. |
| `stripeWebhook` | HTTP | Tar emot `checkout.session.completed` (lägger till krediter), `charge.refunded` (drar tillbaka dem) `invoice.paid` / `invoice.voided` / `invoice.marked_uncollectible` (kreditfakturor och Pro-påfyllning) och `customer.subscription.*` (Pro-status). |

Region `europe-north1`, `maxInstances: 10`. App Check krävs på callables
(avstängt i emulatorn).

### Data

```
billing/{uid}                { credits, subscriptionCredits?, subscriptionPeriodStart?,
                               pro?: { status, subscriptionId, planId,
                                       currentPeriodEnd, cancelAtPeriodEnd },
                               recentGenerations[], stripeCustomerId?,
                               stripeOrgCustomerId?, updatedAt }
billing/{uid}/ledger/{id}    generation: id = requestId
                               { type:"generation", status: reserved|consumed|refunded,
                                 delta:-N, mode, result?, usage?, error? }
                             köp: id = Stripe Checkout Session-id
                               { type:"purchase", status:"granted", delta:+N,
                                 packId, amountTotal, currency }
                             faktura: id = Stripe Invoice-id
                               { type:"invoice", status: open|granted|void|uncollectible,
                                 delta: 0 tills betald, sedan +N, requestId, packId,
                                 credits, amountDue, number, hostedInvoiceUrl }
                             Pro-period: id = Stripe Invoice-id
                               { type:"subscription", status: granted|stale,
                                 delta, expired, planId, credits, periodStart, periodEnd }
                             återbetalning: id = refund_<chargeId>
                               { type:"refund", status:"reversed", delta:-N,
                                 creditsReversed, removedTotal, uncollected }
```

Vid återbetalning dras krediterna proportionellt mot återbetalt belopp.
Saldot blir aldrig negativt: har användaren redan förbrukat krediterna
dras det som finns, och resten hamnar i `uncollected` för manuell koll.

Klienten får **läsa** sitt eget `billing/{uid}` och sin `ledger`. Den får
inte **skriva** någonting där; det gör bara Admin SDK.

### Kontoradering

`cleanupDeletedUserBilling` (`functions/src/accountDeletion.ts`) körs för
varje raderat Firebase-konto, oavsett om det raderas från appen, webben
eller Console. Klienten behöver inte anropa något.

1. Alla prenumerationer på användarens Stripe-kund som inte redan är
   avslutade sägs upp direkt, utan återbetalning (villkoren §10).
2. Öppna kreditfakturor (`kind=credit_invoice`) på båda kunderna makuleras.
3. Stripe-kunderna märks med `metadata.firebaseDeletedAt` men raderas
   **inte**. Kvitton och fakturor är bokföringsunderlag och ska sparas i
   sju år (bokföringslagen). De ligger bara hos Stripe.
4. `billing/{uid}` och hela `ledger/` raderas (`recursiveDelete`). Vi
   behåller ingen egen kopia av köphistoriken.

Stegen är idempotenta och triggern har `failurePolicy`, så ett fel mot
Stripe ger nya försök. Firestore raderas sist, så att id:na finns kvar
till nästa försök.

Webhooks som kommer efter raderingen skriver ingenting: hanterarna kollar
`accountExists(uid)` först. Det gäller även `customer.subscription.deleted`
från vår egen uppsägning. Betalas något ändå för ett raderat konto (t.ex.
en Checkout som blev klar under raderingen) loggas ett fel som säger att
betalningen ska återbetalas manuellt i Dashboard.

### Pro

- Pro ger `PRO_CREDITS_PER_MONTH` (20) krediter per månad; årsplanen ger 240 per år.
- Pro-krediterna ligger i `subscriptionCredits`, skilt från köpta `credits`.
  - Vid varje betald period **sätts** de till periodens antal. Oanvända sparas inte, de loggas som `expired`.
  - Köpta krediter påverkas aldrig och tar aldrig slut.
  - En generering drar från Pro-krediterna först. Misslyckas den går krediten tillbaka till samma hink.
- Saldot som visas är `credits + subscriptionCredits`. `creditsLeft` och `details.credits` i felen är redan summan.
- När prenumerationen är slut (`canceled`, `unpaid`, `incomplete_expired`) nollas Pro-krediterna.
- Återbetalas en Pro-avgift dras inga krediter automatiskt. Säg upp prenumerationen i Dashboard om det behövs.

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

Faktura till skola/förening (bara `pack100` och `pack300`):

```ts
const invoice = httpsCallable(functions, "createInvoice");
const { data } = await invoice({
  packId: "pack100",
  requestId: crypto.randomUUID(), // samma id vid retry → samma faktura
  organization: {
    name: "Hammarskolan",
    orgNumber: "212000-0142",     // valfritt, Luhn-kontrolleras för SE
    vatNumber: "",                // valfritt, SE + orgnr + 01
    email: "ekonomi@kommun.se",   // dit fakturan mejlas
    reference: "Anna Andersson / 4711", // "Er referens", valfritt
    address: { line1, line2?, postalCode, city, country: "SE" }, // EU-land
  },
});
// data = { invoiceId, number, hostedInvoiceUrl, amountDue, currency, dueDate }
```

- Fakturan mejlas direkt och kan betalas med kort på `hostedInvoiceUrl`, eller till bankgiro enligt fakturan.
- Krediterna läggs till när den är betald. Bankgirobetalningar markeras i Dashboard: fakturan → *Mark as paid* → *Paid out of band*. Det ger `invoice.paid` och krediterna.
- Högst 3 obetalda fakturor per användare (`reason: "too-many-open-invoices"`).
- Faktureringsuppgifterna ligger på en egen Stripe-kund per användare (`stripeOrgCustomerId`), så privata kvitton och skolans fakturor hålls isär.

Pro och kundportal:

```ts
const pro = httpsCallable(functions, "createProCheckout");
const { data } = await pro({ plan: "pro_month" }); // pro_month | pro_year
location.href = data.url; // retur: /skapa?pro=ok&session_id=… eller ?pro=avbrutet
// reason "already-subscribed" → skicka till portalen i stället

const portal = httpsCallable(functions, "createPortalSession");
location.href = (await portal()).data.url; // reason "no-customer" om inget köp finns
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
   - Skapa fyra priser i SEK och notera deras `price_…`-id:n:
     - 10 krediter (t.ex. 49 kr)
     - 30 krediter (t.ex. 119 kr)
     - 100 krediter (t.ex. 349 kr), går att få på faktura
     - 300 krediter (t.ex. 899 kr), går att få på faktura
   - Pro: skapa en produkt "Tipspromenaden Pro" med ett månadspris (t.ex. 79 kr/mån) och eventuellt ett årspris (t.ex. 790 kr/år). Båda ska vara återkommande i SEK, inklusive moms.
   - Kundportal (Settings → **Billing → Customer portal**):
     - Tillåt byte av betalkort, uppdatering av faktureringsadress och momsnummer, fakturahistorik och uppsägning vid periodens slut.
     - Om årsplanen finns: tillåt byte mellan månads- och årspriset (*Subscriptions → Customers can switch plans*).
   - Misslyckade kortdragningar (Settings → **Billing → Subscriptions and emails**): slå på *Smart Retries* och mejl vid misslyckad betalning. Efter sista försöket: *Cancel the subscription*.
   - Fakturor (Settings → **Invoices**):
     - Sätt ett nummerprefix, t.ex. `TP`.
     - Lägg bankgiro och betalningsvillkor i sidfoten (*Default footer*).
     - Välj betalsätt för fakturasidan (kort räcker).
   - Slå på *Email finalized invoices to customers* under Settings → **Customer emails**, och påminnelser för förfallna fakturor under **Subscriptions and emails → Manage invoices sent to customers**.
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
   - `STRIPE_PRICE_PACK_100`
   - `STRIPE_PRICE_PACK_300`
   - `STRIPE_PRICE_PRO_MONTHLY`
   - `STRIPE_PRICE_PRO_YEARLY` (tom = ingen årsplan)
   - `STRIPE_AUTOMATIC_TAX`
   - `STRIPE_TAX_RATE_ID` (tom om Stripe Tax används)
   - `WEB_BASE_URL`
5. **Webhook:** Stripe Dashboard → Developers → Webhooks.
   - Lägg till endpoint `https://europe-north1-tipspromenaden-491207.cloudfunctions.net/stripeWebhook`.
   - Välj händelserna:
     - `checkout.session.completed`
     - `checkout.session.async_payment_succeeded`
     - `charge.refunded`
     - `invoice.paid`
     - `invoice.voided`
     - `invoice.marked_uncollectible`
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
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
npm run test:emulator  # kreditlogiken och kontoraderingen mot Firestore-emulatorn (kräver Java)
```

Med Stripe i testläge:

```
stripe listen --forward-to localhost:5001/tipspromenaden-491207/europe-north1/stripeWebhook
```

Köp med testkortet `4242 4242 4242 4242`. Kontrollera att krediterna läggs
till exakt en gång, även med `stripe events resend <id>`.

Faktura: skicka en faktura via `createInvoice`, markera den som betald i
Dashboard och kontrollera att krediterna kommer en gång.

Pro: teckna med testkortet och kontrollera `billing/{uid}.pro` och
`subscriptionCredits`. Spola fram en period med en *test clock* (Billing →
Test clocks) och kontrollera att Pro-krediterna fylls på, inte läggs ihop.

## Kvar att göra

- Webb-UI: `AiGenerateDialog`, `BuyCreditsDialog`, CSP `connect-src`.
- Eval-set med ~20 promptar. Jämför effort `low` och `medium` och gör en faktagranskning.
- Test i Stripe testläge av faktura och Pro, se *Test* ovan.
- Villkoren behöver text om Pro: vad som ingår, att oanvända Pro-krediter inte sparas, och uppsägning.
- Appen (fas 3): samma callable, inga köplänkar i appen.
