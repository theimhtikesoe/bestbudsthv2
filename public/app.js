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
  transferTotal: document.getElementById('transferTotal'),
  transferEntriesList: document.getElementById('transferEntriesList'),
  transferEntriesTotal: document.getElementById('transferEntriesTotal'),
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
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  
  let str = String(value).trim();
  if (str === '') return 0;
  
  // Clean up: remove everything except digits, dots, and minus sign
  // This handles "1. 2050.00", "THB 2,050.00", etc.
  // We want to keep the LAST numeric part if there are multiple (like "1. 2050.00")
  const parts = str.match(/-?\d+(?:,\d+)*(?:\.\d+)?/g);
  if (!parts || parts.length === 0) return 0;
  
  // Pick the last part which is usually the actual amount
  let lastPart = parts[parts.length - 1].replace(/,/g, '');
  const n = Number(lastPart);
  return Number.isFinite(n) ? n : 0;
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function round2(value) {
  return Number((value || 0).toFixed(2));
}

function formatCurrency(value) {
  const amount = parseNumber(value);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
  return `THB ${formatted}`;
}

function formatPercentage(value) {
  const normalized = round2(parseNumber(value));
  const clean = normalized % 1 === 0 ? String(normalized.toFixed(0)) : String(normalized.toFixed(2));
  return `${clean.replace(/\.?0+$/, '')}%`;
}

function parsePercentage(value) {
  if (value === null || value === undefined || value === '') return null;
  let str = String(value).replace(/%/g, '').trim();
  const n = Number(str.replace(/,/g, ''));
  if (!Number.isFinite(n) || n === 0) return null;
  return round2(Math.abs(n) > 0 && Math.abs(n) <= 1 ? n * 100 : n);
}

function formatTime(isoString) {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    return date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');
  } catch (e) { return ''; }
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(entry => {
    let amount = 0, percentage = null, time = null, receiptNumber = null;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      amount = entry.amount ?? entry.money_amount?.amount ?? entry.amount_money?.amount ?? entry.total_money?.amount ?? 0;
      percentage = parsePercentage(entry.percentage ?? entry.percent ?? entry.rate);
      time = entry.time || null;
      receiptNumber = entry.receiptNumber || entry.receipt_number || entry.number || null;
    } else {
      amount = entry;
    }
    return { amount: round2(parseNumber(amount)), percentage, time, receiptNumber };
  }).filter(e => e.amount > 0);
}

function renderEntryList(listElement, entries, options = {}) {
  if (!listElement) return;
  const { showPercentage = false, percentageOnly = false, percentageFallbackText = 'N/A%' } = options;
  
  listElement.innerHTML = '';
  if (!entries.length) {
    const li = document.createElement('li');
    li.className = 'text-muted';
    li.textContent = '-';
    listElement.appendChild(li);
    return;
  }

  entries.forEach(entry => {
    const li = document.createElement('li');
    const timeStr = entry.time ? `${formatTime(entry.time)} ` : '';
    const receiptStr = entry.receiptNumber ? `(${entry.receiptNumber}) ` : '';
    const detailStr = (timeStr || receiptStr) ? `${timeStr}${receiptStr}- ` : '';
    
    let content = '';
    if (showPercentage) {
      if (entry.percentage !== null) {
        content = percentageOnly ? `${detailStr}${formatPercentage(entry.percentage)}` : `${detailStr}${formatPercentage(entry.percentage)} • ${formatCurrency(entry.amount)}`;
      } else {
        content = percentageOnly ? `${detailStr}${percentageFallbackText}` : `${detailStr}${formatCurrency(entry.amount)}`;
      }
    } else {
      content = `${detailStr}${formatCurrency(entry.amount)}`;
    }
    
    // ENSURE NO EXTRA NUMBERING
    li.textContent = content;
    listElement.appendChild(li);
  });
}

