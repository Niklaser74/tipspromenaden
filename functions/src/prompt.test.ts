import { strict as assert } from "node:assert";
import { test } from "node:test";
import { GenerationError, buildGenerationPrompt, toGenerationResult } from "./prompt";
import { parseGenerateRequest } from "./request";

const req = parseGenerateRequest({
  mode: "topic",
  prompt: "Svenska kungar",
  language: "sv",
  count: 5,
  requestId: "req_12345678",
});

function q(text: string, options = ["A", "B", "C", "D"], correctOptionIndex = 1) {
  return { text, options, correctOptionIndex, explanation: "För att.", sourceUrl: "" };
}

test("giltigt svar blir ett tipspack", () => {
  const raw = JSON.stringify({
    name: "Kungar",
    description: "Frågor om kungar",
    questions: [q("F1"), q("F2"), q("F3"), q("F4"), q("F5"), q("F6")],
  });
  const { battery, notes } = toGenerationResult(raw, req);
  assert.equal(battery.format, "tipspack");
  assert.equal(battery.language, "sv");
  assert.equal(battery.questions.length, 5, "trimmas till begärt antal");
  assert.equal(notes.length, 5);
  assert.deepEqual(Object.keys(battery.questions[0]).sort(), ["correctOptionIndex", "options", "text"]);
});

test("dåliga frågor sorteras bort, för få kvar ger fel", () => {
  const raw = JSON.stringify({
    name: "Kungar",
    description: "",
    questions: [
      q("F1"),
      q("F2", ["A", "a", "C", "D"]), // dubbla alternativ
      q("F3", ["A", "B"], 5), // fel index
      q("F4"),
      q("F5"),
    ],
  });
  assert.throws(() => toGenerationResult(raw, req), GenerationError);
});

test("ogiltig JSON ger GenerationError", () => {
  assert.throws(() => toGenerationResult("{inte json", req), GenerationError);
});

test("källänkar måste vara http(s)", () => {
  const questions = [q("F1"), q("F2"), q("F3"), q("F4"), q("F5")];
  questions[0].sourceUrl = "javascript:alert(1)";
  questions[1].sourceUrl = "https://sv.wikipedia.org/wiki/Visby";
  const { notes } = toGenerationResult(JSON.stringify({ name: "X", description: "", questions }), req);
  assert.equal(notes[0].sourceUrl, "");
  assert.equal(notes[1].sourceUrl, "https://sv.wikipedia.org/wiki/Visby");
});

test("text-läget skickar med materialet inom taggar", () => {
  const textReq = parseGenerateRequest({
    mode: "text",
    sourceText: "Föreningen grundades 1932. ".repeat(10),
    language: "sv",
    count: 5,
    requestId: "req_12345678",
  });
  const prompt = buildGenerationPrompt(textReq);
  assert.match(prompt, /<material>\nFöreningen grundades 1932/);
  assert.match(prompt, /ONLY on the facts/);
});
