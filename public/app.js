/**
 * Daily POS Closing & Report System - Frontend Logic
 */

// Global state for synced data
window.lastSyncedData = null;

/**
 * Show alert messages to user
 */
window.showMessage = function(message, type = 'info') {
  const alertContainer = document.getElementById('message');
  if (!alertContainer) return;

  alertContainer.className = `alert alert-${type} d-block`;
  alertContainer.innerHTML = message;

  setTimeout(() => {
    alertContainer.className = 'alert d-none';
  }, 5000);
};

// --- EXPENSES LOGIC ---
let currentNetSale = 0; 

function renderExpenses() {
  const date = document.getElementById('reportDate')?.value;
  if (!date) return;
  const expenses = typeof getLocalExpenses === 'function' ? getLocalExpenses(date) : [];
  if (typeof renderExpensesList === 'function') {
    renderExpensesList(expenses, date);
  }
}
// ----------------------

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
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch (e) { return ''; }
}

function normalizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(entry => {
    let amount = 0, percentage = null, time = null, receiptNumber = null;
    let mainAccTotal = 0, fbTotal = 0;
    
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      // Prioritize discounted amount if available (net amount)
      // Loyverse usually provides 'total_money' or 'amount' as the final paid amount
      amount = entry.total_money?.amount ?? entry.amount_money?.amount ?? entry.money_amount?.amount ?? entry.amount ?? 0;
      
      percentage = parsePercentage(entry.percentage ?? entry.percent ?? entry.rate);
      time = entry.time || null;
      receiptNumber = entry.receiptNumber || entry.receipt_number || entry.number || null;
      // Ensure mainAccTotal and fbTotal reflect discounted prices
      // If main_acc_total or fb_total are not explicitly provided as discounted, derive them from the overall discounted 'amount'
      mainAccTotal = entry.main_acc_total || (entry.amount - (entry.fb_total || 0));
      fbTotal = entry.fb_total || (entry.amount - (entry.main_acc_total || 0));
      
      // Fallback if still zero or negative after derivation, use the amount directly
      if (mainAccTotal <= 0 && fbTotal <= 0) {
        mainAccTotal = amount; // Assume all is main/acc if no breakdown
        fbTotal = 0;
      } else if (mainAccTotal <= 0 && fbTotal > 0) {
        mainAccTotal = amount - fbTotal;
      } else if (fbTotal <= 0 && mainAccTotal > 0) {
        fbTotal = amount - mainAccTotal;
      }
      
      // Ensure they are not negative
      mainAccTotal = Math.max(0, mainAccTotal);
      fbTotal = Math.max(0, fbTotal);
    } else {
      amount = entry;
      mainAccTotal = amount; 
    }
    return { 
      amount: round2(parseNumber(amount)), 
      percentage, time, receiptNumber,
      mainAccTotal: parseNumber(mainAccTotal),
      fbTotal: parseNumber(fbTotal)
    };
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
    let content = '';
    
    if (showPercentage) {
      if (entry.percentage !== null) {
        content = percentageOnly ? `${formatPercentage(entry.percentage)}` : `${formatPercentage(entry.percentage)} • ${formatCurrency(entry.amount)}`;
      } else {
        content = percentageOnly ? `${percentageFallbackText}` : `${formatCurrency(entry.amount)}`;
      }
    } else {
      if (entry.mainAccTotal > 0 && entry.fbTotal > 0) {
        content = `THB ${entry.mainAccTotal.toFixed(2)} / ${entry.fbTotal.toFixed(2)}`;
      } else if (entry.fbTotal > 0 && entry.mainAccTotal <= 0) {
        content = `F&B ${formatCurrency(entry.fbTotal)}`;
      } else if (entry.mainAccTotal > 0 && entry.fbTotal <= 0) {
        content = `${formatCurrency(entry.mainAccTotal)}`;
      } else {
        content = `${formatCurrency(entry.amount)}`;
      }
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

/**
 * Process orders and build both Order Entries table rows and Detailed Sales Record items
 */
function processOrdersData(data) {
  const orders = Array.isArray(data?.orders) ? data.orders : [];
  const orderEntries = [];
  const detailedItems = [];
  let totalGrams = 0;

  orders.forEach(order => {
    let orderLineGram = 0;
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
      
      // --- Zero-Value Gatekeeper Rule ---
      let grossPrice = Number(item?.gross_total_money ?? item?.total_money ?? (Number(item?.price ?? 0) * Number(item?.quantity ?? item?.qty ?? 0)));
      
      // Calculate item-level net price (after line-item discounts)
      let lineItemNetPrice = Number(item?.total_money ?? item?.total_money?.amount ?? 0);
      if (lineItemNetPrice === 0 && grossPrice > 0) {
        lineItemNetPrice = grossPrice - Number(item?.total_discount_money?.amount ?? item?.total_discount_money ?? item?.discount_money?.amount ?? item?.discount_money ?? 0);
      }

      let itemNetPrice = lineItemNetPrice;
      if (hasOrderDiscount && orderTotalMoney > 0 && lineItemNetPrice > 0) {
        itemNetPrice = lineItemNetPrice - (lineItemNetPrice / (orderTotalMoney + orderDiscountMoney) * orderDiscountMoney);
      }

      if (itemNetPrice <= 0.01) return;

      let qty = Number(item?.quantity ?? item?.qty ?? 0);
      if (itemName.includes('lemon cherry') && grossPrice >= 4970) {
        qty = 7;
      }

      const flowerStrains = [
        'grape soda', 'blue pave', 'devil driver', 'lemon cherry gelato', 
        'moonbow', 'emergen c', 'tea time', 'silver shadow', 
        'rozay cake', 'truffaloha', 'the planet of grape', 'crunch berriez',
        'big foot', 'honey bee', 'jealousy mintz', 'crystal candy',
        'alien mint', 'rocket fuel', 'gold dust', 'darth vader',
        'cherry pop tarts', 'white cherry gelato', 'dosidos', 'obama runtz',
        'free pina colada', 'thc gummy'
      ];

      let isFlowerStrain = flowerStrains.some(strain => itemName.includes(strain));
      let isThcGummy = itemName.includes('thc gummy');
      
      let fbKeywords = ['soft drink', 'snacks', 'gummy', 'water', 'soda', 'milk', 'beer', 'drink', 'beverage', 'alcohol', 'wine', 'cider', 'spirit', 'cocktail', 'food', 'coffee', 'juice', 'bakery', 'cookie', 'brownie', 'cake', 'soju'];
      let hasFBKeyword = fbKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword)) ||
                         (['tea'].some(keyword => itemName.includes(keyword) || category.includes(keyword)) && !itemName.includes('tea time'));

      let isFB = !isFlowerStrain && (hasFBKeyword || (grossPrice / (qty || 1)) <= 50);

      if (isFB) {
        fbPriceTotal += itemNetPrice;
      } else {
        mainAndAccPrice += itemNetPrice;
        if (isFlowerStrain && !isThcGummy) {
          orderLineGram += qty;
        }
      }

      detailedItems.push({
        gram: (isFlowerStrain && !isThcGummy) ? `${qty.toFixed(3)} G` : '',
        itemName: item.name || item.item_name,
        price: itemNetPrice,
        isFB: isFB
      });
    });

    orderEntries.push({
      time: order.created_at,
      receipt: order.receipt_number || order.number,
      grams: orderLineGram,
      mainAndAccPrice: mainAndAccPrice,
      fbPrice: fbPriceTotal
    });
    totalGrams += orderLineGram;
  });

  return { orderEntries, detailedItems, totalGrams };
}

