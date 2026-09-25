/**
 * @file index.ts
 * @description Ingång för Tipspromenadens Cloud Functions (2nd gen).
 * Se docs/ai-questions-backend.md för setup, secrets och deploy.
 */
import { initializeApp } from "firebase-admin/app";

initializeApp();

export { generateQuestions } from "./generate";
export { createCheckoutSession, stripeWebhook } from "./billing";
export { createInvoice } from "./invoicing";
export { createPortalSession, createProCheckout } from "./subscriptions";
