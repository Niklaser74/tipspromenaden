/**
 * @file generate.ts
 * @description Callable `generateQuestions` — genererar ett frågebatteri
 * med AI mot betalning i krediter.
 *
 * Klienten (webb nu, app senare) anropar via `httpsCallable`:
 *   { mode, prompt, sourceText?, place?, count, language, difficulty,
 *     audience, requestId }
 * och får tillbaka
 *   { battery: QuestionBattery, notes: QuestionNote[], creditsLeft, cost }
 *
 * `battery` är ett giltigt tipspack som kan gå rakt in i befintlig
 * import (`applyBattery` i appen, biblioteksflödet på webben).
 *
 * Fel skickas som HttpsError med `details.reason` så klienten kan välja
 * rätt översatt text: "no-credits", "rate-limited", "in-progress",
 * "generation-failed", "anonymous".
 */
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "firebase-functions/v2";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { emptyUsage, generateBattery } from "./ai";
import { ANTHROPIC_API_KEY, ENFORCE_APP_CHECK } from "./config";
import { consumeCredits, refundCredits, reserveCredits } from "./credits";
import { GenerationError } from "./prompt";
import { RequestError, creditCost, parseGenerateRequest } from "./request";

export const generateQuestions = onCall(
  {
    secrets: [ANTHROPIC_API_KEY],
    enforceAppCheck: ENFORCE_APP_CHECK,
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "Logga in för att generera frågor.");
    }
    // Samma krav som för att skapa walks: bara Google-/Apple-konton.
    if (auth.token.firebase?.sign_in_provider === "anonymous") {
      throw new HttpsError("permission-denied", "Logga in med ett konto för att använda AI-frågor.", {
        reason: "anonymous",
      });
    }

    let req;
    try {
      req = parseGenerateRequest(request.data);
    } catch (e) {
      if (e instanceof RequestError) throw new HttpsError("invalid-argument", e.message);
      throw e;
    }

    const uid = auth.uid;
    const cost = creditCost(req);
    const reservation = await reserveCredits(uid, req.requestId, cost, req.mode);
    if (reservation.kind === "cached") {
      return { ...reservation.result, creditsLeft: reservation.creditsLeft, cost: 0 };
    }

    const usage = emptyUsage();
    try {
      const { result } = await generateBattery(ANTHROPIC_API_KEY.value(), req, usage);
      await consumeCredits(uid, req.requestId, result, usage);
      logger.info("generateQuestions ok", {
        uid,
        mode: req.mode,
        count: req.count,
        delivered: result.battery.questions.length,
        cost,
        usage,
      });
      return { ...result, creditsLeft: reservation.creditsLeft, cost };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await refundCredits(uid, req.requestId, message, usage).catch((refundError) =>
        // Loggas högt — en misslyckad återbetalning måste rättas manuellt.
        logger.error("refundCredits misslyckades", { uid, requestId: req.requestId, refundError })
      );
      logger.warn("generateQuestions misslyckades, krediten återbetald", {
        uid,
        mode: req.mode,
        error: message,
        usage,
      });

      if (e instanceof GenerationError) {
        throw new HttpsError("internal", `${e.message} Krediten har återbetalats.`, {
          reason: "generation-failed",
        });
      }
      if (e instanceof Anthropic.RateLimitError || (e instanceof Anthropic.APIError && (e.status ?? 0) >= 500)) {
        throw new HttpsError("unavailable", "AI-tjänsten är tillfälligt överbelastad. Försök igen om en stund.", {
          reason: "generation-failed",
        });
      }
      throw new HttpsError("internal", "Något gick fel vid genereringen. Krediten har återbetalats.", {
        reason: "generation-failed",
      });
    }
  }
);
