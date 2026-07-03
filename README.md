# Personal Finance Tracker

A lightweight, private personal finance tracker: track your assets, watch your
net worth over time, and stay aligned with your financial goals.

No build step, no server, no accounts — open `index.html` in a browser and all
data stays in your browser's localStorage.

## Features

- **Assets** — add, edit, and delete assets across six categories (Cash,
  Investments, Retirement, Real estate, Crypto, Other), with per-asset share of
  total.
- **Net worth dashboard** — hero net-worth figure, 30-day change, and an
  interactive net-worth-over-time line chart. A snapshot is recorded every time
  you add or update an asset, so your history builds itself.
- **Asset allocation** — a stacked allocation bar with a value/percent legend.
- **Financial goals** — set a target amount, a target date, and the asset
  categories that count toward it. Each goal shows progress, an
  "expected-by-now" marker, an on-track / behind / off-track status, and the
  monthly amount needed to hit the target on time.
- **Export / import** — back up or move your data as JSON.
- **Light & dark theme** — follows your system preference, with a manual toggle.

## Getting started

1. Open `index.html` in any modern browser (or serve the folder:
   `python3 -m http.server` and visit `http://localhost:8000`).
2. Click **Load sample data** to explore, or **Add your first asset** to start
   fresh.

## How goal status works

When you create a goal, the tracker records your starting amount (the baseline)
and the creation date. It then interpolates linearly from the baseline to the
target amount over the goal's timeline:

- **Achieved** — current amount ≥ target.
- **On track** — you're at or above where the straight-line path says you
  should be today.
- **Behind** — within 85% of the expected amount.
- **Off track** — below 85% of expected, or the target date has passed.

The thin marker on each goal's progress bar shows the expected-by-now amount.

## Data & privacy

Everything is stored locally under the `pft-data-v1` localStorage key. Nothing
is sent anywhere. Use **Export** for backups — clearing browser storage clears
your data.
