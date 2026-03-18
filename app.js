const els = {
  message: document.getElementById('message'),
  reportDate: document.getElementById('reportDate'),
  transferTotal: document.getElementById('transferTotal'),
  reportSection: document.getElementById('reportSection'),
  loadButton: document.getElementById('loadButton'),
  syncButton: document.getElementById('syncButton'),
  saveButton: document.getElementById('saveButton'),
  printButton: document.getElementById('printButton'),
  downloadImageButton: document.getElementById('downloadImageButton'),
  downloadPdfButton: document.getElementById('downloadPdfButton'),
  filterReports: document.getElementById('filterReports'),
  fromDate: document.getElementById('fromDate'),
  toDate: document.getElementById('toDate'),
  cashTotal: document.getElementById('cashTotal'),
  cardTotal: document.getElementById('cardTotal'),
  totalOrders: document.getElementById('totalOrders'),
  netSale: document.getElementById('netSale'),
  expense: document.getElementById('expense'),
  tip: document.getElementById('tip'),
  oneKBillCount: document.getElementById('oneKBillCount'),
  openingCash: document.getElementById('openingCash'),
  actualCashCounted: document.getElementById('actualCashCounted'),
  expectedCash: document.getElementById('expectedCash'),
  difference: document.getElementById('difference'),
  safeBoxApplied: document.getElementById('safeBoxApplied'),
  cashEntriesList: document.getElementById('cashEntriesList'),
  cardEntriesList: document.getElementById('cardEntriesList'),
  transferEntriesList: document.getElementById('transferEntriesList'),
  discountEntriesList: document.getElementById('discountEntriesList'),
  cashEntriesTotal: document.getElementById('cashEntriesTotal'),
  cardEntriesTotal: document.getElementById('cardEntriesTotal'),
  transferEntriesTotal: document.getElementById('transferEntriesTotal'),
  discountEntriesTotal: document.getElementById('discountEntriesTotal'),
  reportsTableBody: document.querySelector('#reportsTable tbody'),
  unclassifiedHint: document.getElementById('unclassifiedHint')
};

let chart;
const A4_LANDSCAPE_RATIO = 297 / 210;
const ONE_K_BILL_VALUE = 1000;
const OPTIONAL_DENOMINATION_INPUTS = {
  5000: ['fiveKBillCount', 'bill5kQty', 'qty5k'],
  10000: ['tenKBillCount', 'bill10kQty', 'qty10k'],
  20000: ['twentyKBillCount', 'bill20kQty', 'qty20k'],
  50000: ['fiftyKBillCount', 'bill50kQty', 'qty50k']
};

function todayLocalDate() {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * 60000;
  return new Date(now - tzOffset).toISOString().slice(0, 10);
}

