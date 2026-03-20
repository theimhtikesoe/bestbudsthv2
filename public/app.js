const els = {
  message: document.getElementById('message'),
  reportDate: document.getElementById('reportDate'),
  reportSection: document.getElementById('reportSection'),

  syncButton: document.getElementById('syncButton'),
  saveButton: document.getElementById('saveButton'),
  printButton: document.getElementById('printButton'),

  cashTotal: document.getElementById('cashTotal'),
  cardTotal: document.getElementById('cardTotal'),
  totalOrders: document.getElementById('totalOrders'),
  netSale: document.getElementById('netSale'),
  totalGramsSold: document.getElementById('totalGramsSold'),

  cashEntriesList: document.getElementById('cashEntriesList'),
  cardEntriesList: document.getElementById('cardEntriesList'),
  discountEntriesList: document.getElementById('discountEntriesList'),
  cashEntriesTotal: document.getElementById('cashEntriesTotal'),
  cardEntriesTotal: document.getElementById('cardEntriesTotal'),
  discountEntriesTotal: document.getElementById('discountEntriesTotal'),
  transferTotal: document.getElementById('transferTotal'),
  transferEntriesList: document.getElementById('transferEntriesList'),
  transferEntriesTotal: document.getElementById('transferEntriesTotal'),
  bestBudsSalesBody: document.getElementById('bestBudsSalesBody'),

  unclassifiedHint: document.getElementById('unclassifiedHint')
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
  
  const parts = str.match(/-?\d+(?:,\d+)*(?:\.\d+)?/g);
  if (!parts || parts.length === 0) return 0;
  
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
  if (normalized % 1 === 0) {
    return `${normalized.toFixed(0)}%`;
  }
  return `${normalized.toFixed(2).replace(/0+$/, '')}%`;
}

function formatGram(value) {
  return `${round2(parseNumber(value)).toFixed(3)} G`;
}

function parsePercentage(value) {
  if (value === null || value === undefined || value === '') return null;
  let str = String(value).replace(/%/g, '').trim();
  const n = Number(str.replace(/,/g, ''));
  if (!Number.isFinite(n) || n === 0) return null;
  if (n > 0 && n < 1) {
    return round2(n * 100);
  } else {
    return round2(n);
  }
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
    
    let content = '';
    if (showPercentage) {
      if (entry.percentage !== null) {
        content = percentageOnly ? `${formatPercentage(entry.percentage)}` : `${formatPercentage(entry.percentage)} • ${formatCurrency(entry.amount)}`;
      } else {
        content = percentageOnly ? `${percentageFallbackText}` : `${formatCurrency(entry.amount)}`;
      }
    } else {
      content = `${formatCurrency(entry.amount)}`;
    }
    
    li.textContent = content;
    listElement.appendChild(li);
  });
}

function applyPaymentDetails(data) {
  const cashEntries = normalizeEntries(data?.cash_entries || []);
  const cardEntries = normalizeEntries(data?.card_entries || []);
  const transferEntries = normalizeEntries(data?.transfer_entries || []);
  const discountEntries = normalizeEntries(Array.isArray(data?.discount_entry_details) && data.discount_entry_details.length ? data.discount_entry_details : data?.discount_entries || []);

  renderEntryList(els.cashEntriesList, cashEntries);
  renderEntryList(els.cardEntriesList, cardEntries);
  renderEntryList(els.transferEntriesList, transferEntries);
  renderEntryList(els.discountEntriesList, discountEntries, { showPercentage: true, percentageOnly: true });

  const cashTotal = cashEntries.reduce((s, e) => s + e.amount, 0);
  const cardTotal = cardEntries.reduce((s, e) => s + e.amount, 0);
  const transferTotal = transferEntries.reduce((s, e) => s + e.amount, 0);
  const discountTotal = round2(parseNumber(data?.total_discount)) || discountEntries.reduce((s, e) => s + e.amount, 0);

  if (els.cashEntriesTotal) els.cashEntriesTotal.textContent = formatCurrency(cashTotal);
  if (els.cardEntriesTotal) els.cardEntriesTotal.textContent = formatCurrency(cardTotal);
  if (els.transferEntriesTotal) els.transferEntriesTotal.textContent = formatCurrency(transferTotal);
  if (els.discountEntriesTotal) els.discountEntriesTotal.textContent = formatCurrency(discountTotal);
}

