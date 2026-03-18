const { roundCurrency, toNumber } = require('../utils/calculations');

function assertValidNumber(name, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be a valid number`);
  }
}

function normalizeTransaction(tx, index) {
  if (!tx || typeof tx !== 'object') {
    throw new Error(`transactions[${index}] must be an object`);
  }

  const type = String(tx.type || '').toLowerCase();
  if (type !== 'cash' && type !== 'card') {
    throw new Error(`transactions[${index}].type must be "cash" or "card"`);
  }

  const amount = toNumber(tx.amount);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`transactions[${index}].amount must be a non-negative number`);
  }

  return { type, amount };
}

function buildSettlementResult({ openingCash, cashSales, cardSales, expenses }) {
  const totalRevenue = roundCurrency(cashSales + cardSales);
  const expectedClosingCash = roundCurrency(openingCash + cashSales - expenses);

  return {
    cashSales: roundCurrency(cashSales),
    cardSales: roundCurrency(cardSales),
    totalRevenue,
    expectedClosingCash
  };
}

function calculatePeriodBusinessSummary(days) {
  if (!Array.isArray(days)) {
    throw new Error('days must be an array');
  }

  const totals = days.reduce(
    (acc, day, index) => {
      if (!day || typeof day !== 'object') {
        throw new Error(`days[${index}] must be an object`);
      }

      const cashSales = toNumber(day.cashSales ?? day.cash_total);
      const cardSales = toNumber(day.cardSales ?? day.card_total);
      const expenses = toNumber(day.expenses ?? day.expense);
      const tips = toNumber(day.tips ?? day.tip);
      const safeBoxAmount = toNumber(day.safeBoxAmount ?? day.safe_box_amount);

      if (cashSales < 0 || cardSales < 0 || expenses < 0 || tips < 0 || safeBoxAmount < 0) {
        throw new Error(`days[${index}] values must be non-negative`);
      }

      acc.cashTotal += cashSales;
      acc.cardTotal += cardSales;
      acc.expenseTotal += expenses;
      acc.tipsTotal += tips;
      acc.safeBoxTotal += safeBoxAmount;
      return acc;
    },
    { cashTotal: 0, cardTotal: 0, expenseTotal: 0, tipsTotal: 0, safeBoxTotal: 0 }
  );

  const revenueTotal = roundCurrency(totals.cashTotal + totals.cardTotal);
  const netRevenueAfterExpense = roundCurrency(revenueTotal - totals.expenseTotal);

  return {
    cashTotal: roundCurrency(totals.cashTotal),
    cardTotal: roundCurrency(totals.cardTotal),
    revenueTotal,
    expenseTotal: roundCurrency(totals.expenseTotal),
    netRevenueAfterExpense,
    tipsTotal: roundCurrency(totals.tipsTotal),
    safeBoxTotal: roundCurrency(totals.safeBoxTotal)
  };
}

function calculateDailySettlement({ openingCash, transactions, expenses }) {
  assertValidNumber('openingCash', openingCash);
  assertValidNumber('expenses', expenses);

  if (!Array.isArray(transactions)) {
    throw new Error('transactions must be an array');
  }

  const totals = transactions
    .map(normalizeTransaction)
    .reduce(
      (acc, tx) => {
        if (tx.type === 'cash') {
          acc.cashSales += tx.amount;
        } else {
          acc.cardSales += tx.amount;
        }
        return acc;
      },
      { cashSales: 0, cardSales: 0 }
    );

  return buildSettlementResult({
    openingCash,
    cashSales: totals.cashSales,
    cardSales: totals.cardSales,
    expenses
  });
}

async function calculateDailySettlementFromLoyverse({ date, openingCash, expenses }) {
  if (!date) {
    throw new Error('date is required (YYYY-MM-DD)');
  }

  assertValidNumber('openingCash', openingCash);
  assertValidNumber('expenses', expenses);

  const { fetchSalesSummaryByDate } = require('./loyverseService');
  const salesSummary = await fetchSalesSummaryByDate(date);

  return buildSettlementResult({
    openingCash,
    cashSales: toNumber(salesSummary.cash_total),
    cardSales: toNumber(salesSummary.card_total),
    expenses
  });
}

module.exports = {
  calculateDailySettlement,
  calculateDailySettlementFromLoyverse,
  calculatePeriodBusinessSummary
};
