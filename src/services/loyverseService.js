const axios = require('axios');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
const { calculateNetSale, normalizeMoney, roundCurrency, toNumber } = require('../utils/calculations');

dayjs.extend(utc);
dayjs.extend(timezone);

const loyverseClient = axios.create({
  baseURL: process.env.LOYVERSE_API_BASE_URL || 'https://api.loyverse.com/v1.0',
  timeout: 30000
});

function getHeaders() {
  const token = process.env.LOYVERSE_API_TOKEN;
  if (!token) {
    throw new Error('LOYVERSE_API_TOKEN is not configured');
  }

  return {
    Authorization: `Bearer ${token}`
  };
}

function getDateBounds(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }

  // --- THAILAND TIMEZONE SYNC FIX ---
  // Using dayjs with timezone for robust calculation
  const tz = process.env.LOYVERSE_TIMEZONE || 'Asia/Bangkok';
  
  // Start Time: 00:00:25 of the selected date in local timezone
  const startLocal = dayjs.tz(`${date} 00:00:25`, tz);
  
  // End Time: 23:59:59 of the selected date in local timezone
  const endLocal = dayjs.tz(`${date} 23:59:59`, tz);

  if (!startLocal.isValid()) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }

  // Loyverse API expects UTC timestamps in ISO 8601 format
  return {
    startIso: startLocal.utc().format('YYYY-MM-DDTHH:mm:ss[Z]'),
    endIso: endLocal.utc().format('YYYY-MM-DDTHH:mm:ss[Z]')
  };
}

async function fetchPaymentTypeMap() {
  try {
    const response = await loyverseClient.get('/payment_types', {
      headers: getHeaders()
    });

    const paymentTypes =
      response.data?.payment_types ||
      response.data?.items ||
      response.data?.data ||
      [];

    const map = new Map();
    for (const type of paymentTypes) {
      const id = type.id || type.payment_type_id;
      if (!id) {
        continue;
      }
      map.set(id, {
        name: type.name || type.payment_type || '',
        type: type.type || ''
      });
    }

    return map;
  } catch (error) {
    return new Map();
  }
}

/**
 * Fetches all categories from Loyverse and returns a Map of category_id -> category_name (lowercase).
 */
async function fetchCategoryIdNameMap() {
  try {
    const response = await loyverseClient.get('/categories', {
      headers: getHeaders()
    });
    const categories = response.data?.categories || response.data?.data || [];
    const map = new Map();
    for (const cat of categories) {
      const id = cat.id || cat.category_id;
      const name = cat.name || cat.category_name || '';
      if (id) map.set(id, String(name).trim().toLowerCase());
    }
    console.log(`[Loyverse API] Category id->name map built: ${map.size} categories`);
    return map;
  } catch (error) {
    console.error('[Loyverse API] fetchCategoryIdNameMap failed:', error.message);
    return new Map();
  }
}

/**
 * Fetches all items from Loyverse and builds a Map of item_id -> category_name (lowercase).
 * Uses category_id -> category_name map to resolve names.
 * Falls back to empty Map on error so the rest of the report still works.
 */
async function fetchItemCategoryMap() {
  try {
    // Step 1: get category_id -> category_name map
    const categoryIdNameMap = await fetchCategoryIdNameMap();

    // Step 2: fetch all items with pagination
    const items = [];
    let cursor = null;
    let pages = 0;
    const MAX_PAGES = 20;

    do {
      const params = { limit: 250 };
      if (cursor) params.cursor = cursor;

      const response = await loyverseClient.get('/items', {
        headers: getHeaders(),
        params
      });

      const payload = response.data || {};
      const pageItems = payload.items || payload.data || [];
      items.push(...pageItems);
      cursor = payload.cursor || null;
      pages += 1;
    } while (cursor && pages < MAX_PAGES);

    // Step 3: build item_id -> category_name map
    const map = new Map();
    for (const item of items) {
      const id = item.id || item.item_id;
      if (!id) continue;
      // Loyverse Items API returns category_id, not category_name
      const categoryId = item.category_id;
      const categoryName = categoryId
        ? (categoryIdNameMap.get(categoryId) || '')
        : (item.category_name || item.category || '');
      map.set(id, String(categoryName).trim().toLowerCase());
    }

    console.log(`[Loyverse API] Item category map built: ${map.size} items`);
    return map;
  } catch (error) {
    console.error('[Loyverse API] fetchItemCategoryMap failed:', error.message);
    return new Map();
  }
}