function processBestBudsOrders(data) {
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  let totalDailyGrams = 0;
  const tableRows = [];
  
  orders.forEach(order => {
    let lineGram = 0;
    let mainAndAccPrice = 0;
    let fbPriceTotal = 0;
    let mainItemName = "";

    const items = order?.line_items || order?.items || [];
    
    const orderTotalMoney = Number(order?.total_money || 0); 
    const orderDiscountMoney = Number(order?.total_discount || 0);
    const hasOrderDiscount = orderDiscountMoney > 0;

    items.forEach(item => {
      let itemName = String(item?.name || item?.item_name || "").toLowerCase();
      let category = String(item?.category_name || "").toLowerCase();
      
      let grossPrice = Number(item?.gross_total_money || item?.total_money || (Number(item?.price || 0) * Number(item?.quantity || item?.qty || 0))); 
      
      let itemNetPrice = grossPrice;
      if (hasOrderDiscount && orderTotalMoney > 0) {
          itemNetPrice = grossPrice - (grossPrice / (orderTotalMoney + orderDiscountMoney) * orderDiscountMoney);
      }

      let qty = Number(item?.quantity || item?.qty || 0);

      // Lemon Cherry Override (7G Fix)
      if (itemName.includes('lemon cherry') && grossPrice >= 4970) {
        qty = 7; 
      }

      // Category Identification
      let isAcc = ['accessories', 'bong', 'paper', 'tip', 'grinder', 'shirt', 'hat', 'lighter']
                  .some(keyword => itemName.includes(keyword) || category.includes(keyword));
      
      let isFB = ['soft drink', 'snacks', 'gummy', 'water', 'soda', 'milk']
                 .some(keyword => itemName.includes(keyword) || category.includes(keyword)) || (grossPrice / (qty || 1)) <= 50;

      // Best Buds Routing Logic
      if (isFB) {
        fbPriceTotal += itemNetPrice; 
      } else if (isAcc) {
        mainAndAccPrice += itemNetPrice; 
      } else {
        mainAndAccPrice += itemNetPrice; 
        
        // Gram Exclusion Logic
        const isFree = grossPrice === 0 || itemName.includes('free');
        const isLobbyShirt = itemName.includes('the lobby shirt');
        
        if (!isFree && !isLobbyShirt) {
          lineGram += qty;
          if (!mainItemName) mainItemName = item?.name;
        }
      }
    });

    totalDailyGrams += lineGram;
    
    // Price Split Format
    const splitFormat = `THB ${mainAndAccPrice.toFixed(2)} / ${fbPriceTotal.toFixed(2)}`;
    
    // Table Row
    tableRows.push({
      time: order?.created_at || "",
      receiptNumber: order?.receipt_number || "",
      g: lineGram,
      name: mainItemName || (mainAndAccPrice > 0 ? "Accessories" : "F&B/Misc"),
      priceDisplay: `${mainAndAccPrice.toFixed(2)} / ${fbPriceTotal.toFixed(2)}`
    });
  });

  return { 
    totalDailyGrams, 
    tableRows
  };
}

function renderBestBudsTable(data) {
  if (!els.bestBudsSalesBody) return;

  const { totalDailyGrams, tableRows } = processBestBudsOrders(data || {});
  const totalGrams = round2(totalDailyGrams);

  // Update total grams display
  if (els.totalGramsSold) {
    els.totalGramsSold.textContent = formatGram(totalGrams);
  }

  els.bestBudsSalesBody.innerHTML = '';

  if (!tableRows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="3" class="text-muted text-center py-3">-</td>`;
    els.bestBudsSalesBody.appendChild(tr);
    return;
  }

  tableRows.forEach((row, idx) => {
    const tr = document.createElement('tr');
    const gramClass = row.g > 0 ? 'text-success fw-bold' : 'text-muted';
    tr.innerHTML = `
      <td class="${gramClass}">${row.g > 0 ? row.g.toFixed(3) : '0.000'}</td>
      <td>${row.name || 'Item'}</td>
      <td class="text-end price-split">${row.priceDisplay}</td>
    `;
    els.bestBudsSalesBody.appendChild(tr);
  });
}

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
  if (els.message) {
    els.message.textContent = text;
    els.message.className = `alert alert-${variant}`;
  }
}

function clearMessage() {
  if (els.message) {
    els.message.className = 'alert d-none';
    els.message.textContent = '';
  }
}

async function syncFromLoyverse() {
  clearMessage();
  if (!els.reportDate?.value) return;
  setButtonLoading(els.syncButton, 'Syncing...', true);
  try {
    const res = await fetch(`/api/loyverse/sync?date=${els.reportDate.value}`, { cache: 'no-store' });
    const data = await res.json();
    console.log('Received Payload:', data);
    
    if (!res.ok) throw new Error(data?.message || 'Sync failed');
    
    lastSyncedData = data;
    applyPaymentDetails(data);
    renderBestBudsTable(data);
    
    if (els.cashTotal) els.cashTotal.value = round2(data?.cash_total || 0).toFixed(2);
    if (els.cardTotal) els.cardTotal.value = round2(data?.card_total || 0).toFixed(2);
    if (els.transferTotal) els.transferTotal.value = round2(data?.transfer_total || 0).toFixed(2);
    if (els.netSale) els.netSale.value = round2(data?.net_sale || 0).toFixed(2);
    if (els.totalOrders) els.totalOrders.value = data?.total_orders || 0;
    
  } catch (e) { 
    console.error('Sync Error:', e);
    setMessage(`Error: ${e.message}`, 'danger');
  }
  finally { 
    setButtonLoading(els.syncButton, '', false); 
  }
}

function bindEvents() {
  if (els.syncButton) {
    els.syncButton.addEventListener('click', syncFromLoyverse);
  }
}

let lastSyncedData = null;

function init() {
  if (els.reportDate) {
    els.reportDate.value = todayLocalDate();
  }
  bindEvents();
  syncFromLoyverse();
  const mainContent = document.querySelector('.app-main-content');
  if (mainContent) {
    mainContent.style.display = 'block';
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
