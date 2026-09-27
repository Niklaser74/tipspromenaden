/**
 * @file rounds.test.ts
 * @description Enhetstest för staleness-regeln som delas av klienten och
 * det schemalagda jobbet. Kör med `npm test` i functions/.
 *
 * Det första fallet är det som faktiskt gick fel i produktion: en person
 * som anslöt men aldrig svarade höll rundan vid liv i åtta timmar till.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { isRoundStale, lastRoundActivity, STALE_ROUND_MS } from "./shared/staleRound";

const NOW = Date.parse("2026-09-27T12:00:00Z");
const hoursAgo = (h: number) => NOW - h * 3600000;

test("den som bara anslutit håller inte rundan vid liv", () => {
  const session = { createdAt: hoursAgo(50) };
  const joinedButNeverAnswered = [
    { answers: [], lastActivityAt: hoursAgo(49) },
    { answers: [], lastActivityAt: hoursAgo(2) }, // anslöt nyss, inga svar
  ];
  assert.equal(isRoundStale(session, joinedButNeverAnswered, null, NOW), true);
  assert.equal(lastRoundActivity(session, joinedButNeverAnswered), hoursAgo(50));
});

test("ett besvarat frågetecken håller rundan vid liv", () => {
  const session = { createdAt: hoursAgo(50) };
  const answered = [{ answers: [{}], lastActivityAt: hoursAgo(2) }];
  assert.equal(isRoundStale(session, answered, null, NOW), false);
});

test("tyst i över åtta timmar är övergivet", () => {
  const session = { createdAt: hoursAgo(30) };
  const answered = [{ answers: [{}, {}], lastActivityAt: hoursAgo(9) }];
  assert.equal(isRoundStale(session, answered, null, NOW), true);
});

test("sju timmars paus i en lång runda är inte övergivet", () => {
  const session = { createdAt: hoursAgo(9) };
  const answered = [{ answers: [{}], lastActivityAt: hoursAgo(7) }];
  assert.equal(isRoundStale(session, answered, null, NOW), false);
});

test("nystartad runda utan svar skyddas av createdAt", () => {
  const session = { createdAt: hoursAgo(1) };
  assert.equal(isRoundStale(session, [{ answers: [] }], null, NOW), false);
});

test("gammal klient utan lastActivityAt faller tillbaka på completedAt", () => {
  const session = { createdAt: hoursAgo(40) };
  const legacy = [{ answers: [{}], completedAt: hoursAgo(1) }];
  assert.equal(isRoundStale(session, legacy, null, NOW), false);
});

test("pågående event rörs aldrig", () => {
  const session = { createdAt: hoursAgo(200) };
  const walk = { event: { startDate: "2026-09-20", endDate: "2026-09-30" } };
  assert.equal(isRoundStale(session, [], walk, NOW), false);
});

test("avslutat event räknas som övergivet för klienten", () => {
  const session = { createdAt: hoursAgo(200) };
  const walk = { event: { startDate: "2026-09-01", endDate: "2026-09-10" } };
  assert.equal(isRoundStale(session, [], walk, NOW), true);
});

test("men jobbet lämnar avslutade event i fred", () => {
  const session = { createdAt: hoursAgo(200) };
  const walk = { event: { startDate: "2026-09-01", endDate: "2026-09-10" } };
  assert.equal(isRoundStale(session, [], walk, NOW, { keepEventWalks: true }), false);
});

test("tröskeln är åtta timmar", () => {
  assert.equal(STALE_ROUND_MS, 8 * 60 * 60 * 1000);
});
