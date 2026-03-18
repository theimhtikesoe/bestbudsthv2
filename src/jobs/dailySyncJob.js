const cron = require('node-cron');
const dayjs = require('dayjs');
const { query, getDialect } = require('../config/db');
const { fetchSalesSummaryByDate } = require('../services/loyverseService');
const { calculateReportValues, toNumber } = require('../utils/calculations');

const isPostgres = getDialect() === 'postgres';
const ONE_K_BILL_AMOUNT = 1000;

function placeholder(index) {
  return isPostgres ? `$${index}` : '?';
}

function oneKQtyColumn() {
  return isPostgres ? '"1k_qty"' : '`1k_qty`';
}

function oneKTotalColumn() {
  return isPostgres ? '"1k_total"' : '`1k_total`';
}

function isAutoSyncEnabled() {
  return String(process.env.AUTO_SYNC_ENABLED || 'false').toLowerCase() === 'true';
}

function normalizeSafeBoxLabel(value) {
  const normalized = String(value ?? '').trim();
  return normalized || '1K Bill';
}

function toNonNegativeInteger(value) {
  const parsed = Math.floor(toNumber(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function roundCurrency(value) {
  return Number(toNumber(value).toFixed(2));
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

async function resolveOpeningCashForDate(date, currentReportOpeningCash) {
  if (hasValue(currentReportOpeningCash)) {
    return roundCurrency(toNumber(currentReportOpeningCash));
  }

  const rows = await query(
    `SELECT actual_cash_counted, expected_cash
     FROM daily_reports
     WHERE date < ${placeholder(1)}
     ORDER BY date DESC
     LIMIT 1`,
    [date]
  );

  const previous = rows[0];
  if (!previous) {
    return 0;
  }

  if (hasValue(previous.actual_cash_counted)) {
    return roundCurrency(toNumber(previous.actual_cash_counted));
  }

  if (hasValue(previous.expected_cash)) {
    return roundCurrency(toNumber(previous.expected_cash));
  }

  return 0;
}

async function runDailySync() {
  const today = dayjs().format('YYYY-MM-DD');
  const sales = await fetchSalesSummaryByDate(today);

  const existing = await query(`SELECT * FROM daily_reports WHERE date = ${placeholder(1)}`, [today]);
  const existingReport = existing[0] || {};
  const openingCash = await resolveOpeningCashForDate(today, existingReport.opening_cash);

  const calculated = calculateReportValues({
    opening_cash: openingCash,
    cash_total: sales.cash_total,
    card_total: sales.card_total,
    expense: toNumber(existingReport.expense),
    safe_box_amount: toNumber(existingReport.safe_box_amount),
    actual_cash_counted: toNumber(existingReport.actual_cash_counted)
  });

  const values = [
    today,
    calculated.net_sale,
    calculated.cash_total,
    calculated.card_total,
    sales.total_orders,
    toNumber(existingReport.expense),
    toNumber(existingReport.tip),
    toNonNegativeInteger(existingReport['1k_qty']),
    roundCurrency(
      toNonNegativeInteger(existingReport['1k_qty']) * ONE_K_BILL_AMOUNT
    ),
    normalizeSafeBoxLabel(existingReport.safe_box_label),
    toNumber(existingReport.safe_box_amount),
    openingCash,
    toNumber(existingReport.actual_cash_counted),
    calculated.expected_cash,
    calculated.difference
  ];

  if (isPostgres) {
    await query(
      `INSERT INTO daily_reports (
        date,
        net_sale,
        cash_total,
        card_total,
        total_orders,
        expense,
        tip,
        ${oneKQtyColumn()},
        ${oneKTotalColumn()},
        safe_box_label,
        safe_box_amount,
        opening_cash,
        actual_cash_counted,
        expected_cash,
        difference
      ) VALUES (${placeholder(1)}, ${placeholder(2)}, ${placeholder(3)}, ${placeholder(4)}, ${placeholder(5)}, ${placeholder(6)}, ${placeholder(7)}, ${placeholder(8)}, ${placeholder(9)}, ${placeholder(10)}, ${placeholder(11)}, ${placeholder(12)}, ${placeholder(13)}, ${placeholder(14)}, ${placeholder(15)})
      ON CONFLICT (date) DO UPDATE SET
        net_sale = EXCLUDED.net_sale,
        cash_total = EXCLUDED.cash_total,
        card_total = EXCLUDED.card_total,
        total_orders = EXCLUDED.total_orders,
        expense = EXCLUDED.expense,
        tip = EXCLUDED.tip,
        ${oneKQtyColumn()} = EXCLUDED.${oneKQtyColumn()},
        ${oneKTotalColumn()} = EXCLUDED.${oneKTotalColumn()},
        safe_box_label = EXCLUDED.safe_box_label,
        safe_box_amount = EXCLUDED.safe_box_amount,
        opening_cash = EXCLUDED.opening_cash,
        actual_cash_counted = EXCLUDED.actual_cash_counted,
        expected_cash = EXCLUDED.expected_cash,
        difference = EXCLUDED.difference,
        updated_at = CURRENT_TIMESTAMP`,
      values
    );
    return;
  }

  await query(
    `INSERT INTO daily_reports (
      date,
      net_sale,
      cash_total,
      card_total,
      total_orders,
      expense,
      tip,
      ${oneKQtyColumn()},
      ${oneKTotalColumn()},
      safe_box_label,
      safe_box_amount,
      opening_cash,
      actual_cash_counted,
      expected_cash,
      difference
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      net_sale = VALUES(net_sale),
      cash_total = VALUES(cash_total),
      card_total = VALUES(card_total),
      total_orders = VALUES(total_orders),
      expense = VALUES(expense),
      tip = VALUES(tip),
      ${oneKQtyColumn()} = VALUES(${oneKQtyColumn()}),
      ${oneKTotalColumn()} = VALUES(${oneKTotalColumn()}),
      safe_box_label = VALUES(safe_box_label),
      safe_box_amount = VALUES(safe_box_amount),
      opening_cash = VALUES(opening_cash),
      actual_cash_counted = VALUES(actual_cash_counted),
      expected_cash = VALUES(expected_cash),
      difference = VALUES(difference),
      updated_at = CURRENT_TIMESTAMP`,
    values
  );
}

function scheduleDailySyncJob() {
  if (!isAutoSyncEnabled()) {
    return null;
  }

  const cronExpression = process.env.AUTO_SYNC_TIME || '59 23 * * *';

  if (!cron.validate(cronExpression)) {
    throw new Error(`Invalid AUTO_SYNC_TIME cron expression: ${cronExpression}`);
  }

  const task = cron.schedule(cronExpression, async () => {
    try {
      await runDailySync();
      console.log('[Cron] Daily sync completed successfully');
    } catch (error) {
      console.error('[Cron] Daily sync failed:', error.message);
    }
  });

  console.log(`[Cron] Daily sync scheduled with expression: ${cronExpression}`);
  return task;
}

module.exports = {
  scheduleDailySyncJob,
  runDailySync
};
