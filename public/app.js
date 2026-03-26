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
let activeSyncController = null;
let activeSyncRequestId = 0;
const SYNC_TIMEOUT_MS = 25000;

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

function round3(value) {
  return Number((value || 0).toFixed(3));
}

function formatCurrency(value) {
  const amount = parseNumber(value);
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
  return `THB ${formatted}`;
}

function formatCompactNumber(value) {
  const amount = round2(parseNumber(value));
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}

function formatGramCompact(value) {
  const amount = round3(parseNumber(value));
  return `${amount.toFixed(3).replace(/\.?0+$/, '')}`;
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
      let grossAmount = entry.total_money?.amount ?? entry.amount_money?.amount ?? entry.money_amount?.amount ?? entry.amount ?? 0;
      percentage = parsePercentage(entry.percentage ?? entry.percent ?? entry.rate);

      // Apply discount if percentage is present
      if (percentage > 0) {
        amount = grossAmount * (1 - percentage / 100);
      } else {
        amount = grossAmount;
      }
      time = entry.time || null;
      receiptNumber = entry.receiptNumber || entry.receipt_number || entry.number || null;
      // Ensure mainAccTotal and fbTotal reflect discounted prices
      // If main_acc_total or fb_total are not explicitly provided as discounted, derive them from the overall discounted 'amount'
      let originalMainAccTotal = entry.main_acc_total || 0;
      let originalFbTotal = entry.fb_total || 0;

      if (percentage > 0) {
        mainAccTotal = originalMainAccTotal * (1 - percentage / 100);
        fbTotal = originalFbTotal * (1 - percentage / 100);
      } else {
        mainAccTotal = originalMainAccTotal;
        fbTotal = originalFbTotal;
      }

      // If mainAccTotal or fbTotal are still zero after applying discount, and the overall 'amount' is available, derive them.
      if (mainAccTotal <= 0 && fbTotal <= 0 && amount > 0) {
        mainAccTotal = amount; // Assume all is main/acc if no breakdown
        fbTotal = 0;
      } else if (mainAccTotal <= 0 && fbTotal > 0 && amount > 0) {
        mainAccTotal = amount - fbTotal;
      } else if (fbTotal <= 0 && mainAccTotal > 0 && amount > 0) {
        fbTotal = amount - mainAccTotal;
      }

      // Ensure they are not negative
      mainAccTotal = Math.max(0, mainAccTotal);
      fbTotal = Math.max(0, fbTotal);
      
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
  const { showPercentage = false, percentageOnly = false, percentageFallbackText = 'N/A%', showGram = false } = options;
  
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
    
    if (showPercentage) {
      let content = '';
      if (entry.percentage !== null) {
        content = percentageOnly ? `${formatPercentage(entry.percentage)}` : `${formatPercentage(entry.percentage)} • ${formatCurrency(entry.amount)}`;
      } else {
        content = percentageOnly ? `${percentageFallbackText}` : `${formatCurrency(entry.amount)}`;
      }
      li.textContent = content;
      listElement.appendChild(li);
      return;
    } else {
      if (entry.mainAccTotal > 0 || entry.fbTotal > 0) {
        const mainText = entry.mainAccTotal > 0 ? formatCompactNumber(entry.mainAccTotal) : '';
        const fbText = entry.fbTotal > 0 ? formatCompactNumber(entry.fbTotal) : '-';
        const splitText = `${mainText} / ${fbText}`;
        if (showGram && entry.gramShare > 0) {
          li.appendChild(document.createTextNode(`${splitText} `));
          const gramBadge = document.createElement('span');
          gramBadge.className = 'entry-gram-badge';
          const gramValue = document.createElement('span');
          gramValue.className = 'entry-gram-value';
          gramValue.textContent = formatGramCompact(entry.gramShare);
          const gramUnit = document.createElement('span');
          gramUnit.className = 'entry-gram-unit';
          gramUnit.textContent = 'G';
          gramBadge.appendChild(gramValue);
          gramBadge.append(' ');
          gramBadge.appendChild(gramUnit);
          li.appendChild(gramBadge);
        } else {
          li.textContent = splitText;
        }
      } else {
        li.textContent = `${formatCurrency(entry.amount)}`;
      }
    }
    listElement.appendChild(li);
  });
}

function sortEntriesByTimeAsc(entries) {
  return [...entries].sort((a, b) => {
    const aTime = a?.time ? new Date(a.time).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b?.time ? new Date(b.time).getTime() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });
}