async function fetchClosedReceiptsByDate(date) {
  const { startIso, endIso } = getDateBounds(date);
  console.log(`[Loyverse API] Fetching receipts for date: ${date}`);
  console.log(`[Loyverse API] Time range - Start: ${startIso}, End: ${endIso}`);

  const receipts = [];
  let cursor;
  let pages = 0;

  do {
    const params = {
      created_at_min: startIso,
      created_at_max: endIso,
      status: 'CLOSED',
      limit: 250
    };

    if (cursor) {
      params.cursor = cursor;
    }

    const response = await loyverseClient.get('/receipts', {
      headers: getHeaders(),
      params
    });

    const payload = response.data || {};
    const pageReceipts = payload.receipts || payload.items || payload.data || [];
    console.log(`[Loyverse API] Page ${pages + 1}: Received ${pageReceipts.length} receipts`);
    
    // Log receipt timestamps for debugging
    if (pageReceipts.length > 0) {
      const timestamps = pageReceipts.map(r => r.created_at || r.createdAt || 'N/A').slice(0, 3);
      console.log(`[Loyverse API] Sample receipt timestamps: ${timestamps.join(', ')}`);
    }
    
    receipts.push(...pageReceipts);

    const nextCursor = payload.cursor || payload.next_cursor || payload.nextCursor || null;
    cursor = nextCursor && nextCursor !== cursor ? nextCursor : null;
    pages += 1;

    if (pages > 100) {
      throw new Error('Loyverse pagination limit exceeded while fetching receipts');
    }
  } while (cursor);

  console.log(`[Loyverse API] Total receipts fetched: ${receipts.length}`);
  return receipts;
}

function classifyPaymentType(paymentTypeText) {
  const normalized = String(paymentTypeText || '').toUpperCase();

  if (normalized.includes('CASH')) {
    return 'cash';
  }

  if (
    normalized.includes('CARD') ||
    normalized.includes('CREDIT') ||
    normalized.includes('DEBIT') ||
    normalized.includes('VISA') ||
    normalized.includes('MASTER')
  ) {
    return 'card';
  }

  // Add Transfer classification
  if (
    normalized.includes('TRANSFER') ||
    normalized.includes('BANK') ||
    normalized.includes('KBANK') ||
    normalized.includes('SCB') ||
    normalized.includes('BBL') ||
    normalized.includes('PROMPTPAY')
  ) {
    return 'transfer';
  }

  return 'other';
}

function hasRefundData(receipt) {
  const refundedFlags = [
    receipt.is_refunded,
    receipt.refunded,
    receipt.is_returned
  ];
  if (refundedFlags.some((flag) => flag === true)) {
    return true;
  }

  if (receipt.refunded_at || receipt.returned_at) {
    return true;
  }

  const refundCollections = [
    receipt.refunds,
    receipt.refund_items,
    receipt.returns
  ];

  return refundCollections.some((collection) => Array.isArray(collection) && collection.length > 0);
}

function isVoidedReceipt(receipt) {
  const status = String(receipt.status || '').toUpperCase();
  const voidStatuses = new Set(['VOIDED', 'VOID', 'CANCELLED', 'CANCELED', 'DELETED']);

  return (
    voidStatuses.has(status) ||
    receipt.voided_at ||
    receipt.cancelled_at ||
    receipt.canceled_at ||
    receipt.deleted_at ||
    receipt.is_voided === true
  );
}

function isCompletedReceipt(receipt) {
  if (isVoidedReceipt(receipt) || hasRefundData(receipt)) {
    return false;
  }

  const status = String(receipt.status || '').toUpperCase();
  const completedStatuses = new Set(['', 'CLOSED', 'COMPLETED', 'PAID']);
  return completedStatuses.has(status);
}

function normalizeCategoryValue(rawCategory) {
  return String(rawCategory || '').trim().toLowerCase();
}

function getReceiptIdentifier(receipt) {
  return (
    receipt.receipt_number ||
    receipt.number ||
    receipt.id ||
    receipt.receipt_id ||
    'unknown-receipt'
  );
}

function extractLineItemCategory(lineItem) {
  if (!lineItem || typeof lineItem !== 'object') {
    return '';
  }

  // Loyverse API uses category_name on line_items
  if (lineItem.category_name) {
    return normalizeCategoryValue(lineItem.category_name);
  }

  if (Object.prototype.hasOwnProperty.call(lineItem, 'category')) {
    return normalizeCategoryValue(lineItem.category);
  }

  return '';
}

