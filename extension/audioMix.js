/**
 * 2つの音声ストリームを AudioContext でミックスし、1本の MediaStream にする。
 * streamA を Meet タブ音声、streamB をマイクとみなす。
 * オプションで streamA のみをスピーカーへモニター（マイクはモニターしない）。
 */
(function () {
  const g = typeof globalThis !== "undefined" ? globalThis : window;

  /**
   * @param {MediaStream} streamA Meet タブ音声（モニター対象にできる）
   * @param {MediaStream} streamB マイク
   * @param {{ meetTabMonitorGain?: number }} [options]
   *   meetTabMonitorGain: 0 でモニター無効。0より大きい値はスピーカー向けゲイン（上限 1 にクランプ）
   * @returns {{ stream: MediaStream, dispose: () => Promise<void> }}
   */
  g.ltgMixTwoAudioStreams = function (streamA, streamB, options) {
    const rawGain =
      options && typeof options.meetTabMonitorGain === "number"
        ? options.meetTabMonitorGain
        : 1;
    const monitorGainValue = Math.min(1, Math.max(0, rawGain));

    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const srcA = ctx.createMediaStreamSource(streamA);
    const srcB = ctx.createMediaStreamSource(streamB);
    srcA.connect(dest);
    srcB.connect(dest);

    /** @type {GainNode | null} */
    let monitorGain = null;
    if (monitorGainValue > 0) {
      monitorGain = ctx.createGain();
      monitorGain.gain.value = monitorGainValue;
      srcA.connect(monitorGain);
      monitorGain.connect(ctx.destination);
    }

    void ctx.resume().catch(() => {});

    return {
      stream: dest.stream,
      dispose: async () => {
        try {
          srcA.disconnect();
          srcB.disconnect();
          if (monitorGain) {
            monitorGain.disconnect();
          }
        } catch (_) {
          /* ignore */
        }
        streamA.getTracks().forEach((t) => t.stop());
        streamB.getTracks().forEach((t) => t.stop());
        await ctx.close();
      },
    };
  };
})();