function parseNumber(value) {
  if (value === null || value === undefined) {
    return 0;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  let normalized = String(value).trim();
  if (normalized === '') {
    return 0;
  }

  if (/^-?\d+,\d+$/.test(normalized) && !normalized.includes('.')) {
    normalized = normalized.replace(',', '.');
  } else {
    normalized = normalized.replace(/,/g, '');
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function round2(value) {
  return Number((value || 0).toFixed(2));
}

function hasOwn(obj, key) {
  return Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);
}

function resolveOneKBillCount(report) {
  if (hasOwn(report, '1k_qty')) {
    return parseOneKBillCount(report['1k_qty']);
  }

  const explicitTotal = round2(parseNumber(report?.['1k_total']));
  if (explicitTotal > 0) {
    return Math.max(0, Math.round(explicitTotal / ONE_K_BILL_VALUE));
  }

  const legacySafeBoxAmount = round2(parseNumber(report?.safe_box_amount));
  if (legacySafeBoxAmount > 0) {
    return Math.max(0, Math.round(legacySafeBoxAmount / ONE_K_BILL_VALUE));
  }

  const date = normalizeDate(report?.date || els.reportDate.value);
  if (date === '2026-02-20') {
    return 7;
  }

  return 0;
}

function parseOneKBillCount(value) {
  const parsed = Math.floor(parseNumber(value));
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

function oneKBillCountToAmount(count) {
  return round2(parseOneKBillCount(count) * ONE_K_BILL_VALUE);
}

function formatOneKBillCount(count) {
  const qty = parseOneKBillCount(count);
  return String(qty);
}

function readOptionalQuantityById(ids = []) {
  for (const id of ids) {
    const input = document.getElementById(id);
    if (input) {
      return parseOneKBillCount(input.value);
    }
  }
  return 0;
}

function calculateDenominationSummary() {
  const oneKQty = parseOneKBillCount(els.oneKBillCount.value);
  const oneKTotal = round2(oneKQty * ONE_K_BILL_VALUE);

  let otherDenominationTotal = 0;
  for (const [valueText, ids] of Object.entries(OPTIONAL_DENOMINATION_INPUTS)) {
    const value = parseNumber(valueText);
    const qty = readOptionalQuantityById(ids);
    otherDenominationTotal += qty * value;
  }

  const actualCashCounted = round2(oneKTotal + otherDenominationTotal);
  return {
    oneKQty,
    oneKTotal,
    otherDenominationTotal: round2(otherDenominationTotal),
    actualCashCounted
  };
}

function setMessage(text, variant = 'info') {
  els.message.textContent = text;
  els.message.className = `alert alert-${variant}`;
}

function clearMessage() {
  els.message.className = 'alert d-none';
  els.message.textContent = '';
}

function formatCurrency(value) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'THB'
  }).format(parseNumber(value));
}

function formatPercentage(value) {
  const normalized = round2(parseNumber(value));
  const clean = normalized % 1 === 0 ? String(normalized.toFixed(0)) : String(normalized.toFixed(2));
  const trimmed = clean.includes('.') ? clean.replace(/\.?0+$/, '') : clean;
  return `${trimmed}%`;
}

function parsePercentage(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  let normalized = String(value).trim();
  if (normalized.endsWith('%')) {
    normalized = normalized.slice(0, -1);
  }

  const parsed = Number(normalized.replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed === 0) {
    return null;
  }

  const absolute = Math.abs(parsed);
  const percentage = absolute > 0 && absolute <= 1 ? absolute * 100 : absolute;
  return round2(percentage);
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => {
      if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
        return {
          amount: round2(parseNumber(entry.amount)),
          percentage: parsePercentage(entry.percentage ?? entry.percent ?? entry.rate)
        };
      }

      return {
        amount: round2(parseNumber(entry)),
        percentage: null
      };
    })
    .filter((entry) => Number.isFinite(entry.amount) && entry.amount !== 0);
}

function renderEntryList(listElement, entries, options = {}) {
  const {
    showPercentage = false,
    percentageOnly = false,
    percentageFallbackText = 'N/A%'
  } = options;

  if (!listElement) {
    return;
  }

  listElement.innerHTML = '';

  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'text-muted';
    li.textContent = '-';
    listElement.appendChild(li);
    return;
  }

  entries.forEach((entry) => {
    const li = document.createElement('li');
    if (showPercentage) {
      if (entry.percentage !== null) {
        li.textContent = percentageOnly
          ? formatPercentage(entry.percentage)
          : `${formatPercentage(entry.percentage)} • ${formatCurrency(entry.amount)}`;
      } else if (percentageOnly) {
        li.textContent = percentageFallbackText;
      } else {
        li.textContent = formatCurrency(entry.amount);
      }
    } else {
      li.textContent = formatCurrency(entry.amount);
    }
    listElement.appendChild(li);
  });
}

