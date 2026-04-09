/**
 * 保存した Meet タブ ID からタブキャプチャの MediaStream を取得する。
 */
(function () {
  const g = typeof globalThis !== "undefined" ? globalThis : window;

  /**
   * @param {number} tabId
   * @returns {Promise<MediaStream>}
   */
  g.ltgGetMeetTabAudioStream = function (tabId) {
    return new Promise((resolve, reject) => {
      chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, async (streamId) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!streamId) {
          reject(new Error("ストリーム ID を取得できませんでした"));
          return;
        }
        try {
          const stream = await navigator.mediaDevices.getUserMedia(
            /** @type {MediaStreamConstraints} */ ({
              audio: {
                mandatory: {
                  chromeMediaSource: "tab",
                  chromeMediaSourceId: streamId,
                },
              },
              video: false,
            }),
          );
          resolve(stream);
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      });
    });
  };
})();
