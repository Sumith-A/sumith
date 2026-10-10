(function () {
  "use strict";

  const D = window.SFM;
  const $ = id => document.getElementById(id);
  const qsa = s => Array.from(document.querySelectorAll(s));

  const MIRRORS = [
    "https://de1.api.radio-browser.info/json",
    "https://nl1.api.radio-browser.info/json",
    "https://all.api.radio-browser.info/json"
  ];

  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  };

  const PAL = [
    "#ff3b30,#ff9f0a", "#ff2d55,#bf5af2", "#0a84ff,#5e5ce6", "#30d158,#0a84ff",
    "#ff9f0a,#ffd60a", "#bf5af2,#ff2d55", "#40c8e0,#0a84ff", "#ff6482,#ff9f0a"
  ];

  const state = {
    fav: store.get("sfm_fav", { st: [], songs: [] }),
    favData: store.get("sfm_favdata", {}),
    recent: store.get("sfm_recent", []),
    alarms: store.get("sfm_alarms", []),
    res: store.get("sfm_res", {}),
    rateUser: store.get("sfm_rate_user", {}),
    rateAgg: store.get("sfm_rate_agg", {}),
    compImg: store.get("sfm_comp_img", {}),
    reg: {},
    group: "all",
    lang: "all",
    loaded: {},
    muted: false
  };

  const moreActions = {};

  function allStations() { return D.TAMIL_FM.concat(D.NEWS_LIVE, D.NEWS_CHANNELS, D.TAMIL_TV); }
  function findStation(id) { return state.reg[id] || allStations().find(x => x.id === id) || state.favData[id]; }

  function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function palette(name) { let h = 0; for (let i = 0; i < String(name).length; i++) h = (h * 31 + String(name).charCodeAt(i)) >>> 0; return PAL[h % PAL.length]; }
  function initials(name) {
    const t = String(name).replace(/[^\u0B80-\u0BFFa-zA-Z0-9]/g, " ").trim().split(/\s+/);
    if (!t[0]) return "FM";
    let s = t[0].slice(0, 2);
    if (/^[0-9]/.test(s) && t[1]) s = s[0] + t[1][0];
    return s.toUpperCase();
  }
  function host(url) { try { return new URL(url).hostname; } catch (e) { return ""; } }

  function toast(msg, ms) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._t);
    t._t = setTimeout(() => t.classList.remove("show"), ms || 2600);
  }

  function openModal(title, html) {
    $("modalTitle").textContent = title;
    $("modalBody").innerHTML = html;
    $("modalBackdrop").classList.remove("hidden");
  }
  function closeModal() { $("modalBackdrop").classList.add("hidden"); }

  function thumbHTML(st) {
    const g = palette(st.name || st.ta || "fm");
    const av = `<span class="avatar" style="background:linear-gradient(135deg,${g})">${esc(initials(st.ta || st.name))}</span>`;
    if (st.logo) return av + `<img class="thumb-img" loading="lazy" src="${esc(st.logo)}" onerror="this.remove()">`;
    return av;
  }

  /* ---------- Star rating (customer rating) ---------- */
  function baseRating(id) {
    let h = 0; const s = String(id);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    const count = 40 + (h % 260);
    const avg = 3.7 + ((h >> 3) % 12) / 10;
    return { count: count, sum: Math.round(avg * count) };
  }
  function ratingStats(id) {
    const b = baseRating(id), u = state.rateAgg[id];
    const count = b.count + (u ? u.count : 0);
    const sum = b.sum + (u ? u.sum : 0);
    return { count: count, avg: count ? sum / count : 0 };
  }
  function rateBtnHTML(id) {
    const r = ratingStats(id);
    const on = (state.rateUser[id] || 0) > 0;
    return `<span class="rate-ic ${on ? "on" : ""}">&starf;</span><b>${r.avg.toFixed(1)}</b><small>(${r.count})</small>`;
  }
  function refreshRatings(id) {
    qsa(`[data-rate="${CSS.escape(id)}"]`).forEach(b => { b.innerHTML = rateBtnHTML(id); });
  }
  function setRating(id, v) {
    const prev = state.rateUser[id] || 0;
    const a = state.rateAgg[id] || { sum: 0, count: 0 };
    if (prev > 0) { a.sum -= prev; a.count = Math.max(0, a.count - 1); }
    a.sum += v; a.count += 1;
    state.rateAgg[id] = a; state.rateUser[id] = v;
    store.set("sfm_rate_agg", state.rateAgg);
    store.set("sfm_rate_user", state.rateUser);
    refreshRatings(id);
  }
  function openRateModal(id) {
    const st = findStation(id);
    if (!st) return;
    const cur = state.rateUser[id] || 0;
    const r = ratingStats(id);
    openModal("Rate: " + (st.ta || st.name), `
      <div class="rate-big-row" id="rateStars">
        ${[1, 2, 3, 4, 5].map(v => `<button class="rate-big ${v <= cur ? "on" : ""}" data-v="${v}" aria-label="${v} star">&starf;</button>`).join("")}
      </div>
      <p class="muted" id="rateAvg" style="text-align:center">${r.avg.toFixed(1)} / 5 · ${r.count} ratings</p>
      <p class="muted" style="text-align:center">Tap a star to rate this station.</p>`);
    const row = $("rateStars");
    if (row) row.onclick = e => {
      const b = e.target.closest("[data-v]");
      if (!b) return;
      const v = Number(b.getAttribute("data-v"));
      setRating(id, v);
      qsa("#rateStars .rate-big").forEach(x => x.classList.toggle("on", Number(x.getAttribute("data-v")) <= v));
      const rr = ratingStats(id);
      $("rateAvg").textContent = rr.avg.toFixed(1) + " / 5 · " + rr.count + " ratings";
      toast("Thanks! You rated " + v + " star" + (v > 1 ? "s" : ""));
    };
  }

  function normApi(s) {
    const url = s.url_resolved || s.url || "";
    return {
      id: s.stationuuid, name: s.name, ta: s.name,
      sub: [s.state, s.country].filter(Boolean).join(" · ") || "FM",
      url: url, hls: s.hls === 1 || /\.m3u8/i.test(url), logo: s.favicon || ""
    };
  }

  function isFav(id, type) { return type === "song" ? state.fav.songs.indexOf(id) > -1 : state.fav.st.indexOf(id) > -1; }

  function toggleFav(type, item) {
    const list = type === "song" ? state.fav.songs : state.fav.st;
    const i = list.indexOf(item.id);
    if (i > -1) { list.splice(i, 1); delete state.favData[item.id]; toast("Removed from favorites"); }
    else { list.push(item.id); if (type !== "song") state.favData[item.id] = item; toast("Added to favorites"); }
    store.set("sfm_fav", state.fav);
    store.set("sfm_favdata", state.favData);
    qsa(`[data-fav="${CSS.escape(item.id)}"]`).forEach(b => {
      const on = isFav(item.id, type);
      b.classList.toggle("on", on);
      b.setAttribute("aria-label", on ? "Remove from favorites" : "Add to favorites");
    });
    renderFav();
  }

  const starSvg = '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.8 1-6.1L3.2 9.4l6.1-.9z"/></svg>';
  const playSvg = '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z"/></svg>';

  function stationCardHTML(st, opts) {
    opts = opts || {};
    const badge = st.url ? '<span class="st-badge live">LIVE</span>' : (opts.badge || '<span class="st-badge" style="display:none"></span>');
    const on = isFav(st.id, "st");
    const fm = st.fm ? `<span class="st-fm">${esc(st.fm)} FM</span>` : (st.hq ? `<span class="st-fm hq">HQ ${esc(st.hq)}k</span>` : "");
    return `<div class="station-card" data-id="${esc(st.id)}" data-type="st" tabindex="0" role="button">
      <button class="fav-star ${on ? "on" : ""}" data-fav="${esc(st.id)}" data-type="st" aria-label="Favorite">${starSvg}</button>
      <div class="thumb">${thumbHTML(st)}${badge}</div>
      <div class="st-name">${esc(st.ta || st.name)}</div>
      <div class="st-sub">${esc(st.sub || "")}</div>
      <div class="st-meta">${fm}<button class="st-rate" data-rate="${esc(st.id)}" aria-label="Rate station">${rateBtnHTML(st.id)}</button></div>
    </div>`;
  }

  function attachStationGrid(container) {
    container.addEventListener("click", e => {
      const rate = e.target.closest("[data-rate]");
      if (rate) { e.stopPropagation(); openRateModal(rate.getAttribute("data-rate")); return; }
      const fav = e.target.closest("[data-fav]");
      if (fav) {
        e.stopPropagation();
        const id = fav.getAttribute("data-fav");
        const st = findStation(id);
        if (st) toggleFav("st", st);
        return;
      }
      const more = e.target.closest("[data-more]");
      if (more) {
        const act = moreActions[more.getAttribute("data-more")];
        if (act) act();
        return;
      }
      const card = e.target.closest(".station-card");
      if (!card) return;
      const st = findStation(card.getAttribute("data-id"));
      if (st) playStation(st, card);
    });
  }

  async function apiGet(path) {
    let lastErr;
    for (const m of MIRRORS) {
      try {
        const r = await fetch(m + path, { cache: "no-store" });
        if (!r.ok) throw new Error("http " + r.status);
        return await r.json();
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("api failed");
  }

  function cacheRes(name, val) { state.res[name.toLowerCase()] = val; store.set("sfm_res", state.res); }

  async function resolveStation(st) {
    if (st.url) return { url: st.url, hls: !!st.hls, logo: st.logo || "" };
    const key = String(st.name).toLowerCase();
    if (key in state.res) return state.res[key];
    let out = null;
    try {
      const arr = await apiGet("/stations/byname/" + encodeURIComponent(st.name) + "?limit=8&hidebroken=true");
      const list = (arr || []).filter(x => x.lastcheckok === 1);
      const pool = list.length ? list : (arr || []);
      const best = pool.sort((a, b) => ((b.bitrate || 0) - (a.bitrate || 0)) || ((b.votes || 0) - (a.votes || 0)))[0];
      if (best) {
        const url = best.url_resolved || best.url;
        out = { url: url, hls: best.hls === 1 || /\.m3u8/i.test(url), logo: best.favicon || "", home: best.homepage || "" };
      }
    } catch (e) {}
    cacheRes(st.name, out);
    return out;
  }

  const resolveQueue = [];
  let resolving = 0;
  function queueResolve(st) {
    if (st.url || (String(st.name).toLowerCase() in state.res)) return;
    resolveQueue.push(st);
    pump();
  }
  function pump() {
    while (resolving < 3 && resolveQueue.length) {
      const st = resolveQueue.shift();
      resolving++;
      resolveStation(st).then(r => {
        updateCard(st, r);
        resolving--;
        pump();
      }).catch(() => { resolving--; pump(); });
    }
  }

  function updateCard(st, r) {
    const card = document.querySelector(`.station-card[data-id="${CSS.escape(st.id)}"]`);
    if (!card) return;
    const thumb = card.querySelector(".thumb");
    const badge = card.querySelector(".st-badge");
    if (r && r.url) {
      if (r.logo && !thumb.querySelector("img")) {
        const img = document.createElement("img");
        img.className = "thumb-img"; img.loading = "lazy"; img.src = r.logo;
        img.onerror = () => img.remove();
        thumb.insertBefore(img, thumb.firstChild);
      }
      state.reg[st.id] = Object.assign({}, st, { url: r.url, hls: r.hls, logo: r.logo || st.logo });
      if (badge) { badge.textContent = "LIVE"; badge.className = "st-badge live"; badge.style.display = ""; }
    } else if (badge && badge.style.display !== "none" && !st.url) {
      badge.textContent = "Coming soon";
      badge.className = "st-badge soon";
      badge.style.display = "";
    }
  }

  async function playStation(st, card) {
    state.reg[st.id] = state.reg[st.id] || st;
    const doPlay = data => {
      Player.play({ id: st.id, title: st.ta || st.name, sub: st.sub || "Sumith FM Redio", url: data.url, hls: data.hls, logo: data.logo || st.logo || "" });
    };
    if (st.url) { doPlay({ url: st.url, hls: !!st.hls, logo: st.logo }); return; }
    toast("Finding stream...", 1600);
    const r = await resolveStation(st);
    if (r && r.url) { updateCard(st, r); doPlay(r); }
    else {
      if (card) updateCard(st, null);
      toast("This station's audio is coming soon");
    }
  }

  function playFromReg(id) {
    const st = findStation(id);
    if (st) playStation(st);
  }

  function recentPush(item) {
    if (!item || !item.id) return;
    state.recent = state.recent.filter(x => x.id !== item.id);
    state.recent.unshift({ id: item.id, ta: item.title, sub: item.sub, url: item.url, hls: item.hls, logo: item.logo });
    state.recent = state.recent.slice(0, 10);
    store.set("sfm_recent", state.recent);
    renderRecent();
  }

  function renderRecent() {
    const box = $("recentList");
    if (!state.recent.length) { box.innerHTML = '<span class="empty-note">Nothing played yet</span>'; return; }
    box.innerHTML = state.recent.map(r =>
      `<button class="chip recent-chip" data-recent="${esc(r.id)}" style="border-color:${r.url ? "var(--accent)" : "var(--line)"}">${esc(r.ta)}</button>`
    ).join("");
  }

  function renderNav() {
    $("bottomNav").addEventListener("click", e => {
      const b = e.target.closest(".nav-item");
      if (!b) return;
      switchTab(b.getAttribute("data-tab"));
    });
    $("recentList").addEventListener("click", e => {
      const b = e.target.closest("[data-recent]");
      if (!b) return;
      const id = b.getAttribute("data-recent");
      const r = state.recent.find(x => x.id === id);
      if (r && r.url) Player.play(r);
      else playFromReg(id);
    });
    $("clearRecentBtn").addEventListener("click", () => { state.recent = []; store.set("sfm_recent", []); renderRecent(); });
  }

  function switchTab(name) {
    qsa(".tab").forEach(s => s.classList.toggle("active", s.id === "tab-" + name));
    qsa(".nav-item").forEach(b => b.classList.toggle("active", b.getAttribute("data-tab") === name));
    window.scrollTo({ top: 0, behavior: "smooth" });
    if (name === "all") loadAll();
    if (name === "online") loadOnline();
    if (name === "devotional") loadDevo();
    if (name === "news") queueResolveList(D.NEWS_CHANNELS);
  }

  function queueResolveList(list) { list.forEach(queueResolve); }

  function renderTamil() {
    const chips = $("tamilGroupChips");
    chips.innerHTML = D.GROUPS.map(g => `<button class="chip ${g.k === state.group ? "active" : ""}" data-group="${g.k}">${esc(g.ta)}</button>`).join("");
    chips.onclick = e => {
      const c = e.target.closest("[data-group]");
      if (!c) return;
      state.group = c.getAttribute("data-group");
      renderTamil();
    };
    const list = state.group === "all" ? D.TAMIL_FM : D.TAMIL_FM.filter(s => s.g === state.group);
    const grid = $("tamilGrid");
    grid.innerHTML = list.map(s => { state.reg[s.id] = state.reg[s.id] || s; return stationCardHTML(s); }).join("");
    queueResolveList(list);
  }

  function renderNews() {
    $("newsHeadlines").innerHTML = D.HEADLINES.map(h => {
      const parts = h.split(" - ");
      return `<div class="news-card"><span class="news-tag">Tamil Nadu</span><h4>${esc(parts[0])}</h4>${parts[1] ? `<p>${esc(parts[1])}</p>` : ""}</div>`;
    }).join("");
    $("newsLiveGrid").innerHTML = D.NEWS_LIVE.map(s => { state.reg[s.id] = state.reg[s.id] || s; return stationCardHTML(s); }).join("");
    if ($("newsGrid")) $("newsGrid").innerHTML = D.NEWS_CHANNELS.map(s => { state.reg[s.id] = state.reg[s.id] || s; return stationCardHTML(s); }).join("");
    if ($("newsChannelsSec")) $("newsChannelsSec").style.display = D.NEWS_CHANNELS.length ? "" : "none";
    if ($("tamilTvGrid")) $("tamilTvGrid").innerHTML = D.TAMIL_TV.map(s => { state.reg[s.id] = state.reg[s.id] || s; return stationCardHTML(s); }).join("");
    if ($("tamilTvSec")) $("tamilTvSec").style.display = D.TAMIL_TV.length ? "" : "none";
    queueResolveList(D.NEWS_LIVE);
    queueResolveList(D.NEWS_CHANNELS);
    $("tickerTrack").innerHTML = "<span>" + D.HEADLINES.map(esc).join("  ✦  ") + "</span>" + "  ✦  " + "<span>" + D.HEADLINES.map(esc).join("  ✦  ") + "</span>";
  }

  function renderSchedule(dayIndex) {
    const day = D.SCHEDULE[dayIndex];
    $("scheduleList").innerHTML = day.items.map(it =>
      `<div class="sch-row"><div class="sch-time">${esc(it[0])}</div><div><div class="sch-name">${esc(it[1])}</div><div class="sch-desc">${esc(it[2])}</div></div></div>`
    ).join("");
  }

  function renderScheduleChips() {
    const today = new Date().getDay();
    const map = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
    const idx = map[today] != null ? map[today] : 0;
    const box = $("dayChips");
    box.innerHTML = D.SCHEDULE.map((d, i) => `<button class="chip ${i === idx ? "active" : ""}" data-day="${i}">${esc(d.d)}</button>`).join("");
    box.onclick = e => {
      const c = e.target.closest("[data-day]");
      if (!c) return;
      Array.from(box.children).forEach(x => x.classList.remove("active"));
      c.classList.add("active");
      renderSchedule(Number(c.getAttribute("data-day")));
    };
    renderSchedule(idx);
  }

  function renderHits() {
    $("hitsList").innerHTML = D.HITS.map((s, i) => {
      const on = isFav(s.id, "song");
      return `<div class="chart-row">
        <div class="chart-rank ${i < 3 ? "top" : ""}">${i + 1}</div>
        <div class="chart-info"><div class="chart-title">${esc(s.t)}</div><div class="chart-sub">${esc([s.m, s.c].filter(Boolean).join(" · ") || "Tamil song")}</div></div>
        <div class="chart-actions">
          <button class="mini-btn" data-lyric="${esc(s.id)}" aria-label="Details"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h13"/></svg></button>
          <button class="mini-btn ${on ? "on" : ""}" data-fav="${esc(s.id)}" data-type="song" aria-label="Favorite">${starSvg}</button>
          <button class="mini-btn" data-req="${esc(s.t)}" aria-label="Request"><svg viewBox="0 0 24 24"><path d="M3 11l18-7-7 18-2.5-7.5z"/></svg></button>
        </div>
      </div>`;
    }).join("");
    $("hitsList").onclick = e => {
      const l = e.target.closest("[data-lyric]");
      if (l) { showSong(l.getAttribute("data-lyric")); return; }
      const f = e.target.closest("[data-type='song']");
      if (f) { const s = D.HITS.find(x => x.id === f.getAttribute("data-fav")); if (s) { toggleFav("song", { id: s.id }); state.favData[s.id] = s; store.set("sfm_favdata", state.favData); } return; }
      const r = e.target.closest("[data-req]");
      if (r) { $("reqSong").value = r.getAttribute("data-req"); switchTab("home"); toast("Request form filled in"); }
    };
  }

  function showSong(id) {
    const s = D.HITS.find(x => x.id === id);
    if (!s) return;
    openModal(esc(s.t), `
      <p><b>Film:</b> ${esc(s.m || "—")}</p>
      <p><b>Music:</b> ${esc(s.c || "—")}</p>
      <p class="muted">Full lyrics will be added soon. For now, request this song on the FM schedule.</p>
      <button class="btn-primary" id="songReqBtn">Request this song</button>`);
    const b = $("songReqBtn");
    if (b) b.onclick = () => { closeModal(); $("reqSong").value = s.t; switchTab("home"); };
  }

  /* ---------- Music director playlists ---------- */
  function composerImgHTML(c) {
    const g = palette(c.name);
    const cached = state.compImg[c.wiki];
    const av = `<span class="avatar comp-av" style="background:linear-gradient(135deg,${g})">${esc(initials(c.name))}</span>`;
    return cached ? av + `<img class="comp-photo" loading="lazy" src="${esc(cached)}" onerror="this.remove()">` : av;
  }
  async function fetchComposerImage(c) {
    try {
      const r = await fetch("https://en.wikipedia.org/api/rest_v1/page/summary/" + encodeURIComponent(c.wiki));
      if (!r.ok) return null;
      const d = await r.json();
      return (d.thumbnail && d.thumbnail.source) || (d.originalimage && d.originalimage.source) || null;
    } catch (e) { return null; }
  }
  function applyComposerImage(c, url) {
    if (!url) return;
    state.compImg[c.wiki] = url;
    store.set("sfm_comp_img", state.compImg);
    qsa(`[data-comp-img="${CSS.escape(c.id)}"]`).forEach(box => {
      if (box.querySelector("img")) return;
      const img = document.createElement("img");
      img.className = "comp-photo"; img.loading = "lazy"; img.src = url;
      img.onerror = () => img.remove();
      box.insertBefore(img, box.firstChild);
    });
  }
  async function loadComposerImages() {
    const q = D.COMPOSERS.filter(c => !state.compImg[c.wiki]).slice();
    if (!q.length) return;
    async function worker() {
      while (q.length) { const c = q.shift(); const url = await fetchComposerImage(c); if (url) applyComposerImage(c, url); }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
  }
  function openComposer(c) {
    const st = c.station ? findStation(c.station) : null;
    const songs = c.songs.map((s, i) =>
      `<div class="chart-row"><div class="chart-rank">${i + 1}</div><div class="chart-info"><div class="chart-title">${esc(s.t)}</div><div class="chart-sub">${esc(s.f || "Tamil song")}</div></div><button class="mini-btn" data-creq="${esc(s.t)}" aria-label="Request this song">${playSvg}</button></div>`
    ).join("");
    openModal(c.name, `
      <div class="comp-hero">
        <div class="comp-hero-photo" data-comp-img="${esc(c.id)}">${composerImgHTML(c)}</div>
        <div><div class="comp-hero-name">${esc(c.name)}</div><div class="comp-hero-sub">${esc(c.sub || "")}</div></div>
      </div>
      ${st ? `<button class="btn-primary" id="compPlay" style="width:100%;margin:4px 0 2px">Play ${esc(st.ta || st.name)} Radio</button>` : ""}
      <p class="muted" style="margin-top:14px">Popular songs</p>
      <div class="chart-list">${songs}</div>
      <p class="muted">Tap play to fill the request form.</p>`);
    if (!state.compImg[c.wiki]) fetchComposerImage(c).then(u => applyComposerImage(c, u));
    const pb = $("compPlay");
    if (pb && st) pb.onclick = () => { closeModal(); playStation(st); };
    $("modalBody").onclick = e => {
      const b = e.target.closest("[data-creq]");
      if (!b) return;
      closeModal();
      $("reqSong").value = b.getAttribute("data-creq");
      switchTab("home");
      toast("Request form filled in");
    };
  }
  function renderComposers() {
    const grid = $("composerGrid");
    if (!grid) return;
    grid.innerHTML = D.COMPOSERS.map(c => {
      const st = c.station ? findStation(c.station) : null;
      return `<div class="composer-card" data-comp="${esc(c.id)}" tabindex="0" role="button">
        <div class="comp-photo-wrap" data-comp-img="${esc(c.id)}">${composerImgHTML(c)}${st ? '<span class="st-badge live">PLAY</span>' : ""}</div>
        <div class="comp-name">${esc(c.name)}</div>
        <div class="comp-sub">${esc(c.sub || "")}</div>
        <div class="comp-count">${c.songs.length} songs</div>
      </div>`;
    }).join("");
    grid.onclick = e => {
      const card = e.target.closest("[data-comp]");
      if (!card) return;
      const c = D.COMPOSERS.find(x => x.id === card.getAttribute("data-comp"));
      if (c) openComposer(c);
    };
    loadComposerImages();
  }

  function renderDevoStatic() {
    const list = D.TAMIL_FM.filter(s => s.g === "devotional");
    $("devoStatic").innerHTML = list.map(s => { state.reg[s.id] = state.reg[s.id] || s; return stationCardHTML(s); }).join("");
    queueResolveList(list);
  }

  let devoList = [];
  function renderDevoApi() {
    const grid = $("devoApi");
    const shown = devoList.slice(0, state.devoX);
    grid.innerHTML = (shown.map(stationCardHTML).join("") + (devoList.length > state.devoX ? moreWrap("devo") : "")) || '<p class="empty-note">No results</p>';
  }
  async function loadDevo() {
    if (state.loaded.devo) return;
    state.loaded.devo = true;
    $("devoApi").innerHTML = '<p class="empty-note">Loading...</p>';
    try {
      const a = await apiGet("/stations/bytag/bhajan?limit=500&hidebroken=true");
      const b = await apiGet("/stations/bytag/devotional?limit=500&hidebroken=true");
      const seen = {};
      devoList = (a || []).concat(b || []).map(normApi).filter(s => { if (seen[s.id]) return false; seen[s.id] = 1; state.reg[s.id] = s; return true; });
      state.devoX = 36;
      moreActions.devo = () => { state.devoX += 36; renderDevoApi(); };
      renderDevoApi();
    } catch (e) {
      state.loaded.devo = false;
      $("devoApi").innerHTML = '<p class="empty-note">Connection failed · <button class="link-btn" id="devoRetry">Retry</button></p>';
      const r = $("devoRetry"); if (r) r.onclick = loadDevo;
    }
  }

  const LANG_CHIPS = [["all", "All"], ["tamil", "Tamil"], ["hindi", "Hindi"], ["malayalam", "Malayalam"], ["telugu", "Telugu"], ["english", "English"]];
  let allCache = [];

  function renderAllChips() {
    $("allLangChips").innerHTML = LANG_CHIPS.map(l => `<button class="chip ${l[0] === state.lang ? "active" : ""}" data-lang="${l[0]}">${esc(l[1])}</button>`).join("");
    $("allLangChips").onclick = e => {
      const c = e.target.closest("[data-lang]");
      if (!c) return;
      state.lang = c.getAttribute("data-lang");
      renderAllChips();
      drawAll();
    };
  }

  function drawAll() {
    const src = state.lang === "all" ? allCache : allCache.filter(s => String(s.language || "").toLowerCase().includes(state.lang));
    const shown = src.slice(0, state.allX);
    $("allGrid").innerHTML = (shown.map(stationCardHTML).join("") + (src.length > state.allX ? moreWrap("all") : "")) || '<p class="empty-note">No results</p>';
  }

  async function loadAll() {
    if (state.loaded.all) return;
    state.loaded.all = true;
    renderAllChips();
    $("allGrid").innerHTML = '<p class="empty-note">Loading...</p>';
    try {
      const arr = await apiGet("/stations?order=votes&reverse=true&limit=500&hidebroken=true");
      allCache = (arr || []).filter(s => s.languagecodes).map(s => { const n = normApi(s); n.language = (s.language || "") + "," + (s.languagecodes || ""); return n; });
      allCache.forEach(s => state.reg[s.id] = s);
      state.allX = 48;
      moreActions.all = () => { state.allX += 48; drawAll(); };
      drawAll();
    } catch (e) {
      state.loaded.all = false;
      $("allGrid").innerHTML = '<p class="empty-note">Connection failed · <button class="link-btn" id="allRetry">Retry</button></p>';
      const r = $("allRetry"); if (r) r.onclick = loadAll;
    }
  }

  let onlineGroups = [];
  function moreWrap(key) { return `<div class="more-wrap"><button class="btn-small" data-more="${key}">Show more</button></div>`; }
  function renderOnlineGroups() {
    const shown = onlineGroups.slice(0, state.onlineG);
    $("onlineWrap").innerHTML = shown.map(g =>
      `<div class="state-group"><h3>${esc(g.key)} <small class="muted">(${g.cards.length})</small></h3><div class="grid stations-grid">${g.cards.map(stationCardHTML).join("")}</div></div>`
    ).join("") + (onlineGroups.length > state.onlineG ? moreWrap("online") : "");
  }

  async function loadOnline() {
    if (state.loaded.online) return;
    state.loaded.online = true;
    $("onlineWrap").innerHTML = '<p class="empty-note">Loading...</p>';
    try {
      const arr = await apiGet("/stations?countrycode=IN&order=votes&reverse=true&limit=500&hidebroken=true");
      const groups = {};
      (arr || []).forEach(s => {
        const n = normApi(s);
        state.reg[n.id] = n;
        const key = s.state && s.state.trim() ? s.state.trim() : "India";
        (groups[key] = groups[key] || []).push(n);
      });
      onlineGroups = Object.keys(groups).sort((a, b) => groups[b].length - groups[a].length).map(k => ({ key: k, cards: groups[k] }));
      state.onlineG = 2;
      moreActions.online = () => { state.onlineG += 2; renderOnlineGroups(); };
      renderOnlineGroups();
    } catch (e) {
      state.loaded.online = false;
      $("onlineWrap").innerHTML = '<p class="empty-note">Connection failed · <button class="link-btn" id="onlineRetry">Retry</button></p>';
      const r = $("onlineRetry"); if (r) r.onclick = loadOnline;
    }
  }

  function renderFav() {
    const stations = state.fav.st.map(id => state.reg[id] || state.favData[id]).filter(Boolean);
    $("favStations").innerHTML = stations.length ? stations.map(stationCardHTML).join("") : '<p class="empty-note">No favorite stations yet. Tap the ⭐ to add.</p>';
    const songs = state.fav.songs.map(id => D.HITS.find(s => s.id === id)).filter(Boolean);
    $("favSongs").innerHTML = songs.length ? songs.map((s, i) =>
      `<div class="chart-row"><div class="chart-rank">${i + 1}</div><div class="chart-info"><div class="chart-title">${esc(s.t)}</div><div class="chart-sub">${esc(s.m || "Tamil song")}</div></div><button class="mini-btn on" data-fav="${esc(s.id)}" data-type="song">${starSvg}</button></div>`
    ).join("") : '<p class="empty-note">No favorite songs</p>';
    $("favSongs").onclick = e => {
      const f = e.target.closest("[data-type='song']");
      if (f) { toggleFav("song", { id: f.getAttribute("data-fav") }); }
    };
  }

  function renderSearch(q) {
    const box = $("searchResults");
    q = q.trim().toLowerCase();
    if (!q) { box.innerHTML = '<p class="empty-note">Start typing to search...</p>'; return; }
    const hit = (s) => (s.ta || "").toLowerCase().includes(q) || (s.name || "").toLowerCase().includes(q) || (s.sub || "").toLowerCase().includes(q);
    const st = D.TAMIL_FM.filter(hit);
    const nw = D.NEWS_LIVE.concat(D.NEWS_CHANNELS, D.TAMIL_TV).filter(hit);
    const songs = D.HITS.filter(s => s.t.toLowerCase().includes(q) || (s.ty || "").includes(q) || (s.m || "").toLowerCase().includes(q) || (s.c || "").toLowerCase().includes(q));
    let html = "";
    if (st.length) html += `<h3>Stations (${st.length})</h3><div class="grid stations-grid">${st.map(s => { state.reg[s.id] = state.reg[s.id] || s; return stationCardHTML(s); }).join("")}</div>`;
    if (nw.length) html += `<h3>News & TV Channels (${nw.length})</h3><div class="grid stations-grid">${nw.map(s => { state.reg[s.id] = state.reg[s.id] || s; return stationCardHTML(s); }).join("")}</div>`;
    if (songs.length) html += `<h3>Songs (${songs.length})</h3>${songs.map(s => `<div class="chart-row"><div class="chart-rank">♪</div><div class="chart-info"><div class="chart-title">${esc(s.t)}</div><div class="chart-sub">${esc(s.m || "")}</div></div><button class="mini-btn" data-req="${esc(s.t)}">${playSvg}</button></div>`).join("")}`;
    box.innerHTML = html || '<p class="empty-note">No results</p>';
    queueResolveList(st.concat(nw));
  }

  function initSearch() {
    const inp = $("searchInput");
    let t;
    inp.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => renderSearch(inp.value), 160); });
  }

  function initWeather() {
    const sel = $("wCity");
    sel.innerHTML = D.CITIES.map((c, i) => `<option value="${i}">${esc(c.n)}</option>`).join("");
    sel.value = state.city != null ? state.city : 0;
    sel.addEventListener("change", () => { state.city = Number(sel.value); store.set("sfm_city", state.city); loadWeather(); });
    loadWeather();
  }

  async function loadWeather() {
    const idx = state.city != null ? state.city : 0;
    const c = D.CITIES[idx] || D.CITIES[0];
    $("wCityName").textContent = c.n;
    $("wDesc").textContent = "Loading...";
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=Asia%2FKolkata&forecast_days=5`;
      const r = await fetch(url);
      const d = await r.json();
      const cur = d.current;
      $("wTemp").textContent = Math.round(cur.temperature_2m);
      $("wDesc").textContent = D.WMO[cur.weather_code] || "Weather";
      $("wMax").textContent = Math.round(d.daily.temperature_2m_max[0]);
      $("wMin").textContent = Math.round(d.daily.temperature_2m_min[0]);
      $("wHum").textContent = cur.relative_humidity_2m;
      $("wWind").textContent = Math.round(cur.wind_speed_10m);
      $("wDays").innerHTML = d.daily.time.slice(1, 5).map((iso, i) => {
        const day = new Date(iso).getDay();
        return `<div class="w-day">${esc(D.TDAY[day])}<b>${Math.round(d.daily.temperature_2m_max[i + 1])}° / ${Math.round(d.daily.temperature_2m_min[i + 1])}°</b><span class="wd-t">${esc(D.WMO[d.daily.weather_code[i + 1]] || "")}</span></div>`;
      }).join("");
    } catch (e) {
      $("wDesc").textContent = "Weather data unavailable";
    }
  }

  function initRequest() {
    $("requestForm").addEventListener("submit", e => {
      e.preventDefault();
      const name = $("reqName").value.trim();
      const song = $("reqSong").value.trim();
      const phone = $("reqPhone").value.trim();
      let ok = true;
      $("reqName").classList.toggle("err", !name); if (!name) ok = false;
      $("reqSong").classList.toggle("err", !song); if (!song) ok = false;
      const phoneBad = phone && !/^[0-9]{10}$/.test(phone);
      $("reqPhone").classList.toggle("err", phoneBad); if (phoneBad) ok = false;
      if (!ok) { toast("Please fill in the form correctly"); return; }
      const reqs = store.get("sfm_reqs", []);
      reqs.unshift({ name, song, phone, msg: $("reqMsg").value.trim(), at: Date.now() });
      store.set("sfm_reqs", reqs.slice(0, 50));
      e.target.reset();
      toast("Thank you " + name + "! Your request was received");
    });
  }

  function initTheme() {
    const saved = store.get("sfm_theme", null);
    if (saved) document.documentElement.setAttribute("data-theme", saved);
    $("themeBtn").addEventListener("click", () => {
      const cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", cur);
      store.set("sfm_theme", cur);
      document.querySelector('meta[name="theme-color"]').setAttribute("content", cur === "light" ? "#faf5ff" : "#120a1f");
    });
  }

  function share(opts) {
    const data = { title: "Sumith FM Redio", text: opts.text || "Sumith FM Redio – your Tamil music friend", url: opts.url || location.href };
    if (navigator.share) navigator.share(data).catch(() => {});
    else window.open("https://wa.me/?text=" + encodeURIComponent(data.text + " " + data.url), "_blank");
  }
  function initShare() { $("shareSiteBtn").addEventListener("click", () => share({})); }

  function initAlarms() {
    $("alarmAddBtn").addEventListener("click", showAlarmModal);
    renderAlarms();
    setInterval(checkAlarms, 20000);
  }
  function renderAlarms() {
    $("alarmList").innerHTML = state.alarms.length ? state.alarms.map(a =>
      `<div class="alarm-item"><div><div class="alarm-time">${esc(a.time)}</div><div class="alarm-st">${esc(a.stName)}</div></div><button class="alarm-del" data-del="${a.id}">Delete</button></div>`
    ).join("") : '<p class="empty-note">No alarms</p>';
    $("alarmList").onclick = e => {
      const d = e.target.closest("[data-del]");
      if (!d) return;
      state.alarms = state.alarms.filter(a => String(a.id) !== d.getAttribute("data-del"));
      store.set("sfm_alarms", state.alarms);
      renderAlarms();
    };
  }
  function showAlarmModal() {
    const opts = D.TAMIL_FM.map(s => `<option value="${esc(s.id)}">${esc(s.ta)}</option>`).join("");
    openModal("New Alarm", `
      <label>Time<input type="time" id="alTime" value="07:00"></label>
      <label class="muted">Station</label>
      <select id="alStation" style="width:100%;padding:10px;border-radius:12px;background:var(--card-2);border:1px solid var(--line);margin-top:4px">${opts}</select>
      <button class="btn-primary" id="alSave" style="margin-top:14px">Save</button>`);
    $("alSave").onclick = () => {
      const time = $("alTime").value;
      const sid = $("alStation").value;
      const st = D.TAMIL_FM.find(s => s.id === sid);
      state.alarms.push({ id: Date.now(), time: time, stId: sid, stName: st ? st.ta : sid });
      store.set("sfm_alarms", state.alarms);
      renderAlarms();
      closeModal();
      if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
      toast("Alarm set for " + time);
    };
  }
  let lastAlarmMin = "";
  function checkAlarms() {
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
    if (hhmm === lastAlarmMin) return;
    state.alarms.forEach(a => {
      if (a.time === hhmm) { lastAlarmMin = hhmm; triggerAlarm(a); }
    });
  }
  function triggerAlarm(a) {
    toast("Alarm! " + a.stName, 6000);
    if ("Notification" in window && Notification.permission === "granted") new Notification("Sumith FM Redio", { body: "Alarm: " + a.stName });
    playFromReg(a.stId);
  }

  function initPlayerUI() {
    const vol = $("volume");
    vol.value = Math.round(Player.volume() * 100);
    Player.setVolume(vol.value / 100);
    vol.addEventListener("input", () => Player.setVolume(vol.value / 100));

    $("heroPlay").addEventListener("click", () => {
      if (!Player.now()) { toast("Choose a station first"); switchTab("tamil"); return; }
      Player.toggle();
    });
    $("mpPlay").addEventListener("click", () => Player.toggle());
    $("mpStop").addEventListener("click", () => Player.stop());
    $("mpEqBtn").addEventListener("click", () => { state.muted = !state.muted; Player.setVolume(state.muted ? 0 : vol.value / 100); toast(state.muted ? "Sound muted" : "Sound on"); });

    Player.on("change", item => {
      if (!item) {
        $("miniPlayer").classList.add("hidden");
        $("heroTitle").textContent = "Choose a station";
        $("heroSub").textContent = "Music · News · Bhakti";
        return;
      }
      $("miniPlayer").classList.remove("hidden");
      $("heroTitle").textContent = item.title;
      $("heroSub").textContent = item.sub || "";
      $("mpTitle").textContent = item.title;
      $("mpThumb").innerHTML = thumbHTML({ name: item.title, ta: item.title, logo: item.logo });
      $("heroThumb").innerHTML = thumbHTML({ name: item.title, ta: item.title, logo: item.logo });
      $("mpMarquee").innerHTML = "<span>" + esc((item.sub || "") + " · Sumith FM Redio") + "</span>";
      recentPush(item);
    });
    Player.on("state", s => {
      const playing = s.playing;
      $("heroPlay").classList.toggle("playing", playing);
      $("mpPlay").classList.toggle("playing", playing);
      $("miniPlayer").classList.toggle("playing", playing);
      $("heroStatus").textContent = playing ? (s.buffering ? "Connecting..." : "Live") : "Stopped";
    });
    Player.on("error", item => toast("Could not play this station · please choose another"));
  }

  function initSW() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
    }
  }

  function init() {
    renderNav();
    initTheme();
    initShare();
    initSearch();
    initWeather();
    initRequest();
    initAlarms();
    initPlayerUI();
    renderRecent();
    renderScheduleChips();
    renderNews();
    renderTamil();
    renderHits();
    renderComposers();
    renderDevoStatic();
    renderFav();
    attachStationGrid($("tamilGrid"));
    attachStationGrid($("newsGrid"));
    attachStationGrid($("newsLiveGrid"));
    attachStationGrid($("allGrid"));
    attachStationGrid($("devoStatic"));
    attachStationGrid($("devoApi"));
    attachStationGrid($("favStations"));
    attachStationGrid($("searchResults"));
    if ($("tamilTvGrid")) attachStationGrid($("tamilTvGrid"));
    $("modalClose").addEventListener("click", closeModal);
    $("modalBackdrop").addEventListener("click", e => { if (e.target === $("modalBackdrop")) closeModal(); });
    if (state.city == null) state.city = 0;
    initSW();
  }

  document.addEventListener("DOMContentLoaded", init);
})();