function applyPaymentDetails({ cash_entries, card_entries, transfer_entries, discount_entries, discount_entry_details, total_discount }) {
  const cashEntries = normalizeEntries(cash_entries);
  const cardEntries = normalizeEntries(card_entries);
  const transferEntries = normalizeEntries(transfer_entries);
  const discountEntries = normalizeEntries(
    Array.isArray(discount_entry_details) && discount_entry_details.length
      ? discount_entry_details
      : discount_entries
  );

  renderEntryList(els.cashEntriesList, cashEntries);
  renderEntryList(els.cardEntriesList, cardEntries);
  renderEntryList(els.transferEntriesList, transferEntries);
  renderEntryList(els.discountEntriesList, discountEntries, {
    showPercentage: true,
    percentageOnly: true
  });

  const cashTotal = cashEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const cardTotal = cardEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const transferTotal = transferEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const discountTotalFromEntries = discountEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const discountTotalFromApi = round2(parseNumber(total_discount));
  const discountTotal = discountTotalFromApi > 0 ? discountTotalFromApi : discountTotalFromEntries;

  if (els.cashEntriesTotal) {
    els.cashEntriesTotal.textContent = formatCurrency(cashTotal);
  }
  if (els.cardEntriesTotal) {
    els.cardEntriesTotal.textContent = formatCurrency(cardTotal);
  }
  if (els.transferEntriesTotal) {
    els.transferEntriesTotal.textContent = formatCurrency(transferTotal);
  }
  if (els.transferTotal) {
    els.transferTotal.value = formatCurrency(transferTotal);
  }
  if (els.discountEntriesTotal) {
    els.discountEntriesTotal.textContent = formatCurrency(discountTotal);
  }
}

function clearPaymentDetails() {
  applyPaymentDetails({
    cash_entries: [],
    card_entries: [],
    transfer_entries: [],
    discount_entries: [],
    discount_entry_details: [],
    total_discount: 0
  });
}

function getReportFileBaseName() {
  const date = els.reportDate.value || todayLocalDate();
  return `daily-report-${date}`.replace(/[^\w.-]+/g, '_');
}

function setButtonLoading(button, loadingText, isLoading) {
  if (!button) {
    return;
  }

  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent;
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : button.dataset.defaultText;
}

function recalculate() {
  const openingCash = parseNumber(els.openingCash.value);
  const cashTotal = parseNumber(els.cashTotal.value);
  const cardTotal = parseNumber(els.cardTotal.value);
  const transferTotal = parseNumber(els.transferTotal?.value.replace(/[^\d.-]/g, '') || 0);
  const expense = parseNumber(els.expense.value);

  const netSale = round2(cashTotal + cardTotal + transferTotal);
  els.netSale.value = netSale.toFixed(2);

  const expectedCash = round2(openingCash + netSale);
  els.expectedCash.value = expectedCash.toFixed(2);

  const denom = calculateDenominationSummary();
  const safeBoxAmount = denom.oneKTotal;
  els.safeBoxApplied.value = `${denom.oneKQty} x 1,000 = ${formatCurrency(denom.oneKTotal)}`;

  const actualCashCounted = parseNumber(els.actualCashCounted.value);
  const outflowTotal = round2(safeBoxAmount + cardTotal + transferTotal + expense + actualCashCounted);
  const difference = round2(expectedCash - outflowTotal);

  els.difference.value = difference.toFixed(2);
  els.difference.className = `form-control ${difference > 0 ? 'diff-positive' : difference < 0 ? 'diff-negative' : ''}`;
}

function applyReportData(report) {
  els.reportDate.value = normalizeDate(report.date);
  els.cashTotal.value = round2(parseNumber(report.cash_total)).toFixed(2);
  els.cardTotal.value = round2(parseNumber(report.card_total)).toFixed(2);
  els.netSale.value = round2(parseNumber(report.net_sale)).toFixed(2);
  els.totalOrders.value = parseInt(report.total_orders || 0, 10);
  els.expense.value = round2(parseNumber(report.expense)).toFixed(2);
  els.tip.value = round2(parseNumber(report.tip)).toFixed(2);
  els.oneKBillCount.value = formatOneKBillCount(resolveOneKBillCount(report));
  els.openingCash.value = round2(parseNumber(report.opening_cash)).toFixed(2);
  els.actualCashCounted.value = round2(parseNumber(report.actual_cash_counted)).toFixed(2);
  recalculate();
}

function resetManualFields() {
  els.expense.value = '0.00';
  els.tip.value = '0.00';
  els.oneKBillCount.value = '0';
  els.openingCash.value = '0.00';
  els.actualCashCounted.value = '0.00';
  recalculate();
}

function resetSyncedFields() {
  els.cashTotal.value = '0.00';
  els.cardTotal.value = '0.00';
  els.totalOrders.value = '0';
  els.netSale.value = '0.00';
}