function extractLineItemQty(lineItem) {
  const qty =
    lineItem?.quantity ??
    lineItem?.qty ??
    lineItem?.count ??
    lineItem?.item_quantity ??
    0;

  const normalized = toNumber(qty);
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
}

function extractLineItemPrice(lineItem) {
  // --- Zero-Value Gatekeeper Rule ---
  // Prioritize net amount (after discounts) using nullish coalescing to catch 0
  const directAmount =
    lineItem?.total_money?.amount ??
    lineItem?.total_price_money?.amount ??
    lineItem?.line_total_money?.amount ??
    lineItem?.total ??
    lineItem?.total_price ??
    lineItem?.line_total ??
    lineItem?.amount ??
    null;

  if (directAmount !== null && directAmount !== undefined) {
    return normalizeMoney(directAmount);
  }

  // Fallback to gross amount minus explicit discounts if net is not directly available
  const grossAmount = 
    lineItem?.gross_sales_money?.amount ??
    lineItem?.subtotal_money?.amount ??
    null;

  if (grossAmount !== null && grossAmount !== undefined) {
    const gross = normalizeMoney(grossAmount);
    const discount = normalizeMoney(
      lineItem?.total_discount_money?.amount ?? 
      lineItem?.discount_money?.amount ?? 
      lineItem?.discount_amount ?? 
      0
    );
    return roundCurrency(gross - discount);
  }

  const unitPrice =
    lineItem?.price_money?.amount ??
    lineItem?.unit_price_money?.amount ??
    lineItem?.price ??
    lineItem?.unit_price ??
    0;

  const qty = extractLineItemQty(lineItem);
  return roundCurrency(normalizeMoney(unitPrice) * qty);
}

