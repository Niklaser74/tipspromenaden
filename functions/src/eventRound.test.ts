/**
 * @file eventRound.test.ts
 * @description Enhetstest för regeln som scopar en eventtopplista till
 * aktuell omgång. Regeln bor i app-repots `src/utils/eventRound.ts` och
 * speglas hit av `scripts/sync-shared.mjs` — functions/ använder den inte
 * i produktion än, men det är repots enda testharness.
 *
 * Bakgrund till att regeln går på DELTAGAREN och inte på sessionen: se
 * det första testet. Ett filter på sessionens `createdAt` hade dolt hela
 * topplistan för de event där arrangören testat promenaden i förväg.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  EVENT_ROUND_GRACE_MS,
  eventRoundWindow,
  filterParticipantsToEventRound,
  isParticipantInEventRound,
  isSameEventWindow,
} from "./shared/eventRound";

/** Lokal tid, samma tolkning som `parseIsoDate` gör i appen. */
const at = (iso: string, h = 12, min = 0) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
};

const walk2026 = { event: { startDate: "2026-08-20", endDate: "2026-08-21" } };
const walk2027 = { event: { startDate: "2027-08-19", endDate: "2027-08-20" } };

test("deltagare i en runda som skapades före eventet räknas ändå med", () => {
  // Verkligt fall (Medborgarskapspromenaden): arrangören testade 21 aug,
  // sessionen låg kvar öppen, och de riktiga deltagarna gick i mål 25 aug.
  const walk = { event: { startDate: "2026-08-25", endDate: "2026-08-25" } };
  const deltagare = { completedAt: at("2026-08-25", 10, 31) };
  const testrunda = { completedAt: at("2026-08-21", 13, 50) };
  assert.equal(isParticipantInEventRound(deltagare, walk), true);
  assert.equal(isParticipantInEventRound(testrunda, walk), false);
});

test("förra årets deltagare faller ut när eventet fått nya datum", () => {
  const p = { completedAt: at("2026-08-20", 10) };
  assert.equal(isParticipantInEventRound(p, walk2026), true);
  assert.equal(isParticipantInEventRound(p, walk2027), false);
});

test("dag 3 av ett femdagarsevent räknas med", () => {
  const walk = { event: { startDate: "2026-06-01", endDate: "2026-06-05" } };
  assert.equal(isParticipantInEventRound({ completedAt: at("2026-06-03", 14) }, walk), true);
});

test("den som startade 23:40 och gick i mål efter midnatt räknas med", () => {
  const p = { lastActivityAt: at("2026-08-21", 23, 40), completedAt: at("2026-08-22", 0, 20) };
  assert.equal(isParticipantInEventRound(p, walk2026), true);
});

test("marginalen täcker natten efter men inte nästa kväll", () => {
  assert.equal(isParticipantInEventRound({ completedAt: at("2026-08-22", 6) }, walk2026), true);
  assert.equal(isParticipantInEventRound({ completedAt: at("2026-08-22", 20) }, walk2026), false);
});

test("walk utan event lämnar listan orörd", () => {
  const ps = [{ completedAt: at("2020-01-01") }, { completedAt: at("2030-01-01") }];
  assert.deepEqual(filterParticipantsToEventRound(ps, {}), ps);
  assert.deepEqual(filterParticipantsToEventRound(ps, null), ps);
});

test("deltagare utan tidsstämplar räknas med", () => {
  assert.equal(isParticipantInEventRound({}, walk2026), true);
  assert.equal(isParticipantInEventRound({ completedAt: NaN }, walk2026), true);
});

test("gammal klient utan lastActivityAt bedöms på completedAt", () => {
  assert.equal(isParticipantInEventRound({ completedAt: at("2026-08-20", 9) }, walk2026), true);
  assert.equal(isParticipantInEventRound({ completedAt: at("2025-08-20", 9) }, walk2026), false);
});

test("trasigt datum ger inget fönster och filtrerar inget", () => {
  const trasig = { event: { startDate: "inte-ett-datum", endDate: "2026-08-21" } };
  assert.equal(eventRoundWindow(trasig), null);
  const ps = [{ completedAt: at("2020-01-01") }];
  assert.deepEqual(filterParticipantsToEventRound(ps, trasig), ps);
});

test("slutdatum före startdatum ger inget fönster", () => {
  assert.equal(
    eventRoundWindow({ event: { startDate: "2026-08-21", endDate: "2026-08-20" } }),
    null
  );
});

test("filtrering plockar ut rätt omgång ur en blandad lista", () => {
  const ps = [
    { completedAt: at("2026-08-20", 10) },
    { completedAt: at("2026-08-21", 11) },
    { completedAt: at("2027-08-19", 10) },
  ];
  assert.equal(filterParticipantsToEventRound(ps, walk2026).length, 2);
  assert.equal(filterParticipantsToEventRound(ps, walk2027).length, 1);
});

test("fönstret sträcker sig ett dygn plus marginalen efter sista dagen", () => {
  const w = eventRoundWindow(walk2026)!;
  assert.equal(w.from, at("2026-08-20", 0));
  assert.equal(w.to, at("2026-08-21", 0) + 24 * 3600000 + EVENT_ROUND_GRACE_MS);
});

test("samma datum är samma omgång", () => {
  assert.equal(isSameEventWindow(walk2026.event, { ...walk2026.event }), true);
  assert.equal(isSameEventWindow(walk2026.event, walk2027.event), false);
  assert.equal(isSameEventWindow(undefined, undefined), true);
  assert.equal(isSameEventWindow(walk2026.event, undefined), false);
});
