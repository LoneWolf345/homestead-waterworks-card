/* homestead-waterworks-card — "The Soil Ledger": the yard's water as a bank passbook for a
 * newsprint Home Assistant dashboard. Rain credits, the sun's evapotranspiration debits, the
 * balance owed to the soil, a settlement date from the watering automation, dispatches from
 * the valves and the leak desk (with 24-hour incident memory, a CORRECTION & AMPLIFICATION
 * box and the dry-streak), and the mains demoted to a one-line agate brief. Read-only: tap →
 * more-info. Companion to almanac-weather-card / network-ledger-card / homestead-classifieds-card
 * / homestead-pool-card / homestead-motoring-card. */
const HWC_VERSION = "2026.9.4";
const INK = "#3a2d1f", PAPER = "#f3e7d3", TAN = "#a3876a", BROWN = "#7a6248",
  TERRA = "#c65f38", BLUE = "#5f7e94", DOT = "#cfb894", GREEN = "#2f7f6f", RED = "#7e1d10";
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY3 = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const NWORD = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const bad = (s) => s == null || s === "" || s === "unknown" || s === "unavailable";
const num = (s) => { const v = parseFloat(s); return isNaN(v) ? null : v; };
const fmt = (v, d = 0) => (v == null ? "—" : v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d }));
const pad2 = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const hourWord = (d) => { let h = d.getHours(); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return d.getMinutes() >= 30 ? `~${(h % 12) + 1} ${h === 11 ? (ap === "AM" ? "PM" : "AM") : ap}` : `~${h} ${ap}`; };
const durWord = (secs) => { const m = Math.round(secs / 60); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h ${pad2(r)} m` : `${m} min`; };
const hm = (d) => { let h = d.getHours(); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12; return `${h}:${pad2(d.getMinutes())} ${ap}`; };
const etWord = (v) => { const a = Math.abs(v); if (a <= 0.05) return "next to nothing"; if (a <= 0.18) return "an eighth of an inch"; if (a <= 0.29) return "a quarter-inch"; if (a <= 0.4) return "a third of an inch"; if (a <= 0.62) return "a half-inch"; return `${fmt(a, 2)} inches`; };

class HomesteadWaterworksCard extends HTMLElement {
  static getStubConfig() { return { meter_entity: "sensor.water_meter_reading", today_entity: "sensor.water_meter_water_today" }; }

  setConfig(config) {
    if (!config || !config.meter_entity) throw new Error("homestead-waterworks-card: set meter_entity (the total_increasing meter reading)");
    const c = Object.assign({
      title: "THE WATERWORKS", kicker: "GARDENS DESK", meter_number: "", today_entity: "", month_entity: "", flow_entity: "",
      days: 14, dek: "Being a true account of water credited to and debited from the front yard",
      rain_gauge_entity: "", correspondents: [], overnight_entity: "", leak_entity: "", valves: [], contracted_valves: 1,
      column_rule: false,
      footer: "",
      agate_tail: "Fuller accounts available upon request, and rendered nightly regardless.",
    }, config);
    c.irrigation = Object.assign({ name: "the front yard", zone: "the drip", duration_entity: "", bucket_entity: "", rain_entity: "", skip_threshold: 0.1,
      et_entity: "", drainage_entity: "", valve_entity: "", timer_entity: "", automation_entity: "", interval_days: 5 }, config.irrigation || {});
    this._cfg = c;
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._sig = null; this._stats = null; this._statsAt = 0; this._statsDay = ""; this._flood = null; this._rain24 = null;
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
  getCardSize() { return 8; }
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
      if (this._cfg.rain_gauge_entity) {
        try {
          const r24 = await this._hass.callWS({ type: "recorder/statistics_during_period", start_time: new Date(Date.now() - 24 * 3600000).toISOString(), statistic_ids: [this._cfg.rain_gauge_entity], period: "hour", types: ["change"] });
          const rr = (r24 && r24[this._cfg.rain_gauge_entity]) || [];
          this._rain24 = rr.reduce((a, x) => a + (x.change > 0 ? x.change : 0), 0);
        } catch (e) { /* keep the last figure */ }
      }
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
    return { past, avg, todayGal };
  }
  _band(r) {
    if (r == null) return null;
    if (r < 0.35) return "a third of the usual";
    if (r < 0.6) return "half the usual";
    if (r < 0.85) return "below the usual";
    if (r < 1.2) return "near habit";
    if (r < 1.7) return "above the usual";
    if (r < 2.5) return "near twice the usual";
    return "more than twice the usual";
  }
  _watering() {
    const ir = this._cfg.irrigation, dur = this._val(ir.duration_entity);
    const durTxt = dur != null ? durWord(dur) : "";
    const timer = this._st(ir.timer_entity);
    if (timer && timer.state === "active") {
      const fin = timer.attributes.finishes_at ? new Date(timer.attributes.finishes_at) : null;
      const left = fin ? Math.max(0, Math.round((fin - Date.now()) / 60000)) : null;
      return { row: left != null ? `In progress · ${left} min remain` : "In progress", now: true, entity: ir.timer_entity, dur };
    }
    const auto = this._st(ir.automation_entity);
    const last = auto && auto.attributes.last_triggered ? new Date(auto.attributes.last_triggered) : null;
    if (!last) return { row: durTxt ? `At the next start · ${durTxt}` : "At the next start", entity: ir.automation_entity, dur, last: null };
    const next = new Date(last.getTime() + ir.interval_days * 86400000), now = new Date();
    if (next < now) return { row: durTxt ? `At the next start · ${durTxt}` : "At the next start", entity: ir.automation_entity, dur, last };
    const today = ymd(now), tmrw = ymd(new Date(now.getTime() + 86400000)), nd = ymd(next);
    const when = nd === today ? "Today" : nd === tmrw ? (next.getHours() < 6 ? "Tonight" : "Tomorrow") : DAY3[next.getDay()];
    return { row: `${when}, ${hourWord(next)}${durTxt ? " · " + durTxt : ""}`, entity: ir.automation_entity, dur, last };
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
    const flow = this._val(c.flow_entity), month = this._val(c.month_entity);
    const corr = this._correspondents(), wet = corr.filter((p) => p.wet);
    const leak = this._st(c.leak_entity), leakOn = !!leak && leak.state === "on";
    const overnight = this._val(c.overnight_entity);
    const water = this._watering();
    const bucket = this._val(ir.bucket_entity), rainF = this._val(ir.rain_entity), gauge = this._val(c.rain_gauge_entity);
    const et = this._val(ir.et_entity), drain = this._val(ir.drainage_entity);
    const skip = rainF != null && rainF >= ir.skip_threshold;
    const rain24 = this._rain24;
    const wateredToday = water.last && now - water.last < 24 * 3600000;

    // headline
    let head;
    if (water.now) head = `Settlement in progress: ${ir.zone} pays the yard ${water.dur != null ? durWord(water.dur) : "its due"}`;
    else if (skip) head = `The sky assumes the debt: ${fmt(rainF, 2)} in expected within the day`;
    else if (bucket == null) head = "The gardens desk awaits its figures";
    else if (bucket < -0.02) head = et != null ? `The sun takes ${etWord(et)}; the soil is owed ${fmt(Math.abs(bucket), 2)}` : `The soil is owed ${fmt(Math.abs(bucket), 2)}, and the sun says nothing`;
    else if (bucket > 0.02) head = `The account runs in credit: ${fmt(bucket, 2)} in to the good`;
    else head = "The account stands square, to the sky's surprise";

    // ledger
    const lrow = (d, di, v, cls, ent) => `<div class="brow" data-entity="${esc(ent || "")}"><span class="d">${d}${di ? `, <i>${di}</i>` : ""}</span><span class="a${cls ? " " + cls : ""}">${v}</span></div>`;
    const owed = bucket != null && bucket < 0;
    const book = `<div class="book">
      <div class="bh"><span>ACCOUNT OF ${esc(String(ir.name).toUpperCase())}</span><span>INCHES</span></div>
      <div class="bsub">CREDITS</div>
      ${lrow("Rain", "the sky, last 24 hours", rain24 == null ? "—" : fmt(rain24, 2), rain24 > 0 ? "cr" : "", c.rain_gauge_entity)}
      ${wateredToday ? lrow("Irrigation", `${esc(ir.zone)}, ${esc(hm(water.last))}`, "paid", "cr", ir.automation_entity) : ""}
      ${lrow("Rain promised", "unredeemed", rainF == null ? "—" : fmt(rainF, 2), "", ir.rain_entity)}
      <div class="bsub">DEBITS</div>
      ${lrow("Evaporation", "the sun, yesterday", et == null ? "—" : (Math.abs(et) > 0.005 ? "−" : "") + fmt(Math.abs(et), 2), et != null && Math.abs(et) > 0.02 ? "dr" : "", ir.et_entity)}
      ${lrow("Drainage", "the caliche", drain == null ? "0.00" : fmt(Math.abs(drain), 2), "", ir.drainage_entity)}
      <div class="bal" data-entity="${esc(ir.bucket_entity)}"><span class="d">${owed ? "BALANCE OWED TO THE SOIL" : "BALANCE, IN THE SOIL'S FAVOR"}</span><span class="a${owed ? "" : " up"}">${bucket == null ? "—" : (bucket < 0 ? "−" : "+") + fmt(Math.abs(bucket), 2)}</span></div>
    </div>
    <div class="settle"><span data-entity="${esc(water.entity || "")}"><b>SETTLEMENT</b> ${esc(skip && !water.now ? "Stands down · rain" : water.row)}</span><span data-entity="${esc(c.rain_gauge_entity)}"><b>SEASON RAIN</b> ${gauge == null ? "—" : fmt(gauge, 2) + " in"}</span></div>`;

    // dispatches
    const lcn = (n) => String(n).replace(/^([A-Z])(?=[a-z])/, (m) => m.toLowerCase()); // keeps acronyms like "RO filter"
    let streak = "";
    if (!wet.length && this._flood) {
      let lastEnd = null, since = null;
      for (const id of Object.keys(this._flood)) { const f = this._flood[id]; if (f.since && (!since || f.since < since)) since = f.since; for (const i of f.incidents) { const e = i.off || new Date(); if (!lastEnd || e > lastEnd) lastEnd = e; } }
      if (lastEnd) { const d = Math.floor((Date.now() - lastEnd.getTime()) / 86400000); streak = ` · DRY ${d} ${d === 1 ? "DAY" : "DAYS"}`; }
      else if (since) { const d = Math.floor((Date.now() - since.getTime()) / 86400000); streak = ` · DRY ${d}+ DAYS`; }
    }
    const right = (overnight == null ? "" : `OVERNIGHT · ${fmt(overnight, 1)} GAL`) + streak;
    let disp = "";
    if ((c.valves || []).length) {
      const open = c.valves.filter((id) => { const st = this._st(id); return st && ["open", "on"].includes(st.state); }).length;
      const n = c.valves.length, spare = Math.max(0, n - (c.contracted_valves || 0));
      disp += `<p data-entity="${esc(c.valves[0])}"><b>THE VALVES</b> — ${NWORD[Math.min(n, 10)]} on the manifold, ${open ? NWORD[Math.min(open, 10)] + " open" : "all closed"}; ${NWORD[Math.min(c.contracted_valves || 0, 10)]} under contract, ${NWORD[Math.min(spare, 10)]} awaiting assignment.</p>`;
    }
    if (corr.length) {
      const retract = (i) => { const m = Math.max(1, Math.round((i.off - i.on) / 60000)); return m < 2 ? "a minute later" : m < 60 ? `${m} minutes later` : `${Math.floor(m / 60)} hour${Math.floor(m / 60) > 1 ? "s" : ""} later`; };
      const recentP = corr.filter((p) => p.recent && !p.wet).sort((a, b) => b.recent.off - a.recent.off)[0];
      const names = corr.map((p) => lcn(p.name));
      const nameList = names.length > 1 ? names.slice(0, -1).join(", ") + " and " + names[names.length - 1] : names[0] || "";
      let line;
      if (wet.length) line = `<span class="wetw">WATER at the ${esc(lcn(wet[0].name))}</span>, reports our correspondent${wet.length > 1 ? ", and so does the " + esc(lcn(wet[1].name)) : ""}.`;
      else if (recentP) line = `the ${esc(lcn(recentP.name))} filed a wet dispatch at ${hm(recentP.recent.on)} and retracted it ${retract(recentP.recent)}; the others report dry.`;
      else line = `${esc(nameList)} file the same word: <span class="ok">dry</span>.`;
      disp += `<p data-entity="${esc((wet[0] || corr[0]).entity)}"><b>THE LEAK DESK</b> — ${line}</p>`;
    }
    const dispatches = disp ? `<div class="sub"><span class="subn">Dispatches</span><span class="subr${overnight > 0 ? " hot" : ""}">${esc(right)}</span></div><div class="disp">${disp}</div>` : "";

    // corrections & amplifications — the most recent resolved incident, through the following noon
    let corrBox = "";
    if (this._flood && !wet.length) {
      let best = null, bestName = "", bestEnt = "";
      for (const p of c.correspondents || []) { const f = this._flood[p.entity]; if (!f) continue; for (const i of f.incidents) { if (i.off && (!best || i.off > best.off)) { best = i; bestName = p.name || p.entity; bestEnt = p.entity; } } }
      if (best) {
        const today0 = new Date(now); today0.setHours(0, 0, 0, 0);
        const show = best.off >= today0 || (best.off >= new Date(today0.getTime() - 86400000) && now.getHours() < 12);
        if (show) {
          const mins = Math.max(1, Math.round((best.off - best.on) / 60000));
          const dur = mins < 2 ? "one minute" : mins < 60 ? `${mins} minutes` : `${Math.floor(mins / 60)} hour${Math.floor(mins / 60) > 1 ? "s" : ""}${mins % 60 ? " " + (mins % 60) + " minutes" : ""}`;
          const when = ymd(best.on) === ymd(now) ? "" : " yesterday";
          corrBox = `<div class="corr" data-entity="${esc(bestEnt)}"><div class="corrh">CORRECTION &amp; AMPLIFICATION</div><div class="corrb">The ${esc(lcn(bestName))} reported water at ${hm(best.on)}${when}. The floor has since retracted its statement. Duration of the scandal: ${dur}.</div></div>`;
        }
      }
    }

    // stop press
    const press = leakOn || wet.length ? `<div class="press">STOP PRESS · WATER AT THE ${esc((wet[0] ? wet[0].name : "premises").toUpperCase())}</div>` : "";

    // the mains, in agate
    const ratio = s.avg && s.todayGal != null ? s.todayGal / s.avg : null;
    const band = this._band(ratio);
    const agate = `<div class="agate" data-entity="${esc(c.today_entity || c.meter_entity)}"><b>THE MAINS, IN BRIEF.</b> ${s.todayGal == null ? "No reading filed" : fmt(Math.round(s.todayGal)) + " gallons drawn by press time"}${band ? ", " + band : ""}${flow != null ? "; flow " + fmt(flow, 1) + " gal/min" : ""}${month != null ? "; month " + fmt(Math.round(month)) : ""}. ${esc(c.agate_tail)}</div>`;

    const body = `<div class="sect"><span>${esc(c.title)}</span><span class="sectr">${esc(c.kicker)}</span></div>
      ${press}
      <h2 class="hed" data-entity="${esc(ir.bucket_entity || c.meter_entity)}">${esc(head)}</h2>
      <div class="dek">${esc(c.dek)}</div>
      ${book}${dispatches}${corrBox}${agate}
      ${c.footer ? `<div class="foot">${esc(c.footer)}</div>` : ""}`;
    return { sig: body, html: `<style>${this._css()}</style><div class="wrap"><div class="card">${body}</div></div>` };
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
  .press { margin-top: calc(10*var(--px)); background: ${RED}; color: #f6ecd8; text-align: center; font-size: max(8px, calc(11*var(--px))); font-weight: 700; letter-spacing: calc(2*var(--px)); padding: calc(7*var(--px)); border-top: 2px solid #e8a03d; border-bottom: 2px solid #e8a03d; }
  .hed { font-family: Fraunces, Georgia, serif; font-size: max(15px, calc(21*var(--px))); font-weight: 700; line-height: 1.15; margin: calc(12*var(--px)) 0 calc(4*var(--px)); text-wrap: balance; cursor: pointer; }
  .dek { font-family: Fraunces, Georgia, serif; font-style: italic; font-size: max(10px, calc(12.5*var(--px))); color: ${BROWN}; margin-bottom: calc(12*var(--px)); }
  .book { border: 1.5px solid ${INK}; }
  .bh { display: flex; justify-content: space-between; background: ${INK}; color: ${PAPER}; font-size: max(7px, calc(9*var(--px))); font-weight: 700; letter-spacing: calc(2*var(--px)); padding: calc(5*var(--px)) calc(10*var(--px)); }
  .bsub { font-size: max(7px, calc(8.5*var(--px))); font-weight: 700; letter-spacing: calc(2*var(--px)); color: ${TAN}; padding: calc(7*var(--px)) calc(10*var(--px)) calc(2*var(--px)); }
  .brow { display: flex; justify-content: space-between; align-items: baseline; gap: calc(10*var(--px)); padding: calc(6*var(--px)) calc(10*var(--px)); border-bottom: 1px dotted ${DOT}; cursor: pointer; }
  .brow .d { font-size: max(9px, calc(11.5*var(--px))); color: ${BROWN}; }
  .brow .d i { font-family: Fraunces, Georgia, serif; font-style: italic; }
  .brow .a { font-family: Fraunces, Georgia, serif; font-size: max(10px, calc(13*var(--px))); font-weight: 600; white-space: nowrap; }
  .a.cr { color: ${GREEN}; } .a.dr { color: ${RED}; }
  .bal { display: flex; justify-content: space-between; align-items: baseline; padding: calc(8*var(--px)) calc(10*var(--px)); border-top: 2px solid ${INK}; background: #eddcc0; cursor: pointer; }
  .bal .d { font-size: max(8px, calc(11*var(--px))); font-weight: 700; letter-spacing: calc(1.5*var(--px)); }
  .bal .a { font-family: Fraunces, Georgia, serif; font-size: max(13px, calc(17*var(--px))); font-weight: 900; color: ${RED}; } .bal .a.up { color: ${GREEN}; }
  .settle { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; column-gap: calc(12*var(--px)); padding: calc(7*var(--px)) 2px 0; font-family: Fraunces, Georgia, serif; font-size: max(10px, calc(12.5*var(--px))); }
  .settle b { font-family: Archivo, sans-serif; font-size: max(7px, calc(9*var(--px))); font-weight: 700; letter-spacing: calc(2*var(--px)); color: ${TAN}; }
  .settle span { cursor: pointer; }
  .sub { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; column-gap: calc(12*var(--px)); row-gap: 2px; margin-top: calc(14*var(--px)); padding-bottom: 3px; border-bottom: 1px solid ${INK}; }
  .subn { font-family: Fraunces, Georgia, serif; font-size: max(10px, calc(12.5*var(--px))); font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
  .subr { font-size: max(7px, calc(9*var(--px))); font-weight: 700; letter-spacing: 1.5px; color: ${TAN}; } .subr.hot { color: ${TERRA}; }
  .disp { font-family: Fraunces, Georgia, serif; font-size: max(10px, calc(12.5*var(--px))); line-height: 1.5; margin-top: calc(8*var(--px)); }
  .disp b { font-family: Archivo, sans-serif; font-size: max(8px, calc(10*var(--px))); letter-spacing: calc(1.5*var(--px)); }
  .disp p { margin: 0 0 calc(7*var(--px)); cursor: pointer; }
  .disp .ok { color: ${GREEN}; font-weight: 600; }
  .disp .wetw { color: ${TERRA}; font-weight: 700; }
  .corr { border: 1.5px solid ${INK}; margin-top: calc(10*var(--px)); padding: calc(7*var(--px)) calc(10*var(--px)); cursor: pointer; }
  .corrh { font-size: max(7px, calc(8.5*var(--px))); font-weight: 700; letter-spacing: calc(2*var(--px)); color: ${TAN}; text-align: center; }
  .corrb { font-family: Fraunces, Georgia, serif; font-size: max(10px, calc(12*var(--px))); font-style: italic; text-align: center; margin-top: calc(4*var(--px)); line-height: 1.4; }
  .agate { margin-top: calc(12*var(--px)); border-top: 1px solid ${INK}; padding-top: calc(6*var(--px)); font-size: max(7px, calc(9*var(--px))); letter-spacing: .3px; color: ${TAN}; line-height: 1.5; cursor: pointer; }
  .agate b { color: ${BROWN}; letter-spacing: calc(1.5*var(--px)); }
  .foot { font-size: max(7px, calc(9*var(--px))); letter-spacing: .3px; color: ${TAN}; margin-top: calc(10*var(--px)); line-height: 1.5; }`;
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
window.customCards.push({ type: "homestead-waterworks-card", name: "Homestead Waterworks Card", description: "The Soil Ledger: the yard's water as a newsprint bank passbook — rain credits, the sun's debits, the balance owed, settlement by drip, and the mains in agate.", preview: true, documentationURL: "https://github.com/LoneWolf345/homestead-waterworks-card" });
