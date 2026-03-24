const ExcelJS = require('exceljs');

/**
 * Generate Excel report matching the user's template
 * @param {string} date - Report date
 * @param {Object} reportData - Sales summary data
 * @param {Array} classifiedItems - Items classified into 'main' and 'fb'
 * @param {Array} expenses - Daily expenses
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function generateExcelReport(date, reportData, classifiedItems, expenses) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Daily Report');

  // --- STYLING ---
  const headerFill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8ECDA' }
  };
  const sectionFill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFCCCCCC' }
  };
  const border = {
    top: { style: 'thin' },
    left: { style: 'thin' },
    bottom: { style: 'thin' },
    right: { style: 'thin' }
  };
  const fontBold = { bold: true };
  const centerAlign = { vertical: 'middle', horizontal: 'center' };
  const rightAlign = { vertical: 'middle', horizontal: 'right' };

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

  // --- FLOWER / MAIN SECTION ---
  const mainItems = classifiedItems.filter(item => item.category === 'main');
  let totalMainGrams = 0;
  let totalMainPrice = 0;

  mainItems.forEach(item => {
    const qty = parseFloat(item.quantity || 0);
    const price = parseFloat(item.unitPrice || 0);
    const total = qty * price;
    totalMainPrice += total;
    if (item.itemName.toLowerCase().includes('gram') || item.category === 'main') {
        totalMainGrams += qty;
    }

    const row = sheet.addRow({
      type: 'Flower / Accessories',
      name: item.itemName,
      discount: '',
      qty: qty,
      unitPrice: price.toFixed(2),
      totalPrice: total.toFixed(2),
      payment: 'Sync', // Loyverse doesn't give payment per item easily
      totalGrams: qty + ' g',
      note: ''
    });
    row.eachCell(cell => cell.border = border);
  });

  sheet.addRow([]); // Empty row

  // --- EXPENSES SECTION ---
  const expenseHeader = sheet.addRow(['EXPENSES']);
  expenseHeader.getCell(1).fill = sectionFill;
  expenseHeader.getCell(1).font = fontBold;
  
  const expSubHeader = sheet.addRow(['Expense Category', 'Description', 'Amount']);
  expSubHeader.eachCell(cell => {
    cell.font = fontBold;
    cell.border = border;
  });

  let totalExpenses = 0;
  expenses.forEach(exp => {
    const amount = parseFloat(exp.amount || 0);
    totalExpenses += amount;
    const row = sheet.addRow([exp.category, exp.description, amount.toFixed(2)]);
    row.eachCell(cell => cell.border = border);
  });

  const expTotalRow = sheet.addRow(['', 'Total Expenses', totalExpenses.toFixed(2)]);
  expTotalRow.getCell(2).font = fontBold;
  expTotalRow.getCell(3).font = fontBold;
  expTotalRow.eachCell(cell => cell.border = border);

  sheet.addRow([]); // Empty row

  // --- FOODS & DRINKS SECTION ---
  const fbHeader = sheet.addRow(['FOODS & DRINKS']);
  fbHeader.getCell(1).fill = sectionFill;
  fbHeader.getCell(1).font = fontBold;

  const fbSubHeader = sheet.addRow(['Item Type', 'Item Name', 'Discount', 'Qty', 'Unit Price', 'Total Price', 'Payment Method', '', 'Note']);
  fbSubHeader.eachCell(cell => {
    cell.font = fontBold;
    cell.border = border;
  });

  const fbItems = classifiedItems.filter(item => item.category === 'fb');
  let totalFbPrice = 0;

  fbItems.forEach(item => {
    const qty = parseFloat(item.quantity || 0);
    const price = parseFloat(item.unitPrice || 0);
    const total = qty * price;
    totalFbPrice += total;

    const row = sheet.addRow({
      type: 'Foods & Drinks',
      name: item.itemName,
      discount: '',
      qty: qty,
      unitPrice: price.toFixed(2),
      totalPrice: total.toFixed(2),
      payment: 'Sync',
      note: ''
    });
    row.eachCell(cell => cell.border = border);
  });

  sheet.addRow([]); // Empty row

  // --- SUMMARY SECTION ---
  const summaryHeader = sheet.addRow(['SUMMARY']);
  summaryHeader.getCell(1).font = fontBold;

  sheet.addRow(['Total Main Sales', totalMainPrice.toFixed(2) + ' THB']);
  sheet.addRow(['Total F&B Sales', totalFbPrice.toFixed(2) + ' THB']);
  sheet.addRow(['Total Expenses', totalExpenses.toFixed(2) + ' THB']);
  const netSale = (totalMainPrice + totalFbPrice - totalExpenses);
  const netRow = sheet.addRow(['NET SALE', netSale.toFixed(2) + ' THB']);
  netRow.getCell(1).font = fontBold;
  netRow.getCell(2).font = fontBold;

  return await workbook.xlsx.writeBuffer();
}

module.exports = { generateExcelReport };
