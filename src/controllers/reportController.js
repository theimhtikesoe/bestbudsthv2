const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { query, getDialect } = require('../config/db');

dayjs.extend(utc);
dayjs.extend(timezone);
const { fetchSalesSummaryByDate } = require('../services/loyverseService');
const { calculateReportValues, toNumber } = require('../utils/calculations');
const { calculatePeriodBusinessSummary } = require('../services/settlementService');

const isPostgres = getDialect() === 'postgres';

// SSE Clients
let clients = [];

/**
 * SSE middleware to handle real-time updates
 */
function eventsHandler(req, res) {
  const headers = {
    'Content-Type': 'text/event-stream',
    'Connection': 'keep-alive',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no' // Disable buffering for Nginx/Proxy
  };
  res.writeHead(200, headers);

  // Send a comment to keep connection alive
  res.write('retry: 10000\n\n');
  res.write(':ok\n\n');

  const clientId = Date.now();
  const newClient = {
    id: clientId,
    res
  };
  clients.push(newClient);

  req.on('close', () => {
    clients = clients.filter(client => client.id !== clientId);
  });
}

/**
 * Broadcast event to all connected clients
 */
function broadcast(data) {
  clients.forEach(client => client.res.write(`data: ${JSON.stringify(data)}\n\n`));
}
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

  const tz = process.env.LOYVERSE_TIMEZONE || 'Asia/Bangkok';
  const parsed = dayjs.tz(`${date} 00:00:00`, tz);
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
    
    // Auto-save/upsert to database
    const net_sale = toNumber(summary.net_sale);
    const cash_total = toNumber(summary.cash_total);
    const card_total = toNumber(summary.card_total);
    const transfer_total = toNumber(summary.transfer_total);
    const total_orders = toNumber(summary.total_orders);
    const total_grams = toNumber(summary.total_grams);
    const fb_total = toNumber(summary.fb_total);

    const values = [
      date, net_sale, cash_total, card_total, transfer_total,
      total_orders, total_grams, fb_total, 0, 0, 0, 0, '1K Bill', 0, 0, 0, 0, 0
    ];

    if (isPostgres) {
      await query(
        `INSERT INTO daily_reports (
          date, net_sale, cash_total, card_total, transfer_total,
          total_orders, total_grams, fb_total, expense, tip,
          ${oneKQtyColumn()}, ${oneKTotalColumn()}, safe_box_label,
          safe_box_amount, opening_cash, actual_cash_counted, expected_cash, difference
        ) VALUES (${placeholder(1)}, ${placeholder(2)}, ${placeholder(3)}, ${placeholder(4)}, ${placeholder(5)}, ${placeholder(6)}, ${placeholder(7)}, ${placeholder(8)}, ${placeholder(9)}, ${placeholder(10)}, ${placeholder(11)}, ${placeholder(12)}, ${placeholder(13)}, ${placeholder(14)}, ${placeholder(15)}, ${placeholder(16)}, ${placeholder(17)}, ${placeholder(18)})
        ON CONFLICT (date) DO UPDATE SET
          net_sale = EXCLUDED.net_sale,
          cash_total = EXCLUDED.cash_total,
          card_total = EXCLUDED.card_total,
          transfer_total = EXCLUDED.transfer_total,
          total_orders = EXCLUDED.total_orders,
          total_grams = EXCLUDED.total_grams,
          fb_total = EXCLUDED.fb_total`,
        values
      );
    } else {
      await query(
        `INSERT INTO daily_reports (
          date, net_sale, cash_total, card_total, transfer_total,
          total_orders, total_grams, fb_total, expense, tip,
          ${oneKQtyColumn()}, ${oneKTotalColumn()}, safe_box_label,
          safe_box_amount, opening_cash, actual_cash_counted, expected_cash, difference
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          net_sale = VALUES(net_sale),
          cash_total = VALUES(cash_total),
          card_total = VALUES(card_total),
          transfer_total = VALUES(transfer_total),
          total_orders = VALUES(total_orders),
          total_grams = VALUES(total_grams),
          fb_total = VALUES(fb_total)`,
        values
      );
    }

    broadcast({ type: 'REPORT', date, action: 'SYNC' });
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
    const reportList = Array.isArray(rows) ? rows : [];

    if (reportList.length === 0) {
      return res.status(404).json({ message: 'Report not found for this date' });
    }

    return res.json(reportList[0]);
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
    const transferTotal = toNumber(payload.transfer_total);
    const totalGrams = toNumber(payload.total_grams);
    const fbTotal = toNumber(payload.fb_total);

    const values = [
      payload.date,
      reportValues.net_sale,
      reportValues.cash_total,
      reportValues.card_total,
      transferTotal,
      totalOrders,
      totalGrams,
      fbTotal,
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
          transfer_total,
          total_orders,
          total_grams,
          fb_total,
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
        ) VALUES (${placeholder(1)}, ${placeholder(2)}, ${placeholder(3)}, ${placeholder(4)}, ${placeholder(5)}, ${placeholder(6)}, ${placeholder(7)}, ${placeholder(8)}, ${placeholder(9)}, ${placeholder(10)}, ${placeholder(11)}, ${placeholder(12)}, ${placeholder(13)}, ${placeholder(14)}, ${placeholder(15)}, ${placeholder(16)}, ${placeholder(17)}, ${placeholder(18)})
        ON CONFLICT (date) DO UPDATE SET
          net_sale = EXCLUDED.net_sale,
          cash_total = EXCLUDED.cash_total,
          card_total = EXCLUDED.card_total,
          transfer_total = EXCLUDED.transfer_total,
          total_orders = EXCLUDED.total_orders,
          total_grams = EXCLUDED.total_grams,
          fb_total = EXCLUDED.fb_total,
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

      broadcast({ type: 'REPORT_UPDATE', date: payload.date });
      return res.status(201).json(savedRows[0]);
    }

    await query(
      `INSERT INTO daily_reports (
        date,
        net_sale,
        cash_total,
        card_total,
        transfer_total,
        total_orders,
        total_grams,
        fb_total,
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        net_sale = VALUES(net_sale),
        cash_total = VALUES(cash_total),
        card_total = VALUES(card_total),
        transfer_total = VALUES(transfer_total),
        total_orders = VALUES(total_orders),
        total_grams = VALUES(total_grams),
        fb_total = VALUES(fb_total),
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

    broadcast({ type: 'REPORT_UPDATE', date: payload.date });
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
    return res.json(Array.isArray(rows) ? rows : []);
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
    const resultList = Array.isArray(rows) ? rows : [];

    return res.json(resultList.reverse());
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
    const resultList = Array.isArray(rows) ? rows : [];

    const summary = calculatePeriodBusinessSummary(
      resultList.map((row) => ({
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
      days: resultList.length,
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
    const { fetchClosedReceiptsByDate, filterOutRefundReceipts } = require('../services/loyverseService');

    // Get report data
    const reportRows = await query(
      `SELECT * FROM daily_reports WHERE date = ${placeholder(1)}`,
      [date]
    );
    const reportList = Array.isArray(reportRows) ? reportRows : [];
    const reportData = reportList[0];

    if (!reportData) {
      const error = new Error('Report not found');
      error.status = 404;
      throw error;
    }

    // Get receipts from Loyverse and filter out refunds
    const allReceipts = await fetchClosedReceiptsByDate(date);
    const receipts = filterOutRefundReceipts(allReceipts);
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

    // Get closing staff
    const staffRows = await query(
      `SELECT name FROM daily_staff WHERE date = ${placeholder(1)} ORDER BY created_at DESC`,
      [date]
    );
    const staffList = Array.isArray(staffRows) ? staffRows : [];
    const closingStaff = staffList.length > 0 ? staffList.map(s => s.name).join(', ') : 'N/A';

    const buffer = await generateExcelReport(date, reportData, receipts, expenses, closingStaff);

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

    console.log(`[EXPENSE] Saving expense for ${date}:`, { category, amount: expenseAmount });
    const result = await query(sql, [date, category, description || '', expenseAmount]);
    console.log(`[EXPENSE] Result:`, result);

    // Broadcast update
    broadcast({ type: 'EXPENSE_UPDATE', date });

    res.status(201).json({
      success: true,
      expense: isPostgres ? result[0] : { id: result.insertId, date, category, description, amount: expenseAmount }
    });
  } catch (error) {
    console.error(`[EXPENSE] Failed to save expense:`, error.message, error.stack);
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

    const rows = await query(`SELECT date FROM daily_expenses WHERE id = ${placeholder(1)}`, [id]);
    const resultList = Array.isArray(rows) ? rows : [];
    const date = resultList[0]?.date;

    await query(sql, [id]);

    if (date) {
      const formattedDate = dayjs(date).format('YYYY-MM-DD');
      broadcast({ type: 'EXPENSE_UPDATE', date: formattedDate });
    }

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
      expenses: Array.isArray(expenses) ? expenses : [],
      total: (Array.isArray(expenses) ? expenses : []).reduce((sum, e) => sum + toNumber(e.amount), 0)
    });
  } catch (error) {
    return next(error);
  }
}

/**
 * Add staff
 */
async function addStaff(req, res, next) {
  try {
    const { date, name } = req.body;
    validateDateOrThrow(date);

    if (!name) {
      const error = new Error('Name is required');
      error.status = 400;
      throw error;
    }

    const sql = isPostgres
      ? `INSERT INTO daily_staff (date, name) VALUES ($1, $2) RETURNING *`
      : `INSERT INTO daily_staff (date, name) VALUES (?, ?)`;
    
    console.log(`[STAFF] Saving staff for ${date}:`, { name });
    const result = await query(sql, [date, name]);
    console.log(`[STAFF] Result:`, result);

    broadcast({ type: 'STAFF_UPDATE', date });

    res.status(201).json({
      success: true,
      staff: isPostgres ? result[0] : { id: result.insertId, date, name }
    });
  } catch (error) {
    console.error(`[STAFF] Failed to save staff:`, error.message, error.stack);
    next(error);
  }
}

/**
 * Remove staff
 */
async function removeStaff(req, res, next) {
  try {
    const { id } = req.params;
    const rows = await query(`SELECT date FROM daily_staff WHERE id = ${placeholder(1)}`, [id]);
    const resultList = Array.isArray(rows) ? rows : [];
    const date = resultList[0]?.date;

    const sql = isPostgres
      ? `DELETE FROM daily_staff WHERE id = $1`
      : `DELETE FROM daily_staff WHERE id = ?`;
    
    await query(sql, [id]);

    if (date) {
      const formattedDate = dayjs(date).format('YYYY-MM-DD');
      broadcast({ type: 'STAFF_UPDATE', date: formattedDate });
    }

    res.json({ success: true, message: 'Staff deleted' });
  } catch (error) {
    next(error);
  }
}

/**
 * List staff for a date
 */
async function listStaff(req, res, next) {
  try {
    const { date } = req.params;
    validateDateOrThrow(date);

    const sql = isPostgres
      ? `SELECT * FROM daily_staff WHERE date = $1 ORDER BY created_at DESC`
      : `SELECT * FROM daily_staff WHERE date = ? ORDER BY created_at DESC`;

    const staff = await query(sql, [date]);

    res.json({
      date,
      staff: Array.isArray(staff) ? staff : []
    });
  } catch (error) {
    next(error);
  }
}

async function manualDbInit(req, res, next) {
  try {
    const { initializeSchema } = require('../config/db');
    await initializeSchema();
    res.json({ success: true, message: 'Database schema initialized successfully' });
  } catch (error) {
    console.error('[DB] Manual initialization failed:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
}

module.exports = {
  manualDbInit,
  eventsHandler,
  syncFromLoyverse,
  getReportByDate,
  upsertReport,
  listReports,
  getLast7DayNetSales,
  getReportsSummary,
  exportToExcel,
  addExpense,
  removeExpense,
  listExpenses,
  addStaff,
  removeStaff,
  listStaff
};
