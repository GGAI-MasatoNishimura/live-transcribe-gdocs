/**
 * 2つの音声ストリームを AudioContext でミックスし、1本の MediaStream にする。
 */
(function () {
  const g = typeof globalThis !== "undefined" ? globalThis : window;

  /**
   * @param {MediaStream} streamA
   * @param {MediaStream} streamB
   * @returns {{ stream: MediaStream, dispose: () => Promise<void> }}
   */
  g.ltgMixTwoAudioStreams = function (streamA, streamB) {
    const ctx = new AudioContext();
    const dest = ctx.createMediaStreamDestination();
    const srcA = ctx.createMediaStreamSource(streamA);
    const srcB = ctx.createMediaStreamSource(streamB);
    srcA.connect(dest);
    srcB.connect(dest);
    return {
      stream: dest.stream,
      dispose: async () => {
        try {
          srcA.disconnect();
          srcB.disconnect();
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
