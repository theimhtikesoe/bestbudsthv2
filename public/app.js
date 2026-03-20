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

  unclassifiedHint: document.getElementById('unclassifiedHint'),

  totalGramsValue: document.getElementById('totalGramsValue'),
  bestBudsEntriesList: document.getElementById('bestBudsEntriesList')
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
  // If the number is between 0 and 1 (exclusive of 0), assume it's a decimal representation and multiply by 100.
  // Otherwise, assume it's already a percentage value.
  // If the number is between 0 and 1 (exclusive of 0), assume it's a decimal representation and multiply by 100.
  // Otherwise, assume it's already a percentage value.
  // Also, if the number is exactly 1, it should be 100%.
  // If the number is between 0 and 1 (exclusive of 0), assume it's a decimal representation and multiply by 100.
  // Otherwise, assume it's already a percentage value.
  // Also, if the number is exactly 1, it should be 100%.
  // If the number is greater than 1, assume it's already a percentage value (e.g., 40 for 40%).
  // If the number is between 0 and 1, assume it's a decimal (e.g., 0.4 for 40%).
  // If the number is between 0 and 1 (exclusive of 0), assume it's a decimal representation and multiply by 100.
  // Otherwise, assume it's already a percentage value.
  // If the number is between 0 and 1 (exclusive of 0), assume it's a decimal representation and multiply by 100.
  // If the number is greater than 1, assume it's already a percentage value.
  // If the number is 0, return 0.
  // If the number is between 0 and 1 (exclusive of 0), assume it's a decimal representation and multiply by 100.
  // If the number is greater than 1, assume it's already a percentage value.
  // If the number is 0, return 0.
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
    const detailStr = "";
    
    let content = '';
    if (showPercentage) {
      if (entry.percentage !== null) {
        content = percentageOnly ? `${formatPercentage(entry.percentage)}` : `${formatPercentage(entry.percentage)} • ${formatCurrency(entry.amount)}`;
      } else {
        content = percentageOnly ? `${percentageFallbackText}` : `${formatCurrency(entry.amount)}`;
      }
    } else {
      // Final Master Codex: Format each entry as [Main+Acc Price] / [F&B Price]
      if (entry.main_acc_total !== undefined && entry.fb_total !== undefined) {
        const mStr = formatCurrency(entry.main_acc_total).replace('THB ', '');
        const fbStr = formatCurrency(entry.fb_total).replace('THB ', '');
        content = `THB ${mStr} / ${fbStr}`;
      } else {
        // Fallback if split info is missing
        content = `${formatCurrency(entry.amount)} / 0.00`;
      }
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

function processBestBudsData(items) {
  let lineGram = 0;
  let mainAndAccPrice = 0;
  let fbPriceTotal = 0;
  let mainItemName = '';

  const list = Array.isArray(items) ? items : [];
  list.forEach(item => {
    let itemName = String(item.name || item.item_name || "").toLowerCase();
    let category = String(item.category_name || "").toLowerCase();
    let price = Number(item.price || 0);
    let qty = Number(item.quantity || item.qty || 0);
    let itemTotal = price * qty;

    // --- [1] LEMON CHERRY OVERRIDE (7G Fix) ---
    if (itemName.includes('lemon cherry') && itemTotal === 4970) {
      qty = 7; 
    }

    // --- [2] CATEGORY IDENTIFICATION ---
    let isAcc = category.includes('accessories') || 
                itemName.includes('accessories') || 
                itemName.includes('bong') || 
                itemName.includes('paper') || 
                itemName.includes('tip') || 
                itemName.includes('grinder');
    let isFB = category.includes('soft drink') || 
               category.includes('snacks') || 
               itemName.includes('gummy') || 
               itemName.includes('water') || 
               itemName.includes('soda');

    // --- [3] THE BEST BUDS ROUTING LOGIC ---
    if (price <= 50 || isFB) {
      // Group B: F&B (ဒါမှမဟုတ် 50 THB အောက် Item တွေ)
      // Action -> ညာဘက်မှာထားမယ်, Gram 0.000
      fbPriceTotal += itemTotal;
    } else if (isAcc) {
      // Group C: Real Accessories (50 THB ထက်ကြီးသော အသုံးအဆောင်များ)
      // Action -> ဘယ်ဘက်မှာထားမယ်, Gram 0.000
      mainAndAccPrice += itemTotal;
    } else {
      // Group A: Main Flowers (ပန်းသီးသန့်)
      // Action -> ဘယ်ဘက်မှာထားမယ်, Gram ပေါင်းမယ်
      mainAndAccPrice += itemTotal;
      lineGram += qty;
      if (!mainItemName) mainItemName = item.name;
    }
  });

  return {
    mainGram: round2(lineGram),
    mainAndAccPrice: round2(mainAndAccPrice),
    fbPrice: round2(fbPriceTotal),
    itemName: mainItemName || 'Accessories'
  };
}

function normalizeBestBudsRows(data) {
  const automatedRows = Array.isArray(data.automated_report_rows) ? data.automated_report_rows : [];
  if (automatedRows.length > 0) {
    return automatedRows.map((row) => ({
      mainGram: round2(parseNumber(row.gram_qty)),
      itemName: String(row.item_name || 'Accessories'),
      mainAndAccPrice: round2(parseNumber(row.numerator_price)),
      fbPrice: round2(parseNumber(row.denominator_price))
    }));
  }

  const rawOrders = Array.isArray(data.orders) ? data.orders : [];
  return rawOrders.map((order) => processBestBudsData(order.items));
}

function renderBestBudsTable(data) {
  if (!els.bestBudsSalesBody) return;
  const rows = normalizeBestBudsRows(data);

  els.bestBudsSalesBody.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="3" class="text-muted text-center py-3">-</td>';
    els.bestBudsSalesBody.appendChild(tr);
  } else {
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      // Use formatCurrency for both sides of the slash
      const mainPriceStr = formatCurrency(row.mainAndAccPrice).replace('THB ', '');
      const fbPriceStr = formatCurrency(row.fbPrice).replace('THB ', '');
      
      tr.innerHTML = `
        <td class="gram-value">${round2(row.mainGram).toFixed(3)}</td>
        <td>${row.itemName || 'Accessories'}</td>
        <td class="text-end price-split">${mainPriceStr} / ${fbPriceStr}</td>
      `;
      els.bestBudsSalesBody.appendChild(tr);
    });
  }

  const totalGram = rows.reduce((sum, row) => sum + parseNumber(row.mainGram), 0);
  if (els.totalGramsSold) {
    els.totalGramsSold.textContent = formatGram(totalGram);
  }
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
  els.message.textContent = text;
  els.message.className = `alert alert-${variant}`;
}