function applyPaymentDetails(data) {
  const cashEntries = normalizeEntries(data.cash_entries);
  const cardEntries = normalizeEntries(data.card_entries);
  const transferEntries = normalizeEntries(data.transfer_entries);
  const discountEntries = normalizeEntries(Array.isArray(data.discount_entry_details) && data.discount_entry_details.length ? data.discount_entry_details : data.discount_entries);

  renderEntryList(els.cashEntriesList, cashEntries);
  renderEntryList(els.cardEntriesList, cardEntries);
  renderEntryList(els.transferEntriesList, transferEntries);
  renderEntryList(els.discountEntriesList, discountEntries, { showPercentage: true, percentageOnly: true });

  const cashTotal = cashEntries.reduce((s, e) => s + e.amount, 0);
  const cardTotal = cardEntries.reduce((s, e) => s + e.amount, 0);
  const transferTotal = transferEntries.reduce((s, e) => s + e.amount, 0);
  const discountTotal = round2(parseNumber(data.total_discount)) || discountEntries.reduce((s, e) => s + e.amount, 0);

  if (els.cashEntriesTotal) els.cashEntriesTotal.textContent = formatCurrency(cashTotal);
  if (els.cardEntriesTotal) els.cardEntriesTotal.textContent = formatCurrency(cardTotal);
  if (els.transferEntriesTotal) els.transferEntriesTotal.textContent = formatCurrency(transferTotal);
  if (els.discountEntriesTotal) els.discountEntriesTotal.textContent = formatCurrency(discountTotal);
}

function recalculate() {
  const oneKCount = parseOneKBillCount(els.oneKBillCount.value);
  const oneKTotal = oneKCount * ONE_K_BILL_VALUE;
  const opening = parseNumber(els.openingCash.value);
  const net = round2(parseNumber(els.netSale.value));
  const card = parseNumber(els.cardTotal.value);
  const transfer = parseNumber(els.transferTotal.value);
  const expense = parseNumber(els.expense.value);
  const actual = parseNumber(els.actualCashCounted.value);
  
  const expected = round2(opening + net);
  const outflow = round2(oneKTotal + card + transfer + expense + actual);
  const diff = round2(expected - outflow);

  els.expectedCash.value = expected.toFixed(2);
  els.difference.value = diff.toFixed(2);
  if (els.safeBoxApplied) els.safeBoxApplied.value = `${oneKCount} x 1,000 = ${formatCurrency(oneKTotal)}`;

  els.difference.classList.remove('diff-positive', 'diff-negative');
  if (diff > 0) els.difference.classList.add('diff-positive');
  else if (diff < 0) els.difference.classList.add('diff-negative');
}

function parseOneKBillCount(v) {
  const n = Math.floor(parseNumber(v));
  return n > 0 ? n : 0;
}

function formatOneKBillCount(c) { return String(parseOneKBillCount(c)); }

function setButtonLoading(btn, text, isLoading) {
  if (!btn) return;
  btn.disabled = isLoading;
  if (isLoading) {
    btn.dataset.originalText = btn.textContent;
    btn.textContent = text;
  } else {
    btn.textContent = btn.dataset.originalText || btn.textContent;
  }
}

function setMessage(text, variant = 'info') {
  els.message.textContent = text;
  els.message.className = `alert alert-${variant}`;
}

function clearMessage() {
  els.message.className = 'alert d-none';
  els.message.textContent = '';
}