function ensureManualInputsEnabled() {
  [els.expense, els.tip, els.oneKBillCount, els.openingCash, els.actualCashCounted].forEach((input) => {
    if (input) {
      input.readOnly = false;
      input.disabled = false;
    }
  });
}

function applySyncSummaryToFields(data) {
  els.cashTotal.value = round2(parseNumber(data.cash_total)).toFixed(2);
  els.cardTotal.value = round2(parseNumber(data.card_total)).toFixed(2);
  els.netSale.value = round2(parseNumber(data.net_sale)).toFixed(2);
  els.totalOrders.value = parseInt(data.total_orders || 0, 10);

  if (parseNumber(data.unclassified_amount) > 0) {
    els.unclassifiedHint.textContent =
      `Unclassified payment amount: ${formatCurrency(data.unclassified_amount)} (not included in Cash/Card totals).`;
  } else {
    els.unclassifiedHint.textContent = '';
  }

  recalculate();
}

async function fetchLoyverseSummaryByDate(date) {
  const response = await fetch(
    `/api/loyverse/sync?date=${encodeURIComponent(date)}&_ts=${Date.now()}`,
    {
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache'
      }
    }
  );
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Sync failed');
  }

  return data;
}

async function loadPaymentDetailsForDate(date, options = {}) {
  const { updateSummary = false, silent = true } = options;

  try {
    const data = await fetchLoyverseSummaryByDate(date);
    applyPaymentDetails(data);

    if (updateSummary) {
      applySyncSummaryToFields(data);
    }

    return data;
  } catch (error) {
    clearPaymentDetails();
    if (!silent) {
      throw error;
    }
    return null;
  }
}

function normalizeDate(value) {
  return String(value || '').slice(0, 10);
}

async function fetchSavedReportByDate(date) {
  const response = await fetch(`/api/reports/${date}`);
  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(errorData.message || 'Failed to load report');
  }

  return response.json();
}

async function loadReportForDate(date, options = {}) {
  const { showMessage = true } = options;

  ensureManualInputsEnabled();

  if (!date) {
    if (showMessage) {
      setMessage('Please choose a report date first.', 'warning');
    }
    return null;
  }

  try {
    const report = await fetchSavedReportByDate(date);
    if (!report) {
      resetSyncedFields();
      resetManualFields();
      clearPaymentDetails();

      if (showMessage) {
        setMessage('No saved report found for this date.', 'secondary');
      }

      return null;
    }

    applyReportData(report);
    await loadPaymentDetailsForDate(date, { updateSummary: false, silent: true });
    if (showMessage) {
      setMessage('Saved report loaded.', 'success');
    }
    return report;
  } catch (error) {
    if (showMessage) {
      setMessage(error.message, 'danger');
    }
    throw error;
  }
}

async function syncFromLoyverse() {
  clearMessage();
  ensureManualInputsEnabled();

  if (!els.reportDate.value) {
    setMessage('Please choose a report date first.', 'warning');
    return;
  }

  els.syncButton.disabled = true;
  els.syncButton.textContent = 'Syncing...';

  try {
    await loadPaymentDetailsForDate(els.reportDate.value, { updateSummary: true, silent: false });
    setMessage('Loyverse data synced successfully.', 'success');
  } catch (error) {
    setMessage(error.message, 'danger');
  } finally {
    els.syncButton.disabled = false;
    els.syncButton.textContent = 'Sync From Loyverse';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (els.reportDate) {
    els.reportDate.value = todayLocalDate();
    loadReportForDate(els.reportDate.value, { showMessage: false });

    els.reportDate.addEventListener('change', () => {
      loadReportForDate(els.reportDate.value, { showMessage: true });
    });
  }

  if (els.syncButton) {
    els.syncButton.addEventListener('click', syncFromLoyverse);
  }

  // Auto-recalculate on manual inputs (though mostly hidden now)
  [els.expense, els.tip, els.oneKBillCount, els.openingCash, els.actualCashCounted].forEach((input) => {
    if (input) {
      input.addEventListener('input', recalculate);
    }
  });
});