function processAutomatedReportRows(data) {
  const rows = Array.isArray(data?.automated_report_rows) ? data.automated_report_rows : [];
  const orderEntries = [];
  const detailedItems = [];
  let totalGrams = 0;

  rows.forEach(row => {
    const items = row.items || [];
    let orderLineGram = 0;
    let mainAndAccPrice = 0;
    let fbPriceTotal = 0;

    items.forEach(item => {
      let itemName = String(item?.item_name || "").toLowerCase();
      let category = String(item?.category_name || "").toLowerCase();
      let qty = Number(item?.quantity || 0);
      let price = Number(item?.price || 0);

      const flowerStrains = [
        'grape soda', 'blue pave', 'devil driver', 'lemon cherry gelato', 
        'moonbow', 'emergen c', 'tea time', 'silver shadow', 
        'rozay cake', 'truffaloha', 'the planet of grape', 'crunch berriez',
        'big foot', 'honey bee', 'jealousy mintz', 'crystal candy',
        'alien mint', 'rocket fuel', 'gold dust', 'darth vader',
        'cherry pop tarts', 'white cherry gelato', 'dosidos', 'obama runtz',
        'free pina colada', 'thc gummy'
      ];

      let isFlowerStrain = flowerStrains.some(strain => itemName.includes(strain));
      let isThcGummy = itemName.includes('thc gummy');

      let fbKeywords = ['soft drink', 'snacks', 'gummy', 'water', 'soda', 'milk', 'beer', 'drink', 'beverage', 'alcohol', 'wine', 'cider', 'spirit', 'cocktail', 'food', 'coffee', 'juice', 'bakery', 'cookie', 'brownie', 'cake', 'soju'];
      let hasFBKeyword = fbKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword)) ||
                         (['tea'].some(keyword => itemName.includes(keyword) || category.includes(keyword)) && !itemName.includes('tea time'));

      let isFB = !isFlowerStrain && (hasFBKeyword || (price / (qty || 1)) <= 50);

      if (isFB) {
        fbPriceTotal += price;
      } else {
        mainAndAccPrice += price;
        if (isFlowerStrain && !isThcGummy) {
          orderLineGram += qty;
        }
      }

      detailedItems.push({
        gram: (isFlowerStrain && !isThcGummy) ? `${qty.toFixed(3)} G` : '',
        itemName: item.item_name,
        price: price,
        isFB: isFB
      });
    });

    orderEntries.push({
      time: row.time,
      receipt: row.receipt_number,
      grams: orderLineGram,
      mainAndAccPrice: mainAndAccPrice,
      fbPrice: fbPriceTotal
    });
    totalGrams += orderLineGram;
  });

  return { orderEntries, detailedItems, totalGrams };
}

