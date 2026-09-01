// smoke.mjs — node harness for homestead-waterworks-card
import fs from "node:fs"; import vm from "node:vm";
const src = fs.readFileSync(new URL("./homestead-waterworks-card.js", import.meta.url), "utf8");
class HTMLElement { constructor() { this._sr = null; this.style = {}; this._h = 700; } attachShadow() { this._sr = { innerHTML: "", querySelectorAll: () => [], querySelector: () => null }; return this._sr; } get shadowRoot() { return this._sr; } dispatchEvent() {} getBoundingClientRect() { return { height: this._h }; } }
const defs = {}; const store = new Map();
const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) };
const ctx = { HTMLElement, customElements: { define: (n, c) => (defs[n] = c) }, document: { getElementById: () => null, createElement: () => ({}), head: { appendChild() {} } }, console, CustomEvent: class { constructor(t, o) { this.type = t; this.detail = o && o.detail; } }, setInterval: () => 0, clearInterval() {}, setTimeout, Date, localStorage };
ctx.window = ctx; vm.createContext(ctx); vm.runInContext(src, ctx);
const Card = defs["homestead-waterworks-card"];
let fails = 0;
const check = (name, cond) => { console.log((cond ? "ok  " : "FAIL") + " " + name); if (!cond) fails++; };
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const now = new Date(); const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
const dayIso = (off) => new Date(day0.getTime() + off * 86400000).toISOString();
const rows = [409, 197, 246, 372, 163, 535, 260, 133, 86, 263, 538, 354, 211, 352].map((g, i) => ({ start: dayIso(i - 14), change: g })).concat([{ start: dayIso(0), change: 130 }]);
const stats = async (m) => (m.type === "recorder/statistics_during_period" ? { "sensor.water_meter_reading": rows } : {});
const S = (v, extra) => ({ state: String(v), attributes: extra || {} });
const base = () => ({
  "sensor.water_meter_reading": S(511920.6), "sensor.water_meter_water_today": S(149.4), "sensor.water_meter_water_this_month": S(6248.5), "sensor.water_meter_water_flow": S(0.6),
  "sensor.smart_irrigation_front_yard_drip": S(14400), "sensor.smart_irrigation_front_yard_drip_bucket": S(-1.17), "sensor.si_rain_forecast_24h": S(0.01), "sensor.rainfall_cumulative": S(0.47),
  "timer.front_yard_drip": S("idle"), "automation.front_yard_drip_weather_aware_watering": S("on", { last_triggered: new Date(now.getTime() - 4.2 * 86400000).toISOString() }),
  "binary_sensor.water_heater_leak_flood": S("off"), "binary_sensor.ro_filter_leak_flood": S("off"), "binary_sensor.kitchen_kitchen_sink_leak_flood": S("off"),
  "input_number.water_overnight_leak_gal": S(0), "input_boolean.water_leak_detected": S("off"),
});
const cfg = () => ({ meter_entity: "sensor.water_meter_reading", today_entity: "sensor.water_meter_water_today", month_entity: "sensor.water_meter_water_this_month", flow_entity: "sensor.water_meter_water_flow", meter_number: "1545163240", plate: "/local/waterworks/plate-tank.jpg",
  irrigation: { name: "Front-yard drip", duration_entity: "sensor.smart_irrigation_front_yard_drip", bucket_entity: "sensor.smart_irrigation_front_yard_drip_bucket", rain_entity: "sensor.si_rain_forecast_24h", valve_entity: "valve.front_yard_drip", timer_entity: "timer.front_yard_drip", automation_entity: "automation.front_yard_drip_weather_aware_watering", interval_days: 5 },
  rain_gauge_entity: "sensor.rainfall_cumulative", overnight_entity: "input_number.water_overnight_leak_gal", leak_entity: "input_boolean.water_leak_detected",
  correspondents: [{ name: "Water heater", entity: "binary_sensor.water_heater_leak_flood" }, { name: "RO filter", entity: "binary_sensor.ro_filter_leak_flood" }, { name: "Kitchen sink", entity: "binary_sensor.kitchen_kitchen_sink_leak_flood" }] });
const make = async (states, c) => { const el = new Card(); el.setConfig(c || cfg()); el.hass = { states, callWS: stats }; await tick(); await tick(); return el; };

check("card registered", typeof Card === "function");
check("setConfig rejects missing meter_entity", (() => { try { new Card().setConfig({}); return false; } catch (e) { return /meter_entity/.test(e.message); } })());

