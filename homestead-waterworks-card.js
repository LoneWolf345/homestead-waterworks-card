/* homestead-waterworks-card — a water-use news article for a newsprint Home Assistant
 * dashboard: a woodcut plate carrying the day's figures, a data-driven headline and lede,
 * a hatched 14-day bar chart from recorder statistics, a five-cell ledger, irrigation rows
 * and the leak pucks filing as "From our correspondents". Read-only: tap → more-info.
 * Companion to almanac-weather-card / network-ledger-card / homestead-classifieds-card. */
const HWC_VERSION = "2026.9.3";
const INK = "#3a2d1f", PAPER = "#f3e7d3", TAN = "#a3876a", BROWN = "#7a6248",
  TERRA = "#c65f38", BLUE = "#5f7e94", DOT = "#cfb894", GREEN = "#2f7f6f";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const bad = (s) => s == null || s === "" || s === "unknown" || s === "unavailable";
const num = (s) => { const v = parseFloat(s); return isNaN(v) ? null : v; };
const fmt = (v, d = 0) => (v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const hourWord = (d) => { let h = d.getHours(); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return d.getMinutes() >= 30 ? `~${(h % 12) + 1} ${h === 11 ? (ap === "AM" ? "PM" : "AM") : ap}` : `~${h} ${ap}`; };
const durWord = (secs) => { const m = Math.round(secs / 60); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h ${pad2(r)} m` : `${m} min`; };
const hm = (d) => { let h = d.getHours(); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return `${h}:${pad2(d.getMinutes())} ${ap}`; };

class HomesteadWaterworksCard extends HTMLElement {
  static getStubConfig() { return { meter_entity: "sensor.water_meter_reading", today_entity: "sensor.water_meter_water_today" }; }

  setConfig(config) {
    if (!config || !config.meter_entity) throw new Error("homestead-waterworks-card: set meter_entity (the total_increasing meter reading)");
    const c = Object.assign({
      title: "THE WATERWORKS", meter_number: "", today_entity: "", month_entity: "", flow_entity: "", stale_entity: "",
      days: 14, plate: "", plate_number: "I", plate_caption: "The tank on its trestle, with the porthole showing water.",
      plate_credit: "Engraving after a photograph", tag_position: "br",
      rain_gauge_entity: "", correspondents: [], overnight_entity: "", leak_entity: "",
      column_rule: false, footer: "All readings taken at the main by radio, every few minutes. The house disputes none of them.",
    }, config);
    c.irrigation = Object.assign({ name: "Irrigation", duration_entity: "", bucket_entity: "", rain_entity: "", skip_threshold: 0.1,
      valve_entity: "", timer_entity: "", automation_entity: "", interval_days: 5 }, config.irrigation || {});
    this._cfg = c;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._sig = null; this._stats = null; this._statsAt = 0; this._statsDay = ""; this._flood = null;
    if (this._fontsReady === undefined) {
      const fonts = typeof document !== "undefined" && document.fonts;
      this._fontsReady = !fonts;
      if (fonts) Promise.race([fonts.ready, new Promise((r) => setTimeout(r, 3000))]).then(() => { this._fontsReady = true; this._sig = null; this._render(); });
    }
    this._render();
  }
  set hass(hass) {
    this._hass = hass;
    // a correspondent drying off should surface in print promptly — force a history refetch
    const wk = ((this._cfg && this._cfg.correspondents) || []).map((p) => { const s = this._st(p.entity); return s && s.state === "on" ? "1" : "0"; }).join("");
    if (this._wetKey !== undefined && wk !== this._wetKey) this._statsAt = 0;
    this._wetKey = wk;
    this._maybeFetchStats(); this._render();
  }
  getCardSize() { return 9; }
  connectedCallback() { this._tick = setInterval(() => this._render(), 60000); }
  disconnectedCallback() { clearInterval(this._tick); }

  // ---------- data ----------
  _st(id) { const s = id && this._hass && this._hass.states[id]; return s && !bad(s.state) ? s : null; }
  _val(id) { const s = this._st(id); return s ? num(s.state) : null; }
  async _maybeFetchStats() {
    const day = ymd(new Date());
    if (this._fetching || (Date.now() - this._statsAt < 30 * 60000 && this._statsDay === day)) return;
    this._fetching = true;
    try {
      const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - this._cfg.days);
      const r = await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(), statistic_ids: [this._cfg.meter_entity], period: "day", types: ["change"] });
      const rows = (r && r[this._cfg.meter_entity]) || [];
      this._stats = rows.map((x) => ({ day: ymd(new Date(x.start)), gal: x.change == null ? null : Math.max(0, x.change) })).filter((x) => x.gal != null);
      const ents = [...(this._cfg.correspondents || []).map((p) => p.entity), this._cfg.leak_entity].filter(Boolean);
      if (ents.length) {
        try {
          const s2 = new Date(Date.now() - 365 * 86400000);
          const r2 = await this._hass.callWS({ type: "history/history_during_period", start_time: s2.toISOString(), entity_ids: ents, minimal_response: true, no_attributes: true });
          const map = {};
          for (const id of ents) {
            const hrows = (r2 && r2[id]) || []; const inc = []; let cur = null;
            for (const x of hrows) { if (x.s === "on") { if (!cur) cur = { on: new Date(x.lu * 1000), off: null }; } else if (cur) { cur.off = new Date(x.lu * 1000); inc.push(cur); cur = null; } }
            if (cur) inc.push(cur);
            map[id] = { incidents: inc, since: hrows.length ? new Date(hrows[0].lu * 1000) : null };
          }
          this._flood = map;
        } catch (e) { /* keep the last incident rows */ }
      } else this._flood = {};
      this._statsAt = Date.now(); this._statsDay = day; this._sig = null; this._render();
    } catch (e) { /* keep the last rows */ }
    finally { this._fetching = false; }
  }
  _series() {
    const today = ymd(new Date());
    const past = (this._stats || []).filter((x) => x.day !== today).slice(-this._cfg.days);
    const avg = past.length ? past.reduce((a, x) => a + x.gal, 0) / past.length : null;
    const todayGal = this._val(this._cfg.today_entity);
    const yesterday = past.length ? past[past.length - 1].gal : null;
    return { past, avg, todayGal, yesterday };
  }
  _band(r) {
    if (r == null) return null;
    if (r < 0.35) return { mood: "quiet", head: "a third of the usual", lede: "a third of its fourteen-day habit" };
    if (r < 0.6) return { mood: "quiet", head: "half the usual", lede: "half its fourteen-day habit" };
    if (r < 0.85) return { mood: "light", head: "below the usual", lede: "a little under its fourteen-day habit" };
    if (r < 1.2) return { mood: "ordinary", head: "", lede: "about its fourteen-day habit" };
    if (r < 1.7) return { mood: "thirsty", head: "above the usual", lede: "over its fourteen-day habit" };
    if (r < 2.5) return { mood: "heavy", head: "near twice the usual", lede: "near twice its fourteen-day habit" };
    return { mood: "heavy", head: "more than twice the usual", lede: "more than twice its fourteen-day habit" };
  }
  _headline(s) {
    const n = s.todayGal == null ? "—" : fmt(Math.round(s.todayGal));
    const b = s.avg ? this._band(s.todayGal / s.avg) : null;
    if (!b || s.todayGal == null) return `${n} gallons drawn at the main so far today`;
    const art = b.mood === "ordinary" ? "An" : "A";
    return b.head ? `${art} ${b.mood} day at the main: ${n} gallons drawn, ${b.head}` : `${art} ${b.mood} day at the main: ${n} gallons drawn`;
  }
  _watering() {
    const ir = this._cfg.irrigation, dur = this._val(ir.duration_entity);
    const durTxt = dur != null ? durWord(dur) : "";
    const timer = this._st(ir.timer_entity);
    if (timer && timer.state === "active") {
      const fin = timer.attributes.finishes_at ? new Date(timer.attributes.finishes_at) : null;
      const left = fin ? Math.max(0, Math.round((fin - Date.now()) / 60000)) : null;
      return { row: left != null ? `Watering now · ${left} min left` : "Watering now", lede: "is watering as we go to press", now: true, entity: ir.timer_entity };
    }
    const auto = this._st(ir.automation_entity);
    const last = auto && auto.attributes.last_triggered ? new Date(auto.attributes.last_triggered) : null;
    if (!last) return { row: durTxt ? `At the next start · ${durTxt}` : "At the next start", lede: "waters at the next start", entity: ir.automation_entity };
    const next = new Date(last.getTime() + ir.interval_days * 86400000), now = new Date();
    if (next < now) return { row: durTxt ? `At the next start · ${durTxt}` : "At the next start", lede: "is due at the next start", entity: ir.automation_entity };
    const today = ymd(now), tmrw = ymd(new Date(now.getTime() + 86400000)), nd = ymd(next);
    const when = nd === today ? "Today" : nd === tmrw ? (next.getHours() < 6 ? "Tonight" : "Tomorrow") : DAY3[next.getDay()];
    const whenLede = nd === today ? "today" : nd === tmrw ? (next.getHours() < 6 ? "tonight" : "tomorrow") : `on ${DAYS[next.getDay()]}`;
    return { row: `${when}, ${hourWord(next)}${durTxt ? " · " + durTxt : ""}`, lede: `waters ${whenLede}${durTxt ? " for " + durTxt.replace(" 00 m", "") : ""}`, entity: ir.automation_entity };
  }
  _correspondents() {
    const now = Date.now();
    return (this._cfg.correspondents || []).map((p) => {
      const s = this._st(p.entity);
      const fl = this._flood && this._flood[p.entity];
      const inc = fl && fl.incidents.length ? fl.incidents[fl.incidents.length - 1] : null;
      const recent = inc && inc.off && now - inc.off.getTime() < 24 * 3600000 ? inc : null;
      return { name: p.name || p.entity, entity: p.entity, wet: !!s && s.state === "on", known: !!s, recent };
    });
  }

  // ---------- render ----------
  _render() {
    if (!this._cfg || !this._hass) return;
    const loaded = !!this._fontsReady && this._stats !== null;
    const reserve = loaded ? 0 : this._reserve();
    this.style.minHeight = reserve ? reserve + "px" : "";
    let out;
    try { out = this._article(); }
    catch (e) { out = { sig: "err:" + e.message, html: `<div style="padding:12px;color:#b00;font-family:sans-serif">${esc(e.message)}</div>` }; }
    if (out.sig === this._sig) return;
    this._sig = out.sig;
    this._pin();
    this.shadowRoot.innerHTML = out.html;
    this.shadowRoot.querySelectorAll("[data-entity]").forEach((el) => el.addEventListener("click", (ev) => { ev.stopPropagation(); this._more(el.dataset.entity); }));
    this._unpin(reserve);
    if (loaded) setTimeout(() => this._remember(), 60);
  }
  _more(id) { if (id) this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: id } })); }

  _article() {
    const c = this._cfg, ir = c.irrigation, now = new Date();
    const s = this._series();
    const ratio = s.avg && s.todayGal != null ? s.todayGal / s.avg : null;
    const pct = ratio == null ? null : Math.round(ratio * 100);
    const flow = this._val(c.flow_entity), month = this._val(c.month_entity);
    const corr = this._correspondents(), wet = corr.filter((p) => p.wet);
    const leak = this._st(c.leak_entity), leakOn = !!leak && leak.state === "on";
    const overnight = this._val(c.overnight_entity);
    const water = this._watering();
    const bucket = this._val(ir.bucket_entity), rain = this._val(ir.rain_entity), gauge = this._val(c.rain_gauge_entity);
    const skip = rain != null && rain >= ir.skip_threshold;
    const band = this._band(ratio);

    // headline / dek / lede
    const head = this._headline(s);
    const dek = `Flow at press time ${flow == null ? "—" : fmt(flow, 1)} gal/min · ${c.days}-day average ${s.avg == null ? "—" : fmt(Math.round(s.avg))} gal/day · month to date ${month == null ? "—" : fmt(Math.round(month))} gal`;
    const lc = (n) => "the " + String(n).replace(/^([A-Z])(?=[a-z])/, (m) => m.toLowerCase()); // keeps acronyms like "RO filter"
    const names = corr.map((p) => lc(p.name));
    const nameList = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0] || "";
    const bucketTxt = bucket == null ? "" : bucket < 0 ? `, owed ${fmt(Math.abs(bucket), 2)} in,` : `, ${fmt(bucket, 2)} in to the good,`;
    let lede = `The main reported ${band ? (band.mood === "ordinary" ? "an ordinary" : "a " + band.mood) : "a"} ${DAYS[now.getDay()]}: ${s.todayGal == null ? "no reading" : fmt(Math.round(s.todayGal)) + " gallons"} by press time${band ? ", " + band.lede : ""}. `;
    if (ir.duration_entity || ir.automation_entity) lede += `The ${ir.name.toLowerCase()}${bucketTxt} ${skip ? "stands down for rain" : water.lede}; `;
    else lede += "";
    const retract = (i) => { const m = Math.max(1, Math.round((i.off - i.on) / 60000)); return m < 2 ? "a minute later" : m < 60 ? `${m} minutes later` : `${Math.floor(m / 60)} hour${Math.floor(m / 60) > 1 ? "s" : ""} later`; };
    const recentP = corr.filter((p) => p.recent && !p.wet).sort((a, b) => b.recent.off - a.recent.off)[0];
    lede += wet.length ? `our correspondent at ${lc(wet[0].name)} reports water${wet.length > 1 ? ", and so does " + lc(wet[1].name) : ""}.`
      : recentP ? `our correspondent at ${lc(recentP.name)} filed a wet dispatch at ${hm(recentP.recent.on)} and retracted it ${retract(recentP.recent)}${corr.length > 1 ? "; the others report dry" : ""}.`
      : corr.length ? `our correspondents at ${nameList} all file the same dispatch: dry, nothing to report.` : "";

    // plate
    const pos = ["br", "bl", "tr", "tl"].includes(c.tag_position) ? c.tag_position : "br";
    const tag = `<div class="tag ${pos}"><div class="tv">${s.todayGal == null ? "—" : fmt(Math.round(s.todayGal))} GAL</div><div class="tl">${pct == null ? "TODAY" : pct + "% OF AVERAGE"}</div></div>`;
    const plate = c.plate
      ? `<div class="fig" data-entity="${esc(c.today_entity || c.meter_entity)}"><img src="${esc(c.plate)}" alt="">${tag}</div>`
      : `<div class="fig" data-entity="${esc(c.today_entity || c.meter_entity)}">${this._vectorTank(pct)}</div>`;
    const plateCap = `<div class="plate"><span><b>PLATE ${esc(c.plate_number)}.</b> <i>${esc(c.plate_caption)}</i></span><span class="r"><i>${esc(c.plate_credit)}</i></span></div>`;

    // chart
    const bars = s.past.map((x) => ({ label: String(parseInt(x.day.slice(8), 10)), gal: x.gal, today: false }));
    if (s.todayGal != null) bars.push({ label: "TODAY", gal: s.todayGal, today: true });
    let chart = "";
    if (bars.length > 1) {
      const W = 456, H = 112, base = 92.5, top = 2, n = bars.length, slot = (W - 8) / n, bw = Math.min(22, slot - 8);
      const max = Math.max(...bars.map((b) => b.gal), s.avg || 0, 1);
      const y = (g) => base - (g / max) * (base - top);
      const rects = bars.map((b, i) => { const x = 4 + i * slot + (slot - bw) / 2; const yy = y(b.gal); return `<rect x="${x.toFixed(1)}" y="${yy.toFixed(1)}" width="${bw.toFixed(1)}" height="${(base - yy).toFixed(1)}" fill="url(#${b.today ? "ht" : "hb"})" stroke="${b.today ? TERRA : INK}" stroke-width="1"/>`; }).join("");
      const labels = bars.map((b, i) => `<text x="${(4 + i * slot + slot / 2).toFixed(1)}" y="104" text-anchor="middle" font-family="Archivo, sans-serif" font-size="7.5" font-weight="700" fill="${b.today ? TERRA : BROWN}">${b.label}</text>`).join("");
      const avgLine = s.avg ? `<line x1="4" y1="${y(s.avg).toFixed(1)}" x2="${W - 4}" y2="${y(s.avg).toFixed(1)}" stroke="${BROWN}" stroke-width="1" stroke-dasharray="3 3"/><text x="${W - 4}" y="${(y(s.avg) - 3).toFixed(1)}" text-anchor="end" font-family="Archivo, sans-serif" font-size="7.5" font-weight="700" fill="${BROWN}" letter-spacing="1">AVG</text>` : "";
      chart = `<div class="sub"><span class="subn">${s.past.length} days at the main</span><span class="subr">GALLONS PER DAY${s.avg ? " · AVG " + fmt(Math.round(s.avg)) : ""}</span></div>
      <svg class="chart" viewBox="0 0 ${W} ${H}" data-entity="${esc(c.meter_entity)}">
        <defs><pattern id="hb" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="${INK}" stroke-width="1.5"/></pattern>
        <pattern id="ht" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="4" stroke="${TERRA}" stroke-width="2.2"/></pattern></defs>
        ${rects}${avgLine}<line x1="4" y1="${base}" x2="${W - 4}" y2="${base}" stroke="${INK}" stroke-width="1"/>${labels}</svg>`;
    }

    // strip
    const strip = `<div class="strip">
      <div class="cell" data-entity="${esc(c.today_entity)}"><div class="cv">${s.todayGal == null ? "—" : fmt(Math.round(s.todayGal))}</div><div class="cl">TODAY · GAL</div></div>
      <div class="cell" data-entity="${esc(c.meter_entity)}"><div class="cv">${s.yesterday == null ? "—" : fmt(Math.round(s.yesterday))}</div><div class="cl">YESTERDAY</div></div>
      <div class="cell" data-entity="${esc(c.meter_entity)}"><div class="cv">${s.avg == null ? "—" : fmt(Math.round(s.avg))}</div><div class="cl">${c.days}-DAY AVG</div></div>
      <div class="cell" data-entity="${esc(c.month_entity)}"><div class="cv">${month == null ? "—" : fmt(Math.round(month))}</div><div class="cl">MONTH</div></div>
      <div class="cell" data-entity="${esc(c.flow_entity)}"><div class="cv">${flow == null ? "—" : fmt(flow, 1)}</div><div class="cl">GAL/MIN NOW</div></div></div>`;

    // irrigation
    let irr = "";
    if (ir.duration_entity || ir.automation_entity) {
      irr = `<div class="sub"><span class="subn">Irrigation</span><span class="subr">${esc(ir.name).toUpperCase()}</span></div>
      <div class="row" data-entity="${esc(water.entity || "")}"><span class="k">Next watering</span><span class="v${water.now ? " due" : ""}">${esc(skip ? "Stands down · rain" : water.row)}</span></div>
      ${ir.bucket_entity ? `<div class="row" data-entity="${esc(ir.bucket_entity)}"><span class="k">Soil bucket</span><span class="v${bucket != null && bucket < 0 ? " due" : ""}">${bucket == null ? "—" : (bucket < 0 ? "−" : "+") + fmt(Math.abs(bucket), 2) + " in · " + (bucket < 0 ? "deficit" : "credit")}</span></div>` : ""}
      ${ir.rain_entity ? `<div class="row" data-entity="${esc(ir.rain_entity)}"><span class="k">Rain forecast, 24 h</span><span class="v">${rain == null ? "—" : fmt(rain, 2) + " in · " + (skip ? "skip" : "no skip")}</span></div>` : ""}
      ${c.rain_gauge_entity ? `<div class="row" data-entity="${esc(c.rain_gauge_entity)}"><span class="k">Rain gauge, season</span><span class="v">${gauge == null ? "—" : fmt(gauge, 2) + " in"}</span></div>` : ""}`;
    }

    // correspondents
    let corrHtml = "";
    if (corr.length) {
      let streak = "";
      if (!wet.length && this._flood) {
        let lastEnd = null, since = null;
        for (const id of Object.keys(this._flood)) { const f = this._flood[id]; if (f.since && (!since || f.since < since)) since = f.since; for (const i of f.incidents) { const e = i.off || new Date(); if (!lastEnd || e > lastEnd) lastEnd = e; } }
        if (lastEnd) { const d = Math.floor((Date.now() - lastEnd.getTime()) / 86400000); streak = ` · DRY ${d} ${d === 1 ? "DAY" : "DAYS"}`; }
        else if (since) { const d = Math.floor((Date.now() - since.getTime()) / 86400000); streak = ` · DRY ${d}+ DAYS`; }
      }
      const right = (overnight == null ? "" : `OVERNIGHT · ${fmt(overnight, 1)} GAL MOVED`) + streak;
      const puckTxt = (p) => p.wet ? "WATER — reports our correspondent"
        : p.recent ? `Water ${ymd(p.recent.on) === ymd(new Date()) ? "at" : "yesterday"} ${hm(p.recent.on)} · dry by ${hm(p.recent.off)}`
        : p.known ? "Dry, nothing to report" : "No dispatch received";
      corrHtml = `<div class="sub"><span class="subn">From our correspondents</span><span class="subr${overnight > 0 ? " hot" : ""}">${esc(right)}</span></div>
      <div class="sent">${corr.map((p) => `<div class="puck${p.wet ? " wet" : p.recent ? " was" : ""}" data-entity="${esc(p.entity)}"><div class="pn">${esc(p.name).toUpperCase()}</div><div class="ps">${puckTxt(p)}</div></div>`).join("")}</div>`;
    }

    // corrections & amplifications — the most recent resolved incident, through the following noon
    let corrBox = "";
    if (this._flood && !wet.length) {
      let best = null, bestName = "", bestEnt = "";
      for (const p of this._cfg.correspondents || []) { const f = this._flood[p.entity]; if (!f) continue; for (const i of f.incidents) { if (i.off && (!best || i.off > best.off)) { best = i; bestName = p.name || p.entity; bestEnt = p.entity; } } }
      if (best) {
        const today0 = new Date(now); today0.setHours(0, 0, 0, 0);
        const show = best.off >= today0 || (best.off >= new Date(today0.getTime() - 86400000) && now.getHours() < 12);
        if (show) {
          const mins = Math.max(1, Math.round((best.off - best.on) / 60000));
          const dur = mins < 2 ? "one minute" : mins < 60 ? `${mins} minutes` : `${Math.floor(mins / 60)} hour${Math.floor(mins / 60) > 1 ? "s" : ""}${mins % 60 ? " " + (mins % 60) + " minutes" : ""}`;
          const when = ymd(best.on) === ymd(now) ? "" : " yesterday";
          const dayCount = (this._cfg.correspondents || []).reduce((a, p) => a + ((this._flood[p.entity] || { incidents: [] }).incidents.filter((i) => i.off && ymd(i.off) === ymd(best.off)).length), 0);
          const nth = ["", "", "second", "third", "fourth"][Math.min(dayCount, 4)];
          corrBox = `<div class="corr" data-entity="${esc(bestEnt)}"><div class="corrh">CORRECTION &amp; AMPLIFICATION</div><div class="corrb">${esc(lc(bestName).replace(/^t/, "T"))} reported water at ${hm(best.on)}${when}. The floor has since retracted its statement. Duration of the scandal: ${dur}.${dayCount > 1 ? ` It was the ${nth} such report of the day.` : ""}</div></div>`;
        }
      }
    }

    // stop press
    const press = leakOn || wet.length ? `<div class="press">STOP PRESS · WATER AT THE ${esc((wet[0] ? wet[0].name : "premises").toUpperCase())}</div>` : "";

    const body = `<div class="sect"><span>${esc(c.title)}</span><span class="sectr">${c.meter_number ? "METER Nº " + esc(c.meter_number) : ""}</span></div>
      ${press}
      <h2 class="hed" data-entity="${esc(c.today_entity || c.meter_entity)}">${esc(head)}</h2>
      <div class="dek">${esc(dek)}</div>
      ${plate}${plateCap}
      <p class="lede">${esc(lede)}</p>
      ${chart}${strip}${irr}${corrHtml}${corrBox}
      ${c.footer ? `<div class="foot">${esc(c.footer)}</div>` : ""}`;
    return { sig: body, html: `<style>${this._css()}</style><div class="wrap"><div class="card">${body}</div></div>` };
  }

  // Vector fallback (no plate configured): the round-1 dusk tower, tank filled to today ÷ average.
  _vectorTank(pct) {
    const fill = Math.max(0, Math.min(1, (pct == null ? 50 : pct) / 100)), h = Math.round(62 * fill), y = 108 - h;
    return `<svg viewBox="0 0 456 200" style="display:block;width:100%;height:100%">
      <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6f7f94"/><stop offset="1" stop-color="#c9b28e"/></linearGradient><clipPath id="tank"><rect x="176" y="46" width="104" height="62" rx="6"/></clipPath></defs>
      <rect width="456" height="200" fill="url(#sky)"/><circle cx="392" cy="40" r="12" fill="#f6efdc" opacity=".9"/>
      <path d="M0 150 L70 110 L120 135 L180 100 L240 140 L300 105 L360 130 L420 112 L456 128 L456 200 L0 200Z" fill="#5b4a6e"/>
      <path d="M0 170 L60 150 L130 165 L210 148 L290 168 L370 152 L456 165 L456 200 L0 200Z" fill="#4a3d5c"/>
      <rect y="176" width="456" height="24" fill="${TAN}"/>
      <path d="M60 178 V128 M60 150 H48 V136 M60 144 H72 V132" stroke="${INK}" stroke-width="5" stroke-linecap="round" fill="none"/>
      <g stroke="${INK}" stroke-width="3" fill="none" stroke-linecap="round"><path d="M190 112 L166 178"/><path d="M266 112 L290 178"/><path d="M178 146 L278 146"/><path d="M172 163 L284 163"/></g>
      <path d="M226 114 L226 178" stroke="${BLUE}" stroke-width="5"/>
      <rect x="170" y="40" width="116" height="74" rx="10" fill="#f6efdc" stroke="${INK}" stroke-width="3"/>
      <path d="M170 48 Q228 20 286 48 Z" fill="#e7d9bd" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
      <rect x="176" y="${y}" width="104" height="${h}" fill="${BLUE}" clip-path="url(#tank)"/>
      <text x="228" y="69" text-anchor="middle" font-family="Fraunces, Georgia, serif" font-weight="900" font-size="22" fill="${INK}">${pct == null ? "—" : pct + "%"}</text>
      <text x="228" y="98" text-anchor="middle" font-family="Archivo, sans-serif" font-weight="700" font-size="8" letter-spacing="1.5" fill="#f6efdc">OF AVERAGE</text>
      <path d="M226 186 L330 186 L330 178" stroke="${BLUE}" stroke-width="4" fill="none"/>
      <path d="M318 178 L318 150 L346 130 L374 150 L374 178 Z" fill="#f6efdc" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/><rect x="340" y="160" width="12" height="18" fill="${INK}"/><rect x="358" y="154" width="9" height="9" fill="#e8a03d"/>
    </svg>`;
  }

  // ---------- scroll-jump guards (see homestead-classifieds-card) ----------
  _pin() { try { const h = Math.round(this.getBoundingClientRect().height); if (h > 0) this.style.minHeight = Math.max(h, parseFloat(this.style.minHeight) || 0) + "px"; } catch (e) { /* not in a document */ } }
  _unpin(reserve) { setTimeout(() => { this.style.minHeight = reserve ? reserve + "px" : ""; }, 0); }
  _hkey() { return "hwc-h:" + this._cfg.meter_entity; }
  _reserve() { try { const v = parseInt(localStorage.getItem(this._hkey()), 10); return v > 40 ? v : 0; } catch (e) { return 0; } }
  _remember() { try { const h = Math.round(this.getBoundingClientRect().height); if (h > 40) localStorage.setItem(this._hkey(), String(h)); } catch (e) { /* storage unavailable */ } }

  _css() {
    const c = this._cfg;
    return `
  :host { display: block; }
  * { box-sizing: border-box; }
  .wrap { container-type: inline-size; position: relative; }
  .wrap::before { content: ""; position: absolute; top: 0; bottom: 0; left: calc(-1 * var(--almanac-gutter, 16px)); width: 1px; background: ${c.column_rule ? "var(--almanac-column-rule, #2b2118)" : "transparent"}; }
  .card { --px: max(0.5px, 0.1923cqw); background: var(--almanac-paper, ${PAPER}); color: ${INK}; border-radius: var(--ha-card-border-radius, 14px); box-shadow: var(--ha-card-box-shadow, 0 4px 16px rgba(0,0,0,.18)); overflow: hidden; font-family: Archivo, 'Segoe UI', sans-serif; padding: calc(22*var(--px)) calc(32*var(--px)) calc(20*var(--px)); }
  .sect { display: flex; justify-content: space-between; align-items: baseline; font-size: max(8px, calc(10*var(--px))); font-weight: 700; letter-spacing: calc(3*var(--px)); color: ${TAN}; border-bottom: 1.5px solid ${INK}; padding-bottom: calc(5*var(--px)); }
  .sectr { letter-spacing: calc(1*var(--px)); }
  .press { margin-top: calc(10*var(--px)); background: #7e1d10; color: #f6ecd8; text-align: center; font-size: max(8px, calc(11*var(--px))); font-weight: 700; letter-spacing: calc(2*var(--px)); padding: calc(7*var(--px)); border-top: 2px solid #e8a03d; border-bottom: 2px solid #e8a03d; }
  .hed { font-family: Fraunces, Georgia, serif; font-size: max(15px, calc(21*var(--px))); font-weight: 700; line-height: 1.15; margin: calc(12*var(--px)) 0 calc(4*var(--px)); text-wrap: balance; cursor: pointer; }
  .dek { font-family: Fraunces, Georgia, serif; font-style: italic; font-size: max(10px, calc(12.5*var(--px))); color: ${BROWN}; margin-bottom: calc(10*var(--px)); }
  .fig { position: relative; width: 100%; aspect-ratio: 456 / 194; overflow: hidden; cursor: pointer; }
  .fig img { display: block; width: 100%; height: 100%; object-fit: cover; mix-blend-mode: multiply; }
  .tag { position: absolute; background: #f6efdc; border: 1.5px solid ${INK}; box-shadow: 0 0 0 3px #f6efdc; padding: calc(4*var(--px)) calc(9*var(--px)) calc(5*var(--px)); text-align: center; transform: rotate(-1.5deg); }
  .tag.br { right: calc(12*var(--px)); bottom: calc(12*var(--px)); } .tag.bl { left: calc(12*var(--px)); bottom: calc(12*var(--px)); } .tag.tr { right: calc(12*var(--px)); top: calc(12*var(--px)); } .tag.tl { left: calc(12*var(--px)); top: calc(12*var(--px)); }
  .tv { font-family: Fraunces, Georgia, serif; font-weight: 900; font-size: max(12px, calc(16*var(--px))); line-height: 1; }
  .tl { font-size: max(6px, calc(6.5*var(--px))); font-weight: 700; letter-spacing: calc(1.2*var(--px)); color: ${BROWN}; margin-top: 3px; border-top: 1px solid ${DOT}; padding-top: 3px; }
  .plate { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-top: calc(6*var(--px)); font-family: Fraunces, Georgia, serif; font-size: max(8px, calc(10*var(--px))); color: ${BROWN}; }
  .plate b { font-weight: 700; letter-spacing: 1.5px; font-family: Archivo, sans-serif; font-size: max(7px, calc(8*var(--px))); color: ${TAN}; }
  .plate i { font-style: italic; } .plate .r { white-space: nowrap; }
  .lede { font-family: Fraunces, Georgia, serif; font-size: max(10px, calc(12.5*var(--px))); line-height: 1.45; margin: calc(10*var(--px)) 0 0; }
  .lede::first-letter { font-size: 2.7em; font-weight: 900; float: left; line-height: .82; padding: 4px 6px 0 0; }
  .sub { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; column-gap: calc(12*var(--px)); row-gap: 2px; margin-top: calc(14*var(--px)); padding-bottom: 3px; border-bottom: 1px solid ${INK}; }
  .subn { font-family: Fraunces, Georgia, serif; font-size: max(10px, calc(12.5*var(--px))); font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .subr { font-size: max(7px, calc(9*var(--px))); font-weight: 700; letter-spacing: 1.5px; color: ${TAN}; } .subr.hot { color: ${TERRA}; }
  .chart { display: block; width: 100%; margin-top: calc(8*var(--px)); cursor: pointer; }
  .strip { margin-top: calc(12*var(--px)); border-top: 1.5px solid ${INK}; border-bottom: 1.5px solid ${INK}; display: grid; grid-template-columns: repeat(5, 1fr); text-align: center; padding: calc(8*var(--px)) 0; }
  .cell { cursor: pointer; } .cell + .cell { border-left: 1px dotted ${DOT}; }
  .cv { font-family: Fraunces, Georgia, serif; font-size: max(11px, calc(16*var(--px))); font-weight: 700; white-space: nowrap; }
  .cl { font-size: max(7px, calc(8.5*var(--px))); font-weight: 700; letter-spacing: calc(1.5*var(--px)); color: ${TAN}; margin-top: 2px; white-space: nowrap; }
  .row { display: flex; justify-content: space-between; align-items: baseline; padding: calc(6*var(--px)) 0; border-bottom: 1px dotted ${DOT}; cursor: pointer; }
  .row:last-child { border-bottom: none; }
  .k { font-size: max(9px, calc(11.5*var(--px))); color: ${BROWN}; }
  .v { font-family: Fraunces, Georgia, serif; font-size: max(10px, calc(13*var(--px))); font-weight: 600; } .v.due { color: ${TERRA}; }
  .sent { display: grid; grid-template-columns: repeat(3, 1fr); gap: calc(8*var(--px)); margin-top: calc(8*var(--px)); }
  .puck { border: 1px solid ${DOT}; padding: calc(6*var(--px)) calc(8*var(--px)); cursor: pointer; } .puck.wet { border-color: ${TERRA}; }
  .pn { font-size: max(7px, calc(9*var(--px))); font-weight: 700; letter-spacing: 1.5px; color: ${TAN}; }
  .ps { font-family: Fraunces, Georgia, serif; font-size: max(10px, calc(12.5*var(--px))); font-weight: 600; color: ${GREEN}; margin-top: 2px; } .puck.wet .ps { color: ${TERRA}; }
  .puck.was { border-color: ${BROWN}; } .puck.was .ps { color: ${BROWN}; }
  .corr { border: 1.5px solid ${INK}; margin-top: calc(12*var(--px)); padding: calc(7*var(--px)) calc(10*var(--px)); cursor: pointer; }
  .corrh { font-size: max(7px, calc(8.5*var(--px))); font-weight: 700; letter-spacing: calc(2*var(--px)); color: ${TAN}; text-align: center; }
  .corrb { font-family: Fraunces, Georgia, serif; font-size: max(10px, calc(12*var(--px))); font-style: italic; text-align: center; margin-top: calc(4*var(--px)); line-height: 1.4; }
  .foot { font-size: max(7px, calc(9*var(--px))); letter-spacing: .3px; color: ${TAN}; margin-top: calc(12*var(--px)); line-height: 1.5; }
  @container (max-width: 380px) { .sent { grid-template-columns: 1fr; } }`;
  }
}

if (!document.getElementById("hwc-font")) {
  const l = document.createElement("link");
  l.id = "hwc-font"; l.rel = "stylesheet";
  l.href = "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;0,9..144,900;1,9..144,400&family=Archivo:wght@400;600;700&display=swap";
  document.head.appendChild(l);
}
customElements.define("homestead-waterworks-card", HomesteadWaterworksCard);
console.info(`%c HOMESTEAD-WATERWORKS-CARD %c ${HWC_VERSION} `, "background:#3a2d1f;color:#f3e7d3;font-weight:700", "background:#5f7e94;color:#fff;font-weight:700");
window.customCards = window.customCards || [];
window.customCards.push({ type: "homestead-waterworks-card", name: "Homestead Waterworks Card", description: "A newsprint water-use article: woodcut plate, data-driven headline, hatched 14-day chart, irrigation and leak dispatches.", preview: true, documentationURL: "https://github.com/LoneWolf345/homestead-waterworks-card" });