function buildAutomatedReceiptRow(receipt, itemCategoryMap = new Map()) {
  const lineItems = receipt.line_items || receipt.items || [];
  const receiptNumber = getReceiptIdentifier(receipt);
  const time = receipt.created_at || receipt.receipt_date || null;
  const strictCategoryRequired = String(process.env.LOYVERSE_STRICT_CATEGORY || 'false').toLowerCase() === 'true';

  let totalGram = 0;
  let numeratorPrice = 0;
  let denominatorPrice = 0;
  let netSales = 0;
  let mainItemName = '';

  for (let index = 0; index < lineItems.length; index += 1) {
    const lineItem = lineItems[index];
    let itemName = String(lineItem.item_name || lineItem.name || "").toLowerCase();
    let category = extractLineItemCategory(lineItem);
    if (!category) {
      const itemId = lineItem.item_id || lineItem.id;
      if (itemId && itemCategoryMap.has(itemId)) {
        category = itemCategoryMap.get(itemId);
      }
    }
    let normalizedCategory = category || 'uncategorized';
    let price = extractLineItemPrice(lineItem);
    let qty = extractLineItemQty(lineItem);
    let itemTotal = price; // In backend, price is already the total for the line item

    // --- [1] LEMON CHERRY OVERRIDE (7G Fix) ---
    if (itemName.includes('lemon cherry') && itemTotal === 4970) {
      qty = 7; 
    }

    // --- [2] CATEGORY IDENTIFICATION ---
    let isAcc = normalizedCategory.includes('accessories') || 
                normalizedCategory.includes('merchandise') ||
                itemName.includes('accessories') || 
                itemName.includes('bong') || 
                itemName.includes('paper') || 
                itemName.includes('tip') || 
                itemName.includes('grinder') ||
                itemName.includes('shirt') ||
                itemName.includes('hat') ||
                itemName.includes('lighter') ||
                itemName.includes('the lobby') ||
                itemName.includes('merch');
    let isFB = (normalizedCategory.includes('soft drink') || 
                normalizedCategory.includes('snacks') || 
                normalizedCategory.includes('beverage') ||
                normalizedCategory.includes('drink') ||
                normalizedCategory.includes('food') ||
                normalizedCategory.includes('bakery') ||
                itemName.includes('gummy') || 
                itemName.includes('water') || 
                itemName.includes('soda') ||
                itemName.includes('beer') ||
                itemName.includes('drink') ||
                itemName.includes('beverage') ||
                itemName.includes('alcohol') ||
                itemName.includes('wine') ||
                itemName.includes('cider') ||
                itemName.includes('spirit') ||
                itemName.includes('cocktail') ||
                itemName.includes('milk') ||
                itemName.includes('coffee') ||
                (itemName.includes('tea') && !itemName.includes('tea time')) ||
                itemName.includes('juice') ||
                itemName.includes('cookie') ||
                itemName.includes('brownie') ||
                itemName.includes('cake')) && !itemName.includes('rozay cake');

    // --- [3] THE BEST BUDS ROUTING LOGIC ---
    // Note: In backend, we need to determine unit price for the <= 50 check
    const unitPrice = qty > 0 ? roundCurrency(itemTotal / qty) : itemTotal;

    if (unitPrice <= 50 || isFB) {
      // Group B: F&B (ဒါမှမဟုတ် 50 THB အောက် Item တွေ)
      // Action -> ညာဘက်မှာထားမယ်, Gram 0.000
      denominatorPrice += itemTotal;
    } else if (isAcc) {
      // Group C: Real Accessories (50 THB ထက်ကြီးသော အသုံးအဆောင်များ)
      // Action -> ဘယ်ဘက်မှာထားမယ်, Gram 0.000
      numeratorPrice += itemTotal;
    } else {
      // Group A: Main Flowers (ပန်းသီးသန့်)
      // Action -> ဘယ်ဘက်မှာထားမယ်, Gram ပေါင်းမယ်
      numeratorPrice += itemTotal;
      
      // --- [NEW] Gram Exclusion Logic ---
      // 1. Price 0 (THB 0) items are excluded
      // 2. Name containing "free" are excluded
      // 3. "The Lobby Shirt" is excluded
      // 4. 100% Discounted items are excluded (itemTotal would be 0)
      const isFree = itemTotal <= 0 || itemName.includes('free');
      const isLobbyShirt = itemName.includes('the lobby shirt');
      
      if (!isFree && !isLobbyShirt) {
        totalGram += qty;
        if (!mainItemName) {
          mainItemName = String(lineItem.item_name || lineItem.name || "").trim();
        }
      }
    }

    netSales += itemTotal;
  }

  return {
    receipt_number: receiptNumber,
    time,
    gram_qty: roundCurrency(totalGram),
    item_name: mainItemName || 'Accessories',
    numerator_price: roundCurrency(numeratorPrice),
    denominator_price: roundCurrency(denominatorPrice),
    price_split: `${roundCurrency(numeratorPrice)} / ${roundCurrency(denominatorPrice)}`,
    net_sales: roundCurrency(netSales)
  };
}

function buildAutomatedReportRows(receipts, itemCategoryMap = new Map()) {
  const rows = receipts.map(receipt => buildAutomatedReceiptRow(receipt, itemCategoryMap));

  const totals = rows.reduce(
    (acc, row) => {
      acc.total_gram_qty += toNumber(row.gram_qty);
      acc.total_numerator_price += toNumber(row.numerator_price);
      acc.total_denominator_price += toNumber(row.denominator_price);
      acc.total_net_sales += toNumber(row.net_sales);
      return acc;
    },
    {
      total_gram_qty: 0,
      total_numerator_price: 0,
      total_denominator_price: 0,
      total_net_sales: 0
    }
  );

  return {
    rows,
    totals: {
      total_gram_qty: roundCurrency(totals.total_gram_qty),
      total_numerator_price: roundCurrency(totals.total_numerator_price),
      total_denominator_price: roundCurrency(totals.total_denominator_price),
      total_price_split: `${roundCurrency(totals.total_numerator_price)} / ${roundCurrency(totals.total_denominator_price)}`,
      total_net_sales: roundCurrency(totals.total_net_sales)
    }
  };
}

