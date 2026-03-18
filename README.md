# Daily POS Closing & Report System

Production-ready web application for daily store closing with Loyverse integration.

## Tech Stack

- Backend: Node.js + Express
- Database: PostgreSQL (Vercel managed) or MySQL
- Frontend: Bootstrap + Vanilla JS
- Charts: Chart.js

## Project Structure

```text
daily-pos-closing-report-system/
├── public/
│   ├── app.js
│   ├── index.html
│   └── styles.css
├── sql/
│   ├── schema.postgres.sql
│   └── schema.sql
├── src/
│   ├── config/
│   │   └── db.js
│   ├── controllers/
│   │   └── reportController.js
│   ├── jobs/
│   │   └── dailySyncJob.js
│   ├── middleware/
│   │   └── errorHandler.js
│   ├── routes/
│   │   └── apiRoutes.js
│   ├── services/
│   │   └── loyverseService.js
│   ├── utils/
│   │   └── calculations.js
│   └── server.js
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

## Features

- Date selector for daily report
- Sync sales totals from Loyverse receipts API by selected date
- Payment split totals: Cash and Card
- Auto-calculated:
  - Net Sale = Cash + Card
  - Expected Cash = Opening Cash + Net Sale
  - Difference = (Net Sale + Opening Cash) - (1K Bill Total + Card + Expense + Actual Cash Counted)
- Manual inputs:
  - Expense
  - Tip
  - 1,000 THB Bills (Qty)
  - Opening Cash
  - Actual Cash Counted
- Save or update daily report (upsert by date)
- Historical report list with date filters
- Last 7 days net sale chart
- Optional cron job for automatic daily sync at 23:59

## Database Schema

Run SQL from `sql/schema.postgres.sql` (PostgreSQL) or `sql/schema.sql` (MySQL), or let the app auto-create on startup.

Main table: `daily_reports` with fields:

- `id`
- `date` (unique)
- `net_sale`
- `cash_total`
- `card_total`
- `total_orders`
- `expense`
- `tip`
- `1k_qty`
- `1k_total`
- `safe_box_label`
- `safe_box_amount`
- `opening_cash`
- `actual_cash_counted`
- `expected_cash`
- `difference`
- `created_at`
- `updated_at`

## Environment Variables

Copy `.env.example` to `.env` and update values:

```bash
cp .env.example .env
```

Required keys:

- `DATABASE_URL` (for PostgreSQL mode, recommended on Vercel)
- OR MySQL keys:
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_AUTO_INIT` (`true` to auto-create schema on startup)
- `DB_REQUIRE_ON_STARTUP` (`true` to fail-fast if DB is unreachable on boot)
- `LOYVERSE_API_TOKEN`

Optional:

- `LOYVERSE_API_BASE_URL` (default `https://api.loyverse.com/v1.0`)
- `LOYVERSE_MONEY_DIVISOR` (default `1`; set to `100` only if your API returns minor units)
- `LOYVERSE_TIMEZONE` (default `Asia/Bangkok` for date-range sync accuracy)
- `AUTO_SYNC_ENABLED` (`true`/`false`)
- `AUTO_SYNC_TIME` (cron expression, default `59 23 * * *`)

## Install & Run

```bash
npm install
npm run dev
```

App URL:

- `http://localhost:4000`

## API Endpoints

- `GET /api/health`
- `GET /api/loyverse/sync?date=YYYY-MM-DD`
- `POST /api/reports`
- `GET /api/reports?from=YYYY-MM-DD&to=YYYY-MM-DD`
- `GET /api/reports/:date`
- `GET /api/reports/last-7/net-sales`

`GET /api/loyverse/sync` response:

- `date`
- `cash_total`
- `card_total`
- `net_sale`
- `total_orders`
- `unclassified_amount`
- `cash_entries` (array of cash payment amounts)
- `card_entries` (array of card payment amounts)
- `total_discount`
- `discount_entries` (array of discount amounts)
- `discount_entry_details` (array of `{ amount, percentage }`)

## Security Notes

- Loyverse API token is server-side only (`.env`), never exposed to browser.
- Basic request validation for date and numeric values.
- Centralized API error handling.

## Cron Auto-Sync (Optional)

Set in `.env`:

```env
AUTO_SYNC_ENABLED=true
AUTO_SYNC_TIME=59 23 * * *
```

## Vercel + Managed Postgres

For Vercel deployment, set:

- `DATABASE_URL` (provided by Vercel DB integration)
- `DB_AUTO_INIT=true`
- `DB_REQUIRE_ON_STARTUP=false`
- Loyverse variables

Schema is auto-created when `DB_AUTO_INIT=true`.

If you want manual schema import:

```bash
psql "$DATABASE_URL" -f sql/schema.postgres.sql
```

When enabled, server will auto-sync today's Loyverse totals and upsert the current day report.

## PDF Export (Optional Extension)

Not included by default. Can be added with a separate endpoint using `pdfkit` or `puppeteer`.
