// smoke.mjs — node harness for homestead-waterworks-card (Soil Ledger layout)
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
const rows = [409, 197, 246, 372, 163, 535, 260, 133, 86, 263, 538, 354, 211, 352].map((g, i) => ({ start: dayIso(i - 14), change: g }));
let rainRows = [];
let floodRows = {};
const stats = async (m) => {
  if (m.type === "recorder/statistics_during_period") {
    const id = (m.statistic_ids || [])[0];
    if (id === "sensor.water_meter_reading") return { "sensor.water_meter_reading": rows };
    if (id === "sensor.rainfall_cumulative") return { "sensor.rainfall_cumulative": rainRows };
  }
  if (m.type === "history/history_during_period") return floodRows;
  return {};
};
const S = (v, extra) => ({ state: String(v), attributes: extra || {} });
const base = () => ({
  "sensor.water_meter_reading": S(512430.1), "sensor.water_meter_water_today": S(290.2), "sensor.water_meter_water_this_month": S(6248.5), "sensor.water_meter_water_flow": S(0.6),
  "sensor.smart_irrigation_front_yard_drip": S(14400), "sensor.smart_irrigation_front_yard_drip_bucket": S(-0.94), "sensor.si_rain_forecast_24h": S(0.01), "sensor.rainfall_cumulative": S(0.47),
  "sensor.smart_irrigation_front_yard_drip_et_value": S(-0.25), "sensor.smart_irrigation_front_yard_drip_current_drainage": S(0.0),
  "timer.front_yard_drip": S("idle"), "automation.front_yard_drip_weather_aware_watering": S("on", { last_triggered: new Date(now.getTime() - 4.2 * 86400000).toISOString() }),
  "valve.front_yard_drip": S("closed"), "valve.zone_2": S("closed"), "valve.zone_3": S("closed"), "valve.zone_4": S("closed"), "valve.zone_5": S("closed"), "valve.zone_6": S("closed"),
  "binary_sensor.water_heater_leak_flood": S("off"), "binary_sensor.ro_filter_leak_flood": S("off"), "binary_sensor.kitchen_kitchen_sink_leak_flood": S("off"),
  "input_number.water_overnight_leak_gal": S(0), "input_boolean.water_leak_detected": S("off"),
});
const cfg = () => ({ meter_entity: "sensor.water_meter_reading", today_entity: "sensor.water_meter_water_today", month_entity: "sensor.water_meter_water_this_month", flow_entity: "sensor.water_meter_water_flow",
  irrigation: { name: "the front yard", zone: "the drip", duration_entity: "sensor.smart_irrigation_front_yard_drip", bucket_entity: "sensor.smart_irrigation_front_yard_drip_bucket", rain_entity: "sensor.si_rain_forecast_24h", et_entity: "sensor.smart_irrigation_front_yard_drip_et_value", drainage_entity: "sensor.smart_irrigation_front_yard_drip_current_drainage", timer_entity: "timer.front_yard_drip", automation_entity: "automation.front_yard_drip_weather_aware_watering", interval_days: 5 },
  valves: ["valve.front_yard_drip", "valve.zone_2", "valve.zone_3", "valve.zone_4", "valve.zone_5", "valve.zone_6"], contracted_valves: 1,
  rain_gauge_entity: "sensor.rainfall_cumulative", overnight_entity: "input_number.water_overnight_leak_gal", leak_entity: "input_boolean.water_leak_detected",
  correspondents: [{ name: "Water heater", entity: "binary_sensor.water_heater_leak_flood" }, { name: "RO filter", entity: "binary_sensor.ro_filter_leak_flood" }, { name: "Kitchen sink", entity: "binary_sensor.kitchen_kitchen_sink_leak_flood" }] });
const make = async (states, c) => { const el = new Card(); el.setConfig(c || cfg()); el.hass = { states, callWS: stats }; await tick(); await tick(); return el; };

check("card registered", typeof Card === "function");
check("setConfig rejects missing meter_entity", (() => { try { new Card().setConfig({}); return false; } catch (e) { return /meter_entity/.test(e.message); } })());