/**
 * Sync data from Loyverse API via our backend
 */
async function syncFromLoyverse() {
  const dateInput = document.getElementById('reportDate');
  const staffInput = document.getElementById('closingStaff');
  const syncBtn = document.getElementById('syncButton');
  const date = dateInput?.value;
  const staffName = staffInput?.value || '';

  if (!date) {
    window.showMessage('Please select a date first', 'warning');
    return;
  }

  setButtonLoading(syncBtn, 'Syncing...', true);
  try {
    const res = await fetch(`/api/loyverse/sync?date=${date}`, { cache: 'no-store' });
    const data = await res.json();
    console.log("Received Payload:", data);

    
    if (!res.ok) throw new Error(data?.message || 'Sync failed');
    
    window.lastSyncedData = data;
    console.log("Raw Cash Entries:", data?.cash_entries);
    console.log("Raw Card Entries:", data?.card_entries);
    console.log("Raw Transfer Entries:", data?.transfer_entries);
    
    // Set Net Sale for Expense calculation
    currentNetSale = round2(data?.net_sale || 0);
    
    // Apply payment details
    applyPaymentDetails(data);
    
    // Process and render order data
    let totalGramsCalculated = 0;
    // Use raw orders if available, otherwise fallback to automated_report_rows
    if (Array.isArray(data?.orders) && data.orders.length > 0) {
      const result = processOrdersData(data);
      totalGramsCalculated = result.totalGrams;
      renderOrderEntriesTable(result.orderEntries);
      renderDetailedSalesTable(result.detailedItems, result.totalGrams);
    } else if (Array.isArray(data?.automated_report_rows) && data.automated_report_rows.length > 0) {
      // Fallback: use pre-processed automated_report_rows from backend
      const fallbackResult = processAutomatedReportRows(data);
      totalGramsCalculated = fallbackResult.totalGrams;
      renderOrderEntriesTable(fallbackResult.orderEntries);
      renderDetailedSalesTable(fallbackResult.detailedItems, fallbackResult.totalGrams);
    } else {
      renderOrderEntriesTable([]);
      renderDetailedSalesTable([], 0);
    }
    
    // Update summary totals
    if (els.cashTotal) els.cashTotal.value = round2(data?.cash_total || 0).toFixed(2);
    if (els.cardTotal) els.cardTotal.value = round2(data?.card_total || 0).toFixed(2);
    if (els.transferTotal) els.transferTotal.value = round2(data?.transfer_total || 0).toFixed(2);
    if (els.netSale) els.netSale.value = currentNetSale.toFixed(2);
    if (els.totalOrders) els.totalOrders.value = data?.total_orders || 0;
    
    // Use the totalGrams calculated during processing
    if (els.totalGramsSold) els.totalGramsSold.innerText = totalGramsCalculated.toFixed(3) + ' G';

    // Refresh Expense display
    renderExpenses();
    
  } catch (e) { 
    console.error('Sync Error:', e);
    window.showMessage(`Sync Error: ${e.message}`, 'danger');
  }
  finally { 
    setButtonLoading(syncBtn, '', false); 
  }
}