function buildReceiptGramMap(orderEntries) {
  const receiptGramMap = new Map();
  if (!Array.isArray(orderEntries)) return receiptGramMap;

  orderEntries.forEach((entry) => {
    const receiptKey = String(entry?.receipt || '').trim();
    const grams = round3(parseNumber(entry?.grams));
    if (receiptKey && grams > 0.001) {
      receiptGramMap.set(receiptKey, grams);
    }
  });

  return receiptGramMap;
}

function attachGramShare(entries, receiptGramMap) {
  if (!(receiptGramMap instanceof Map) || receiptGramMap.size === 0) {
    return entries.map((entry) => ({ ...entry, gramShare: 0 }));
  }

  const receiptAmountTotals = new Map();
  entries.forEach((entry) => {
    const receiptKey = String(entry?.receiptNumber || '').trim();
    if (!receiptKey) return;
    const nextTotal = parseNumber(receiptAmountTotals.get(receiptKey)) + parseNumber(entry.amount);
    receiptAmountTotals.set(receiptKey, round2(nextTotal));
  });

  return entries.map((entry) => {
    const receiptKey = String(entry?.receiptNumber || '').trim();
    const receiptGrams = round3(parseNumber(receiptGramMap.get(receiptKey)));
    if (!receiptKey || receiptGrams <= 0.001) {
      return { ...entry, gramShare: 0 };
    }

    const entryAmount = round2(parseNumber(entry.amount));
    const receiptAmount = round2(parseNumber(receiptAmountTotals.get(receiptKey)));
    if (receiptAmount <= 0 || entryAmount <= 0) {
      return { ...entry, gramShare: 0 };
    }

    const gramShare = round3(receiptGrams * (entryAmount / receiptAmount));
    return { ...entry, gramShare };
  });
}

