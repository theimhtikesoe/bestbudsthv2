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
  const sectionFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCCCCC' } };
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

  // --- PROCESS RECEIPTS FOR FLOWER/ACCESSORIES SECTION ---
  const flowerItems = [];
  const fbItems = [];
  let totalFlowerGrams = 0;

  receipts.forEach(receipt => {
    const lineItems = receipt.line_items || receipt.items || [];
    const paymentType = (receipt.payments && receipt.payments[0]) 
      ? (receipt.payments[0].payment_type || 'Other') 
      : 'Other';

    // Group items by receipt for the "Item Name" slash format
    const receiptFlowerItems = [];
    const receiptFbItems = [];

    lineItems.forEach(item => {
      const category = (item.category_name || '').toLowerCase();
      const isFb = category.includes('food') || category.includes('drink') || category.includes('fb');
      
      const itemInfo = {
        name: item.item_name || item.name || 'Unknown',
        qty: parseFloat(item.quantity || 0),
        price: parseFloat(item.unit_price || 0),
        total: parseFloat(item.total_money?.amount || item.total_price || 0),
        discount: parseFloat(item.discount_money?.amount || 0),
        payment: paymentType,
        category: category
      };

      if (isFb) {
        receiptFbItems.push(itemInfo);
      } else {
        receiptFlowerItems.push(itemInfo);
      }
    });

    if (receiptFlowerItems.length > 0) {
      const names = receiptFlowerItems.map(i => i.name).join(' / ');
      const qtys = receiptFlowerItems.map(i => i.qty).join(' / ');
      const prices = receiptFlowerItems.map(i => i.price).join(' / ');
      const total = receiptFlowerItems.reduce((sum, i) => sum + i.total, 0);
      const grams = receiptFlowerItems.reduce((sum, i) => sum + i.qty, 0);
      totalFlowerGrams += grams;

      flowerItems.push({
        type: 'Flower / Accessories',
        name: names,
        discount: '',
        qty: qtys,
        unitPrice: prices,
        totalPrice: total,
        payment: paymentType,
        totalGrams: grams + 'g',
        note: ''
      });
    }

    receiptFbItems.forEach(item => {
      fbItems.push(item);
    });
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
    totalFbPrice += item.total;
    const row = sheet.addRow(['', item.name, item.discount || '', item.qty, item.price, item.total, item.payment]);
    // Shifted cells because Item Type is blank in template for FB
    row.eachCell(cell => cell.border = border);
  });

  const fbTotalRow = sheet.addRow(['', '', '', 'Total', totalFbPrice]);
  fbTotalRow.eachCell(cell => { cell.font = fontBold; cell.border = border; });

  sheet.addRow([]);
  sheet.addRow([]);

  // --- DASHBOARD SECTION ---
  const dashHeader = sheet.addRow(['Dashboard (Daily Summary)']);
  dashHeader.getCell(1).font = fontBold;

  const dashSubHeader = sheet.addRow(['Flower Sales(grams)', 'Cash In', 'Card In', 'Transfer In', 'Net Sales']);
  dashSubHeader.eachCell(cell => { cell.font = fontBold; cell.border = border; });

  const dashRow = sheet.addRow([
    totalFlowerGrams + 'g',
    reportData.cash_total || 0,
    reportData.card_total || 0,
    reportData.transfer_total || 0,
    reportData.net_sale || 0
  ]);
  dashRow.eachCell(cell => cell.border = border);

  sheet.addRow([]);
  sheet.addRow(['Staffs', 'Lont x Noom']); // Placeholder staff

  return await workbook.xlsx.writeBuffer();
}

module.exports = { generateExcelReport };
