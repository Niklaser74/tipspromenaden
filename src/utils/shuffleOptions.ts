/**
 * @file shuffleOptions.ts
 * @description Blandar svarsalternativen i en uppsättning frågor så att
 * rätt svar inte ligger på samma plats hela promenaden.
 *
 * Tipspack skrivs ofta med rätt svar först — sex av de femton kurerade
 * paketen hade det på varje fråga — och det märker en deltagare efter tre
 * kontroller. Två regler:
 *
 * - **Jämn fördelning, inte bara slump.** Rena slumpen kan lika gärna ge
 *   fyra A i rad. I stället delas platserna ut så att varje plats används
 *   ungefär lika ofta över hela uppsättningen, och sedan blandas vilken
 *   fråga som får vilken plats.
 * - **Tal sorteras i stället för att blandas.** Är varje alternativ ett tal
 *   eller årtal ("1856", "3,5 km") är stigande ordning det naturliga, och
 *   rätt svar hamnar ändå på olika platser.
 *
 * Alla deltagare ser samma ordning — resultatet sparas i walken. Att blanda
 * per deltagare skulle göra facit ojämförbart och fördelningen i
 * WalkInsights (räknad per alternativ-index) meningslös.
 *
 * Filen finns i två repon och ska vara **byte-för-byte identisk** i båda:
 * `tipspromenaden-app/src/utils/shuffleOptions.ts` och
 * `tipspromenaden-web/src/lib/shuffleOptions.ts`. Ändra båda i samma veva.
 * Ren TS utan plattformsberoenden.
 */

export interface ShufflableQuestion {
  options: string[];
  correctOptionIndex: number;
}

/**
 * Siffror med valfria mellanslag, decimaltecken, intervall och enhet efter.
 * Ingen `\p{L}`: Hermes stöd för Unicode-egenskaper vill vi inte luta oss
 * mot, så enhetsbokstäverna räknas upp.
 */
const NUMERIC_OPTION = /^\s*[-−]?\d[\d\s.,]*(\s*[–-]\s*\d[\d\s.,]*)?\s*[A-Za-zÀ-ÿ%°²³]*\.?\s*$/;

function numericValue(option: string): number {
  // Första talet räcker: "1990–1995" sorteras på 1990. Mellanslag är
  // tusentalsavgränsare ("12 000"), komma är decimaltecken.
  const first = option.trim().replace(/−/g, "-").match(/^-?\d[\d\s.,]*/);
  if (!first) return NaN;
  const cleaned = first[0].replace(/\s/g, "").replace(",", ".");
  return parseFloat(cleaned);
}

function isNumericQuestion(q: ShufflableQuestion): boolean {
  return (
    q.options.length > 1 &&
    q.options.every((o) => NUMERIC_OPTION.test(o) && !Number.isNaN(numericValue(o)))
  );
}

function fisherYates<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Sorterar talalternativ stigande och följer med rätt svar. Spårar index,
 * inte text, så att två identiska alternativ inte förväxlas.
 */
function sortNumeric<T extends ShufflableQuestion>(q: T): T {
  const order = q.options
    .map((option, index) => ({ option, index, value: numericValue(option) }))
    .sort((a, b) => a.value - b.value || a.index - b.index);
  return {
    ...q,
    options: order.map((o) => o.option),
    correctOptionIndex: order.findIndex((o) => o.index === q.correctOptionIndex),
  };
}

/** Placerar rätt svar på `target` och blandar resten runt det. */
function placeCorrectAt<T extends ShufflableQuestion>(
  q: T,
  target: number,
  random: () => number
): T {
  const correct = q.options[q.correctOptionIndex];
  const others = fisherYates(
    q.options.filter((_, i) => i !== q.correctOptionIndex),
    random
  );
  const options = [...others.slice(0, target), correct, ...others.slice(target)];
  return { ...q, options, correctOptionIndex: target };
}

/**
 * Blandar svarsalternativen i alla frågor. Returnerar nya objekt; indata
 * rörs inte. Frågor med färre än två alternativ eller ett ogiltigt
 * `correctOptionIndex` lämnas som de är.
 *
 * `random` går att byta ut i test.
 */
export function shuffleQuestionOptions<T extends ShufflableQuestion>(
  questions: T[],
  random: () => number = Math.random
): T[] {
  const valid = (q: T) =>
    q.options.length > 1 &&
    q.correctOptionIndex >= 0 &&
    q.correctOptionIndex < q.options.length;

  // Frågorna som ska blandas (inte talfrågor) får var sin målplats. Inom
  // varje grupp med samma antal alternativ cyklar platserna A, B, C, … och
  // listan blandas, så fördelningen blir jämn men ordningen oförutsägbar.
  // Grupperingen gör att ett pack med bara tre alternativ fördelas på tre
  // platser i stället för att D viks ner slumpvis.
  const slotsByCount = new Map<number, number[]>();
  for (const q of questions) {
    if (!valid(q) || isNumericQuestion(q)) continue;
    const n = q.options.length;
    const list = slotsByCount.get(n) ?? [];
    list.push(list.length % n);
    slotsByCount.set(n, list);
  }
  for (const [n, list] of slotsByCount) slotsByCount.set(n, fisherYates(list, random));

  return questions.map((q) => {
    if (!valid(q)) return q;
    if (isNumericQuestion(q)) return sortNumeric(q);
    const target = slotsByCount.get(q.options.length)!.pop()!;
    return placeCorrectAt(q, target, random);
  });
}
