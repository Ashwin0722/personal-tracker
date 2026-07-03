# Build Prompt — Personal Finance Tracker v2

> The definitive specification for this app, assembled from a requirements
> interview on 2026-07-03. Hand this whole document to an engineer (or an AI
> agent) as the build instruction. A v1 baseline already exists in this repo
> (assets, net worth trend, allocation, goals) — v2 extends it; don't rebuild
> from scratch.

## Product vision

A private, local-first personal finance tracker for a single user. It answers
three questions at a glance: **What am I worth? Where is it? Am I on pace for
my goals?** The user feeds it monthly PDF statements from their bank,
Robinhood, and E*Trade, plus occasional manual edits; the app does the rest.

## Hard constraints

- **Local web app, no server.** Opens from `index.html` (or any static file
  server). No login, no accounts, no backend, no build step required to run.
- **Privacy:** all data stays in the browser (localStorage; move bulky
  statement/transaction data to IndexedDB if needed). The ONLY network calls
  allowed are read-only price quotes. PDF parsing happens entirely client-side.
- **No paid services, no API keys.** Prices come from free, keyless endpoints.
- **Currency: USD.** Locale `en-US`.
- Vanilla JS preferred; vendored libraries are fine where they earn their
  weight (pdf.js for statement parsing, nothing heavier).

## Data model

- **Asset**: name, category (Cash / Investments / Retirement / Real estate /
  Crypto / Other), value. Optionally a **holding**: ticker or coin id +
  quantity, in which case value = quantity × latest price.
- **Liability**: name, type (mortgage / loan / credit card / other), balance,
  APR, monthly payment — enough for amortized payoff projection.
- **Transaction**: date, description, amount, direction (income/expense),
  source account, import batch id.
- **Recurring contribution**: label, amount/month, target asset or category.
- **Goal**: name, target amount, target date, linked categories (or all),
  baseline amount + created date, ordered **milestones** (label, amount).
  Goal types: accumulation (reach $X) and payoff (liability to $0).
- **Snapshot**: date + total assets + total liabilities (net worth history).
- Everything is exportable/importable as one JSON file.

## Features

### 1. Net worth (extend v1)
Net worth = total assets − total liabilities. Keep the v1 hero figure, 30-day
delta, and interactive trend line; the trend now plots net worth, with assets
and liabilities available as a breakdown (two separate small charts or an
indexed view — never a dual-axis chart).

### 2. Live prices (free, keyless)
Holdings with a ticker/coin id get quotes: crypto from CoinGecko's public API,
stocks/ETFs from a free keyless endpoint (best-effort; e.g. Stooq CSV).
Manual "Refresh prices" button + auto-refresh on load, cached with a visible
"as of" timestamp. Offline or API failure degrades gracefully to the last
known price — never block the UI, never lose data.

### 3. PDF statement import — fully automatic
Drag-and-drop one or more PDF statements. Parse client-side with pdf.js.
Recognize and extract:
- **Bank statements**: closing balance, transactions (date, description,
  amount) → updates the linked cash asset and appends transactions.
- **Robinhood / E*Trade statements**: account value, positions (symbol,
  quantity, price) → updates/creates holdings.

Apply changes **automatically** (per the owner's explicit choice), with two
safety valves: every import writes an **import log entry** (file name, what
changed, before/after) and offers **one-click undo of the whole batch**; a
statement that can't be confidently parsed falls back to a review table
instead of guessing. Duplicate detection: re-importing the same statement is
a no-op.

### 4. Cash-flow summary (derived, not budgeted)
From imported transactions: monthly income vs spending vs **savings rate**,
shown as a monthly bar view with a savings-rate line beneath the net worth
chart. No category budgets, no envelope system. Savings rate feeds goal
projections as the default contribution estimate.

### 5. Liabilities & payoff
CRUD for liabilities. From balance + APR + payment, compute payoff date and
total interest; "debt-free by X" is a goal type whose progress is the
shrinking balance.

### 6. Goals: status vs time + milestones + timeline
Keep v1's model: baseline→target linear expectation, expected-by-now marker
on the meter, statuses Achieved / On track / Behind (≥85% of expected) / Off
track, and $/month needed. Add:
- **Milestones**: ordered checkpoints per goal (e.g. "first $10k"), shown as
  ticks on the meter and checked off automatically as current value passes them.
- **Timeline view**: all goals and their milestones on one horizontal time
  axis from today to the furthest target date, so pacing conflicts are visible.
- **Recurring contributions** roll into a simple projection line per goal:
  "at your planned $X/mo you'll reach this goal by ~DATE" (straight-line, no
  return assumptions unless a growth rate is set per goal).

### 7. Retained from v1
Asset CRUD + allocation stacked bar with legend, sample data, JSON
export/import, light/dark theme, localStorage persistence.

## Design & dataviz rules (already validated in v1 — keep them)

- Reference palette in `css/style.css`; categorical colors are fixed per
  category and never repainted. Palette is validator-passing in both themes.
- One y-axis per chart, thin marks (2px lines, ≤24px bars, 2px surface gaps),
  hairline solid gridlines, hero figure in the system sans.
- Every chart: hover tooltip (crosshair on lines, per-mark on bars), keyboard
  access, and a table view so no value is tooltip-gated. Status is never
  color-alone (icon + label).

## Acceptance criteria

1. Drop a real Robinhood PDF → positions update, import appears in the log,
   undo restores the prior state exactly.
2. A holding with 10 shares of an ETF shows a $ value with an "as of" time;
   with the network blocked the app still loads and shows the cached value.
3. Adding a $200k mortgage at 6% with a $1,400 payment shows a payoff date
   and makes net worth = assets − 200k.
4. A goal with milestones shows ticks on its meter, and the timeline view
   places all goals correctly by date.
5. Monthly cash-flow bars and savings rate appear after importing two
   consecutive bank statements.
6. Export → clear storage → import restores everything, including
   transactions and the import log.
7. No network requests other than price quotes (verify in devtools).
8. Both themes render correctly; all v1 functionality still works.