function extractPaymentEntries(receipt, paymentTypeMap) {
  // Loyverse receipts typically have payments in receipt.payments
  const payments =
    receipt.payments ||
    receipt.payment_details ||
    receipt.payment_type_totals ||
    [];

  const time = receipt.created_at || receipt.receipt_date || null;
  const receiptNumber = receipt.receipt_number || receipt.number || null;

  if (Array.isArray(payments) && payments.length > 0) {
    return payments.map((payment) => {
      const paymentTypeId = payment.payment_type_id || payment.paymentTypeId || payment.type_id;
      const mapped = paymentTypeId ? paymentTypeMap.get(paymentTypeId) : null;

      const paymentTypeLabel = [
        payment.payment_type,
        payment.payment_type_name,
        payment.name,
        payment.type,
        mapped?.name,
        mapped?.type
      ]
        .filter(Boolean)
        .join(' ');

      // Most reliable way is to check nested amount fields first
      const rawAmount = 
        payment.money_amount?.amount ?? 
        payment.amount_money?.amount ?? 
        payment.total_money?.amount ?? 
        payment.money_amount ?? 
        payment.amount_money ?? 
        payment.amount ?? 
        payment.collected_money ?? 
        payment.total_money ?? 
        payment.value ?? 
        0;

      return {
        paymentTypeLabel,
        amount: normalizeMoney(rawAmount),
        time,
        receiptNumber
      };
    });
  }

  // If no payments array, fallback to receipt level fields
  const fallbackAmount = 
    receipt.total_money?.amount ?? 
    receipt.total_paid_money?.amount ?? 
    receipt.total_money ?? 
    receipt.total ?? 
    receipt.total_paid_money ?? 
    0;

  return [
    {
      paymentTypeLabel: [
        receipt.payment_type,
        receipt.payment_type_name,
        receipt.tender_type,
        receipt.payment_method
      ]
        .filter(Boolean)
        .join(' '),
      amount: normalizeMoney(fallbackAmount),
      time,
      receiptNumber
    }
  ];
}

function extractDiscountValue(entry) {
  const rawAmount =
    entry?.money_amount ??
    entry?.amount_money?.amount ??
    entry?.amount_money ??
    entry?.amount ??
    entry?.discount_money ??
    entry?.discount_amount ??
    entry?.total_discount_money ??
    entry?.value ??
    0;

  return normalizeMoney(rawAmount);
}

function normalizePercentageValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const normalizedRaw =
    typeof value === 'string'
      ? value.replace('%', '').trim()
      : value;
  const parsed = Number(normalizedRaw);
  if (!Number.isFinite(parsed) || parsed === 0) {
    return null;
  }

  const absolute = Math.abs(parsed);
  const percentage = absolute > 0 && absolute <= 1 ? absolute * 100 : absolute;
  return roundCurrency(percentage);
}

function deriveDiscountPercentageFromBase(discountAmount, baseAmount) {
  const normalizedDiscount = Math.abs(normalizeMoney(discountAmount));
  const normalizedBase = Math.abs(normalizeMoney(baseAmount));

  if (normalizedDiscount <= 0 || normalizedBase <= normalizedDiscount) {
    return null;
  }

  const percentage = roundCurrency((normalizedDiscount / normalizedBase) * 100);
  if (!Number.isFinite(percentage) || percentage <= 0 || percentage >= 100) {
    return null;
  }

  return percentage;
}

function pickPreferredDiscountPercentage(candidates) {
  const normalized = candidates
    .map((candidate) => normalizePercentageValue(candidate))
    .filter((value) => Number.isFinite(value) && value > 0 && value < 100)
    .map((value) => roundCurrency(value));

  if (!normalized.length) {
    return null;
  }

  const frequencyMap = new Map();
  for (const value of normalized) {
    frequencyMap.set(value, (frequencyMap.get(value) || 0) + 1);
  }

  const unique = [...frequencyMap.keys()];
  unique.sort((a, b) => {
    const freqDiff = (frequencyMap.get(b) || 0) - (frequencyMap.get(a) || 0);
    if (freqDiff !== 0) {
      return freqDiff;
    }

    const decimalA = Math.abs(a - Math.round(a));
    const decimalB = Math.abs(b - Math.round(b));

    if (decimalA !== decimalB) {
      return decimalA - decimalB;
    }

    return b - a;
  });

  return unique[0];
}

function pushMoneyCandidate(target, rawValue) {
  const amount = Math.abs(normalizeMoney(rawValue));
  if (amount > 0) {
    target.push(amount);
  }
}

