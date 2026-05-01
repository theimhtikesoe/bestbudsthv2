const ExcelJS = require('exceljs');

/**
 * Check if a receipt is a refund receipt
 */
function isRefundReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') return false;
  
  // Check receipt type
  const receiptType = String(receipt.receipt_type || receipt.type || '').toUpperCase();
  if (receiptType === 'REFUND') return true;
  
  // Check for refund flags
  if (receipt.is_refunded === true || receipt.refunded === true || receipt.is_returned === true) return true;
  if (receipt.refunded_at || receipt.returned_at) return true;
  
  // Check for refund collections
  const hasRefunds = Array.isArray(receipt.refunds) && receipt.refunds.length > 0;
  const hasRefundItems = Array.isArray(receipt.refund_items) && receipt.refund_items.length > 0;
  const hasReturns = Array.isArray(receipt.returns) && receipt.returns.length > 0;
  
  return hasRefunds || hasRefundItems || hasReturns;
}

/**
 * Generate Excel report matching the frontend export template
 * @param {string} date - Report date
 * @param {Object} reportData - Sales summary data
 * @param {Array} receipts - Original Loyverse receipts
 * @param {Array} expenses - Daily expenses
 * @param {string} closingStaff - Closing staff names (optional)
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function generateExcelReport(date, reportData, receipts, expenses, closingStaff = 'N/A') {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Daily Report');
  sheet.properties.defaultRowHeight = 22;

  // Set column widths for better visibility
  sheet.columns = [
    { header: 'Item Type', key: 'type', width: 15 },
    { header: 'Item Name', key: 'name', width: 35 },
    { header: 'Qty', key: 'qty', width: 10 },
    { header: 'Gram', key: 'gram', width: 12 },
    { header: 'Unit Price', key: 'unitPrice', width: 15 },
    { header: 'Discount', key: 'discount', width: 20 },
    { header: 'Net Price', key: 'netPrice', width: 15 },
    { header: 'Payment', key: 'payment', width: 15 },
    { header: 'Note', key: 'note', width: 25 }
  ];

  // Styling - matching frontend
  const border = { 
    top: { style: 'thin', color: { argb: 'FFD5B68A' } }, 
    left: { style: 'thin', color: { argb: 'FFD5B68A' } }, 
    bottom: { style: 'thin', color: { argb: 'FFD5B68A' } }, 
    right: { style: 'thin', color: { argb: 'FFD5B68A' } } 
  };
  const titleFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2A2010' } };
  const sectionFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3D2A14' } };
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1D8AC' } };
  const rowLight = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFBF4' } };
  const rowDark = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4E0' } };

  // Item Classification Logic
  const flowerStrains = [
    'grape soda', 'blue pave', 'devil driver', 'lemon cherry gelato', 
    'moonbow', 'emergen c', 'tea time', 'silver shadow', 
    'rozay cake', 'truffaloha', 'the planet of grape', 'crunch berriez',
    'big foot', 'honey bee', 'jealousy mintz', 'crystal candy',
    'alien mint', 'rocket fuel', 'gold dust', 'darth vader',
    'cherry pop tarts', 'white cherry gelato', 'dosidos', 'obama runtz',
    'free pina colada', 'thc gummy', 'flower', 'bud', 'pre-roll', 'joint',
    'cheese candy', 'vino tinto', 'mac stormper', 'r2d2 fluid', 'planet of the grape'
  ];

  const fbKeywords = [
    'water', 'soda', 'beer', 'drink', 'beverage', 'alcohol', 'wine', 
    'cider', 'spirit', 'cocktail', 'milk', 'coffee', 'tea', 'juice', 
    'corona', 'sato', 'budweiser', 'singha', 'asahi', 'chang', 'leo', 
    'cocacola', 'coke', 'sprite', 'tonic water',
    'cookie', 'brownie', 'cake', 'soju', 'snack', 'food', 'bakery'
  ];
  
  const accessoryKeywords = [
    'accessories', 'merchandise', 'bong', 'paper', 'tip', 'grinder',
    'shirt', 'hat', 'lighter', 'the lobby', 'merch', 'ashtray', 'ash tray',
    'pipe', 'small pipe', 'best buds grinder', 'best buds shirt',
    'nf best buds shirt', 'sw best buds shirt', 'balm 10g'
  ];

  function toMoneyNumber(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof value === 'object') {
      if (Object.prototype.hasOwnProperty.call(value, 'amount')) {
        return toMoneyNumber(value.amount);
      }
      if (Object.prototype.hasOwnProperty.call(value, 'value')) {
        return toMoneyNumber(value.value);
      }
    }
    return null;
  }

  function getMoney(...candidates) {
    for (const candidate of candidates) {
      const amount = toMoneyNumber(candidate);
      if (amount !== null) return amount;
    }
    return null;
  }

  const flowerItems = [];
  const fbItems = [];
  let totalFlowerGrams = 0;
  let calculatedFbTotal = 0;

    receipts.forEach(receipt => {
      // Receipts are already filtered by filterOutRefundReceipts() in the controller.
      // This extra check is a safety guard to skip any remaining refund/voided receipts.
      if (isRefundReceipt(receipt)) return;
      
      // [FIX] Check for 100% receipt-level discount
      const receiptDiscounts = receipt.total_discounts || receipt.discounts || receipt.applied_discounts || [];
      const has100PercentReceiptDiscount = receiptDiscounts.some(d => {
        const p = d.percentage || d.percent || d.rate;
        return p >= 99.99;
      });

      const items = receipt.line_items || receipt.items || [];

    const paymentMethod = (receipt.payments && receipt.payments[0]?.payment_type?.name) || 
                           (receipt.payments && receipt.payments[0]?.name) || 'N/A';
    const receiptNumber = receipt.receipt_number || receipt.number || 'N/A';
    
    const orderDiscount = getMoney(
      receipt.total_discount_money,
      receipt.total_discounts_money,
      receipt.total_discount,
      receipt.discount_money,
      receipt.discount_amount,
      receipt.discount
    ) || 0;
    const orderTotal = getMoney(
      receipt.total_money,
      receipt.total_price_money,
      receipt.amount_money,
      receipt.amount
    ) || 0;
    const hasOrderDiscount = orderDiscount > 0;

    items.forEach(item => {
      let itemName = String(item.name || item.item_name || "").toLowerCase();
      let category = String(item.category_name || "").toLowerCase();
      let qty = Number(item.quantity || item.qty || 0);
      
      let grossPrice = getMoney(
        item.gross_total_money,
        item.subtotal_money,
        item.total_before_discount_money,
        item.total_before_discounts_money,
        item.original_total_money
      );
      const lineItemDiscount = getMoney(
        item.total_discount_money,
        item.total_discounts_money,
        item.discount_money,
        item.discount_amount,
        item.discount
      ) || 0;
      const explicitNetPrice = getMoney(
        item.total_money,
        item.total_price_money,
        item.line_total_money
      );

      if (grossPrice === null) {
        const unitPrice = getMoney(item.price_money, item.unit_price_money, item.price, item.unit_price);
        if (unitPrice !== null && qty > 0) {
          grossPrice = unitPrice * qty;
        }
      }

      if (grossPrice === null && explicitNetPrice !== null) {
        grossPrice = explicitNetPrice + lineItemDiscount;
      }

      if (grossPrice === null) {
        grossPrice = 0;
      }

      const hasExplicitLineNet = explicitNetPrice !== null;
      let itemNetPrice = hasExplicitLineNet ? explicitNetPrice : Math.max(0, grossPrice - lineItemDiscount);
      
      if (!hasExplicitLineNet && hasOrderDiscount && orderTotal > 0 && itemNetPrice > 0) {
        let allocatedOrderDiscount = (itemNetPrice / (orderTotal + orderDiscount)) * orderDiscount;
        itemNetPrice = Math.max(0, itemNetPrice - allocatedOrderDiscount);
      }

      const totalItemDiscount = Math.max(0, grossPrice - itemNetPrice);
      const discountPercent = grossPrice > 0 ? (totalItemDiscount / grossPrice * 100) : 0;
      
      // Rule: Skip items where price is 0 OR discount is 100% from TOTALS, but we might want to list them
      // Based on user request: "The planet of grape" at 100% discount should not be counted in total grams
      // but should be shown in the list with 100% discount.
      
      const is100PercentDiscount = itemNetPrice <= 0.01 || discountPercent >= 99.99;
      const discountStr = (totalItemDiscount > 0.01 || is100PercentDiscount) 
        ? `${discountPercent.toFixed(0)}% (${totalItemDiscount.toFixed(2)} THB)` 
        : '-';

      let isThcGummy = itemName.includes('thc gummy');
      let isAccessory = accessoryKeywords.some(k => itemName.includes(k) || category.includes(k));
      let isLobbyShirt = itemName.includes('the lobby shirt');

      let isFB = !isAccessory && (
        fbKeywords.some(k => itemName.includes(k) || category.includes(k)) ||
        itemName.includes('budweiser') ||
        category.includes('soft drink') || 
        category.includes('snacks') || 
        category.includes('beverage') ||
        category.includes('drink') ||
        category.includes('food') ||
        category.includes('bakery') ||
        (['tea'].some(k => itemName.includes(k) || category.includes(k)) && !itemName.includes('tea time'))
      );

      // Exception: 'tea time' and 'gummy' should not be F&B
      if (isFB && (itemName.includes('tea time') || itemName.includes('gummy'))) {
        isFB = false;
      }

      let isFlowerStrain = !isFB && !isAccessory && flowerStrains.some(strain => {
        return itemName.includes(strain);
      });

      if (!isFlowerStrain && !isFB && !isThcGummy && !isAccessory) {
        const unitPrice = itemNetPrice / (qty || 1);
        if (unitPrice > 50) {
          isFlowerStrain = true;
        } else if (unitPrice > 0) {
          isFB = true;
        } else {
          isFlowerStrain = true;
        }
      }

      const exportType = isFB ? 'F&B' : (isAccessory ? 'Accessories' : 'Flower/Main');
      
      // Determine display values
      let displayQty = qty;
      let displayGram = '-';
      
      // For flower strains (not gummy, not accessories), show gram instead of qty
      if (isFlowerStrain && !isThcGummy && !isAccessory && !isLobbyShirt) {
        displayQty = '-';
        displayGram = `${qty.toFixed(3)} G`;
        // Only add to total grams if NOT 100% discounted AND price > 0 AND no 100% receipt discount
        if (!is100PercentDiscount && itemNetPrice > 0.01 && !has100PercentReceiptDiscount) {
          totalFlowerGrams += qty;
        }
      }

      const unitPrice = grossPrice / (qty || 1);

      const exportItem = {
        type: exportType,
        name: item.name || item.item_name,
        qty: displayQty,
        gram: displayGram,
        unitPrice: unitPrice,
        discount: discountStr,
        netPrice: itemNetPrice,
        payment: paymentMethod,
        note: receiptNumber
      };

      if (isFB) {
        fbItems.push(exportItem);
        // Only add to total revenue if NOT 100% discounted
        if (!is100PercentDiscount) {
          calculatedFbTotal += itemNetPrice;
        }
      } else {
        flowerItems.push(exportItem);
      }
    });
  });

  // --- ROW 1: TITLE ---
  sheet.mergeCells('A1:I1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = `BestBuds Daily Report - ${date}`;
  titleCell.fill = titleFill;
  titleCell.font = { size: 14, bold: true, color: { argb: 'FFF8EBCF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

  // --- ROW 2: HEADERS ---
  const headerRow = sheet.getRow(2);
  headerRow.values = ['Item Type', 'Item Name', 'Qty', 'Gram', 'Unit Price', 'Discount', 'Net Price', 'Payment', 'Note'];
  headerRow.eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = { bold: true, color: { argb: 'FF2A2010' } };
    cell.border = border;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // --- ROWS: DATA ---
  let currentRow = 3;

  // 1. Flower Items
  flowerItems.forEach((item, index) => {
    const row = sheet.getRow(currentRow++);
    row.values = [
      item.type,
      item.name,
      item.qty,
      item.gram,
      item.unitPrice,
      item.discount,
      item.netPrice,
      item.payment,
      item.note
    ];
    row.eachCell((cell) => {
      cell.fill = index % 2 === 0 ? rowLight : rowDark;
      cell.border = border;
      if (cell.col === 5 || cell.col === 7) cell.numFmt = '#,##0.00';
    });
  });

  // 2. F&B Items
  fbItems.forEach((item, index) => {
    const row = sheet.getRow(currentRow++);
    row.values = [
      item.type,
      item.name,
      item.qty,
      item.gram,
      item.unitPrice,
      item.discount,
      item.netPrice,
      item.payment,
      item.note
    ];
    row.eachCell((cell) => {
      cell.fill = index % 2 === 0 ? rowLight : rowDark;
      cell.border = border;
      if (cell.col === 5 || cell.col === 7) cell.numFmt = '#,##0.00';
    });
  });

  // --- SUMMARY DASHBOARD ---
  currentRow += 2;
  sheet.mergeCells(`A${currentRow}:I${currentRow}`);
  const summaryTitle = sheet.getCell(`A${currentRow}`);
  summaryTitle.value = 'REPORT SUMMARY';
  summaryTitle.fill = sectionFill;
  summaryTitle.font = { bold: true, color: { argb: 'FFF1D8AC' } };
  summaryTitle.alignment = { horizontal: 'center' };

  currentRow++;
  const fbTotal = Number(reportData.fb_total || calculatedFbTotal || 0);
  const totalGrams = totalFlowerGrams > 0 ? totalFlowerGrams : Number(reportData.total_grams || 0);

  sheet.getCell(`A${currentRow}`).value = 'Total F&B:';
  sheet.getCell(`B${currentRow}`).value = fbTotal;
  sheet.getCell(`B${currentRow}`).numFmt = '#,##0.00';
  
  sheet.getCell(`D${currentRow}`).value = 'Total Grams:';
  sheet.getCell(`E${currentRow}`).value = totalGrams;
  sheet.getCell(`E${currentRow}`).numFmt = '#,##0.000 "G"';

  currentRow++;
  sheet.getCell(`A${currentRow}`).value = 'Net Sale:';
  sheet.getCell(`B${currentRow}`).value = Number(reportData.net_sale || 0);
  sheet.getCell(`B${currentRow}`).numFmt = '#,##0.00';

  sheet.getCell(`D${currentRow}`).value = 'Closing Staff:';
  sheet.getCell(`E${currentRow}`).value = closingStaff;

  return await workbook.xlsx.writeBuffer();
}

module.exports = {
  generateExcelReport
};