function setButtonLoading(button, text, isLoading) {
  if (!button) return;
  button.disabled = isLoading;
  if (isLoading) {
    button.dataset.originalText = button.innerHTML;
    button.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${text}`;
  } else {
    button.innerHTML = button.dataset.originalText || 'Sync From Loyverse';
  }
}

function renderOrderEntriesTable(orderEntries) {
  const container = document.getElementById('orderEntriesBody');
  if (!container) return;

  if (!orderEntries || orderEntries.length === 0) {
    container.innerHTML = '<tr><td colspan="4" class="text-center">No orders found</td></tr>';
    return;
  }

  let html = '';
  orderEntries.forEach(entry => {
    const time = new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    html += `
      <tr>
        <td>${time}</td>
        <td>${entry.receipt}</td>
        <td>${entry.grams.toFixed(3)} G</td>
        <td class="text-end">${entry.mainAndAccPrice.toLocaleString()} / ${entry.fbPrice.toLocaleString()}</td>
      </tr>
    `;
  });
  container.innerHTML = html;
}

function renderDetailedSalesTable(detailedItems, totalGrams) {
  const container = document.getElementById('bestBudsSalesBody');
  if (!container) return;

  if (!detailedItems || detailedItems.length === 0) {
    container.innerHTML = '<tr><td colspan="3" class="text-center">No detailed sales found</td></tr>';
    return;
  }

  let html = '';
  detailedItems.forEach(item => {
    html += `
      <tr>
        <td>${item.gram}</td>
        <td>${item.itemName}</td>
        <td class="text-end">${item.price.toLocaleString()}</td>
      </tr>
    `;
  });
  container.innerHTML = html;
}

function bindEvents() {
  const reportDateInput = document.getElementById('reportDate');
  if (reportDateInput) {
    reportDateInput.addEventListener('change', syncFromLoyverse);
  }
  const syncButton = document.getElementById('syncButton');
  if (syncButton) {
    syncButton.addEventListener('click', syncFromLoyverse);
  }
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener('click', exportReportToExcel);
  }
  const addExpenseBtn = document.querySelector('#expenseSection button.btn-success');
  if (addExpenseBtn) {
    addExpenseBtn.addEventListener('click', addExpenseToReport);
  }
}

// Expense logic moved to enhancements.js

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// DOM elements cache
const els = {
  cashTotal: document.getElementById('cashTotal'),
  cardTotal: document.getElementById('cardTotal'),
  transferTotal: document.getElementById('transferTotal'),
  netSale: document.getElementById('netSale'),
  totalOrders: document.getElementById('totalOrders'),
  totalGramsSold: document.getElementById('totalGramsSold'),
  cashEntriesTotal: document.getElementById('cashEntriesTotal'),
  cardEntriesTotal: document.getElementById('cardEntriesTotal'),
  transferEntriesTotal: document.getElementById('transferEntriesTotal'),
  discountEntriesTotal: document.getElementById('discountEntriesTotal'),
  cashEntriesList: document.getElementById('cashEntriesList'),
  cardEntriesList: document.getElementById('cardEntriesList'),
  transferEntriesList: document.getElementById('transferEntriesList'),
  discountEntriesList: document.getElementById('discountEntriesList')
};

function init() {
  const reportDateInput = document.getElementById('reportDate');
  if (reportDateInput) {
    reportDateInput.value = todayLocalDate();
  }
  
  // Refresh els references in case they weren't in DOM yet
  els.cashTotal = document.getElementById('cashTotal');
  els.cardTotal = document.getElementById('cardTotal');
  els.transferTotal = document.getElementById('transferTotal');
  els.netSale = document.getElementById('netSale');
  els.totalOrders = document.getElementById('totalOrders');
  els.totalGramsSold = document.getElementById('totalGramsSold');
  els.cashEntriesTotal = document.getElementById('cashEntriesTotal');
  els.cardEntriesTotal = document.getElementById('cardEntriesTotal');
  els.transferEntriesTotal = document.getElementById('transferEntriesTotal');
  els.discountEntriesTotal = document.getElementById('discountEntriesTotal');
  els.cashEntriesList = document.getElementById('cashEntriesList');
  els.cardEntriesList = document.getElementById('cardEntriesList');
  els.transferEntriesList = document.getElementById('transferEntriesList');
  els.discountEntriesList = document.getElementById('discountEntriesList');

  bindEvents();
  syncFromLoyverse();
  const mainContent = document.querySelector('.app-main-content');
  if (mainContent) {
    mainContent.style.display = 'block';
  }
}

// Old exportToExcel function removed. Using enhanced version in enhancements.js
