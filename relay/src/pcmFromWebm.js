/**
 * MediaRecorder の WebM 断片を ffmpeg で 16kHz mono LINEAR16 (s16le) に変換する。
 */

import { spawn } from "node:child_process";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

/**
 * @param {Buffer} webmBuffer
 * @returns {Promise<Buffer | null>}
 */
export async function webmBufferToLinear16Pcm(webmBuffer) {
  if (!ffmpegPath) {
    console.warn("[relay] ffmpeg-static が利用できません");
    return null;
  }
  if (!webmBuffer?.length) {
    return null;
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  const inPath = join(tmpdir(), `ltg-in-${id}.webm`);
  const outPath = join(tmpdir(), `ltg-out-${id}.s16`);

  await writeFile(inPath, webmBuffer);

  const exitCode = await new Promise((resolve, reject) => {
    const ff = spawn(ffmpegPath, [
      "-nostdin",
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-i",
      inPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "s16le",
      outPath,
    ]);
    ff.on("error", reject);
    ff.on("close", resolve);
  });

  await unlink(inPath).catch(() => {});

  if (exitCode !== 0) {
    await unlink(outPath).catch(() => {});
    return null;
  }

  try {
    const pcm = await readFile(outPath);
    await unlink(outPath).catch(() => {});
    if (pcm.length < 500) {
      return null;
    }
    return pcm;
  } catch {
    await unlink(outPath).catch(() => {});
    return null;
  }
}
