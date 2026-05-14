# clima-registro

Lightweight online meteorological logging and monitoring system.

The project is a personal, independent weather log. It has no business, commerce, ads, analytics, tracking pixels, store features, or brand integrations.

## Features

- Email/password login with Supabase Auth
- Manual weather observations by region and location
- Online PostgreSQL storage through Supabase
- Current weather fetch from Open-Meteo
- Daily automatic collection with GitHub Actions
- Dashboard summaries, history filters, and simple charts
- In-app heuristic alerts for frost risk, heavy rain, pressure drops, cold front signals, and high wind
- CSV export/import backup
- Plain TypeScript, plain CSS, desktop-first and mobile-friendly

## Tech Stack

- Vite
- TypeScript
- Plain CSS
- Supabase Auth and PostgreSQL
- Open-Meteo API
- Chart.js
- GitHub Actions
- GitHub Pages

There is no backend server in version 1. The browser uses the Supabase anon key. The scheduled collector uses a Supabase service role key only inside GitHub Actions secrets.

## Supabase Setup

1. Create a Supabase project.
2. In Supabase, open **Authentication > Providers > Email**.
3. Enable email/password authentication.
4. Open **SQL Editor**.
5. Run the full SQL in `src/sql/schema.sql`.
6. Confirm Row Level Security is enabled on:
   - `profiles`
   - `regions`
   - `locations`
   - `weather_records`
   - `alert_rules`
   - `alert_events`

The schema includes policies so users can select, insert, update, and delete only their own rows. The GitHub Action uses the service role key, which bypasses RLS, so the collector must always insert `user_id` from the location owner. The script does that explicitly.

## Database Setup

`src/sql/schema.sql` creates:

- `profiles`
- `regions`
- `locations`
- `weather_records`
- `alert_rules`
- `alert_events`

It also creates indexes for weather records, locations, regions, and alert events, plus update timestamp triggers and a profile creation trigger for new auth users.

## Environment Variables

Create a local `.env` file from `.env.example`.

Browser variables:

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Use these only in frontend code. They are safe for browser use when RLS is configured correctly.

GitHub Actions collector variables:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Add these as GitHub repository secrets. Never expose `SUPABASE_SERVICE_ROLE_KEY` in frontend code, `.env`, screenshots, commits, or GitHub Pages.

## Local Development

```bash
npm install
npm run dev
```

Open the local Vite URL shown in the terminal.

After first login, if the user has no locations, the app creates:

- Region: `Centro Serra / RS`
- Region: `Serra da Mantiqueira / SP`
- Location: `Sobradinho/RS`
- Location: `Campos do Jordão/SP`

## Build

```bash
npm run build
npm run preview
```

## GitHub Pages Deploy

`.github/workflows/deploy.yml` builds the app and deploys `dist` to GitHub Pages on every push to `main`.

The Vite config currently uses:

```ts
base: '/clima-registro/'
```

If the repository name changes, update `vite.config.ts` to match the new repository path.

To enable Pages:

1. Push the repository to GitHub.
2. Open **Settings > Pages**.
3. Use **GitHub Actions** as the source.
4. Push to `main`.

## Daily Weather Collection

`.github/workflows/collect-weather.yml` runs daily at `12:00 UTC`, which is about `09:00` Brazil time, and also supports manual `workflow_dispatch`.

Add repository secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

The workflow runs:

```bash
npm run collect:weather
```

If the GitHub repository secrets are not configured yet, the workflow skips collection and finishes without failing. After `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are added, the same workflow starts collecting normally.

The script:

- Selects active locations where `collect_daily = true`
- Calls Open-Meteo current weather API
- Inserts `weather_records`
- Sets `user_id`, `location_id`, and `region_id`
- Avoids duplicate Open-Meteo automatic records for the same location and local date
- Runs alert detection after insertion
- Inserts `alert_events` when rules trigger

## Alerts

Alerts are simple heuristics, not official warnings.

- Frost risk: temperature `<= 3 °C`
- Heavy rain: precipitation `>= 20 mm`
- Pressure drop: latest pressure drops `>= 5 hPa` from previous record
- Cold front signal: temperature drops `>= 5 °C` and pressure changes `>= 4 hPa`
- High wind: wind `>= 40 km/h`

Severity levels:

- `baixa`
- `média`
- `alta`
- `crítica`

The app shows this note in the interface:

> Alertas gerados por regras simples do sistema. Não substituem avisos oficiais de órgãos meteorológicos.

## CSV Backup

The Backup CSV screen can:

- Export all user records
- Export currently filtered records
- Import records from CSV
- Validate rows
- Generate IDs when missing
- Skip duplicate records already present in the app

Recommended habit: export CSV periodically even though records are stored online.

## Collaboration

This repository includes:

- `CONTRIBUTING.md` for contribution guidelines
- `CODE_OF_CONDUCT.md` for community expectations
- `SECURITY.md` for sensitive reports
- GitHub issue templates for bugs and feature requests
- A pull request template

Before making the repository public, choose a license. For broad open-source collaboration, common options are MIT, Apache-2.0, or GPL-3.0.

## Current Limitations

- No official meteorological warning source integration
- No server-side API layer
- CSV import is intentionally simple and expects known locations or location IDs
- Alert rules are stored in the database, but version 1 focuses on built-in heuristic alerts
- Open-Meteo current data is point-based by coordinates, not a full station network

## Roadmap

- Alert rule editor UI
- Better CSV templates and import preview
- More historical Open-Meteo backfill options
- Region-level rollups
- Public read-only dashboards
- Optional station/source metadata
- Offline-first local cache
