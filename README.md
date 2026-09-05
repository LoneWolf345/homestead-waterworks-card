# Homestead Waterworks Card

**The Soil Ledger** — the yard's water rendered as a bank passbook, for a newsprint Home Assistant dashboard. Companion to the [Almanac Weather Card](https://github.com/LoneWolf345/almanac-weather-card), the [Network Ledger Card](https://github.com/LoneWolf345/network-ledger-card), the [Homestead Classifieds Card](https://github.com/LoneWolf345/homestead-classifieds-card), the [Homestead Pool Card](https://github.com/LoneWolf345/homestead-pool-card) and the [Homestead Motoring Card](https://github.com/LoneWolf345/homestead-motoring-card).

<img src="docs/waterworks.png" width="520" alt="The Soil Ledger: a passbook of rain credits and the sun's debits, the balance owed to the soil, settlement by drip, dispatches, and the mains in agate">

**What it prints**

- **A data-driven headline** — "The sun takes a quarter-inch; the soil is owed .94" — from Smart Irrigation's evapotranspiration and bucket. In credit it celebrates; mid-watering it reads "Settlement in progress"; before rain, "The sky assumes the debt."
- **The passbook** — CREDITS: rain fallen in the last 24 h (from the rain gauge's statistics), the drip's run when it watered today ("paid"), and rain promised but unredeemed (the 24-h forecast). DEBITS: what the sun evaporated yesterday, and drainage. Then the double-ruled **BALANCE OWED TO THE SOIL**, red when owed, green when in credit.
- **Settlement** — the next watering from your automation's last run and cadence ("Tonight, ~2 AM · 4 h 00 m"), "In progress · N min remain" while the run timer is active, or "Stands down · rain" on a forecast skip. Season rain rides alongside.
- **Dispatches** — THE VALVES (counted from your valve entities: "six on the manifold, all closed; one under contract, five awaiting assignment") and THE LEAK DESK (flood sensors filing "dry" — or WATER, with a STOP PRESS band). A resolved leak stays in print for 24 hours, a **CORRECTION & AMPLIFICATION** box runs until the following noon, and the kicker carries the dry-streak.
- **The mains, in agate** — one line: gallons drawn today against the 14-day habit, flow, month. The meter no longer gets a chart; it files a brief.

Read-only: tapping anything opens its more-info dialog.

## Requirements

- [Smart Irrigation](https://github.com/jeroenterheerdt/HAsmartirrigation) (or equivalent sensors) for the bucket, ET and duration.
- A water meter with a `total_increasing` reading (recorder statistics) for the agate brief; a `total_increasing` rain gauge for the 24-h credit line.

## Installation (HACS)

1. HACS → Custom repositories → add this repo, category **Dashboard**
2. Install **Homestead Waterworks Card**
3. Add the card:

```yaml
type: custom:homestead-waterworks-card
meter_entity: sensor.water_meter_reading
today_entity: sensor.water_meter_water_today
month_entity: sensor.water_meter_water_this_month
flow_entity: sensor.water_meter_water_flow
rain_gauge_entity: sensor.rainfall_cumulative
irrigation:
  name: the front yard          # prints as ACCOUNT OF THE FRONT YARD
  zone: the drip                # how the copy refers to the system
  duration_entity: sensor.smart_irrigation_front_yard_drip        # seconds
  bucket_entity: sensor.smart_irrigation_front_yard_drip_bucket   # inches
  et_entity: sensor.smart_irrigation_front_yard_drip_et_value     # inches lost yesterday
  drainage_entity: sensor.smart_irrigation_front_yard_drip_current_drainage
  rain_entity: sensor.si_rain_forecast_24h
  skip_threshold: 0.1
  timer_entity: timer.front_yard_drip
  automation_entity: automation.front_yard_drip_weather_aware_watering
  interval_days: 5
valves: [valve.front_yard_drip, valve.zone_2, valve.zone_3, valve.zone_4, valve.zone_5, valve.zone_6]
contracted_valves: 1
overnight_entity: input_number.water_overnight_leak_gal
leak_entity: input_boolean.water_leak_detected
correspondents:
  - { name: Water heater, entity: binary_sensor.water_heater_leak_flood }
  - { name: RO filter, entity: binary_sensor.ro_filter_leak_flood }
  - { name: Kitchen sink, entity: binary_sensor.kitchen_kitchen_sink_leak_flood }
```

## Options

| Key | Default | Notes |
|---|---|---|
| `meter_entity` | required | `total_increasing` gallons; feeds the agate via statistics |
| `today_entity`, `month_entity`, `flow_entity` | `''` | Utility meters; flow in gal/min |
| `rain_gauge_entity` | `''` | `total_increasing` inches; 24-h credit + season figure |
| `irrigation.*` | see YAML | `name`, `zone`, `duration_entity` (s), `bucket_entity`, `et_entity`, `drainage_entity`, `rain_entity`, `skip_threshold`, `timer_entity`, `automation_entity`, `interval_days` |
| `valves`, `contracted_valves` | `[]`, `1` | Valve entities for the dispatch line |
| `correspondents` | `[]` | `[{name, entity}]` flood binary sensors |
| `overnight_entity`, `leak_entity` | `''` | Overnight gallons moved; house-wide leak flag (STOP PRESS) |
| `title`, `kicker`, `dek` | `THE WATERWORKS`, `GARDENS DESK`, account line | Copy furniture |
| `days`, `agate_tail`, `column_rule`, `footer` | `14`, request line, `false`, `''` | |

## Theming

Honors `--almanac-paper` (set `transparent` for a one-sheet newspaper look), `--almanac-column-rule`, `--almanac-gutter`, `--ha-card-border-radius` / `--ha-card-box-shadow`. The card remembers its rendered height per device and pins it across re-renders so phones don't jump.

## The plates

Versions ≤ 2026.9.3 led with a woodcut water-tower plate and a 14-day chart; that layout retired when the card refocused on the garden, but the five engraved plates remain in [`docs/plates/`](docs/plates) for anyone who wants them.
