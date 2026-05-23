#!/usr/bin/env node
/**
 * Skapar "curated launch-walks" direkt i Firestore för utvalda
 * landmärken (Skansen, Gamla stan, Drottningholm, Slottsskogen,
 * Visby, Pildammsparken, Falu koppargruva). Admin SDK bypassar
 * tap-to-place-flödet i appen så vi kan batcha in färdiga
 * promenader med exakta koordinater.
 *
 * Speglar src/utils/qr.ts generateId() för crypto-secure ID:n
 * (samma pattern som create-review-demo-walk.mjs).
 *
 * Usage:
 *   # Skapa EN specifik walk via dess key (definierad nedan):
 *   node scripts/create-launch-walk.mjs --uid=<your-uid> --walk=skansen
 *
 *   # Skapa ALLA definierade walks:
 *   node scripts/create-launch-walk.mjs --uid=<your-uid> --walk=all
 *
 *   # Eller använd --from-walk för att slippa veta uid:t:
 *   node scripts/create-launch-walk.mjs --from-walk=<egen walk-id> --walk=skansen
 *
 * Walks markeras som publika (`public: true`) med kategori "annat".
 * createdBy = uid → dyker upp under "Mina" i appens bibliotek så
 * du kan finjustera koordinater post-skapande via Skapa-vyn på
 * webben.
 *
 * Säkerhetsspärr: 3 sek delay efter UID-utskrift så ett felskrivet
 * --uid kan avbrytas med Ctrl+C innan något skrivs till Firestore.
 */
import admin from "firebase-admin";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPath = join(__dirname, "..", "firebase-admin-key.json");
admin.initializeApp({
  credential: admin.credential.cert(
    JSON.parse(readFileSync(keyPath, "utf-8"))
  ),
});
const db = admin.firestore();

// ─── CLI ─────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const uidArg = argv
  .find((a) => a.startsWith("--uid="))
  ?.slice("--uid=".length);
const fromWalkArg = argv
  .find((a) => a.startsWith("--from-walk="))
  ?.slice("--from-walk=".length);
const walkArg =
  argv.find((a) => a.startsWith("--walk="))?.slice("--walk=".length) ??
  "all";

let createdBy;
if (uidArg) {
  createdBy = uidArg;
} else if (fromWalkArg) {
  const snap = await db.collection("walks").doc(fromWalkArg).get();
  if (!snap.exists) {
    console.error(`✗ Walk ${fromWalkArg} not found`);
    process.exit(1);
  }
  createdBy = snap.data().createdBy;
} else {
  console.error(
    "Usage: node scripts/create-launch-walk.mjs " +
      "(--uid=<uid> | --from-walk=<walkId>) [--walk=<key|all>]"
  );
  process.exit(1);
}

// ─── Helpers ─────────────────────────────────────────────────────────
function generateId() {
  const bytes = randomBytes(12);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return Date.now().toString(36) + hex;
}

function buildWalk(spec) {
  const walkId = generateId();
  const questions = spec.questions.map((q, i) => ({
    id: generateId(),
    text: q.text,
    options: q.options,
    correctOptionIndex: q.correct,
    coordinate: { latitude: q.lat, longitude: q.lng },
    order: i + 1,
  }));
  const centroid = {
    latitude:
      questions.reduce((s, q) => s + q.coordinate.latitude, 0) /
      questions.length,
    longitude:
      questions.reduce((s, q) => s + q.coordinate.longitude, 0) /
      questions.length,
  };
  return {
    id: walkId,
    title: spec.title,
    description: spec.description,
    questions,
    createdBy,
    createdAt: Date.now(),
    language: "sv",
    public: true,
    city: spec.city,
    category: spec.category,
    centroid,
    ...(spec.activityType ? { activityType: spec.activityType } : {}),
  };
}

// ─── Walks-katalog ──────────────────────────────────────────────────
//
// Koordinater är hämtade från Google Maps + Street View och landar
// typiskt inom 10-30 m från idealpunkten. Trigger-zonen är 15 m i
// walk-mode → mindre finjusteringar kan behövas på plats. Justera
// via Skapa-vyn på webben efter testpromenad.

