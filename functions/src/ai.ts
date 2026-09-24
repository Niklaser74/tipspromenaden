/**
 * @file ai.ts
 * @description Anropen mot Claude API. Två steg i platsläget:
 *   1. research — webbsökning, fri text ut (faktablad med käll-URL:er)
 *   2. generering — structured output enligt OUTPUT_SCHEMA
 * Övriga lägen kör bara steg 2. Uppdelningen behövs eftersom
 * webbsökningens citat inte går att kombinera med structured output.
 *
 * `fallbacks: "default"` låter API:t köra om en förfrågan på en annan
 * modell om säkerhetsklassificeraren skulle neka den.
 */
import Anthropic from "@anthropic-ai/sdk";
import {
  AI_EFFORT,
  AI_MODEL,
  PRICE_INPUT_PER_TOKEN,
  PRICE_OUTPUT_PER_TOKEN,
  PRICE_PER_WEB_SEARCH,
} from "./config";
import {
  GenerationError,
  OUTPUT_SCHEMA,
  SYSTEM_PROMPT,
  buildGenerationPrompt,
  buildResearchPrompt,
  toGenerationResult,
  type GenerationResult,
} from "./prompt";
import type { GenerateRequest } from "./request";

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const MAX_PAUSE_CONTINUATIONS = 3;

export interface UsageSummary {
  inputTokens: number;
  outputTokens: number;
  webSearches: number;
  costUsd: number;
}

function emptyUsage(): UsageSummary {
  return { inputTokens: 0, outputTokens: 0, webSearches: 0, costUsd: 0 };
}

function addUsage(total: UsageSummary, message: Anthropic.Beta.BetaMessage): void {
  const u = message.usage;
  // Cachade tokens räknas som input i vår grova kostnadslogg.
  const input =
    u.input_tokens + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0);
  const searches = u.server_tool_use?.web_search_requests ?? 0;
  total.inputTokens += input;
  total.outputTokens += u.output_tokens;
  total.webSearches += searches;
  total.costUsd +=
    input * PRICE_INPUT_PER_TOKEN +
    u.output_tokens * PRICE_OUTPUT_PER_TOKEN +
    searches * PRICE_PER_WEB_SEARCH;
}

function textOf(message: Anthropic.Beta.BetaMessage): string {
  return message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function assertUsableStop(message: Anthropic.Beta.BetaMessage): void {
  if (message.stop_reason === "refusal") {
    throw new GenerationError("AI:n avböjde att skriva frågor om det här ämnet.");
  }
  if (message.stop_reason === "max_tokens") {
    throw new GenerationError("AI-svaret blev för långt och klipptes av.");
  }
}

/** Platsläget steg 1: webbsökning → faktablad i fri text. */
async function research(
  client: Anthropic,
  req: GenerateRequest,
  usage: UsageSummary
): Promise<string> {
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    { role: "user", content: buildResearchPrompt(req) },
  ];
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    { type: "web_search_20260209", name: "web_search", max_uses: 6 },
  ];

  let message = await client.beta.messages
    .stream({
      model: AI_MODEL,
      max_tokens: 16000,
      output_config: { effort: AI_EFFORT },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      tools,
      messages,
    })
    .finalMessage();
  addUsage(usage, message);

  // Serverns sökloop kan pausa; skicka tillbaka turen så fortsätter den.
  for (let i = 0; message.stop_reason === "pause_turn" && i < MAX_PAUSE_CONTINUATIONS; i++) {
    messages.push({ role: "assistant", content: message.content });
    message = await client.beta.messages
      .stream({
        model: AI_MODEL,
        max_tokens: 16000,
        output_config: { effort: AI_EFFORT },
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        tools,
        messages,
      })
      .finalMessage();
    addUsage(usage, message);
  }

  assertUsableStop(message);
  const notes = textOf(message).trim();
  if (notes.length < 200) {
    throw new GenerationError("Hittade för lite information om platsen.");
  }
  return notes;
}

/** Steg 2: structured output enligt OUTPUT_SCHEMA. */
async function generate(
  client: Anthropic,
  req: GenerateRequest,
  material: string | undefined,
  usage: UsageSummary
): Promise<GenerationResult> {
  const message = await client.beta.messages
    .stream({
      model: AI_MODEL,
      // Thinking räknas in i max_tokens — 30 frågor + resonemang ryms gott.
      max_tokens: 32000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: AI_EFFORT,
        format: { type: "json_schema", schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> },
      },
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      messages: [{ role: "user", content: buildGenerationPrompt(req, material) }],
    })
    .finalMessage();
  addUsage(usage, message);
  assertUsableStop(message);
  return toGenerationResult(textOf(message), req);
}

export interface AiOutcome {
  result: GenerationResult;
  usage: UsageSummary;
}

/**
 * Kör hela genereringen. Kastar `GenerationError` (användbart meddelande)
 * eller SDK:ns `Anthropic.APIError` — anroparen återbetalar i båda fallen.
 * `usage` fylls på även när ett senare steg kastar, så kostnaden kan loggas.
 */
export async function generateBattery(
  apiKey: string,
  req: GenerateRequest,
  usage: UsageSummary = emptyUsage()
): Promise<AiOutcome> {
  const client = new Anthropic({ apiKey, maxRetries: 2 });
  const material = req.mode === "place" ? await research(client, req, usage) : req.sourceText;
  const result = await generate(client, req, material, usage);
  return { result, usage };
}

export { emptyUsage };
