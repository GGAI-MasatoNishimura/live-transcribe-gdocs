/**
 * Google Cloud Speech-to-Text（同期 recognize）。要件の第一候補に合わせる。
 */

import { SpeechClient } from "@google-cloud/speech";

/** @type {SpeechClient | null} */
let client = null;

export function isSttConfigured() {
  return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
}

function getClient() {
  if (!isSttConfigured()) {
    return null;
  }
  if (!client) {
    client = new SpeechClient();
  }
  return client;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * @param {Buffer} pcmBuffer
 * @param {number} sampleRateHz
 * @returns {Promise<string | null>}
 */
export async function transcribeLinear16Pcm(pcmBuffer, sampleRateHz = 16000) {
  const speechClient = getClient();
  if (!speechClient || !pcmBuffer?.length) {
    return null;
  }

  const maxAttempts = 3;
  let lastErr;
  const languageCode = process.env.RELAY_STT_LANGUAGE ?? "ja-JP";
  const model = process.env.RELAY_STT_MODEL?.trim();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const [response] = await speechClient.recognize({
        config: {
          encoding: "LINEAR16",
          sampleRateHertz: sampleRateHz,
          audioChannelCount: 1,
          languageCode,
          ...(model ? { model } : {}),
          enableAutomaticPunctuation: true,
        },
        audio: {
          content: pcmBuffer,
        },
      });

      const parts = [];
      for (const result of response.results ?? []) {
        const t = result.alternatives?.[0]?.transcript?.trim();
        if (t) {
          parts.push(t);
        }
      }
      if (parts.length === 0) {
        const n = response.results?.length ?? 0;
        console.log(
          `[relay] STT: API は応答したが transcript が空（results=${n}）。PCM が無音に近い、言語コード（RELAY_STT_LANGUAGE）、またはモデル（RELAY_STT_MODEL）の不一致の可能性があります。`,
        );
      }
      return parts.length ? parts.join(" ") : null;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[relay] STT recognize 試行 ${attempt}/${maxAttempts}: ${msg}`);
      if (attempt < maxAttempts) {
        await sleep(500 * 2 ** (attempt - 1));
      }
    }
  }

  console.error("[relay] STT recognize がリトライ後も失敗:", lastErr);
  return null;
}
