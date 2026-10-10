window.Player = (function () {
  const audio = new Audio();
  audio.preload = "none";

  let hls = null;
  let hlsLoad = null;
  let current = null;
  const subs = { change: [], state: [], error: [] };

  function emit(evt, data) { (subs[evt] || []).forEach(fn => { try { fn(data); } catch (e) {} }); }

  function on(evt, fn) { if (subs[evt]) subs[evt].push(fn); }

  function ensureHls() {
    if (!hlsLoad) {
      hlsLoad = new Promise((resolve, reject) => {
        if (window.Hls) return resolve(window.Hls);
        const s = document.createElement("script");
        s.src = "https://cdn.jsdelivr.net/npm/hls.js@1.5.13/dist/hls.min.js";
        s.onload = () => resolve(window.Hls);
        s.onerror = () => reject(new Error("hls load failed"));
        document.head.appendChild(s);
      });
    }
    return hlsLoad;
  }

  function cleanupHls() {
    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }
  }

  function isHls(item) { return !!(item && (item.hls || /\.m3u8(\?|#|$)/i.test(item.url || ""))); }

  async function play(item) {
    if (!item) return false;
    if (current && current.url === item.url && !audio.paused) { return true; }
    cleanupHls();
    audio.removeAttribute("src");
    audio.load();
    current = item;
    emit("change", item);

    if (isHls(item)) {
      try {
        const Hls = await ensureHls();
        if (Hls && Hls.isSupported()) {
          hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            startLevel: -1,
            capLevelToPlayerSize: false,
            backBufferLength: 90,
            maxBufferLength: 30,
            maxMaxBufferLength: 60
          });
          hls.loadSource(item.url);
          hls.attachMedia(audio);
          hls.on(Hls.Events.ERROR, (e, d) => {
            if (!d) return;
            if (!d.fatal) return;
            if (d.type === Hls.ErrorTypes.NETWORK_ERROR) { try { hls.startLoad(); return; } catch (x) {} }
            if (d.type === Hls.ErrorTypes.MEDIA_ERROR) { try { hls.recoverMediaError(); return; } catch (x) {} }
            emit("error", item);
          });
        } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
          audio.src = item.url;
        } else {
          emit("error", item);
          return false;
        }
      } catch (err) {
        emit("error", item);
        return false;
      }
    } else {
      audio.src = item.url;
    }

    try {
      await audio.play();
      return true;
    } catch (err) {
      emit("state", { playing: false, blocked: true });
      return false;
    }
  }

  function pause() { audio.pause(); }
  function toggle() { if (!current) return; if (audio.paused) audio.play().catch(() => {}); else audio.pause(); }
  function stop() { cleanupHls(); try { audio.pause(); } catch (e) {} audio.removeAttribute("src"); audio.load(); current = null; emit("change", null); emit("state", { playing: false }); }
  function setVolume(v) { audio.volume = Math.max(0, Math.min(1, v)); }
  function volume() { return audio.volume; }
  function isPlaying() { return current && !audio.paused; }
  function now() { return current; }

  audio.addEventListener("playing", () => { if (current) current._retry = false; emit("state", { playing: true }); });
  audio.addEventListener("pause", () => emit("state", { playing: false }));
  audio.addEventListener("waiting", () => emit("state", { playing: true, buffering: true }));
  audio.addEventListener("error", () => {
    if (!current) return;
    if (!isHls(current) && !current._retry) {
      current._retry = true;
      setTimeout(() => { try { audio.src = current.url; audio.play().catch(() => {}); } catch (e) {} }, 900);
      return;
    }
    emit("error", current);
  });

  audio.volume = 0.8;

  return { play, pause, toggle, stop, setVolume, volume, isPlaying, now, on };
})();
