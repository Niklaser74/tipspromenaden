/**
 * @file region.ts
 * @description Regionen, ensam i en egen fil.
 *
 * Bor inte i `config.ts` eftersom den filen också definierar secrets
 * (`defineSecret`). Importeras den av en funktion som deployas ensam
 * kräver firebase-tools värden för ALLA secrets i kodbasen — och
 * `closeStaleRounds` ska gå att deploya utan Stripe-nycklarna.
 */
export const REGION = "europe-north1";

/**
 * Region för 1st gen-funktioner (`cleanupDeletedUserBilling` — Auth
 * onDelete finns inte i 2nd gen). 1st gen finns inte i europe-north1:
 * deploy dit failar med "403 Permission denied on locations/europe-north1"
 * mot v1-API:t, och eftersom källkoden laddas upp per region och
 * plattform fäller det även deploy av enskilda 2nd gen-funktioner.
 */
export const V1_REGION = "europe-west1";