async function syncFromLoyverse() {
  clearMessage();
  if (!els.reportDate.value) return setMessage('Please choose a date.', 'warning');
  setButtonLoading(els.syncButton, 'Syncing...', true);
  try {
    const res = await fetch(`/api/loyverse/sync?date=${els.reportDate.value}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Sync failed');
    applyPaymentDetails(data);
    els.cashTotal.value = round2(data.cash_total).toFixed(2);
    els.cardTotal.value = round2(data.card_total).toFixed(2);
    if (els.transferTotal) els.transferTotal.value = round2(data.transfer_total).toFixed(2);
    els.netSale.value = round2(data.net_sale).toFixed(2);
    els.totalOrders.value = data.total_orders || 0;
    recalculate();
    setMessage('Synced successfully.', 'success');
  } catch (e) { setMessage(e.message, 'danger'); }
  finally { setButtonLoading(els.syncButton, '', false); }
}

async function loadSavedReport() {
  clearMessage();
  const date = els.reportDate.value;
  if (!date) return;
  try {
    const res = await fetch(`/api/reports/${date}`);
    if (res.status === 404) {
      resetFields();
      return setMessage('No saved report found.', 'secondary');
    }
    const report = await res.json();
    els.cashTotal.value = round2(report.cash_total).toFixed(2);
    els.cardTotal.value = round2(report.card_total).toFixed(2);
    if (els.transferTotal) els.transferTotal.value = round2(report.transfer_total || 0).toFixed(2);
    els.totalOrders.value = report.total_orders || 0;
    els.netSale.value = round2(report.net_sale).toFixed(2);
    els.expense.value = round2(report.expense).toFixed(2);
    els.tip.value = round2(report.tip).toFixed(2);
    els.oneKBillCount.value = report['1k_qty'] || 0;
    els.openingCash.value = round2(report.opening_cash).toFixed(2);
    els.actualCashCounted.value = round2(report.actual_cash_counted).toFixed(2);
    
    const syncRes = await fetch(`/api/loyverse/sync?date=${date}`);
    if (syncRes.ok) applyPaymentDetails(await syncRes.json());
    
    recalculate();
    setMessage('Report loaded.', 'success');
  } catch (e) { setMessage(e.message, 'danger'); }
}

function resetFields() {
  els.cashTotal.value = '0.00';
  els.cardTotal.value = '0.00';
  if (els.transferTotal) els.transferTotal.value = '0.00';
  els.totalOrders.value = '0';
  els.netSale.value = '0.00';
  els.expense.value = '0.00';
  els.tip.value = '0.00';
  els.oneKBillCount.value = '0';
  els.openingCash.value = '0.00';
  els.actualCashCounted.value = '0.00';
  els.cashEntriesList.innerHTML = '';
  els.cardEntriesList.innerHTML = '';
  els.transferEntriesList.innerHTML = '';
  els.discountEntriesList.innerHTML = '';
  recalculate();
}

async function saveReport() {
  if (!els.reportDate.value) return setMessage('Please choose a date.', 'warning');
  setButtonLoading(els.saveButton, 'Saving...', true);
  try {
    const payload = {
      date: els.reportDate.value,
      cash_total: parseNumber(els.cashTotal.value),
      card_total: parseNumber(els.cardTotal.value),
      transfer_total: els.transferTotal ? parseNumber(els.transferTotal.value) : 0,
      total_orders: parseInt(els.totalOrders.value || '0', 10),
      net_sale: parseNumber(els.netSale.value),
      expense: parseNumber(els.expense.value),
      tip: parseNumber(els.tip.value),
      '1k_qty': parseOneKBillCount(els.oneKBillCount.value),
      opening_cash: parseNumber(els.openingCash.value),
      actual_cash_counted: parseNumber(els.actualCashCounted.value)
    };
    const res = await fetch('/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Save failed');
    setMessage('Report saved.', 'success');
    loadReportHistory();
  } catch (e) { setMessage(e.message, 'danger'); }
  finally { setButtonLoading(els.saveButton, '', false); }
}

async function loadReportHistory() {
  try {
    const res = await fetch('/api/reports');
    const data = await res.json();
    els.reportsTableBody.innerHTML = '';
    data.forEach(r => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${r.date}</td>
        <td>${formatCurrency(r.net_sale)}</td>
        <td>${formatCurrency(r.cash_total)}</td>
        <td>${formatCurrency(r.card_total)}</td>
        <td>${r.total_orders}</td>
        <td>${formatCurrency(r.expense)}</td>
        <td>${formatCurrency(r.safe_box_amount)}</td>
        <td>${formatCurrency(r.expected_cash)}</td>
        <td class="${r.difference > 0 ? 'diff-positive' : r.difference < 0 ? 'diff-negative' : ''}">${formatCurrency(r.difference)}</td>
        <td><button class="btn btn-sm btn-outline-primary view-btn" data-date="${r.date}">View</button></td>
      `;
      els.reportsTableBody.appendChild(tr);
    });
  } catch (e) { console.error(e); }
}

async function loadNetSalesChart() {
  try {
    const res = await fetch('/api/reports/last-7/net-sales');
    const data = await res.json();
    const ctx = document.getElementById('netSalesChart').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(d => d.date),
        datasets: [{ label: 'Net Sale', data: data.map(d => d.net_sale), backgroundColor: '#b6781e' }]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  } catch (e) { console.error(e); }
}

function bindEvents() {
  els.syncButton.addEventListener('click', syncFromLoyverse);
  els.saveButton.addEventListener('click', saveReport);
  els.loadButton.addEventListener('click', loadSavedReport);
  els.reportDate.addEventListener('change', loadSavedReport);
  els.printButton.addEventListener('click', () => window.print());
  
  document.querySelectorAll('.calc-input').forEach(i => i.addEventListener('input', recalculate));
  
  els.reportsTableBody.addEventListener('click', e => {
    if (e.target.classList.contains('view-btn')) {
      els.reportDate.value = e.target.dataset.date;
      loadSavedReport();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
}

function init() {
  els.reportDate.value = todayLocalDate();
  bindEvents();
  loadSavedReport();
  loadReportHistory();
  loadNetSalesChart();
}

init();
