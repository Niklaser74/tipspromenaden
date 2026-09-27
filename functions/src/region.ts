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
