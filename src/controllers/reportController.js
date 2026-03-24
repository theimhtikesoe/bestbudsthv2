const dayjs = require('dayjs');
const { query, getDialect } = require('../config/db');
const { fetchSalesSummaryByDate } = require('../services/loyverseService');
const { calculateReportValues, toNumber } = require('../utils/calculations');
const { calculatePeriodBusinessSummary } = require('../services/settlementService');

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

function isValidDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return false;
  }

  const parsed = dayjs(`${date}T00:00:00`);
  return parsed.isValid() && parsed.format('YYYY-MM-DD') === date;
}

function validateDateOrThrow(date) {
  if (!date || !isValidDate(date)) {
    const error = new Error('Invalid date format. Use YYYY-MM-DD.');
    error.status = 400;
    throw error;
  }
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

async function syncFromLoyverse(req, res, next) {
  try {
    const { date } = req.query;
    validateDateOrThrow(date);

    const summary = await fetchSalesSummaryByDate(date);
    res.json(summary);
  } catch (error) {
    next(error);
  }
}

async function getReportByDate(req, res, next) {
  try {
    const { date } = req.params;
    validateDateOrThrow(date);

    const rows = await query(`SELECT * FROM daily_reports WHERE date = ${placeholder(1)}`, [date]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Report not found for this date' });
    }

    return res.json(rows[0]);
  } catch (error) {
    return next(error);
  }
}

async function upsertReport(req, res, next) {
  try {
    const payload = req.body || {};
    validateDateOrThrow(payload.date);

    const totalOrders = Number.isInteger(Number(payload.total_orders)) ? Number(payload.total_orders) : 0;
    if (totalOrders < 0) {
      const error = new Error('total_orders cannot be negative');
      error.status = 400;
      throw error;
    }

    const reportValues = calculateReportValues(payload);
    const tip = toNumber(payload.tip);
    const safeBoxLabel = normalizeSafeBoxLabel(payload.safe_box_label);
    const oneKQty = toNonNegativeInteger(payload['1k_qty']);
    const oneKTotal = roundCurrency(oneKQty * ONE_K_BILL_AMOUNT);

    const values = [
      payload.date,
      reportValues.net_sale,
      reportValues.cash_total,
      reportValues.card_total,
      totalOrders,
      reportValues.expense,
      tip,
      oneKQty,
      oneKTotal,
      safeBoxLabel,
      reportValues.safe_box_amount,
      reportValues.opening_cash,
      reportValues.actual_cash_counted,
      reportValues.expected_cash,
      reportValues.difference
    ];

    if (isPostgres) {
      const savedRows = await query(
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
          updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        values
      );

      return res.status(201).json(savedRows[0]);
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

    const savedRows = await query(`SELECT * FROM daily_reports WHERE date = ${placeholder(1)}`, [payload.date]);
    return res.status(201).json(savedRows[0]);
  } catch (error) {
    return next(error);
  }
}

async function listReports(req, res, next) {
  try {
    const { from, to } = req.query;
    const requestedLimit = Number(req.query.limit || 100);
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.floor(requestedLimit), 500)
        : 100;

    const conditions = [];
    const params = [];
    let index = 1;

    if (from) {
      validateDateOrThrow(from);
      conditions.push(`date >= ${placeholder(index)}`);
      params.push(from);
      index += 1;
    }

    if (to) {
      validateDateOrThrow(to);
      conditions.push(`date <= ${placeholder(index)}`);
      params.push(to);
      index += 1;
    }

    let sql = 'SELECT * FROM daily_reports';
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ` ORDER BY date DESC LIMIT ${placeholder(index)}`;
    params.push(limit);

    const rows = await query(sql, params);
    return res.json(rows);
  } catch (error) {
    return next(error);
  }
}

async function getLast7DayNetSales(req, res, next) {
  try {
    const rows = await query(
      `SELECT date, net_sale
       FROM daily_reports
       ORDER BY date DESC
       LIMIT 7`
    );

    return res.json(rows.reverse());
  } catch (error) {
    return next(error);
  }
}

async function getReportsSummary(req, res, next) {
  try {
    const { from, to } = req.query;
    const conditions = [];
    const params = [];
    let index = 1;

    if (from) {
      validateDateOrThrow(from);
      conditions.push(`date >= ${placeholder(index)}`);
      params.push(from);
      index += 1;
    }

    if (to) {
      validateDateOrThrow(to);
      conditions.push(`date <= ${placeholder(index)}`);
      params.push(to);
      index += 1;
    }

    let sql = 'SELECT date, cash_total, card_total, transfer_total, net_sale, expense, tip, safe_box_amount FROM daily_reports';
    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }
    sql += ' ORDER BY date ASC';

    const rows = await query(sql, params);

    const summary = calculatePeriodBusinessSummary(
      rows.map((row) => ({
        cashSales: toNumber(row.cash_total),
        cardSales: toNumber(row.card_total),
        transferSales: toNumber(row.transfer_total),
        netSales: toNumber(row.net_sale),
        expenses: toNumber(row.expense),
        tips: toNumber(row.tip),
        safeBoxAmount: toNumber(row.safe_box_amount)
      }))
    );

    return res.json({
      from: from || null,
      to: to || null,
      days: rows.length,
      ...summary
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Export report to Excel
 */
async function exportToExcel(req, res, next) {
  try {
    const { date } = req.params;
    validateDateOrThrow(date);

    const { generateExcelReport } = require('../services/excelExportService');
    const { classifyItems } = require('../services/itemClassifier');
    const { fetchClosedReceiptsByDate } = require('../services/loyverseService');

    // Get report data
    const reportRows = await query(
      `SELECT * FROM daily_reports WHERE date = ${placeholder(1)}`,
      [date]
    );
    const reportData = reportRows[0];

    if (!reportData) {
      const error = new Error('Report not found');
      error.status = 404;
      throw error;
    }

    // Get receipts from Loyverse
    const receipts = await fetchClosedReceiptsByDate(date);
    const classifiedReceipts = classifyItems(receipts);

    //     // Get expenses from query param (if provided by frontend LocalStorage)
    let expenses = [];
    if (req.query.expenses) {
      try {
        expenses = JSON.parse(req.query.expenses);
      } catch (e) {
        console.error('Error parsing expenses from query:', e);
      }
    } else {
      // Fallback to database if no query param
      expenses = await query(
        `SELECT * FROM daily_expenses WHERE date = ${placeholder(1)} ORDER BY created_at DESC`,
        [date]
      );
    }

    const buffer = await generateExcelReport(date, reportRows[0], receipts, expenses);

    // Send file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Daily-Report-${date}.xlsx"`);
    res.send(buffer);
  } catch (error) {
    return next(error);
  }
}

/**
 * Add expense
 */
async function addExpense(req, res, next) {
  try {
    const { date, category, description, amount } = req.body;

    validateDateOrThrow(date);

    if (!category || !amount) {
      const error = new Error('Category and amount are required');
      error.status = 400;
      throw error;
    }

    const expenseAmount = toNumber(amount);
    if (expenseAmount < 0) {
      const error = new Error('Amount must be non-negative');
      error.status = 400;
      throw error;
    }

    const sql = isPostgres
      ? `INSERT INTO daily_expenses (date, category, description, amount, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING *`
      : `INSERT INTO daily_expenses (date, category, description, amount, created_at) VALUES (?, ?, ?, ?, NOW())`;

    // Ensure daily_report exists for this date due to foreign key constraint
    const existingReport = await query(`SELECT date FROM daily_reports WHERE date = ${placeholder(1)}`, [date]);
    if (existingReport.length === 0) {
      // Create a skeleton report if it doesn't exist
      const insertSql = isPostgres 
        ? `INSERT INTO daily_reports (date) VALUES ($1) ON CONFLICT (date) DO NOTHING`
        : `INSERT IGNORE INTO daily_reports (date) VALUES (?)`;
      await query(insertSql, [date]);
    }

    const result = await query(sql, [date, category, description || '', expenseAmount]);

    res.status(201).json({
      success: true,
      expense: result[0]
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Remove expense
 */
async function removeExpense(req, res, next) {
  try {
    const { id } = req.params;

    const sql = isPostgres
      ? `DELETE FROM daily_expenses WHERE id = $1 RETURNING *`
      : `DELETE FROM daily_expenses WHERE id = ?`;

    await query(sql, [id]);

    res.json({ success: true, message: 'Expense deleted' });
  } catch (error) {
    return next(error);
  }
}

/**
 * List expenses for a date
 */
async function listExpenses(req, res, next) {
  try {
    const { date } = req.params;
    validateDateOrThrow(date);

    const sql = isPostgres
      ? `SELECT * FROM daily_expenses WHERE date = $1 ORDER BY created_at DESC`
      : `SELECT * FROM daily_expenses WHERE date = ? ORDER BY created_at DESC`;

    const expenses = await query(sql, [date]);

    res.json({
      date,
      expenses,
      total: expenses.reduce((sum, e) => sum + toNumber(e.amount), 0)
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  syncFromLoyverse,
  getReportByDate,
  upsertReport,
  listReports,
  getLast7DayNetSales,
  getReportsSummary,
  exportToExcel,
  addExpense,
  removeExpense,
  listExpenses
};