function deriveDiscountPercentageFromContext(discountAmount, context) {
  if (!context || typeof context !== 'object') {
    return null;
  }

  const normalizedDiscount = Math.abs(normalizeMoney(discountAmount));
  if (normalizedDiscount <= 0) {
    return null;
  }

  const grossCandidates = [];
  const netCandidates = [];

  const grossFields = [
    context.gross_sales_money,
    context.gross_total_money,
    context.total_before_discount_money,
    context.total_before_discounts_money,
    context.original_total_money,
    context.subtotal_before_discounts_money
  ];

  const netFields = [
    context.total_money,
    context.total,
    context.total_paid_money,
    context.net_sales_money,
    context.subtotal_money
  ];

  for (const field of grossFields) {
    pushMoneyCandidate(grossCandidates, field);
  }
  for (const field of netFields) {
    pushMoneyCandidate(netCandidates, field);
  }

  const quantity = toNumber(context.quantity);
  const normalizedQuantity = Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
  const unitPriceFields = [
    context.price_money,
    context.price,
    context.unit_price_money,
    context.unit_price,
    context.base_price_money,
    context.item_price_money
  ];

  for (const unitPrice of unitPriceFields) {
    const normalizedUnitPrice = Math.abs(normalizeMoney(unitPrice));
    if (normalizedUnitPrice > 0) {
      grossCandidates.push(normalizedUnitPrice * normalizedQuantity);
    }
  }

  const percentages = [];
  for (const gross of grossCandidates) {
    const p = deriveDiscountPercentageFromBase(normalizedDiscount, gross);
    if (p !== null) percentages.push(p);
  }
  for (const net of netCandidates) {
    const p = deriveDiscountPercentageFromBase(normalizedDiscount, net + normalizedDiscount);
    if (p !== null) percentages.push(p);
  }

  return pickPreferredDiscountPercentage(percentages);
}

function deriveDiscountPercentageFromReceiptLineItems(discountAmount, receipt) {
  const lineItems = receipt.line_items || receipt.items || [];
  if (!Array.isArray(lineItems) || !lineItems.length) {
    return null;
  }

  const candidates = [];
  for (const line of lineItems) {
    const p = extractDiscountPercentage(line);
    if (p !== null) candidates.push(p);
  }

  return pickPreferredDiscountPercentage(candidates);
}