{ const el = await make(base()); const h = el.shadowRoot.innerHTML;
  check("kicker + meter number", h.includes("THE WATERWORKS") && h.includes("METER Nº 1545163240"));
  check("headline: quiet, half the usual (149 vs avg 294)", h.includes("A quiet day at the main: 149 gallons drawn, half the usual"));
  check("dek: flow/avg/month", h.includes("Flow at press time 0.6 gal/min · 14-day average 294 gal/day · month to date 6,249 gal"));
  check("plate img + tag 51%", h.includes('src="/local/waterworks/plate-tank.jpg"') && h.includes("149 GAL") && h.includes("51% OF AVERAGE"));
  check("plate caption", h.includes("PLATE I.") && h.includes("Engraving after a photograph"));
  check("chart: 14 past bars + today bar, avg excludes today", (h.match(/fill="url\(#hb\)"/g) || []).length === 14 && (h.match(/fill="url\(#ht\)"/g) || []).length === 1 && h.includes("AVG 294"));
  check("strip: yesterday 352", h.includes("<div class=\"cv\">352</div>"));
  check("irrigation: next watering tonight-ish phrasing", /Next watering<\/span><span class="v">(Today|Tonight|Tomorrow|Sun|Mon|Tue|Wed|Thu|Fri|Sat), ~\d+ (AM|PM) · 4 h 00 m/.test(h));
  check("irrigation: bucket deficit terracotta", h.includes("−1.17 in · deficit") && /class="v due">−1\.17/.test(h));
  check("irrigation: rain no skip + gauge", h.includes("0.01 in · no skip") && h.includes("0.47 in"));
  check("correspondents: three dry dispatches + overnight", (h.match(/Dry, nothing to report/g) || []).length === 3 && h.includes("OVERNIGHT · 0.0 GAL MOVED"));
  check("lede: drop-cap sentence mentions habit + dispatch", h.includes('class="lede"') && h.includes("half its fourteen-day habit") && h.includes("file the same dispatch: dry, nothing to report."));
  check("no STOP PRESS when dry", !h.includes("STOP PRESS"));
  check("height remembered after load", store.get("hwc-h:sensor.water_meter_reading") === "700"); }

{ const st = base(); st["binary_sensor.kitchen_kitchen_sink_leak_flood"] = S("on"); st["input_number.water_overnight_leak_gal"] = S(3.2);
  const el = await make(st); const h = el.shadowRoot.innerHTML;
  check("wet puck: dispatch + STOP PRESS band", h.includes("WATER — reports our correspondent") && h.includes("STOP PRESS · WATER AT THE KITCHEN SINK"));
  check("overnight > 0 is hot", h.includes('class="subr hot">OVERNIGHT · 3.2 GAL MOVED'));
  check("lede wet variant", h.includes("our correspondent at the kitchen sink reports water.") && true); }

{ const st = base(); st["timer.front_yard_drip"] = S("active", { finishes_at: new Date(now.getTime() + 42 * 60000).toISOString() });
  const el = await make(st); const h = el.shadowRoot.innerHTML;
  check("timer active: watering now with minutes left", /Watering now · 4[12] min left/.test(h) && h.includes("is watering as we go to press")); }

{ const st = base(); st["automation.front_yard_drip_weather_aware_watering"] = S("on", { last_triggered: new Date(now.getTime() - 7 * 86400000).toISOString() }); st["sensor.si_rain_forecast_24h"] = S(0.4);
  const el = await make(st); const h = el.shadowRoot.innerHTML;
  check("rain skip overrides next watering", h.includes("Stands down · rain") && h.includes("0.40 in · skip") && h.includes("stands down for rain")); }

{ const st = base(); st["sensor.water_meter_water_today"] = S(700);
  const el = await make(st); const h = el.shadowRoot.innerHTML;
  check("headline: heavy, more than twice", h.includes("A heavy day at the main: 700 gallons drawn, near twice the usual") || h.includes("more than twice the usual")); }

{ const c = cfg(); c.plate = ""; const el = await make(base(), c); const h = el.shadowRoot.innerHTML;
  check("no plate → vector tank fallback with % fill", h.includes("<svg viewBox=\"0 0 456 200\"") && h.includes("51%") && !h.includes("<img")); }

{ store.delete("hwc-h:sensor.water_meter_reading"); const el = new Card(); el.setConfig(cfg()); el.hass = { states: base(), callWS: () => new Promise(() => {}) };
  check("stats pending: pinned at current height", el.style.minHeight === "700px"); await tick();
  check("stats pending, no memory: no reservation after the tick", el.style.minHeight === "");
  store.set("hwc-h:sensor.water_meter_reading", "812");
  const el2 = new Card(); el2.setConfig(cfg()); el2.hass = { states: base(), callWS: () => new Promise(() => {}) }; await tick();
  check("stats pending: reserves remembered height", el2.style.minHeight === "812px"); }

console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