function clearMessage() {
  els.message.className = 'alert d-none';
  els.message.textContent = '';
}

async function syncFromLoyverse() {
  clearMessage();
  if (!els.reportDate.value) return;
  setButtonLoading(els.syncButton, 'Syncing...', true);
  try {
    const res = await fetch(`/api/loyverse/sync?date=${els.reportDate.value}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Sync failed');
    lastSyncedData = data;
    applyPaymentDetails(data);
    renderBestBudsTable(data);
    els.cashTotal.value = round2(data.cash_total).toFixed(2);
    els.cardTotal.value = round2(data.card_total).toFixed(2);
    if (els.transferTotal) els.transferTotal.value = round2(data.transfer_total).toFixed(2);
    els.netSale.value = round2(data.net_sale).toFixed(2);
    els.totalOrders.value = data.total_orders || 0;
    recalculate();
  } catch (e) { console.error(e); }
  finally { setButtonLoading(els.syncButton, '', false); }
}



function resetFields() {
  els.cashTotal.value = '0.00';
  els.cardTotal.value = '0.00';
  if (els.transferTotal) els.transferTotal.value = '0.00';
  els.totalOrders.value = '0';
  els.netSale.value = '0.00';
  if (els.totalGramsSold) els.totalGramsSold.textContent = formatGram(0);
  els.expense.value = '0.00';
  els.tip.value = '0.00';
  els.oneKBillCount.value = '0';
  els.openingCash.value = '0.00';
  els.actualCashCounted.value = '0.00';
  els.cashEntriesList.innerHTML = '';
  els.cardEntriesList.innerHTML = '';
  els.transferEntriesList.innerHTML = '';
  els.discountEntriesList.innerHTML = '';
  if (els.bestBudsSalesBody) {
    els.bestBudsSalesBody.innerHTML = '<tr><td colspan="3" class="text-muted text-center py-3">-</td></tr>';
  }
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





// ─── BestBuds Order Report ───────────────────────────────────────────────────

/**
 * processBestBudsOrders
 * Transforms automated_report_rows from the Loyverse sync response
 * into a display-ready array using Group A / B / C rules.
 *
 * Each row already contains:
 *   gram_qty          – total grams (Group A qty)
 *   numerator_price   – Group A + Group C price
 *   denominator_price – Group B (F&B) price
 *   price_split       – "numerator / denominator" string
 *   net_sales         – total receipt net sales
 *   receipt_number    – receipt identifier
 *   time              – receipt timestamp
 *
 * Returns an array of objects:
 *   { g, priceDisplay, receiptNumber, time }
 */
function processBestBudsOrders(data) {
  const orders = Array.isArray(data.orders) ? data.orders : [];
  let totalDailyGrams = 0;
  const tableRows = [];
  
  // Payment Entries အသစ်အတွက် Array များ
  const splitCashEntries = [];
  const splitCardEntries = [];
  const splitTransferEntries = [];

  orders.forEach(order => {
    let lineGram = 0;
    let mainAndAccPrice = 0;
    let fbPriceTotal = 0;
    let mainItemName = "";

    const items = order.line_items || order.items || [];
    
    // --- [1] Discount တွက်ချက်ခြင်း (Gram အပြည့်ရအောင်) ---
    const orderTotalMoney = Number(order.total_money || 0); 
    const orderDiscountMoney = Number(order.total_discount || 0);
    const hasOrderDiscount = orderDiscountMoney > 0;

    items.forEach(item => {
      let itemName = String(item.name || item.item_name || "").toLowerCase();
      let category = String(item.category_name || "").toLowerCase();
      
      // Gross price (discount မနှုတ်ခင် စျေး) ကို ယူမယ်
      let grossPrice = Number(item.gross_total_money || item.total_money || (Number(item.price || 0) * Number(item.quantity || item.qty || 0))); 
      
      // Discount ရှိရင် Net Price ပြောင်းတွက်မယ်
      let itemNetPrice = grossPrice;
      if (hasOrderDiscount && orderTotalMoney > 0) {
          itemNetPrice = grossPrice - (grossPrice / (orderTotalMoney + orderDiscountMoney) * orderDiscountMoney);
      }

      let qty = Number(item.quantity || item.qty || 0);

      // --- [2] Lemon Cherry Override (7G Fix) ---
      if (itemName.includes('lemon cherry') && grossPrice >= 4970) {
        qty = 7; 
      }

      // --- [3] CATEGORIZATION ---
      let isAcc = ['accessories', 'bong', 'paper', 'tip', 'grinder', 'shirt', 'hat', 'lighter']
                  .some(keyword => itemName.includes(keyword) || category.includes(keyword));
      
      // 50 THB အောက်ဆိုရင် F&B ထဲ အလိုလို ထည့်မယ်
      let isFB = ['soft drink', 'snacks', 'gummy', 'water', 'soda', 'milk']
                 .some(keyword => itemName.includes(keyword) || category.includes(keyword)) || (grossPrice / (qty || 1)) <= 50;

      // --- [4] BEST BUDS ROUTING LOGIC ---
      if (isFB) {
        fbPriceTotal += itemNetPrice; 
      } else if (isAcc) {
        mainAndAccPrice += itemNetPrice; 
      } else {
        mainAndAccPrice += itemNetPrice; 
        
        // --- [NEW] Gram Exclusion Logic ---
        // Price 0, Discount 100%, Name contains "free", or "The Lobby Shirt"
        const isFree = grossPrice === 0 || itemName.includes('free');
        const isLobbyShirt = itemName.includes('the lobby shirt');
        
        if (!isFree && !isLobbyShirt) {
          lineGram += qty; // Main Flower ဆိုမှ Gram ပေါင်းမယ်
          if (!mainItemName) mainItemName = item.name;
        }
      }
    });

    totalDailyGrams += lineGram;
    
    // --- [5] Payment Details အတွက် Split string အစစ် ---
    const splitFormat = `THB ${mainAndAccPrice.toFixed(2)} / ${fbPriceTotal.toFixed(2)}`;
    
    // ငွေပေးချေတဲ့ ပုံစံ (Cash, Card, Transfer) ကို ရှာမယ်
    const tenderType = String(order.payment_type || (order.payments && order.payments[0]?.tender_type) || "CASH").toUpperCase();

    if (tenderType === 'CASH') {
        splitCashEntries.push(splitFormat);
    } else if (tenderType === 'CARD') {
        splitCardEntries.push(splitFormat);
    } else {
        splitTransferEntries.push(splitFormat);
    }

    // Table Row အတွက်
    tableRows.push({
      time: order.created_at || "",
      receiptNumber: order.receipt_number || "",
      g: lineGram,
      name: mainItemName || (mainAndAccPrice > 0 ? "Accessories" : "F&B/Misc"),
      priceDisplay: `${mainAndAccPrice.toFixed(2)} / ${fbPriceTotal.toFixed(2)}`
    });
  });

  return { 
    totalDailyGrams, 
    tableRows, 
    cashEntries: splitCashEntries, 
    cardEntries: splitCardEntries, 
    transferEntries: splitTransferEntries 
  };
}

/**
 * renderBestBudsReport
 * Renders the processed order rows into the BestBuds table
 * and updates the total grams display.
 */
function renderBestBudsReport(data) {
  const tbody = els.bestBudsEntriesList;
  const totalGramsEl = els.totalGramsValue;
  if (!tbody) return;

  const { totalDailyGrams, tableRows, cashEntries, cardEntries, transferEntries } = processBestBudsOrders(data);
  const totalGrams = round2(totalDailyGrams);

  // Update total grams display
  if (totalGramsEl) {
    totalGramsEl.textContent = `${totalGrams.toFixed(2)} G`;
    if (totalGrams > 0) {
      totalGramsEl.classList.add('text-success');
      totalGramsEl.classList.remove('text-muted');
    } else {
      totalGramsEl.classList.remove('text-success');
      totalGramsEl.classList.add('text-muted');
    }
  }

  // Update Payment Details UI Boxes
  if (els.cashEntriesList) {
    els.cashEntriesList.innerHTML = cashEntries.map(entry => `<div>${entry}</div>`).join('');
  }
  if (els.cardEntriesList) {
    els.cardEntriesList.innerHTML = cardEntries.map(entry => `<div>${entry}</div>`).join('');
  }
  if (els.transferEntriesList) {
    els.transferEntriesList.innerHTML = transferEntries.map(entry => `<div>${entry}</div>`).join('');
  }

  tbody.innerHTML = '';

  if (!tableRows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td colspan="4" class="text-muted text-center">-</td>`;
    tbody.appendChild(tr);
    return;
  }

  tableRows.forEach((order, idx) => {
    const tr = document.createElement('tr');
    const timeStr = order.time ? formatTime(order.time) : '-';
    const gramClass = order.g > 0 ? 'text-success fw-bold' : 'text-muted';
    tr.innerHTML = `
      <td class="text-muted small">${timeStr}</td>
      <td class="text-muted small">${order.receiptNumber || (idx + 1)}</td>
      <td class="${gramClass}">${order.g > 0 ? order.g.toFixed(2) + ' G' : '0'}</td>
      <td class="small">${order.priceDisplay}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ─────────────────────────────────────────────────────────────────────────────

function bindEvents() {
  els.syncButton.addEventListener('click', syncFromLoyverse);




  

  

}

let lastSyncedData = null;

function recalculate() {
  console.log("Recalculating Best Buds Totals...");
  if (lastSyncedData && typeof renderBestBudsReport === 'function') {
    renderBestBudsReport(lastSyncedData);
  }
}

function init() {
  els.reportDate.value = todayLocalDate();
  bindEvents();
  syncFromLoyverse();
  document.querySelector('.app-main-content').style.display = 'block';
}

init();
