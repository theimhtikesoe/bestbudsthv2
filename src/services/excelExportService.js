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
    'free pina colada', 'thc gummy', 'flower', 'bud', 'pre-roll', 'joint'
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
  const refundItems = [];
  let totalFlowerGrams = 0;
  let calculatedFbTotal = 0;
  let totalRefundAmount = 0;

  receipts.forEach(receipt => {
    // Skip refund receipts - they will be processed separately
    if (isRefundReceipt(receipt)) return;
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
      
      // Rule: Skip items where price is 0 OR discount is 100%
      if (itemNetPrice <= 0.01 || discountPercent >= 99.99) {
        return;
      }

      const discountStr = totalItemDiscount > 0.01 ? `${discountPercent.toFixed(0)}% (${totalItemDiscount.toFixed(2)} THB)` : '-';

      let isFlowerStrain = flowerStrains.some(strain => itemName.includes(strain));
      let isThcGummy = itemName.includes('thc gummy');
      let isAccessory = accessoryKeywords.some(k => itemName.includes(k) || category.includes(k));
      let isLobbyShirt = itemName.includes('the lobby shirt');

      let isFB = !isFlowerStrain && !isThcGummy && !isAccessory && (
        fbKeywords.some(k => itemName.includes(k) || category.includes(k)) ||
        category.includes('soft drink') || 
        category.includes('snacks') || 
        category.includes('beverage') ||
        category.includes('drink') ||
        category.includes('food') ||
        category.includes('bakery') ||
        (['tea'].some(k => itemName.includes(k) || category.includes(k)) && !itemName.includes('tea time'))
      );

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
        totalFlowerGrams += qty;
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
        calculatedFbTotal += itemNetPrice;
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

  // --- ROW 2: CLOSING STAFF ---
  sheet.mergeCells('A2:I2');
  const staffCell = sheet.getCell('A2');
  staffCell.value = `Closing Staff: ${closingStaff}`;
  staffCell.font = { bold: true };
  staffCell.alignment = { vertical: 'middle' };

  let currRow = 4;

  // Helper function to paint section header
  const paintSection = (label) => {
    sheet.mergeCells(`A${currRow}:I${currRow}`);
    const c = sheet.getCell(`A${currRow}`);
    c.value = label;
    c.fill = sectionFill;
    c.font = { bold: true, color: { argb: 'FFF6E5C4' } };
    c.alignment = { vertical: 'middle' };
    currRow++;
  };

  // Helper function to paint column headers
  const paintHeader = () => {
    const headers = ['Item Type', 'Item Name', 'Qty', 'Gram', 'Unit Price', 'Discount', 'Net Price', 'Payment', 'Note'];
    headers.forEach((h, i) => {
      const c = sheet.getCell(currRow, i + 1);
      c.value = h;
      c.fill = headerFill;
      c.font = { bold: true };
      c.border = border;
      c.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    currRow++;
  };

  // --- SECTION 1: FLOWERS & ACCESSORIES ---
  paintSection('Flower / Main / Accessories');
  paintHeader();
  flowerItems.forEach((item, i) => {
    const row = sheet.getRow(currRow);
    row.values = [item.type, item.name, item.qty, item.gram, item.unitPrice, item.discount, item.netPrice, item.payment, item.note];
    row.eachCell((cell) => {
      cell.fill = i % 2 === 0 ? rowLight : rowDark;
      cell.border = border;
      cell.alignment = { vertical: 'middle' };
    });
    currRow++;
  });

  // Add Flower Total Row
  const flowerTotalRow = sheet.getRow(currRow);
  flowerTotalRow.getCell(1).value = 'TOTAL FLOWERS';
  flowerTotalRow.getCell(4).value = `${totalFlowerGrams.toFixed(3)} G`;
  flowerTotalRow.eachCell((cell, colNumber) => {
    if (colNumber === 1 || colNumber === 4) {
      cell.font = { bold: true };
      cell.fill = headerFill;
      cell.border = border;
      cell.alignment = { vertical: 'middle' };
    }
  });
  currRow += 2;

  // --- SECTION 2: EXPENSES ---
  paintSection('Expenses');
  const expenseHeaders = ['Category', 'Description', 'Amount'];
  expenseHeaders.forEach((h, i) => {
    const c = sheet.getCell(currRow, i + 1);
    c.value = h;
    c.fill = headerFill;
    c.font = { bold: true };
    c.border = border;
    c.alignment = { vertical: 'middle', horizontal: 'center' };
  });
  currRow++;

  let totalExp = 0;
  if (expenses.length === 0) {
    sheet.getCell(`A${currRow}`).value = '-';
    sheet.getCell(`B${currRow}`).value = 'No expenses';
    sheet.getCell(`C${currRow}`).value = 0;
    ['A', 'B', 'C'].forEach(col => {
      const c = sheet.getCell(`${col}${currRow}`);
      c.border = border;
      c.alignment = { vertical: 'middle' };
    });
    currRow++;
  } else {
    expenses.forEach((exp, i) => {
      const amt = Number(exp.amount || 0);
      totalExp += amt;
      sheet.getCell(`A${currRow}`).value = exp.category;
      sheet.getCell(`B${currRow}`).value = exp.description || '-';
      sheet.getCell(`C${currRow}`).value = amt;
      ['A', 'B', 'C'].forEach(col => {
        const c = sheet.getCell(`${col}${currRow}`);
        c.fill = i % 2 === 0 ? rowLight : rowDark;
        c.border = border;
        c.alignment = { vertical: 'middle' };
      });
      currRow++;
    });
  }

  currRow += 2;

  // --- SECTION 3: FOOD & DRINKS ---
  paintSection('Food & Drinks');
  paintHeader();
  fbItems.forEach((item, i) => {
    const row = sheet.getRow(currRow);
    row.values = [item.type, item.name, item.qty, item.gram, item.unitPrice, item.discount, item.netPrice, item.payment, item.note];
    row.eachCell((cell) => {
      cell.fill = i % 2 === 0 ? rowLight : rowDark;
      cell.border = border;
      cell.alignment = { vertical: 'middle' };
    });
    currRow++;
  });

  // Add F&B Total Row
  const fbTotalRow = sheet.getRow(currRow);
  fbTotalRow.getCell(1).value = 'TOTAL F&B';
  fbTotalRow.getCell(7).value = calculatedFbTotal;
  fbTotalRow.getCell(7).numFmt = '#,##0.00 "THB"';
  fbTotalRow.eachCell((cell, colNumber) => {
    if (colNumber === 1 || colNumber === 7) {
      cell.font = { bold: true };
      cell.fill = headerFill;
      cell.border = border;
      cell.alignment = { vertical: 'middle' };
    }
  });
  currRow += 2;

  // --- SECTION 4: REFUNDS (if any) ---
  // Process refund receipts separately
  const refundReceipts = receipts.filter(receipt => isRefundReceipt(receipt));
  if (refundReceipts.length > 0) {
    refundReceipts.forEach(receipt => {
      const items = receipt.line_items || receipt.items || [];
      const paymentMethod = (receipt.payments && receipt.payments[0]?.payment_type?.name) || 'N/A';
      const receiptNumber = receipt.receipt_number || receipt.number || 'N/A';
      
      items.forEach(item => {
        let itemName = String(item.name || item.item_name || "").toLowerCase();
        let qty = Number(item.quantity || item.qty || 0);
        let grossPrice = getMoney(
          item.gross_total_money,
          item.subtotal_money,
          item.total_before_discount_money
        );
        if (grossPrice === null) {
          const unitPrice = getMoney(item.price_money, item.unit_price_money, item.price, item.unit_price);
          if (unitPrice !== null && qty > 0) {
            grossPrice = unitPrice * qty;
          }
        }
        if (grossPrice === null) grossPrice = 0;
        
        const lineItemDiscount = getMoney(
          item.total_discount_money,
          item.discount_money
        ) || 0;
        const itemNetPrice = Math.max(0, grossPrice - lineItemDiscount);
        
        if (itemNetPrice > 0.01) {
          const unitPrice = grossPrice / (qty || 1);
          const discountStr = lineItemDiscount > 0.01 ? `${((lineItemDiscount / grossPrice) * 100).toFixed(0)}%` : '-';
          
          refundItems.push({
            type: 'Refund',
            name: item.name || item.item_name,
            qty: qty,
            gram: '-',
            unitPrice: unitPrice,
            discount: discountStr,
            netPrice: itemNetPrice,
            payment: paymentMethod,
            note: receiptNumber
          });
          totalRefundAmount += itemNetPrice;
        }
      });
    });
  }
  
  if (refundItems.length > 0) {
    paintSection('Refunds');
    paintHeader();
    refundItems.forEach((item, i) => {
      const row = sheet.getRow(currRow);
      row.values = [item.type, item.name, item.qty, item.gram, item.unitPrice, item.discount, item.netPrice, item.payment, item.note];
      row.eachCell((cell) => {
        cell.fill = i % 2 === 0 ? rowLight : rowDark;
        cell.border = border;
        cell.alignment = { vertical: 'middle' };
      });
      currRow++;
    });
    
    // Add Refund Total Row
    const refundTotalRow = sheet.getRow(currRow);
    refundTotalRow.getCell(1).value = 'TOTAL REFUNDS';
    refundTotalRow.getCell(7).value = totalRefundAmount;
    refundTotalRow.getCell(7).numFmt = '#,##0.00 "THB"';
    refundTotalRow.eachCell((cell, colNumber) => {
      if (colNumber === 1 || colNumber === 7) {
        cell.font = { bold: true };
        cell.fill = headerFill;
        cell.border = border;
        cell.alignment = { vertical: 'middle' };
      }
    });
    currRow += 2;
  }

  // --- SECTION 5: DASHBOARD ---
  paintSection('Daily Summary Dashboard');

  // Calculate totals from reportData
  const cashTotal = Number(reportData.cash_total || 0);
  const cardTotal = Number(reportData.card_total || 0);
  const transferTotal = Number(reportData.transfer_total || 0);
  const fbTotal = Number(reportData.fb_total || calculatedFbTotal || 0);
  const netSale = Number(reportData.net_sale || 0);
  const totalGrams = Number(reportData.total_grams || totalFlowerGrams || 0);

  const summaryData = [
    ['Total Grams Sold', `${totalGrams.toFixed(3)} G`],
    ['Cash In', `${cashTotal.toLocaleString()} THB`],
    ['Card In', `${cardTotal.toLocaleString()} THB`],
    ['Transfer In', `${transferTotal.toLocaleString()} THB`],
    ['F&B Total', `${fbTotal.toLocaleString()} THB`],
    ['Total Expenses', `${totalExp.toLocaleString()} THB`],
    ['Net Sales (Total)', `${netSale.toLocaleString()} THB`],
    ['Net Profit (After Expenses)', `${(netSale - totalExp).toLocaleString()} THB`]
  ];

  summaryData.forEach((row) => {
    sheet.mergeCells(`A${currRow}:C${currRow}`);
    const labelCell = sheet.getCell(`A${currRow}`);
    labelCell.value = row[0];
    labelCell.border = border;
    labelCell.font = { bold: true };
    labelCell.alignment = { vertical: 'middle' };

    sheet.mergeCells(`D${currRow}:F${currRow}`);
    const valueCell = sheet.getCell(`D${currRow}`);
    valueCell.value = row[1];
    valueCell.border = border;
    valueCell.alignment = { vertical: 'middle', horizontal: 'right' };
    
    currRow++;
  });

  return await workbook.xlsx.writeBuffer();
}

module.exports = { generateExcelReport };
