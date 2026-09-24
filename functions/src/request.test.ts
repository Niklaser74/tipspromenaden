import { strict as assert } from "node:assert";
import { test } from "node:test";
import { RequestError, creditCost, parseGenerateRequest } from "./request";

const base = { language: "sv", count: 10, requestId: "req_12345678" };

test("topic kräver prompt", () => {
  assert.throws(() => parseGenerateRequest({ ...base, mode: "topic" }), RequestError);
  const req = parseGenerateRequest({ ...base, mode: "topic", prompt: "  Svenska kungar " });
  assert.equal(req.prompt, "Svenska kungar");
  assert.equal(req.difficulty, "medium");
  assert.equal(req.audience, "mixed");
});

test("text kräver tillräckligt lång källtext", () => {
  assert.throws(() => parseGenerateRequest({ ...base, mode: "text", sourceText: "kort" }), RequestError);
  assert.throws(
    () => parseGenerateRequest({ ...base, mode: "text", sourceText: "x".repeat(20_001) }),
    RequestError
  );
  const req = parseGenerateRequest({ ...base, mode: "text", sourceText: "a".repeat(300) });
  assert.equal(req.sourceText?.length, 300);
});

test("place kräver namn och giltiga koordinater", () => {
  assert.throws(() => parseGenerateRequest({ ...base, mode: "place", place: {} }), RequestError);
  assert.throws(
    () => parseGenerateRequest({ ...base, mode: "place", place: { name: "Visby", lat: 200 } }),
    RequestError
  );
  const req = parseGenerateRequest({ ...base, mode: "place", place: { name: "Visby", lat: 57.64, lng: 18.29 } });
  assert.deepEqual(req.place, { name: "Visby", lat: 57.64, lng: 18.29 });
});

test("avvisar okända värden och fel antal", () => {
  assert.throws(() => parseGenerateRequest({ ...base, mode: "topic", prompt: "x", language: "xx" }), RequestError);
  assert.throws(() => parseGenerateRequest({ ...base, mode: "topic", prompt: "x", count: 4 }), RequestError);
  assert.throws(() => parseGenerateRequest({ ...base, mode: "topic", prompt: "x", count: 31 }), RequestError);
  assert.throws(() => parseGenerateRequest({ ...base, mode: "topic", prompt: "x", count: 10.5 }), RequestError);
  assert.throws(() => parseGenerateRequest({ ...base, mode: "topic", prompt: "x", requestId: "a b" }), RequestError);
  assert.throws(() => parseGenerateRequest({ ...base, mode: "magic", prompt: "x" }), RequestError);
});

test("kreditkostnad", () => {
  assert.equal(creditCost({ mode: "topic", count: 10 }), 1);
  assert.equal(creditCost({ mode: "text", count: 15 }), 1);
  assert.equal(creditCost({ mode: "topic", count: 16 }), 2);
  assert.equal(creditCost({ mode: "place", count: 10 }), 2);
  assert.equal(creditCost({ mode: "place", count: 30 }), 3);
});