function applyPaymentDetails(data, receiptGramMap = new Map()) {
  const cashEntries = attachGramShare(sortEntriesByTimeAsc(normalizeEntries(data?.cash_entries || [])), receiptGramMap);
  const cardEntries = attachGramShare(sortEntriesByTimeAsc(normalizeEntries(data?.card_entries || [])), receiptGramMap);
  const transferEntries = attachGramShare(sortEntriesByTimeAsc(normalizeEntries(data?.transfer_entries || [])), receiptGramMap);
  const discountEntries = normalizeEntries(Array.isArray(data?.discount_entry_details) && data.discount_entry_details.length ? data.discount_entry_details : data?.discount_entries || []);

  renderEntryList(els.cashEntriesList, cashEntries, { showGram: true });
  renderEntryList(els.cardEntriesList, cardEntries, { showGram: true });
  renderEntryList(els.transferEntriesList, transferEntries, { showGram: true });
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
    const receiptNumber = order.receipt_number || order.number;
    const receiptTime = order.created_at;

    const items = order?.line_items || order?.items || [];
    const orderTotalMoney = Number(order?.total_money || 0);
    const orderDiscountMoney = Number(order?.total_discount || 0);
    const hasOrderDiscount = orderDiscountMoney > 0;

    items.forEach(item => {
      let itemName = String(item?.name || item?.item_name || "").toLowerCase();
      let category = String(item?.category_name || "").toLowerCase();
      const qtyRaw = Number(item?.quantity ?? item?.qty ?? 0);
      
      // --- Zero-Value Gatekeeper Rule ---
      const lineNetRaw = item?.total_money?.amount ?? item?.total_money;
      const hasLineNetPrice = lineNetRaw !== undefined && lineNetRaw !== null;
      const grossRaw = item?.gross_total_money?.amount ?? item?.gross_total_money;
      let grossPrice = Number(grossRaw);
      if (!Number.isFinite(grossPrice)) {
        grossPrice = Number(lineNetRaw);
      }
      if (!Number.isFinite(grossPrice)) {
        grossPrice = Number(item?.price ?? 0) * qtyRaw;
      }
      if (!Number.isFinite(grossPrice)) {
        grossPrice = 0;
      }
      
      // Calculate item-level net price (after line-item discounts)
      let lineItemNetPrice = Number(lineNetRaw ?? 0);
      if (!Number.isFinite(lineItemNetPrice)) {
        lineItemNetPrice = 0;
      }
      if (!hasLineNetPrice && grossPrice > 0) {
        lineItemNetPrice = grossPrice - Number(item?.total_discount_money?.amount ?? item?.total_discount_money ?? item?.discount_money?.amount ?? item?.discount_money ?? 0);
      }

      let itemNetPrice = lineItemNetPrice;
      if (!hasLineNetPrice && hasOrderDiscount && orderTotalMoney > 0 && lineItemNetPrice > 0) {
        itemNetPrice = lineItemNetPrice - (lineItemNetPrice / (orderTotalMoney + orderDiscountMoney) * orderDiscountMoney);
      }

      if (itemNetPrice <= 0.01) return;

      let qty = qtyRaw;
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
        'free pina colada', 'flower', 'bud', 'pre-roll', 'joint'
      ];

      const fbKeywords = [
        'water', 'soda', 'beer', 'drink', 'beverage', 'alcohol', 'wine', 
        'cider', 'spirit', 'cocktail', 'milk', 'coffee', 'tea', 'juice',
        'cookie', 'brownie', 'cake', 'soju', 'gummy', 'snack', 'food', 'bakery'
      ];

      const accessoryKeywords = [
        'accessories', 'merchandise', 'bong', 'paper', 'tip', 'grinder',
        'shirt', 'hat', 'lighter', 'the lobby', 'merch', 'ashtray', 'ash tray',
        'pipe', 'small pipe', 'best buds grinder', 'best buds shirt',
        'nf best buds shirt', 'sw best buds shirt'
      ];

      let isFlowerStrain = flowerStrains.some(strain => itemName.includes(strain));
      let isThcGummy = itemName.includes('thc gummy');
      let isAccessory = accessoryKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword));
      
      let isFB = !isFlowerStrain && !isThcGummy && (fbKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword)) ||
                 (['tea'].some(keyword => itemName.includes(keyword) || category.includes(keyword)) && !itemName.includes('tea time')));

      // Fallback to price if not clearly classified by name
      if (!isFlowerStrain && !isFB && !isAccessory) {
        const unitPrice = grossPrice / (qty || 1);
        if (unitPrice <= 50 && unitPrice > 0) {
          isFB = true;
        } else {
          // Check if it's an accessory
          const isAcc = accessoryKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword));
          if (!isAcc) {
            isFlowerStrain = true; // Default to Main/Flower
          }
        }
      }

      if (isFB) {
        fbPriceTotal += itemNetPrice;
      } else {
        mainAndAccPrice += itemNetPrice;
        if (isFlowerStrain && !isThcGummy && !isAccessory) {
          orderLineGram += qty;
        }
      }

      detailedItems.push({
        receipt: receiptNumber,
        time: receiptTime,
        gram: (isFlowerStrain && !isThcGummy && !isAccessory) ? `${qty.toFixed(3)} G` : '',
        itemName: item.name || item.item_name,
        price: itemNetPrice,
        isFB: isFB,
        mainPrice: isFB ? 0 : itemNetPrice,
        fbPrice: isFB ? itemNetPrice : 0
      });
    });

    orderEntries.push({
      time: receiptTime,
      receipt: receiptNumber,
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
        'free pina colada', 'flower', 'bud', 'pre-roll', 'joint'
      ];

      const fbKeywords = [
        'water', 'soda', 'beer', 'drink', 'beverage', 'alcohol', 'wine', 
        'cider', 'spirit', 'cocktail', 'milk', 'coffee', 'tea', 'juice',
        'cookie', 'brownie', 'cake', 'soju', 'gummy', 'snack', 'food', 'bakery'
      ];

      const accessoryKeywords = [
        'accessories', 'merchandise', 'bong', 'paper', 'tip', 'grinder',
        'shirt', 'hat', 'lighter', 'the lobby', 'merch', 'ashtray', 'ash tray',
        'pipe', 'small pipe', 'best buds grinder', 'best buds shirt',
        'nf best buds shirt', 'sw best buds shirt'
      ];

      let isFlowerStrain = flowerStrains.some(strain => itemName.includes(strain));
      let isThcGummy = itemName.includes('thc gummy');
      let isAccessory = accessoryKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword));
      
      let isFB = !isFlowerStrain && !isThcGummy && (fbKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword)) ||
                 (['tea'].some(keyword => itemName.includes(keyword) || category.includes(keyword)) && !itemName.includes('tea time')));

      // Fallback to price if not clearly classified by name
      if (!isFlowerStrain && !isFB && !isAccessory) {
        const unitPrice = price / (qty || 1);
        if (unitPrice <= 50 && unitPrice > 0) {
          isFB = true;
        } else {
          // Check if it's an accessory
          const isAcc = accessoryKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword));
          if (!isAcc) {
            isFlowerStrain = true; // Default to Main/Flower
          }
        }
      }

      if (isFB) {
        fbPriceTotal += price;
      } else {
        mainAndAccPrice += price;
        if (isFlowerStrain && !isThcGummy && !isAccessory) {
          orderLineGram += qty;
        }
      }

      detailedItems.push({
        receipt: row.receipt_number,
        time: row.time,
        gram: (isFlowerStrain && !isThcGummy && !isAccessory) ? `${qty.toFixed(3)} G` : '',
        itemName: item.item_name,
        price: price,
        isFB: isFB,
        mainPrice: isFB ? 0 : price,
        fbPrice: isFB ? price : 0
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
  const requestId = ++activeSyncRequestId;

  if (!date) {
    window.showMessage('Please select a date first', 'warning');
    return;
  }

  if (activeSyncController) {
    activeSyncController.abort();
  }
  const syncController = new AbortController();
  activeSyncController = syncController;
  const timeoutId = setTimeout(() => {
    syncController.abort();
  }, SYNC_TIMEOUT_MS);

  setButtonLoading(syncBtn, 'Syncing...', true);
  try {
    const res = await fetch(`/api/loyverse/sync?date=${date}`, {
      cache: 'no-store',
      signal: syncController.signal
    });
    const data = await res.json().catch(() => ({}));
    if (requestId !== activeSyncRequestId) {
      return;
    }
    console.log("Received Payload:", data);

    
    if (!res.ok) throw new Error(data?.message || 'Sync failed');
    
    window.lastSyncedData = data;
    console.log("Raw Cash Entries:", data?.cash_entries);
    console.log("Raw Card Entries:", data?.card_entries);
    console.log("Raw Transfer Entries:", data?.transfer_entries);
    
    // Set Net Sale for Expense calculation
    currentNetSale = round2(data?.net_sale || 0);
    
    // Process and render order data
    let totalGramsCalculated = 0;
    let receiptGramMap = new Map();
    // Use raw orders if available, otherwise fallback to automated_report_rows
    if (Array.isArray(data?.orders) && data.orders.length > 0) {
      const result = processOrdersData(data);
      totalGramsCalculated = result.totalGrams;
      receiptGramMap = buildReceiptGramMap(result.orderEntries);
      renderOrderEntriesTable(result.orderEntries, result.detailedItems);
    } else if (Array.isArray(data?.automated_report_rows) && data.automated_report_rows.length > 0) {
      // Fallback: use pre-processed automated_report_rows from backend
      const fallbackResult = processAutomatedReportRows(data);
      totalGramsCalculated = fallbackResult.totalGrams;
      receiptGramMap = buildReceiptGramMap(fallbackResult.orderEntries);
      renderOrderEntriesTable(fallbackResult.orderEntries, fallbackResult.detailedItems);
    } else {
      renderOrderEntriesTable([]);
    }

    // Apply payment details after gram map is built from order entries
    applyPaymentDetails(data, receiptGramMap);
    
    // Update summary totals
    if (els.cashTotal) els.cashTotal.value = round2(data?.cash_total || 0).toFixed(2);
    if (els.cardTotal) els.cardTotal.value = round2(data?.card_total || 0).toFixed(2);
    if (els.transferTotal) els.transferTotal.value = round2(data?.transfer_total || 0).toFixed(2);
    if (els.netSale) els.netSale.value = currentNetSale.toFixed(2);
    if (els.totalOrders) els.totalOrders.value = data?.total_orders || 0;
    if (els.orderEntriesFbTotal) {
      const fbTotalFromPayments = [
        ...(data?.cash_entries || []),
        ...(data?.card_entries || []),
        ...(data?.transfer_entries || [])
      ].reduce((sum, entry) => sum + parseNumber(entry?.fb_total), 0);
      els.orderEntriesFbTotal.textContent = formatCurrency(fbTotalFromPayments);
    }
    
    // Use the totalGrams calculated during processing
    if (els.totalGramsSold) els.totalGramsSold.innerText = totalGramsCalculated.toFixed(3) + ' G';

    // Refresh Expense display
    renderExpenses();
    
  } catch (e) { 
    if (requestId !== activeSyncRequestId) {
      return;
    }
    if (e?.name === 'AbortError') {
      window.showMessage('Sync timed out. Please try again.', 'warning');
      return;
    }
    console.error('Sync Error:', e);
    window.showMessage(`Sync Error: ${e.message}`, 'danger');
  }
  finally { 
    clearTimeout(timeoutId);
    if (requestId === activeSyncRequestId) {
      activeSyncController = null;
      setButtonLoading(syncBtn, '', false);
    }
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

function sortOrderEntriesByTimeAsc(entries) {
  return [...entries].sort((a, b) => {
    const aTime = a?.time ? new Date(a.time).getTime() : Number.POSITIVE_INFINITY;
    const bTime = b?.time ? new Date(b.time).getTime() : Number.POSITIVE_INFINITY;
    return aTime - bTime;
  });
}

function renderOrderEntriesTable(orderEntries, detailedItems = []) {
  const container = document.getElementById('orderEntriesBody');
  if (!container) return;

  if (!orderEntries || orderEntries.length === 0) {
    container.innerHTML = '<tr><td colspan="6" class="text-center">No orders found</td></tr>';
    return;
  }

  const detailsByReceipt = new Map();
  detailedItems.forEach((item) => {
    const receiptKey = String(item?.receipt || '').trim();
    if (!receiptKey) return;
    if (!detailsByReceipt.has(receiptKey)) {
      detailsByReceipt.set(receiptKey, []);
    }
    detailsByReceipt.get(receiptKey).push(item);
  });

  const sortedOrderEntries = sortOrderEntriesByTimeAsc(orderEntries);
  let html = '';
  sortedOrderEntries.forEach(entry => {
    const time = new Date(entry.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const receiptKey = String(entry?.receipt || '').trim();
    const detailRows = detailsByReceipt.get(receiptKey) || [];
    const grams = parseNumber(entry?.grams);
    const mainTotal = parseNumber(entry?.mainAndAccPrice);
    const fbTotal = parseNumber(entry?.fbPrice);
    const hasNonZeroSummary = grams > 0.001 || mainTotal > 0.01 || fbTotal > 0.01;
    const hasNonZeroDetails = detailRows.some((item) => (
      parseNumber(item?.mainPrice) > 0.01 ||
      parseNumber(item?.fbPrice) > 0.01 ||
      parseNumber(item?.price) > 0.01
    ));
    if (!hasNonZeroSummary && !hasNonZeroDetails) {
      return;
    }

    html += `
      <tr class="table-light fw-semibold">
        <td>${time}</td>
        <td>${entry.receipt}</td>
        <td>${entry.grams.toFixed(3)} G</td>
        <td><span class="receipt-summary-label">Main/F&amp;B Total</span></td>
        <td class="text-end">${formatCompactNumber(entry.mainAndAccPrice)}</td>
        <td class="text-end">${formatCompactNumber(entry.fbPrice)}</td>
      </tr>
    `;

    detailRows.forEach((item) => {
      const itemGram = item.gram || '-';
      const mainValue = item.mainPrice > 0 ? formatCompactNumber(item.mainPrice) : '-';
      const fbValue = item.fbPrice > 0 ? formatCompactNumber(item.fbPrice) : '-';
      html += `
        <tr class="detail-row">
          <td></td>
          <td><span class="mobile-item-inline">${item.itemName || '-'}</span></td>
          <td>${itemGram}</td>
          <td>${item.itemName || '-'}</td>
          <td class="text-end">${mainValue}</td>
          <td class="text-end">${fbValue}</td>
        </tr>
      `;
    });
  });
  container.innerHTML = html || '<tr><td colspan="6" class="text-center">No orders found</td></tr>';
}

function bindEvents() {
  const reportDateInput = document.getElementById('reportDate');
  if (reportDateInput) {
    reportDateInput.addEventListener('change', () => {
      const monthInput = document.getElementById('reportMonth');
      if (monthInput && reportDateInput.value) {
        monthInput.value = reportDateInput.value.slice(0, 7);
      }
      syncFromLoyverse();
    });
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
  orderEntriesFbTotal: document.getElementById('orderEntriesFbTotal'),
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
  const reportMonthInput = document.getElementById('reportMonth');
  if (reportMonthInput) {
    reportMonthInput.value = todayLocalDate().slice(0, 7);
  }
  
  // Refresh els references in case they weren't in DOM yet
  els.cashTotal = document.getElementById('cashTotal');
  els.cardTotal = document.getElementById('cardTotal');
  els.transferTotal = document.getElementById('transferTotal');
  els.netSale = document.getElementById('netSale');
  els.totalOrders = document.getElementById('totalOrders');
  els.totalGramsSold = document.getElementById('totalGramsSold');
  els.orderEntriesFbTotal = document.getElementById('orderEntriesFbTotal');
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
