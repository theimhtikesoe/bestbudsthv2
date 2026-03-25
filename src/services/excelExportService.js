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
  const sheet = workbook.addWorksheet(date);

  // --- STYLING ---
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8ECDA' } };
  const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  const fontBold = { bold: true };
  const centerAlign = { vertical: 'middle', horizontal: 'center' };

  // --- COLUMNS ---
  sheet.columns = [
    { header: 'Item Type', key: 'type', width: 20 },
    { header: 'Item Name', key: 'name', width: 40 },
    { header: 'Discount', key: 'discount', width: 10 },
    { header: 'Qty/Grams', key: 'qty', width: 15 },
    { header: 'Unit Price', key: 'unitPrice', width: 15 },
    { header: 'Total Price', key: 'totalPrice', width: 15 },
    { header: 'Payment Method', key: 'payment', width: 20 },
    { header: 'Total Grams', key: 'totalGrams', width: 15 },
    { header: 'Note', key: 'note', width: 30 }
  ];

  // Format header row
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = fontBold;
    cell.border = border;
    cell.alignment = centerAlign;
  });

  const flowerStrains = [
    'grape soda', 'blue pave', 'devil driver', 'lemon cherry gelato', 
    'moonbow', 'emergen c', 'tea time', 'silver shadow', 
    'rozay cake', 'truffaloha', 'the planet of grape', 'crunch berriez',
    'big foot', 'honey bee', 'jealousy mintz', 'crystal candy',
    'alien mint', 'rocket fuel', 'gold dust', 'darth vader',
    'cherry pop tarts', 'white cherry gelato', 'dosidos', 'obama runtz',
    'free pina colada'
  ];

  const fbKeywords = ['soft drink', 'snacks', 'gummy', 'water', 'soda', 'milk', 'beer', 'drink', 'beverage', 'alcohol', 'wine', 'cider', 'spirit', 'cocktail', 'food', 'coffee', 'juice', 'bakery', 'cookie', 'brownie', 'cake', 'soju'];

  const flowerItems = [];
  const fbItems = [];
  let totalFlowerGrams = 0;

  receipts.forEach(receipt => {
    const lineItems = receipt.line_items || receipt.items || [];
    const paymentType = (receipt.payments && receipt.payments[0]) 
      ? (receipt.payments[0].payment_type || receipt.payments[0].name || 'Other') 
      : 'Other';
    const receiptNumber = receipt.receipt_number || receipt.number || 'N/A';

    const receiptFlowerItems = [];

    lineItems.forEach(item => {
      const itemName = (item.item_name || item.name || 'Unknown').toLowerCase();
      const category = (item.category_name || '').toLowerCase();
      const qty = parseFloat(item.quantity || 0);
      const netPrice = parseFloat(item.total_money?.amount ?? item.total_money ?? 0);
      const grossPrice = parseFloat(item.gross_total_money?.amount ?? item.gross_total_money ?? netPrice);
      const unitPrice = qty > 0 ? netPrice / qty : netPrice;

      // Filter out zero-price/100% discount items
      if (netPrice <= 0) return;

      const isFlowerStrain = flowerStrains.some(strain => itemName.includes(strain));
      const isFB = !isFlowerStrain && (
        fbKeywords.some(k => itemName.includes(k) || category.includes(k)) ||
        (['tea'].some(k => itemName.includes(k) || category.includes(k)) && !itemName.includes('tea time')) ||
        unitPrice <= 50
      );

      const itemInfo = {
        name: item.item_name || item.name,
        qty: qty,
        unitPrice: unitPrice,
        totalPrice: netPrice,
        discount: (grossPrice > netPrice) ? `${Math.round(((grossPrice - netPrice) / grossPrice) * 100)}%` : '',
        payment: paymentType,
        note: receiptNumber
      };

      if (isFB) {
        fbItems.push(itemInfo);
      } else {
        receiptFlowerItems.push(itemInfo);
        // Gram calculation logic
        const isFree = netPrice <= 0 || itemName.includes('free');
        const isLobbyShirt = itemName.includes('the lobby shirt');
        if (!isFree && !isLobbyShirt) {
          totalFlowerGrams += qty;
        }
      }
    });

    if (receiptFlowerItems.length > 0) {
      const names = receiptFlowerItems.map(i => i.name).join(' / ');
      const qtys = receiptFlowerItems.map(i => '-').join(' / ');
      const prices = receiptFlowerItems.map(i => i.unitPrice.toFixed(2)).join(' / ');
      const total = receiptFlowerItems.reduce((sum, i) => sum + i.totalPrice, 0);
      const grams = receiptFlowerItems.reduce((sum, i) => {
        const itemName = (i.name || '').toLowerCase();
        const isFree = i.totalPrice <= 0 || itemName.includes('free');
        const isLobbyShirt = itemName.includes('the lobby shirt');
        return (!isFree && !isLobbyShirt) ? sum + i.qty : sum;
      }, 0);

      flowerItems.push({
        type: 'Flower / Accessories',
        name: names,
        discount: receiptFlowerItems.map(i => i.discount).filter(Boolean).join(' / '),
        qty: qtys,
        unitPrice: prices,
        totalPrice: total,
        payment: paymentType,
        totalGrams: grams > 0 ? grams.toFixed(3) + ' G' : '-',
        note: receiptNumber
      });
    }
  });

  // Add Flower rows
  flowerItems.forEach(item => {
    const row = sheet.addRow(item);
    row.eachCell(cell => cell.border = border);
  });

  sheet.addRow([]);
  sheet.addRow([]);

  // --- EXPENSES SECTION ---
  const expHeader = sheet.addRow(['Expenses']);
  expHeader.getCell(1).font = fontBold;
  
  const expSubHeader = sheet.addRow(['Expense Category', 'Description', 'Amount']);
  expSubHeader.eachCell(cell => { cell.font = fontBold; cell.border = border; });

  let totalExpenses = 0;
  expenses.forEach(exp => {
    const amount = parseFloat(exp.amount || 0);
    totalExpenses += amount;
    const row = sheet.addRow([exp.category, exp.description, amount]);
    row.eachCell(cell => cell.border = border);
  });

  const expTotalRow = sheet.addRow(['', 'Total Expenses', totalExpenses]);
  expTotalRow.eachCell(cell => { cell.font = fontBold; cell.border = border; });

  sheet.addRow([]);
  sheet.addRow([]);

  // --- FOOD & DRINKS SECTION ---
  const fbSectionHeader = sheet.addRow(['Food & Drinks']);
  fbSectionHeader.getCell(1).font = fontBold;

  const fbSubHeader = sheet.addRow(['Item Name', 'Discount', 'Qty', 'Unit Price', 'Total Price', 'Payment Method']);
  fbSubHeader.eachCell(cell => { cell.font = fontBold; cell.border = border; });

  let totalFbPrice = 0;
  fbItems.forEach(item => {
    totalFbPrice += item.totalPrice;
    const row = sheet.addRow(['', item.name, item.discount || '', item.qty, item.unitPrice, item.totalPrice, item.payment]);
    row.eachCell(cell => cell.border = border);
  });

  const fbTotalRow = sheet.addRow(['', '', '', 'Total', totalFbPrice]);
  fbTotalRow.eachCell(cell => { cell.font = fontBold; cell.border = border; });

  sheet.addRow([]);
  sheet.addRow([]);

  // --- DASHBOARD SECTION ---
  const dashHeader = sheet.addRow(['Dashboard (Daily Summary)']);
  dashHeader.getCell(1).font = fontBold;

  const dashSubHeader = sheet.addRow(['Flower Sales(grams)', 'Cash In', 'Card In', 'Transfer In', 'F&B Total Price', 'Net Sales']);
  dashSubHeader.eachCell(cell => { cell.font = fontBold; cell.border = border; });

  const dashRow = sheet.addRow([
    totalFlowerGrams.toFixed(3) + ' G',
    reportData.cash_total || 0,
    reportData.card_total || 0,
    reportData.transfer_total || 0,
    totalFbPrice,
    reportData.net_sale || 0
  ]);
  dashRow.eachCell(cell => cell.border = border);

  sheet.addRow([]);
  sheet.addRow(['Staffs', reportData.closing_staff || 'Lont x Noom']);

  return await workbook.xlsx.writeBuffer();
}

module.exports = { generateExcelReport };
