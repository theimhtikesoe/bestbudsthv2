function roundCurrency(value) {
  return Number((value || 0).toFixed(2));
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const normalized = value.replace(/,/g, '').trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'amount')) {
      return toNumber(value.amount);
    }
    if (Object.prototype.hasOwnProperty.call(value, 'value')) {
      return toNumber(value.value);
    }
  }

  return 0;
}

function normalizeMoney(rawValue) {
  const divisor = Number(process.env.LOYVERSE_MONEY_DIVISOR || 1);
  let amount = toNumber(rawValue);

  if (Number.isFinite(divisor) && divisor > 1 && Number.isInteger(amount) && Math.abs(amount) >= divisor) {
    amount = amount / divisor;
  }

  return roundCurrency(amount);
}

function calculateExpectedCash({ opening_cash = 0, net_sale = 0 }) {
  return roundCurrency(toNumber(opening_cash) + toNumber(net_sale));
}

function calculateDifference({ actual_cash_counted = 0, expected_cash = 0 }) {
  return roundCurrency(toNumber(actual_cash_counted) - toNumber(expected_cash));
}

function calculateNetSale({ cash_total = 0, card_total = 0 }) {
  return roundCurrency(toNumber(cash_total) + toNumber(card_total));
}

function calculateReportValues(input) {
  const openingCash = toNumber(input.opening_cash);
  const cashTotal = toNumber(input.cash_total);
  const cardTotal = toNumber(input.card_total);
  const expense = toNumber(input.expense);
  const safeBoxAmount = toNumber(input.safe_box_amount);
  const actualCashCounted = toNumber(input.actual_cash_counted);
  const hasManualNetSale =
    input.net_sale !== undefined &&
    input.net_sale !== null &&
    String(input.net_sale).trim() !== '';

  const netSale = hasManualNetSale
    ? roundCurrency(toNumber(input.net_sale))
    : calculateNetSale({
        cash_total: cashTotal,
        card_total: cardTotal
      });

  const expectedCash = calculateExpectedCash({
    opening_cash: openingCash,
    net_sale: netSale
  });

  const outflowTotal = roundCurrency(safeBoxAmount + cardTotal + expense + actualCashCounted);
  const difference = roundCurrency(expectedCash - outflowTotal);

  return {
    opening_cash: roundCurrency(openingCash),
    cash_total: roundCurrency(cashTotal),
    card_total: roundCurrency(cardTotal),
    expense: roundCurrency(expense),
    safe_box_amount: roundCurrency(safeBoxAmount),
    actual_cash_counted: roundCurrency(actualCashCounted),
    expected_cash: expectedCash,
    difference,
    net_sale: netSale
  };
}

module.exports = {
  toNumber,
  normalizeMoney,
  calculateExpectedCash,
  calculateDifference,
  calculateNetSale,
  calculateReportValues,
  roundCurrency
};
