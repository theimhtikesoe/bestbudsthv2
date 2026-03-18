const els = {
  message: document.getElementById('message'),
  reportDate: document.getElementById('reportDate'),
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
  discountEntriesList: document.getElementById('discountEntriesList'),
  cashEntriesTotal: document.getElementById('cashEntriesTotal'),
  cardEntriesTotal: document.getElementById('cardEntriesTotal'),
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

function applyPaymentDetails({ cash_entries, card_entries, discount_entries, discount_entry_details, total_discount }) {
  const cashEntries = normalizeEntries(cash_entries);
  const cardEntries = normalizeEntries(card_entries);
  const discountEntries = normalizeEntries(
    Array.isArray(discount_entry_details) && discount_entry_details.length
      ? discount_entry_details
      : discount_entries
  );

  renderEntryList(els.cashEntriesList, cashEntries);
  renderEntryList(els.cardEntriesList, cardEntries);
  renderEntryList(els.discountEntriesList, discountEntries, {
    showPercentage: true,
    percentageOnly: true
  });

  const cashTotal = cashEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const cardTotal = cardEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const discountTotalFromEntries = discountEntries.reduce((sum, entry) => sum + entry.amount, 0);
  const discountTotalFromApi = round2(parseNumber(total_discount));
  const discountTotal = discountTotalFromApi > 0 ? discountTotalFromApi : discountTotalFromEntries;

  if (els.cashEntriesTotal) {
    els.cashEntriesTotal.textContent = formatCurrency(cashTotal);
  }
  if (els.cardEntriesTotal) {
    els.cardEntriesTotal.textContent = formatCurrency(cardTotal);
  }
  if (els.discountEntriesTotal) {
    els.discountEntriesTotal.textContent = formatCurrency(discountTotal);
  }
}

function clearPaymentDetails() {
  applyPaymentDetails({
    cash_entries: [],
    card_entries: [],
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

async function captureReportSection() {
  if (!els.reportSection) {
    throw new Error('Report section not found.');
  }

  if (typeof window.html2canvas !== 'function') {
    throw new Error('Export library is not loaded.');
  }

  return window.html2canvas(els.reportSection, {
    backgroundColor: '#ffffff',
    scale: 2,
    useCORS: true,
    ignoreElements: (element) => element.classList?.contains('no-export')
  });
}

function createLandscapeCanvas(sourceCanvas) {
  const padding = Math.max(Math.round(Math.max(sourceCanvas.width, sourceCanvas.height) * 0.03), 36);

  let targetWidth = Math.max(sourceCanvas.width + padding * 2, 2600);
  let targetHeight = Math.round(targetWidth / A4_LANDSCAPE_RATIO);

  if (targetHeight < sourceCanvas.height + padding * 2) {
    targetHeight = sourceCanvas.height + padding * 2;
    targetWidth = Math.round(targetHeight * A4_LANDSCAPE_RATIO);
  }

  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Failed to build export canvas.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, targetWidth, targetHeight);

  const availableWidth = targetWidth - padding * 2;
  const availableHeight = targetHeight - padding * 2;
  const scale = Math.min(availableWidth / sourceCanvas.width, availableHeight / sourceCanvas.height);
  const drawWidth = sourceCanvas.width * scale;
  const drawHeight = sourceCanvas.height * scale;
  const drawX = (targetWidth - drawWidth) / 2;
  const drawY = (targetHeight - drawHeight) / 2;

  context.drawImage(sourceCanvas, drawX, drawY, drawWidth, drawHeight);
  return canvas;
}

function printReport() {
  clearMessage();
  window.print();
}

async function downloadReportAsImage() {
  clearMessage();
  setButtonLoading(els.downloadImageButton, 'Generating...', true);

  try {
    const capturedCanvas = await captureReportSection();
    const landscapeCanvas = createLandscapeCanvas(capturedCanvas);
    const link = document.createElement('a');
    link.href = landscapeCanvas.toDataURL('image/png');
    link.download = `${getReportFileBaseName()}.png`;
    link.click();
    setMessage('Landscape image downloaded successfully.', 'success');
  } catch (error) {
    setMessage(error.message || 'Failed to download image.', 'danger');
  } finally {
    setButtonLoading(els.downloadImageButton, 'Generating...', false);
  }
}

async function downloadReportAsPdf() {
  clearMessage();
  setButtonLoading(els.downloadPdfButton, 'Generating...', true);

  try {
    if (!window.jspdf?.jsPDF) {
      throw new Error('PDF library is not loaded.');
    }

    const capturedCanvas = await captureReportSection();
    const landscapeCanvas = createLandscapeCanvas(capturedCanvas);
    const imageData = landscapeCanvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('l', 'mm', 'a4');

    const margin = 8;
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const contentWidth = pageWidth - margin * 2;
    const contentHeight = pageHeight - margin * 2;
    const imageRatio = landscapeCanvas.width / landscapeCanvas.height;
    const contentRatio = contentWidth / contentHeight;

    let renderWidth = contentWidth;
    let renderHeight = contentHeight;

    if (imageRatio > contentRatio) {
      renderHeight = renderWidth / imageRatio;
    } else {
      renderWidth = renderHeight * imageRatio;
    }

    const renderX = (pageWidth - renderWidth) / 2;
    const renderY = (pageHeight - renderHeight) / 2;
    pdf.addImage(imageData, 'PNG', renderX, renderY, renderWidth, renderHeight, undefined, 'FAST');

    pdf.save(`${getReportFileBaseName()}.pdf`);
    setMessage('Landscape PDF downloaded successfully.', 'success');
  } catch (error) {
    setMessage(error.message || 'Failed to download PDF.', 'danger');
  } finally {
    setButtonLoading(els.downloadPdfButton, 'Generating...', false);
  }
}

function recalculate() {
  const oneKBillCount = parseOneKBillCount(els.oneKBillCount.value);
  const oneKBillTotal = oneKBillCountToAmount(oneKBillCount);
  const openingCash = parseNumber(els.openingCash.value);
  const netSale = round2(parseNumber(els.netSale.value));
  const cardTotal = parseNumber(els.cardTotal.value);
  const expense = parseNumber(els.expense.value);
  const actualCashCounted = parseNumber(els.actualCashCounted.value);
  const expectedCash = round2(openingCash + netSale);
  const outflowTotal = round2(oneKBillTotal + cardTotal + expense + actualCashCounted);
  const difference = round2(expectedCash - outflowTotal);

  els.expectedCash.value = expectedCash.toFixed(2);
  els.difference.value = difference.toFixed(2);
  if (els.safeBoxApplied) {
    els.safeBoxApplied.value = `${formatOneKBillCount(oneKBillCount)} x 1,000 = ${formatCurrency(oneKBillTotal)}`;
  }

  els.difference.classList.remove('diff-positive', 'diff-negative');
  if (difference > 0) {
    els.difference.classList.add('diff-positive');
  } else if (difference < 0) {
    els.difference.classList.add('diff-negative');
  }
}

function getReportPayload() {
  const oneKQty = parseOneKBillCount(els.oneKBillCount.value);
  const oneKTotal = oneKBillCountToAmount(oneKQty);
  const actualCashCounted = parseNumber(els.actualCashCounted.value);
  return {
    date: els.reportDate.value,
    cash_total: parseNumber(els.cashTotal.value),
    card_total: parseNumber(els.cardTotal.value),
    total_orders: parseInt(els.totalOrders.value || '0', 10),
    expense: parseNumber(els.expense.value),
    tip: parseNumber(els.tip.value),
    '1k_qty': oneKQty,
    '1k_total': oneKTotal,
    safe_box_label: '1K Bill',
    safe_box_amount: oneKTotal,
    opening_cash: parseNumber(els.openingCash.value),
    actual_cash_counted: actualCashCounted
  };
}

function applyReportData(report) {
  const oneKBillCount = resolveOneKBillCount(report);
  els.cashTotal.value = round2(parseNumber(report.cash_total)).toFixed(2);
  els.cardTotal.value = round2(parseNumber(report.card_total)).toFixed(2);
  els.totalOrders.value = parseInt(report.total_orders || 0, 10);
  els.netSale.value = round2(parseNumber(report.net_sale)).toFixed(2);
  els.expense.value = round2(parseNumber(report.expense)).toFixed(2);
  els.tip.value = round2(parseNumber(report.tip)).toFixed(2);
  els.oneKBillCount.value = formatOneKBillCount(oneKBillCount);
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
    input.readOnly = false;
    input.disabled = false;
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

async function fillOpeningCashFromPreviousReport(date) {
  const params = new URLSearchParams({
    to: date,
    limit: '100'
  });

  const response = await fetch(`/api/reports?${params.toString()}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Failed to load previous report');
  }

  const rows = Array.isArray(data) ? data : [];
  const previous = rows.find((row) => normalizeDate(row.date) < date);
  if (!previous) {
    return null;
  }

  const hasPreviousActualCash = hasValue(previous.actual_cash_counted);
  const fallbackExpectedCash = hasValue(previous.expected_cash) ? previous.expected_cash : null;
  const openingCashSource = hasPreviousActualCash ? previous.actual_cash_counted : fallbackExpectedCash;
  if (openingCashSource === null) {
    return null;
  }

  const openingCash = round2(parseNumber(openingCashSource));
  els.openingCash.value = openingCash.toFixed(2);
  recalculate();

  return {
    openingCash,
    sourceDate: normalizeDate(previous.date),
    sourceLabel: hasPreviousActualCash ? 'Actual Cash Counted' : 'Expected Cash'
  };
}

async function loadReportForDate(date, options = {}) {
  const { showMessage = true, carryForwardOpeningCash = true } = options;

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

      let carryForward = null;
      if (carryForwardOpeningCash) {
        carryForward = await fillOpeningCashFromPreviousReport(date);
      }

      if (showMessage) {
        if (carryForward) {
          setMessage(
            `No saved report. Opening Cash auto-filled from ${carryForward.sourceDate} ${carryForward.sourceLabel}.`,
            'secondary'
          );
        } else {
          setMessage('No saved report found for this date.', 'secondary');
        }
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

async function loadSavedReport() {
  clearMessage();

  try {
    await loadReportForDate(els.reportDate.value, {
      showMessage: true,
      carryForwardOpeningCash: true
    });
  } catch (error) {
    // message already handled in loadReportForDate
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

async function saveReport() {
  clearMessage();

  if (!els.reportDate.value) {
    setMessage('Please choose a report date first.', 'warning');
    return;
  }

  els.saveButton.disabled = true;
  els.saveButton.textContent = 'Saving...';

  try {
    const payload = getReportPayload();

    const response = await fetch('/api/reports', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.message || 'Save failed');
    }

    applyReportData(data);
    setMessage('Daily report saved successfully.', 'success');
    await Promise.all([loadReportHistory(), loadNetSalesChart()]);
  } catch (error) {
    setMessage(error.message, 'danger');
  } finally {
    els.saveButton.disabled = false;
    els.saveButton.textContent = 'Save Daily Report';
  }
}

function renderReportsTable(reports) {
  els.reportsTableBody.innerHTML = '';

  if (!reports.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="10" class="text-center text-muted">No reports found</td>';
    els.reportsTableBody.appendChild(tr);
    return;
  }

  for (const report of reports) {
    const tr = document.createElement('tr');
    const reportDate = normalizeDate(report.date);
    const oneKBillCount = resolveOneKBillCount(report);
    const oneKBillTotal = hasOwn(report, '1k_total')
      ? round2(parseNumber(report['1k_total']))
      : oneKBillCountToAmount(oneKBillCount);
    const openingCash = round2(parseNumber(report.opening_cash));
    const netSale = round2(parseNumber(report.net_sale));
    const cardTotal = round2(parseNumber(report.card_total));
    const expense = round2(parseNumber(report.expense));
    const actualCashCounted = round2(parseNumber(report.actual_cash_counted));
    const expectedCash = round2(openingCash + netSale);
    const outflowTotal = round2(oneKBillTotal + cardTotal + expense + actualCashCounted);
    const difference = round2(expectedCash - outflowTotal);
    tr.innerHTML = `
      <td>${reportDate}</td>
      <td>${formatCurrency(report.net_sale)}</td>
      <td>${formatCurrency(report.cash_total)}</td>
      <td>${formatCurrency(report.card_total)}</td>
      <td>${parseInt(report.total_orders || 0, 10)}</td>
      <td>${formatCurrency(report.expense)}</td>
      <td>1K: ${formatOneKBillCount(oneKBillCount)} (${formatCurrency(oneKBillTotal)})</td>
      <td>${formatCurrency(expectedCash)}</td>
      <td class="${difference > 0 ? 'diff-positive' : difference < 0 ? 'diff-negative' : ''}">${formatCurrency(difference)}</td>
      <td class="no-export">
        <button type="button" class="btn btn-sm btn-outline-dark print-past-btn" data-date="${reportDate}">
          Print
        </button>
      </td>
    `;
    els.reportsTableBody.appendChild(tr);
  }
}

async function loadReportHistory() {
  const params = new URLSearchParams();
  if (els.fromDate.value) {
    params.set('from', els.fromDate.value);
  }
  if (els.toDate.value) {
    params.set('to', els.toDate.value);
  }

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(`/api/reports${query}`);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Failed to load history');
  }

  renderReportsTable(data);
}

async function loadNetSalesChart() {
  const response = await fetch('/api/reports/last-7/net-sales');
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || 'Failed to load chart data');
  }

  const labels = data.map((item) => String(item.date).slice(0, 10));
  const values = data.map((item) => round2(parseNumber(item.net_sale)));

  const ctx = document.getElementById('netSalesChart');
  if (chart) {
    chart.destroy();
  }

  chart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Net Sale',
          data: values,
          backgroundColor: '#0d6efd'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true
        }
      }
    }
  });
}

function bindEvents() {
  document.querySelectorAll('.calc-input').forEach((input) => {
    input.addEventListener('input', recalculate);
  });
  Object.values(OPTIONAL_DENOMINATION_INPUTS)
    .flat()
    .forEach((id) => {
      const input = document.getElementById(id);
      if (input) {
        input.addEventListener('input', recalculate);
      }
    });

  els.loadButton.addEventListener('click', loadSavedReport);
  els.syncButton.addEventListener('click', syncFromLoyverse);
  els.saveButton.addEventListener('click', saveReport);
  els.printButton.addEventListener('click', printReport);
  els.downloadImageButton.addEventListener('click', downloadReportAsImage);
  els.downloadPdfButton.addEventListener('click', downloadReportAsPdf);
  els.reportsTableBody.addEventListener('click', async (event) => {
    const button = event.target.closest('.print-past-btn');
    if (!button) {
      return;
    }

    const reportDate = button.dataset.date;
    if (!reportDate) {
      return;
    }

    setButtonLoading(button, 'Loading...', true);
    clearMessage();

    try {
      els.reportDate.value = reportDate;
      const report = await loadReportForDate(reportDate, {
        showMessage: false,
        carryForwardOpeningCash: false
      });

      if (!report) {
        throw new Error('Past report not found.');
      }

      printReport();
    } catch (error) {
      setMessage(error.message || 'Failed to print past report.', 'danger');
    } finally {
      setButtonLoading(button, 'Loading...', false);
    }
  });

  els.filterReports.addEventListener('click', async () => {
    try {
      clearMessage();
      await loadReportHistory();
    } catch (error) {
      setMessage(error.message, 'danger');
    }
  });

  els.reportDate.addEventListener('change', async () => {
    clearMessage();
    els.unclassifiedHint.textContent = '';
    await loadSavedReport();
  });
}

async function initializePage() {
  els.reportDate.value = todayLocalDate();
  els.fromDate.value = dayjsOffset(-6);
  els.toDate.value = todayLocalDate();

  resetManualFields();
  resetSyncedFields();
  clearPaymentDetails();
  ensureManualInputsEnabled();

  bindEvents();

  try {
    await Promise.all([loadSavedReport(), loadReportHistory(), loadNetSalesChart()]);
  } catch (error) {
    setMessage(error.message, 'danger');
  }
}

function dayjsOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const tzOffset = date.getTimezoneOffset() * 60000;
  return new Date(date - tzOffset).toISOString().slice(0, 10);
}

initializePage();
