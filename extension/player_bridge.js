// RecallAI Player Bridge — executes in the MAIN world of YouTube
// Grants direct, unhindered access to the live YouTube HTML5 player and caption tracks

(() => {
  function getPlayerCaptionTracks() {
    try {
      // 1. Inspect live movie_player element (updates dynamically on SPA video changes)
      const mp = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
      if (mp) {
        if (typeof mp.getPlayerResponse === 'function') {
          const pr = mp.getPlayerResponse();
          const tr = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (Array.isArray(tr) && tr.length > 0) {
            return {
              ok: true,
              tracks: tr,
              videoId: pr?.videoDetails?.videoId,
              title: pr?.videoDetails?.title,
              source: 'mp.getPlayerResponse'
            };
          }
        }
        if (typeof mp.getOption === 'function') {
          const tr = mp.getOption('captions', 'tracklist');
          if (Array.isArray(tr) && tr.length > 0) {
            return {
              ok: true,
              tracks: tr,
              videoId: null,
              source: 'mp.getOption'
            };
          }
        }
      }

      // 2. Inspect window.ytInitialPlayerResponse
      if (window.ytInitialPlayerResponse) {
        const pr = window.ytInitialPlayerResponse;
        const tr = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (Array.isArray(tr) && tr.length > 0) {
          return {
            ok: true,
            tracks: tr,
            videoId: pr?.videoDetails?.videoId,
            title: pr?.videoDetails?.title,
            source: 'ytInitialPlayerResponse'
          };
        }
      }

      // 3. Inspect window.yt.player
      if (window.yt?.player?.getPlayerByElement) {
        const pr = window.yt.player.getPlayerByElement(mp)?.getPlayerResponse?.();
        const tr = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        if (Array.isArray(tr) && tr.length > 0) {
          return {
            ok: true,
            tracks: tr,
            videoId: pr?.videoDetails?.videoId,
            source: 'yt.player'
          };
        }
      }
    } catch (e) {}

    return { ok: false, tracks: [], videoId: null };
  }

  // Answer on-demand requests from RecallAI content script
  window.addEventListener('__RC_REQ_TRACKS__', (e) => {
    const data = getPlayerCaptionTracks();
    window.dispatchEvent(new CustomEvent('__RC_RESP_TRACKS__', { detail: data }));
  });

  // Automatically broadcast on YouTube navigation events
  function broadcast() {
    const data = getPlayerCaptionTracks();
    if (data.ok && data.tracks.length > 0) {
      window.dispatchEvent(new CustomEvent('__RC_RESP_TRACKS__', { detail: data }));
    }
  }

  window.addEventListener('yt-navigate-finish', () => setTimeout(broadcast, 400));
  window.addEventListener('yt-player-updated', () => setTimeout(broadcast, 300));
  window.addEventListener('spfdone', () => setTimeout(broadcast, 400));
  setInterval(broadcast, 2500);

  // Initial broadcast
  setTimeout(broadcast, 500);
})();