{ const el = await make(base()); const h = el.shadowRoot.innerHTML;
  check("kicker: gardens desk", h.includes("THE WATERWORKS") && h.includes("GARDENS DESK"));
  check("headline: sun takes a quarter-inch, soil owed 0.94", h.includes("The sun takes a quarter-inch; the soil is owed 0.94"));
  check("book header", h.includes("ACCOUNT OF THE FRONT YARD") && h.includes(">INCHES<"));
  check("credits: rain 24h 0.00 + promised 0.01", h.includes("Rain</span>") === false && h.includes("last 24 hours") && /Rain promised[\s\S]*?unredeemed[\s\S]*?>0\.01</.test(h));
  check("debits: evaporation −0.25 red", /Evaporation[\s\S]*?the sun, yesterday[\s\S]*?class="a dr">−0\.25</.test(h));
  check("balance owed −0.94", h.includes("BALANCE OWED TO THE SOIL") && h.includes(">−0.94<"));
  check("settlement tonight + season rain", /SETTLEMENT<\/b> (Today|Tonight|Tomorrow), ~\d+ (AM|PM) · 4 h 00 m/.test(h) && h.includes("SEASON RAIN</b> 0.47 in"));
  check("valves dispatch", h.includes("six on the manifold, all closed; one under contract, five awaiting assignment."));
  check("leak desk dry", h.includes("water heater, RO filter and kitchen sink file the same word") && h.includes('class="ok">dry</span>.'));
  check("agate mains brief", h.includes("THE MAINS, IN BRIEF.") && h.includes("290 gallons drawn by press time, near habit; flow 0.6 gal/min; month 6,249."));
  check("no plate/chart/strip remain", !h.includes("<img") && !h.includes("viewBox") && !h.includes("14-DAY AVG"));
  check("no STOP PRESS when dry", !h.includes("STOP PRESS"));
  check("height remembered after load", store.get("hwc-h:sensor.water_meter_reading") === "700"); }

{ const st = base(); st["sensor.smart_irrigation_front_yard_drip_bucket"] = S(0.3);
  const el = await make(st); const h = el.shadowRoot.innerHTML;
  check("credit: headline + green balance", h.includes("The account runs in credit: 0.30 in to the good") && h.includes("BALANCE, IN THE SOIL'S FAVOR") && /class="a up">\+0\.30</.test(h));
  st["sensor.smart_irrigation_front_yard_drip_bucket"] = S(0.0);
  const el2 = await make(st); check("square account headline", el2.shadowRoot.innerHTML.includes("The account stands square, to the sky&#39;s surprise")); }

{ const st = base(); st["sensor.si_rain_forecast_24h"] = S(0.4);
  const el = await make(st); const h = el.shadowRoot.innerHTML;
  check("rain skip: sky assumes the debt + stands down", h.includes("The sky assumes the debt: 0.40 in expected within the day") && h.includes("SETTLEMENT</b> Stands down · rain")); }

{ const st = base(); st["timer.front_yard_drip"] = S("active", { finishes_at: new Date(now.getTime() + 42 * 60000).toISOString() });
  const el = await make(st); const h = el.shadowRoot.innerHTML;
  check("settlement in progress", h.includes("Settlement in progress: the drip pays the yard 4 h 00 m") && /In progress · 4[12] min remain/.test(h)); }

{ const st = base(); st["automation.front_yard_drip_weather_aware_watering"] = S("on", { last_triggered: new Date(now.getTime() - 3 * 3600000).toISOString() });
  const el = await make(st); const h = el.shadowRoot.innerHTML;
  check("watered today: irrigation credit row paid", /Irrigation[\s\S]*?the drip, \d{1,2}:\d{2} [AP]M[\s\S]*?class="a cr">paid</.test(h)); }

{ rainRows = [{ change: 0.05 }, { change: 0.07 }, { change: 0 }];
  const el = await make(base()); const h = el.shadowRoot.innerHTML;
  check("rain 24h summed 0.12 green", /class="a cr">0\.12</.test(h));
  rainRows = []; }

{ const st = base(); st["binary_sensor.kitchen_kitchen_sink_leak_flood"] = S("on");
  const el = await make(st); const h = el.shadowRoot.innerHTML;
  check("wet: STOP PRESS + leak desk water line", h.includes("STOP PRESS · WATER AT THE KITCHEN SINK") && h.includes("WATER at the kitchen sink") && !h.includes("CORRECTION")); }

{ floodRows = { "binary_sensor.kitchen_kitchen_sink_leak_flood": [{ s: "off", lu: (Date.now() - 30 * 86400000) / 1000 }, { s: "on", lu: (Date.now() - 26 * 60000) / 1000 }, { s: "off", lu: (Date.now() - 25 * 60000) / 1000 }] };
  const el = await make(base()); const h = el.shadowRoot.innerHTML;
  check("resolved: retraction line + corrections box + DRY 0 DAYS", /filed a wet dispatch at \d{1,2}:\d{2} [AP]M and retracted it a minute later; the others report dry\./.test(h) && h.includes("CORRECTION &amp; AMPLIFICATION") && /Duration of the scandal: one minute\./.test(h) && h.includes("· DRY 0 DAYS"));
  floodRows = {}; }

{ store.delete("hwc-h:sensor.water_meter_reading"); const el = new Card(); el.setConfig(cfg()); el.hass = { states: base(), callWS: () => new Promise(() => {}) };
  check("stats pending: pinned at current height", el.style.minHeight === "700px"); await tick();
  check("stats pending, no memory: no reservation after the tick", el.style.minHeight === "");
  store.set("hwc-h:sensor.water_meter_reading", "812");
  const el2 = new Card(); el2.setConfig(cfg()); el2.hass = { states: base(), callWS: () => new Promise(() => {}) }; await tick();
  check("stats pending: reserves remembered height", el2.style.minHeight === "812px"); }

console.log(fails ? `\n${fails} FAILED` : "\nall passed"); process.exit(fails ? 1 : 0);