function extractDiscountPercentage(entry, options = {}) {
  const { depth = 0, visited = new Set() } = options;
  if (depth > 3 || !entry || typeof entry !== 'object' || visited.has(entry)) {
    return null;
  }
  visited.add(entry);

  const directCandidates = [
    entry.percentage,
    entry.percent,
    entry.rate,
    entry.value_percentage,
    entry.discount_percentage,
    entry.percent_off,
    entry.discount_percent
  ];

  for (const candidate of directCandidates) {
    const percentage = normalizePercentageValue(candidate);
    if (percentage !== null) {
      return percentage;
    }
  }

  const typeText = [
    entry.type,
    entry.discount_type,
    entry.value_type,
    entry.calculation_type,
    entry.amount_type
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();

  const valueCandidateRaw =
    typeof entry.value === 'string'
      ? entry.value.replace('%', '').trim()
      : entry.value;
  if (typeText.includes('PERCENT')) {
    const percentage = normalizePercentageValue(valueCandidateRaw);
    if (percentage !== null) {
      return percentage;
    }
  }

  const textFields = [
    entry.name,
    entry.title,
    entry.label,
    entry.description,
    entry.reason,
    entry.note
  ]
    .filter(Boolean)
    .map((value) => String(value))
    .join(' ');

  const match = textFields.match(/(\d+(?:\.\d+)?)\s*%/);
  if (match) {
    const percentage = normalizePercentageValue(match[1]);
    if (percentage !== null) {
      return percentage;
    }
  }

  const nestedDiscountFields = [
    entry.discount,
    entry.discounts,
    entry.applied_discount,
    entry.applied_discounts,
    entry.discount_data,
    entry.discount_detail,
    entry.discount_details
  ];

  for (const nestedField of nestedDiscountFields) {
    if (!nestedField) {
      continue;
    }

    if (Array.isArray(nestedField)) {
      for (const nestedEntry of nestedField) {
        const percentage = extractDiscountPercentage(nestedEntry, {
          depth: depth + 1,
          visited
        });
        if (percentage !== null) {
          return percentage;
        }
      }
      continue;
    }

    if (typeof nestedField === 'object') {
      const percentage = extractDiscountPercentage(nestedField, {
        depth: depth + 1,
        visited
      });
      if (percentage !== null) {
        return percentage;
      }
    }
  }

  return null;
}

function createDiscountEntry(amount, percentage = null, time = null, receiptNumber = null) {
  const normalizedAmount = roundCurrency(Math.abs(amount));
  if (normalizedAmount <= 0) {
    return null;
  }

  const normalizedPercentage = normalizePercentageValue(percentage);

  return {
    amount: normalizedAmount,
    percentage: Number.isFinite(normalizedPercentage) && normalizedPercentage > 0 ? normalizedPercentage : null,
    time,
    receiptNumber
  };
}

function extractDiscountEntriesFromReceipt(receipt) {
  const receiptLevelCandidates = [
    receipt.total_discounts_money,
    receipt.total_discount_money,
    receipt.total_discount,
    receipt.discount_money,
    receipt.discount_amount,
    receipt.discount
  ];

  const entries = [];

  const receiptDiscountLists = [
    receipt.total_discounts,
    receipt.discounts,
    receipt.applied_discounts
  ];

  for (const list of receiptDiscountLists) {
    if (!Array.isArray(list)) {
      continue;
    }
    for (const discount of list) {
      const amount = Math.abs(extractDiscountValue(discount));
      const percentage =
        extractDiscountPercentage(discount) ??
        deriveDiscountPercentageFromReceiptLineItems(amount, receipt) ??
        deriveDiscountPercentageFromContext(amount, discount) ??
        deriveDiscountPercentageFromContext(amount, receipt);
      const entry = createDiscountEntry(
        amount, 
        percentage, 
        receipt.created_at || receipt.receipt_date || null,
        receipt.receipt_number || receipt.number || null
      );
      if (entry) {
        entries.push(entry);
      }
    }
  }

  const lineItems = receipt.line_items || receipt.items || [];
  if (Array.isArray(lineItems)) {
    for (const line of lineItems) {
      const lineLevelCandidates = [
        line.total_discounts_money,
        line.total_discount_money,
        line.discount_money,
        line.discount_amount,
        line.discount
      ];

      let lineDiscount = null;
      for (const candidate of lineLevelCandidates) {
        const amount = Math.abs(normalizeMoney(candidate));
        if (amount > 0) {
          const percentage =
            extractDiscountPercentage(line) ??
            deriveDiscountPercentageFromContext(amount, line) ??
            deriveDiscountPercentageFromContext(amount, receipt);
          lineDiscount = createDiscountEntry(
            amount, 
            percentage, 
            receipt.created_at || receipt.receipt_date || null,
            receipt.receipt_number || receipt.number || null
          );
          break;
        }
      }

      if (lineDiscount) {
        entries.push(lineDiscount);
        continue;
      }

      const lineDiscountLists = [line.discounts, line.applied_discounts];
      for (const list of lineDiscountLists) {
        if (!Array.isArray(list)) {
          continue;
        }
        for (const discount of list) {
          const amount = Math.abs(extractDiscountValue(discount));
          const percentage =
            extractDiscountPercentage(discount) ??
            extractDiscountPercentage(line) ??
            deriveDiscountPercentageFromContext(amount, discount) ??
            deriveDiscountPercentageFromContext(amount, line) ??
            deriveDiscountPercentageFromContext(amount, receipt);
          const entry = createDiscountEntry(
        amount, 
        percentage, 
        receipt.created_at || receipt.receipt_date || null,
        receipt.receipt_number || receipt.number || null
      );
          if (entry) {
            entries.push(entry);
          }
        }
      }
    }
  }

  if (entries.length > 0) {
    return entries;
  }

  const fallbackPercentage = extractDiscountPercentage(receipt);
  for (const candidate of receiptLevelCandidates) {
    const amount = Math.abs(normalizeMoney(candidate));
    const percentage =
      fallbackPercentage ??
      deriveDiscountPercentageFromContext(amount, receipt);
    const entry = createDiscountEntry(
        amount, 
        percentage, 
        receipt.created_at || receipt.receipt_date || null,
        receipt.receipt_number || receipt.number || null
      );
    if (entry) {
      return [entry];
    }
  }

  return [];
}

async function fetchSalesSummaryByDate(date) {
  const paymentTypeMap = await fetchPaymentTypeMap();
  const itemCategoryMap = await fetchItemCategoryMap();
  const receipts = await fetchClosedReceiptsByDate(date);
  
  console.log(`[DEBUG] Total receipts fetched: ${receipts.length}`);
  
  const totals = {
    total_cash: 0,
    total_card: 0,
    total_transfer: 0,
    total_discount: 0,
    total_orders: 0,
    unclassified_amount: 0,
    cash_entries: [],
    card_entries: [],
    transfer_entries: [],
    discount_entries: [],
    discount_entry_details: []
  };

  const closedReceipts = receipts.filter(isCompletedReceipt);

  // Enrich each receipt's line_items with category_name from itemCategoryMap
  // so the frontend can classify items correctly
  for (const receipt of closedReceipts) {
    const lineItems = receipt.line_items || receipt.items || [];
    for (const lineItem of lineItems) {
      if (!lineItem.category_name) {
        const itemId = lineItem.item_id || lineItem.id;
        if (itemId && itemCategoryMap.has(itemId)) {
          lineItem.category_name = itemCategoryMap.get(itemId);
        }
      }
    }
  }

  for (const receipt of closedReceipts) {
    const paymentEntries = extractPaymentEntries(receipt, paymentTypeMap);
    const discountEntries = extractDiscountEntriesFromReceipt(receipt);
    
    // Calculate split for this receipt to apply to payment entries
    const receiptRow = buildAutomatedReceiptRow(receipt, itemCategoryMap);
    const mainAccTotal = receiptRow.numerator_price;
    const fbTotal = receiptRow.denominator_price;

    for (const discountEntry of discountEntries) {
      totals.total_discount += discountEntry.amount;
      totals.discount_entries.push(discountEntry);
      totals.discount_entry_details.push(discountEntry);
    }

    // Calculate total paid for this receipt across all payment methods
    const totalPaidOnReceipt = paymentEntries.reduce((sum, p) => sum + p.amount, 0);

    for (const entry of paymentEntries) {
      const paymentCategory = classifyPaymentType(entry.paymentTypeLabel);
      
      // Attach split info to the entry
      // If there's only one payment, it gets the full split. 
      // If multiple, we prorate based on the payment amount.
      if (totalPaidOnReceipt > 0) {
        const ratio = entry.amount / totalPaidOnReceipt;
        entry.main_acc_total = roundCurrency(mainAccTotal * ratio);
        entry.fb_total = roundCurrency(fbTotal * ratio);
      } else {
        entry.main_acc_total = 0;
        entry.fb_total = 0;
      }

      console.log(`[DEBUG] Payment entry - Label: "${entry.paymentTypeLabel}", Amount: ${entry.amount}, Category: ${paymentCategory}`);
      if (paymentCategory === 'cash') {
        totals.total_cash += entry.amount;
        totals.cash_entries.push(entry);
      } else if (paymentCategory === 'card') {
        totals.total_card += entry.amount;
        totals.card_entries.push(entry);
      } else if (paymentCategory === 'transfer') {
        totals.total_transfer += entry.amount;
        totals.transfer_entries.push(entry);
      } else {
        console.log(`[DEBUG] Unclassified payment: ${entry.paymentTypeLabel} = ${entry.amount}`);
        totals.unclassified_amount += entry.amount;
      }
    }
  }

  totals.total_cash = roundCurrency(totals.total_cash);
  totals.total_card = roundCurrency(totals.total_card);
  totals.total_transfer = roundCurrency(totals.total_transfer);
  totals.total_discount = roundCurrency(totals.total_discount);
  totals.total_orders = closedReceipts.length;
  const automatedReport = buildAutomatedReportRows(closedReceipts, itemCategoryMap);

  const netSale = calculateNetSale({
    cash_total: totals.total_cash,
    card_total: totals.total_card,
    transfer_total: totals.total_transfer
  });

  return {
    date,
    cash_total: totals.total_cash,
    card_total: totals.total_card,
    transfer_total: totals.total_transfer,
    net_sale: netSale,
    total_orders: totals.total_orders,
    unclassified_amount: roundCurrency(totals.unclassified_amount),
    cash_entries: totals.cash_entries,
    card_entries: totals.card_entries,
    transfer_entries: totals.transfer_entries,
    total_discount: totals.total_discount,
    discount_entries: totals.discount_entries,
    discount_entry_details: totals.discount_entry_details,
    automated_report_rows: automatedReport.rows,
    automated_report_totals: automatedReport.totals,
    orders: closedReceipts
  };
}

module.exports = {
  fetchSalesSummaryByDate,
  fetchClosedReceiptsByDate,
  fetchPaymentTypeMap,
  extractPaymentEntries,
  classifyPaymentType,
  isCompletedReceipt
};
