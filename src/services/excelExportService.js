const ExcelJS = require('exceljs');

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

  receipts.forEach(receipt => {
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
        console.log(`[EXPORT] Skipping zero-value item: ${itemName} (Net: ${itemNetPrice}, Discount: ${discountPercent}%)`);
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
  titleCell.alignment = { horizontal: 'center' };

  // --- ROW 2: CLOSING STAFF ---
  sheet.mergeCells('A2:I2');
  const staffCell = sheet.getCell('A2');
  staffCell.value = `Closing Staff: ${closingStaff}`;
  staffCell.font = { bold: true };

  let currRow = 4;

  // Helper function to paint section header
  const paintSection = (label) => {
    sheet.mergeCells(`A${currRow}:I${currRow}`);
    const c = sheet.getCell(`A${currRow}`);
    c.value = label;
    c.fill = sectionFill;
    c.font = { bold: true, color: { argb: 'FFF6E5C4' } };
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
    });
    currRow++;
  };

  // --- SECTION 1: FLOWERS & ACCESSORIES ---
  paintSection('Flower / Main / Accessories');
  paintHeader();
  flowerItems.forEach((item, i) => {
    const row = sheet.getRow(currRow);
    row.values = [item.type, item.name, item.qty, item.gram, item.unitPrice, item.discount, item.netPrice, item.payment, item.note];
    row.eachCell((cell, colNumber) => {
      cell.fill = i % 2 === 0 ? rowLight : rowDark;
      cell.border = border;
    });
    currRow++;
  });

  currRow += 1;

  // --- SECTION 2: EXPENSES ---
  paintSection('Expenses');
  const expenseHeaders = ['Category', 'Description', 'Amount'];
  expenseHeaders.forEach((h, i) => {
    const c = sheet.getCell(currRow, i + 1);
    c.value = h;
    c.fill = headerFill;
    c.font = { bold: true };
    c.border = border;
  });
  currRow++;

  let totalExp = 0;
  if (expenses.length === 0) {
    // Add placeholder row for no expenses
    sheet.getCell(`A${currRow}`).value = '-';
    sheet.getCell(`B${currRow}`).value = 'No expenses';
    sheet.getCell(`C${currRow}`).value = 0;
    ['A', 'B', 'C'].forEach(col => {
      sheet.getCell(`${col}${currRow}`).border = border;
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
        sheet.getCell(`${col}${currRow}`).fill = i % 2 === 0 ? rowLight : rowDark;
        sheet.getCell(`${col}${currRow}`).border = border;
      });
      currRow++;
    });
  }

  currRow += 1;

  // --- SECTION 3: FOOD & DRINKS ---
  paintSection('Food & Drinks');
  paintHeader();
  fbItems.forEach((item, i) => {
    const row = sheet.getRow(currRow);
    row.values = [item.type, item.name, item.qty, item.gram, item.unitPrice, item.discount, item.netPrice, item.payment, item.note];
    row.eachCell((cell, colNumber) => {
      cell.fill = i % 2 === 0 ? rowLight : rowDark;
      cell.border = border;
    });
    currRow++;
  });

  currRow += 1;

  // --- SECTION 4: DASHBOARD ---
  paintSection('Daily Summary Dashboard');

  // Calculate totals
  const cashTotal = Number(reportData.cash_total || 0);
  const cardTotal = Number(reportData.card_total || 0);
  const transferTotal = Number(reportData.transfer_total || 0);
  const fbTotal = Number(reportData.fb_total || 0);
  const netSale = Number(reportData.net_sale || 0);
  const totalGrams = Number(reportData.total_grams || 0);

  const summaryData = [
    ['Total Grams Sold', '', '', `${totalGrams.toFixed(3)} G`],
    ['Cash In', '', '', `${cashTotal.toFixed(0)} THB`],
    ['Card In', '', '', `${cardTotal.toFixed(0)} THB`],
    ['Transfer In', '', '', `${transferTotal.toFixed(0)} THB`],
    ['F&B Total', '', '', `${fbTotal.toFixed(0)} THB`],
    ['Total Expenses', '', '', `${totalExp.toFixed(0)} THB`],
    ['Net Sales (Total)', '', '', `${netSale.toFixed(0)} THB`],
    ['Net Profit (After Expenses)', '', '', `${(netSale - totalExp).toFixed(0)} THB`]
  ];

  summaryData.forEach((row, idx) => {
    sheet.getCell(`A${currRow}`).value = row[0];
    sheet.getCell(`D${currRow}`).value = row[3];
    sheet.getCell(`A${currRow}`).border = border;
    sheet.getCell(`D${currRow}`).border = border;
    currRow++;
  });

  return await workbook.xlsx.writeBuffer();
}

module.exports = { generateExcelReport };