// VIKTIGT: när en walk redan är skapad och finjusterad via Skapa-vyn,
// är Firestore source of truth — INTE detta script. Att köra om
// scriptet skapar en NY walk-id, inte ersätter den finjusterade. Radera
// gamla först via admin om du vill regenerera.
//
// Skansen-walken (skapad 2026-05-21, walk-id mpitu2i256100e5cceca71b573187d34)
// har t.ex. fått sina koordinater finjusterade på plats — koordinaterna
// nedan är de ursprungliga seed-värdena, inte de aktuella Firestore-
// värdena.

const WALKS = {
  // ===== SKANSEN, STOCKHOLM =====
  skansen: {
    title: "Skansen — En runda i världens äldsta friluftsmuseum",
    description:
      "En lugn runda mellan ikoniska hus och hägn på Skansen, Djurgården. Tio frågor om svensk natur, kultur och Skansens egen historia. Cirka 1 km gångväg.",
    city: "Stockholm",
    category: "kultur",
    questions: [
      {
        text: "Vilket år grundades Skansen av Artur Hazelius?",
        options: ["1891", "1850", "1925", "1873"],
        correct: 0,
        lat: 59.32641,
        lng: 18.10256,
      },
      {
        text: "Vilket är Sveriges nationaldjur, som finns på Skansen?",
        options: ["Älg", "Björn", "Lo", "Räv"],
        correct: 0,
        lat: 59.32710,
        lng: 18.10434,
      },
      {
        text: "Vad kallas det årliga TV-evenemanget som sänds från Sollidenscenen varje sommar?",
        options: [
          "Allsång på Skansen",
          "Lotta på Liseberg",
          "Sommarkväll",
          "Diggiloo",
        ],
        correct: 0,
        lat: 59.32524,
        lng: 18.10561,
      },
      {
        text: "Skansens välkända djur — vilket av dessa är inte ett rovdjur?",
        options: ["Visent", "Varg", "Järv", "Björn"],
        correct: 0,
        lat: 59.32753,
        lng: 18.10207,
      },
      {
        text: "Vilken högtid firas extra stort på Skansen med marknad och julgransbelysning?",
        options: ["Jul", "Påsk", "Midsommar", "Valborg"],
        correct: 0,
        lat: 59.32595,
        lng: 18.10318,
      },
      {
        text: "Vad var Skansens grundare Artur Hazelius främsta syfte med museet?",
        options: [
          "Bevara svensk folkkultur",
          "Roa turister",
          "Driva nöjespark",
          "Sälja konst",
        ],
        correct: 0,
        lat: 59.32519,
        lng: 18.10174,
      },
      {
        text: "Skansens lilla röda träkyrka 'Seglora kyrka' är från 1700-talet. Från vilket landskap kommer den?",
        options: [
          "Västergötland",
          "Härjedalen",
          "Småland",
          "Dalarna",
        ],
        correct: 0,
        lat: 59.32668,
        lng: 18.10142,
      },
      {
        text: "Vilket fenomen firas på Skansen den 30 april med stora brasor och körsång?",
        options: ["Valborgsmässoafton", "Midsommar", "Lucia", "Påsk"],
        correct: 0,
        lat: 59.32612,
        lng: 18.10489,
      },
      {
        text: "Skansen-akvariets glasblåsare visar upp ett urgammalt hantverk. Vad är huvudmaterialet i glas?",
        options: ["Sand (kiseldioxid)", "Lera", "Trä", "Kalksten"],
        correct: 0,
        lat: 59.32569,
        lng: 18.10082,
      },
      {
        text: "Vilket träd är vanligast i svenska skogar och växer även på Skansen?",
        options: ["Gran", "Tall", "Björk", "Ek"],
        correct: 0,
        lat: 59.32726,
        lng: 18.10379,
      },
    ],
  },

  // ===== GAMLA STAN, STOCKHOLM =====
  "gamla-stan": {
    title: "Gamla stan — 800 år av Stockholms historia",
    description:
      "En slinga genom Stockholms äldsta delar. Åtta frågor om blodbad, smala gränder, kyrkor och kungliga byggnader. Cirka 800 m mellan Stortorget och Slottsbacken.",
    city: "Stockholm",
    category: "historia",
    questions: [
      {
        text: "Vilket museum vid Stortorget delar ut Nobelpriset varje år?",
        options: ["Nobelmuseet", "Historiska museet", "Vasamuseet", "Skansenmuseet"],
        correct: 0,
        lat: 59.32517,
        lng: 18.07090,
      },
      {
        text: "Vilket år ägde Stockholms blodbad rum vid Stortorget?",
        options: ["1520", "1471", "1611", "1648"],
        correct: 0,
        lat: 59.32517,
        lng: 18.07082,
      },
      {
        text: "Vilken berömd staty finns inuti Storkyrkan, av en helig riddare som dödar en drake?",
        options: [
          "Sankt Göran och draken",
          "Karl XII",
          "Gustav Vasa",
          "Sankt Erik",
        ],
        correct: 0,
        lat: 59.32542,
        lng: 18.07075,
      },
      {
        text: "Vilken arkitekt designade Stockholms slott efter branden 1697?",
        options: [
          "Nicodemus Tessin den yngre",
          "Carl Hårleman",
          "Gunnar Asplund",
          "Erik Lallerstedt",
        ],
        correct: 0,
        lat: 59.32741,
        lng: 18.07166,
      },
      {
        text: "Vilken är den smalaste gränden i Stockholm (90 cm bred)?",
        options: [
          "Mårten Trotzigs Gränd",
          "Köpmangatan",
          "Prästgatan",
          "Skomakargatan",
        ],
        correct: 0,
        lat: 59.32253,
        lng: 18.07174,
      },
      {
        text: "Vilken kyrka är begravningsplats för svenska kungar sedan medeltiden?",
        options: [
          "Riddarholmskyrkan",
          "Storkyrkan",
          "Sankt Eriks kyrka",
          "Engelska kyrkan",
        ],
        correct: 0,
        lat: 59.32510,
        lng: 18.06690,
      },
      {
        text: "För vilken nationalitets handelsmän byggdes Tyska kyrkan på 1600-talet?",
        options: ["Tyska", "Holländska", "Danska", "Norska"],
        correct: 0,
        lat: 59.32328,
        lng: 18.07163,
      },
      {
        text: "Vilket datum firas Sveriges nationaldag med ceremoni vid Stockholms slott?",
        options: ["6 juni", "1 maj", "13 december", "30 april"],
        correct: 0,
        lat: 59.32398,
        lng: 18.07415,
      },
    ],
  },

  // ===== DROTTNINGHOLMS SLOTT =====
  drottningholm: {
    title: "Drottningholm — UNESCO-världsarv och kungens hemvist",
    description:
      "En runda genom Drottningholms slottsområde på Lovön i Mälaren. Åtta frågor om barockslott, Kinaslottet och en av världens äldsta bevarade teaterscener. Cirka 1.2 km.",
    city: "Stockholm",
    category: "historia",
    questions: [
      {
        text: "Vilket år upptogs Drottningholms slottsområde på UNESCO:s världsarvslista?",
        options: ["1991", "1972", "2001", "1985"],
        correct: 0,
        lat: 59.32100,
        lng: 17.88593,
      },
      {
        text: "Vilken kunglig familj bor permanent på Drottningholm idag?",
        options: [
          "Sveriges kungafamilj",
          "Norges kungafamilj",
          "Ingen — det är museum",
          "Danmarks kungafamilj",
        ],
        correct: 0,
        lat: 59.32096,
        lng: 17.88615,
      },
      {
        text: "Vilken drottning lät bygga om Drottningholms slott på 1660-talet efter en brand?",
        options: [
          "Hedvig Eleonora",
          "Kristina",
          "Lovisa Ulrika",
          "Silvia",
        ],
        correct: 0,
        lat: 59.32132,
        lng: 17.88555,
      },
      {
        text: "Vilket lustslott i parken är byggt i kinesisk arkitekturstil?",
        options: ["Kinaslottet", "Slottsteatern", "Orangerie", "Eremitaget"],
        correct: 0,
        lat: 59.32210,
        lng: 17.88140,
      },
      {
        text: "Slottsteatern på Drottningholm är en av världens äldsta bevarade teatrar. Från vilket århundrade?",
        options: ["1700-talet", "1600-talet", "1800-talet", "1500-talet"],
        correct: 0,
        lat: 59.32150,
        lng: 17.88380,
      },
      {
        text: "På vilken ö i Mälaren ligger Drottningholms slott?",
        options: ["Lovön", "Björkö", "Adelsö", "Värmdö"],
        correct: 0,
        lat: 59.32175,
        lng: 17.88500,
      },
      {
        text: "Vilket språk dominerade vid det svenska hovet på 1700-talet?",
        options: ["Franska", "Tyska", "Engelska", "Italienska"],
        correct: 0,
        lat: 59.32250,
        lng: 17.88420,
      },
      {
        text: "Vilken arkitekturstil är Drottningholms huvudslott byggt i?",
        options: ["Barock", "Gotik", "Funktionalism", "Renässans"],
        correct: 0,
        lat: 59.32115,
        lng: 17.88640,
      },
    ],
  },

  // ===== SLOTTSSKOGEN, GÖTEBORG =====
  slottsskogen: {
    title: "Slottsskogen — Göteborgs gröna lunga",
    description:
      "En runda i Göteborgs största stadspark, hem för Älghagen och Plikta-leken. Åtta frågor om parken, Göteborgs landmärken och svensk natur. Cirka 1.5 km.",
    city: "Göteborg",
    category: "natur",
    questions: [
      {
        text: "Vad heter Göteborgs största stadspark?",
        options: ["Slottsskogen", "Trädgårdsföreningen", "Skatås", "Liseberg"],
        correct: 0,
        lat: 57.69130,
        lng: 11.94250,
      },
      {
        text: "Vilket djur är välbekant från Slottsskogens hage och även Sveriges nationaldjur?",
        options: ["Älg", "Björn", "Vildsvin", "Rådjur"],
        correct: 0,
        lat: 57.69120,
        lng: 11.94200,
      },
      {
        text: "Vad heter den berömda lekplatsen i Slottsskogen, älskad av Göteborgs barnfamiljer?",
        options: ["Plikta", "Bullerbyn", "Skansen Kronan", "Junibacken"],
        correct: 0,
        lat: 57.69000,
        lng: 11.94300,
      },
      {
        text: "Vilket museum ligger i Slottsskogen och visar utstoppade djur och fossiler?",
        options: [
          "Naturhistoriska museet",
          "Sjöfartsmuseet",
          "Världskulturmuseet",
          "Röhsska museet",
        ],
        correct: 0,
        lat: 57.69280,
        lng: 11.94450,
      },
      {
        text: "Under vilket århundrade anlades Slottsskogen som folkpark?",
        options: ["1800-talet", "1700-talet", "1900-talet", "1600-talet"],
        correct: 0,
        lat: 57.69230,
        lng: 11.94380,
      },
      {
        text: "Vilket höghus i Göteborg kallas för \"Läppstiftet\" på grund av sin form?",
        options: ["Skanskaskrapan", "Globen", "Karlatornet", "Turning Torso"],
        correct: 0,
        lat: 57.69305,
        lng: 11.93950,
      },
      {
        text: "Vilket fotbollslag från Göteborg har vunnit allsvenskan flest gånger?",
        options: [
          "IFK Göteborg",
          "GAIS",
          "Häcken",
          "Örgryte",
        ],
        correct: 0,
        lat: 57.69050,
        lng: 11.94100,
      },
      {
        text: "Vilken vattenfågel ses ofta simma i Slottsskogens dammar?",
        options: ["And", "Pelikan", "Flamingo", "Pingvin"],
        correct: 0,
        lat: 57.69180,
        lng: 11.94350,
      },
    ],
  },

  // ===== VISBY RINGMUR =====
  visby: {
    title: "Visby ringmur — Medeltidens hjärta",
    description:
      "En runda längs Visbys 800-åriga ringmur, ett UNESCO-världsarv. Åtta frågor om Hansatiden, Almedalsveckan och Gotlands historia. Cirka 1 km mellan Norderport och Söderport via domkyrkan.",
    city: "Visby",
    category: "historia",
    questions: [
      {
        text: "Under vilket århundrade byggdes huvuddelen av Visby ringmur?",
        options: ["1200-talet", "1500-talet", "1000-talet", "1700-talet"],
        correct: 0,
        lat: 57.64330,
        lng: 18.29290,
      },
      {
        text: "Vilken UNESCO-status har Visby?",
        options: [
          "Världsarv",
          "Biosfärsområde",
          "Kreativitetsstad",
          "Geopark",
        ],
        correct: 0,
        lat: 57.64060,
        lng: 18.29370,
      },
      {
        text: "Vad heter Visbys medeltida domkyrka från 1200-talet?",
        options: [
          "Sankta Maria",
          "Sankt Olof",
          "Heliga Trefaldighets",
          "Sankt Hans",
        ],
        correct: 0,
        lat: 57.64060,
        lng: 18.29370,
      },
      {
        text: "Vilket politiskt evenemang hålls i Almedalen varje sommar?",
        options: [
          "Almedalsveckan",
          "Visbyveckan",
          "Riksmötet",
          "Sommarmötet",
        ],
        correct: 0,
        lat: 57.64040,
        lng: 18.28840,
      },
      {
        text: "Vilket medeltida handelsförbund var Visby en del av?",
        options: ["Hansaförbundet", "Kalmarunionen", "Vikingaförbundet", "Östersjöförbundet"],
        correct: 0,
        lat: 57.63950,
        lng: 18.29500,
      },
      {
        text: "Vilken dansk kung plundrade Visby år 1361?",
        options: [
          "Valdemar Atterdag",
          "Kristian II",
          "Erik av Pommern",
          "Fredrik I",
        ],
        correct: 0,
        lat: 57.63530,
        lng: 18.29400,
      },
      {
        text: "Ungefär hur lång är Visby ringmur totalt?",
        options: ["3,4 km", "1,2 km", "7,5 km", "12 km"],
        correct: 0,
        lat: 57.63800,
        lng: 18.29200,
      },
      {
        text: "Vilket medeltidsevenemang fyller Visbys gator under vecka 32 varje sommar?",
        options: [
          "Medeltidsveckan",
          "Almedalsveckan",
          "Hansafestivalen",
          "Visbyfesten",
        ],
        correct: 0,
        lat: 57.63950,
        lng: 18.29510,
      },
    ],
  },

  // ===== PILDAMMSPARKEN, MALMÖ =====
  pildammsparken: {
    title: "Pildammsparken — Malmös hjärta",
    description:
      "En runda runt Stora Pildammen i Malmös största park. Åtta frågor om Malmö, Skåne och regionens kulturarv. Cirka 1 km.",
    city: "Malmö",
    category: "kultur",
    questions: [
      {
        text: "Vilken storutställning ägde rum i Pildammsparken år 1914?",
        options: [
          "Baltiska utställningen",
          "Världsutställningen",
          "Skånsk Industri",
          "Nordiska utställningen",
        ],
        correct: 0,
        lat: 55.58490,
        lng: 12.98760,
      },
      {
        text: "Vilket landskap ligger Malmö i?",
        options: ["Skåne", "Blekinge", "Halland", "Småland"],
        correct: 0,
        lat: 55.58540,
        lng: 12.98530,
      },
      {
        text: "Vilken är Sveriges tredje största stad efter Stockholm och Göteborg?",
        options: ["Malmö", "Uppsala", "Linköping", "Västerås"],
        correct: 0,
        lat: 55.58590,
        lng: 12.98720,
      },
      {
        text: "Vilken bro öppnades år 2000 mellan Malmö och Köpenhamn?",
        options: ["Öresundsbron", "Storebæltsbron", "Ölandsbron", "Tjörnbron"],
        correct: 0,
        lat: 55.58410,
        lng: 12.98660,
      },
      {
        text: "Vilket berömt höghus i Malmö är känt för att vrida sig 90 grader?",
        options: ["Turning Torso", "Globen", "Skanskaskrapan", "Kaknästornet"],
        correct: 0,
        lat: 55.58360,
        lng: 12.98620,
      },
      {
        text: "Vilken arkitekt designade Turning Torso?",
        options: [
          "Santiago Calatrava",
          "Gunnar Asplund",
          "Erik Gunnar Asplund",
          "Frank Gehry",
        ],
        correct: 0,
        lat: 55.58450,
        lng: 12.98700,
      },
      {
        text: "Vad heter Malmös fotbollslag som vunnit allsvenskan flest gånger?",
        options: ["Malmö FF", "Hammarby", "AIK", "IFK Göteborg"],
        correct: 0,
        lat: 55.58520,
        lng: 12.98800,
      },
      {
        text: "Vilken traditionell kaka är kännetecknande för Skåne?",
        options: ["Spettekaka", "Prinsesstårta", "Kladdkaka", "Hjortronpaj"],
        correct: 0,
        lat: 55.58550,
        lng: 12.98760,
      },
    ],
  },

  // ===== FALU KOPPARGRUVA =====
  "falu-koppargruva": {
    title: "Falu koppargruva — En tids­resa i världens äldsta gruva",
    description:
      "En runda kring Stora Stöten — det stora ras-hålet — och gruvmuseet i Falun. Åtta frågor om kopparbrytning, falu rödfärg och svensk industrihistoria. Cirka 600 m.",
    city: "Falun",
    category: "historia",
    questions: [
      {
        text: "Vilken UNESCO-status har Falu gruvområde (sedan 2001)?",
        options: ["Världsarv", "Biosfärsområde", "Geopark", "Naturreservat"],
        correct: 0,
        lat: 60.59790,
        lng: 15.61770,
      },
      {
        text: "Vilket år bröts den sista kopparmalmen i Falu gruva?",
        options: ["1992", "1950", "2001", "1965"],
        correct: 0,
        lat: 60.59820,
        lng: 15.61680,
      },
      {
        text: "Vad heter det stora ras-hålet som uppstod 1687 vid Falu gruva?",
        options: [
          "Stora Stöten",
          "Stora Hålet",
          "Stora Schaktet",
          "Stora Gropen",
        ],
        correct: 0,
        lat: 60.59790,
        lng: 15.61770,
      },
      {
        text: "Vilken välkänd färg är en biprodukt från kopparbrytningen i Falun?",
        options: ["Falu rödfärg", "Engelskt rött", "Kobolt", "Ockra"],
        correct: 0,
        lat: 60.59850,
        lng: 15.61750,
      },
      {
        text: "Ungefär hur stor andel av världens kopparproduktion kom från Falu gruva på 1600-talet?",
        options: ["Två tredjedelar", "En tiondel", "Halva", "Allt"],
        correct: 0,
        lat: 60.59760,
        lng: 15.61820,
      },
      {
        text: "Hur djupt är ras-hålet Stora Stöten ungefär?",
        options: ["95 meter", "20 meter", "200 meter", "10 meter"],
        correct: 0,
        lat: 60.59780,
        lng: 15.61790,
      },
      {
        text: "Vad heter den karaktäristiska färgade träbyggnaden som finns över hela Sverige tack vare Falun?",
        options: [
          "Faluröda stugor",
          "Stockholmsstugor",
          "Karlsborgshus",
          "Visbyhus",
        ],
        correct: 0,
        lat: 60.59820,
        lng: 15.61750,
      },
      {
        text: "Vilket landskap ligger Falun i?",
        options: ["Dalarna", "Värmland", "Gästrikland", "Hälsingland"],
        correct: 0,
        lat: 60.59870,
        lng: 15.61770,
      },
    ],
  },
};

