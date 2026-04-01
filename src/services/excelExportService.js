const ExcelJS = require('exceljs');

/**
 * Generate Excel report matching the user's detailed Monthly Report template
 * @param {string} date - Report date
 * @param {Object} reportData - Sales summary data
 * @param {Array} receipts - Original Loyverse receipts
 * @param {Array} expenses - Daily expenses
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function generateExcelReport(date, reportData, receipts, expenses) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Daily Report');

  // Styling
  const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const boldFont = { bold: true };
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };

  // Row 1: Title
  sheet.getCell('A1').value = `Daily Report - ${date}`;
  sheet.getCell('A1').font = { size: 14, bold: true };

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

      // Rule: Skip items where price is 0 OR discount is 100%
      const totalItemDiscount = Math.max(0, grossPrice - itemNetPrice);
      const discountPercent = grossPrice > 0 ? (totalItemDiscount / grossPrice * 100) : 0;
      
      if (itemNetPrice <= 0.01 || discountPercent >= 99.99) return;

      const discountStr = totalItemDiscount > 0.01 ? `${discountPercent.toFixed(0)}% (${totalItemDiscount.toFixed(2)} THB)` : '-';

      let isFlowerStrain = flowerStrains.some(strain => itemName.includes(strain));
      let isThcGummy = itemName.includes('thc gummy');
      let isAccessory = accessoryKeywords.some(k => itemName.includes(k) || category.includes(k));

      let isFB = !isFlowerStrain && !isThcGummy && (
        fbKeywords.some(k => itemName.includes(k) || category.includes(k)) ||
        (['tea'].some(k => itemName.includes(k) || category.includes(k)) && !itemName.includes('tea time'))
      );

      if (!isFlowerStrain && !isFB && !isThcGummy && !isAccessory) {
        if (grossPrice / (qty || 1) <= 50) isFB = true; else isFlowerStrain = true;
      }

      const exportType = isFB ? 'F&B' : (isAccessory ? 'Accessories' : 'Flower/Main');
      const exportItem = {
        type: exportType,
        name: item.name || item.item_name,
        qty: qty,
        unitPrice: grossPrice / (qty || 1),
        discount: discountStr,
        netPrice: itemNetPrice,
        payment: paymentMethod,
        note: receiptNumber
      };

      if (isFB) {
        fbItems.push(exportItem);
      } else {
        flowerItems.push(exportItem);
        if (!isThcGummy && !isLobbyShirt && !isAccessory) {
          totalFlowerGrams += qty;
        }
      }
    });
  });

  // --- SECTION 1: FLOWERS & ACCESSORIES ---
  sheet.getCell('A3').value = 'Flower / Main / Accessories';
  sheet.getCell('A3').font = boldFont;

  const headers = ['Item Type', 'Item Name', 'Qty', 'Unit Price', 'Discount', 'Net Price', 'Payment', 'Note'];
  headers.forEach((h, i) => {
    const cell = sheet.getCell(4, i + 1);
    cell.value = h;
    cell.font = boldFont;
    cell.fill = headerFill;
    cell.border = border;
  });

  let currRow = 5;
  flowerItems.forEach(item => {
    const row = sheet.getRow(currRow);
    row.values = [item.type, item.name, item.qty, item.unitPrice, item.discount, item.netPrice, item.payment, item.note];
    row.eachCell(cell => cell.border = border);
    currRow++;
  });

  currRow += 2;
  // --- SECTION 2: EXPENSES ---
  sheet.getCell(`A${currRow}`).value = 'Expenses';
  sheet.getCell(`A${currRow}`).font = boldFont;
  currRow++;
  ['Category', 'Description', 'Amount'].forEach((h, i) => {
    const cell = sheet.getCell(currRow, i + 1);
    cell.value = h;
    cell.font = boldFont;
    cell.border = border;
  });
  currRow++;
  let totalExp = 0;
  expenses.forEach(exp => {
    totalExp += parseFloat(exp.amount || 0);
    const row = sheet.getRow(currRow);
    row.values = [exp.category, exp.description || '-', parseFloat(exp.amount || 0)];
    row.eachCell(cell => cell.border = border);
    currRow++;
  });
  currRow += 2;

  // --- SECTION 3: FOOD & DRINKS ---
  sheet.getCell(`A${currRow}`).value = 'Food & Drinks';
  sheet.getCell(`A${currRow}`).font = boldFont;
  currRow++;
  headers.forEach((h, i) => {
    const cell = sheet.getCell(currRow, i + 1);
    cell.value = h;
    cell.font = boldFont;
    cell.fill = headerFill;
    cell.border = border;
  });
  currRow++;
  fbItems.forEach(item => {
    const row = sheet.getRow(currRow);
    row.values = [item.type, item.name, item.qty, item.unitPrice, item.discount, item.netPrice, item.payment, item.note];
    row.eachCell(cell => cell.border = border);
    currRow++;
  });
  currRow += 2;

  // --- SECTION 4: DASHBOARD ---
  sheet.getCell(`A${currRow}`).value = 'Daily Summary Dashboard';
  sheet.getCell(`A${currRow}`).font = boldFont;
  currRow++;

  const dashboard = [
    ['Total Grams Sold', totalFlowerGrams, 'G'],
    ['Cash Total', reportData.cash_total || 0, 'THB'],
    ['Card Total', reportData.card_total || 0, 'THB'],
    ['Transfer Total', reportData.transfer_total || 0, 'THB'],
    ['F&B Total', fbItems.reduce((a, b) => a + b.netPrice, 0), 'THB'],
    ['Total Expenses', totalExp, 'THB'],
    ['Net Sale', reportData.net_sale || 0, 'THB'],
    ['Net Profit', (reportData.net_sale || 0) - totalExp, 'THB']
  ];

  dashboard.forEach(d => {
    sheet.getCell(`A${currRow}`).value = d[0];
    sheet.getCell(`B${currRow}`).value = d[1];
    sheet.getCell(`C${currRow}`).value = d[2];
    ['A','B','C'].forEach(col => sheet.getCell(`${col}${currRow}`).border = border);
    currRow++;
  });

  return await workbook.xlsx.writeBuffer();
}

module.exports = { generateExcelReport };
