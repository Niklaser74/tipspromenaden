import { strict as assert } from "node:assert";
import { test } from "node:test";
import { normalizeOrgNumber, normalizeVatNumber, parseInvoiceRequest } from "./invoiceRequest";
import { RequestError } from "./request";

const org = {
  name: "Hammarskolan",
  orgNumber: "212000-0142",
  email: "ekonomi@kommun.se",
  address: { line1: "Skolvägen 1", postalCode: "123 45", city: "Hammarby" },
};
const base = { packId: "pack100", requestId: "inv_12345678", organization: org };

test("organisationsnummer: Luhn och normalisering", () => {
  assert.equal(normalizeOrgNumber("5560360793"), "556036-0793");
  assert.equal(normalizeOrgNumber("556036-0793"), "556036-0793");
  assert.equal(normalizeOrgNumber("16 556036-0793"), "556036-0793");
  assert.equal(normalizeOrgNumber("556036-0794"), null);
  assert.equal(normalizeOrgNumber("12345"), null);
});

test("momsnummer: SE kräver orgnr + 01", () => {
  assert.equal(normalizeVatNumber("se 5560 3607 9301", "SE"), "SE556036079301");
  assert.equal(normalizeVatNumber("SE556036079401", "SE"), null);
  assert.equal(normalizeVatNumber("SE5560360793", "SE"), null);
  assert.equal(normalizeVatNumber("DE123456789", "DE"), "DE123456789");
  assert.equal(normalizeVatNumber("EL123456789", "GR"), "EL123456789");
  assert.equal(normalizeVatNumber("SE556036079301", "DE"), null);
});

test("giltig förfrågan normaliseras, land blir SE som standard", () => {
  const req = parseInvoiceRequest(base);
  assert.equal(req.organization.orgNumber, "212000-0142");
  assert.equal(req.organization.address.country, "SE");
  assert.equal(req.organization.vatNumber, "");
  assert.equal(req.organization.reference, "");
});

test("felaktiga fält avvisas", () => {
  const bad = (organization: Record<string, unknown>) =>
    assert.throws(() => parseInvoiceRequest({ ...base, organization }), RequestError);
  bad({ ...org, orgNumber: "212000-0143" });
  bad({ ...org, email: "inte-en-adress" });
  bad({ ...org, name: "" });
  bad({ ...org, address: { ...org.address, city: "" } });
  bad({ ...org, address: { ...org.address, country: "US" } });
  bad({ ...org, vatNumber: "SE212000014201x" });
  assert.throws(() => parseInvoiceRequest({ ...base, requestId: "kort" }), RequestError);
});