// ─── Main ────────────────────────────────────────────────────────────
const targets = walkArg === "all" ? Object.keys(WALKS) : [walkArg];
for (const key of targets) {
  if (!WALKS[key]) {
    console.error(`✗ Okänd walk-key: ${key}. Tillgängliga: ${Object.keys(WALKS).join(", ")}`);
    process.exit(1);
  }
}

console.log(`\n⚠️  Kommer att skapa följande walks under uid: ${createdBy}`);
for (const key of targets) {
  console.log(`  • ${key}: "${WALKS[key].title}"`);
}
console.log(`\n   Avbryt med Ctrl+C inom 3 sekunder om något ser fel ut.\n`);
await new Promise((resolve) => setTimeout(resolve, 3000));

for (const key of targets) {
  const walk = buildWalk(WALKS[key]);
  await db.collection("walks").doc(walk.id).set(walk);
  console.log(`✅ Skapad: ${walk.title}`);
  console.log(`   Walk ID: ${walk.id}`);
  console.log(`   URL:     https://tipspromenaden.app/walk/${walk.id}`);
  console.log(`   Frågor:  ${walk.questions.length} st`);
  console.log(``);
}

console.log(`Klart! Walks är synliga i:`);
console.log(`  • Mobilappens Bibliotek → Upptäck`);
console.log(`  • Skapa-vyn på webben → din egen "Mina"-lista (för finjustering)`);
process.exit(0);
