const ExcelJS = require('exceljs');
const dayjs = require('dayjs');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * Generate Excel report with Main/Flower and F&B sheets
 * @param {Object} reportData - Daily report data
 * @param {Array} receipts - Receipt line items
 * @param {Array} expenses - Daily expenses
 * @returns {Promise<Buffer>} Excel file buffer
 */
async function generateExcelReport(reportData, receipts = [], expenses = []) {
  const workbook = new ExcelJS.Workbook();
  
  // Add Main/Flower sheet
  addMainFlowerSheet(workbook, receipts, reportData);
  
  // Add F&B sheet
  addFBSheet(workbook, receipts, reportData);
  
  // Add Expenses sheet
  addExpensesSheet(workbook, expenses, reportData);
  
  // Add Summary sheet
  addSummarySheet(workbook, reportData, receipts, expenses);
  
  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer;
}

/**
 * Add Main/Flower sheet to workbook
 */
function addMainFlowerSheet(workbook, receipts, reportData) {
  const sheet = workbook.addWorksheet('Main/Flower (M)');
  
  // Set column widths
  sheet.columns = [
    { header: 'QTY', key: 'qty', width: 10 },
    { header: 'Item Name', key: 'itemName', width: 25 },
    { header: 'Unit Price (M)', key: 'unitPrice', width: 15 },
    { header: 'Total (M)', key: 'total', width: 15 },
  ];
  
  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'center' };
  
  // Filter and add Main/Flower items
  const mainItems = receipts.filter(r => r.category === 'main' || r.category === 'flower');
  
  let totalQty = 0;
  let totalAmount = 0;
  
  mainItems.forEach(item => {
    const qty = parseFloat(item.quantity) || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const total = qty * unitPrice;
    
    sheet.addRow({
      qty: qty.toFixed(3),
      itemName: item.itemName || 'Unknown',
      unitPrice: unitPrice.toFixed(2),
      total: total.toFixed(2),
    });
    
    totalQty += qty;
    totalAmount += total;
  });
  
  // Add totals row
  const totalRow = sheet.addRow({
    qty: totalQty.toFixed(3),
    itemName: 'TOTAL',
    unitPrice: '',
    total: totalAmount.toFixed(2),
  });
  
  totalRow.font = { bold: true };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
  
  // Format currency columns
  sheet.getColumn('unitPrice').numFmt = '#,##0.00';
  sheet.getColumn('total').numFmt = '#,##0.00';
}

/**
 * Add F&B sheet to workbook
 */
function addFBSheet(workbook, receipts, reportData) {
  const sheet = workbook.addWorksheet('F&B');
  
  // Set column widths
  sheet.columns = [
    { header: 'QTY', key: 'qty', width: 10 },
    { header: 'Item Name', key: 'itemName', width: 25 },
    { header: 'Unit Price (F&B)', key: 'unitPrice', width: 15 },
    { header: 'Total (F&B)', key: 'total', width: 15 },
  ];
  
  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC5504C' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'center' };
  
  // Filter and add F&B items
  const fbItems = receipts.filter(r => r.category === 'fb' || r.category === 'food');
  
  let totalQty = 0;
  let totalAmount = 0;
  
  fbItems.forEach(item => {
    const qty = parseFloat(item.quantity) || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const total = qty * unitPrice;
    
    sheet.addRow({
      qty: qty.toFixed(3),
      itemName: item.itemName || 'Unknown',
      unitPrice: unitPrice.toFixed(2),
      total: total.toFixed(2),
    });
    
    totalQty += qty;
    totalAmount += total;
  });
  
  // Add totals row
  const totalRow = sheet.addRow({
    qty: totalQty.toFixed(3),
    itemName: 'TOTAL',
    unitPrice: '',
    total: totalAmount.toFixed(2),
  });
  
  totalRow.font = { bold: true };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDE5D9' } };
  
  // Format currency columns
  sheet.getColumn('unitPrice').numFmt = '#,##0.00';
  sheet.getColumn('total').numFmt = '#,##0.00';
}

/**
 * Add Expenses sheet to workbook
 */
function addExpensesSheet(workbook, expenses, reportData) {
  const sheet = workbook.addWorksheet('Expenses');
  
  // Set column widths
  sheet.columns = [
    { header: 'Category', key: 'category', width: 20 },
    { header: 'Description', key: 'description', width: 30 },
    { header: 'Amount (THB)', key: 'amount', width: 15 },
  ];
  
  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF70AD47' } };
  headerRow.alignment = { horizontal: 'center', vertical: 'center' };
  
  let totalExpenses = 0;
  
  expenses.forEach(expense => {
    const amount = parseFloat(expense.amount) || 0;
    sheet.addRow({
      category: expense.category || 'Other',
      description: expense.description || '',
      amount: amount.toFixed(2),
    });
    totalExpenses += amount;
  });
  
  // Add totals row
  const totalRow = sheet.addRow({
    category: 'TOTAL EXPENSES',
    description: '',
    amount: totalExpenses.toFixed(2),
  });
  
  totalRow.font = { bold: true };
  totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFD9' } };
  
  // Format currency column
  sheet.getColumn('amount').numFmt = '#,##0.00';
}

/**
 * Add Summary sheet to workbook
 */
function addSummarySheet(workbook, reportData, receipts, expenses) {
  const sheet = workbook.addWorksheet('Summary');
  
  // Calculate totals
  const mainItems = receipts.filter(r => r.category === 'main' || r.category === 'flower');
  const fbItems = receipts.filter(r => r.category === 'fb' || r.category === 'food');
  
  let mainTotal = 0;
  let fbTotal = 0;
  let expenseTotal = 0;
  
  mainItems.forEach(item => {
    const qty = parseFloat(item.quantity) || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    mainTotal += qty * unitPrice;
  });
  
  fbItems.forEach(item => {
    const qty = parseFloat(item.quantity) || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    fbTotal += qty * unitPrice;
  });
  
  expenses.forEach(expense => {
    expenseTotal += parseFloat(expense.amount) || 0;
  });
  
  const netSale = mainTotal + fbTotal;
  const netCash = netSale - expenseTotal;
  
  // Add title
  const titleRow = sheet.addRow(['Daily Report Summary']);
  titleRow.font = { bold: true, size: 14 };
  sheet.mergeCells('A1:B1');
  
  // Add date
  const dateRow = sheet.addRow(['Date', dayjs(reportData.date).format('YYYY-MM-DD')]);
  dateRow.font = { bold: true };
  
  sheet.addRow([]); // Empty row
  
  // Add summary data
  sheet.addRow(['Main/Flower Sales (M)', `${mainTotal.toFixed(2)} THB`]);
  sheet.addRow(['F&B Sales', `${fbTotal.toFixed(2)} THB`]);
  sheet.addRow(['Net Sale', `${netSale.toFixed(2)} THB`]);
  
  sheet.addRow([]); // Empty row
  
  sheet.addRow(['Payment Breakdown']);
  sheet.addRow(['Cash Total', `${(reportData.cash_total || 0).toFixed(2)} THB`]);
  sheet.addRow(['Card Total', `${(reportData.card_total || 0).toFixed(2)} THB`]);
  
  sheet.addRow([]); // Empty row
  
  sheet.addRow(['Expenses', `${expenseTotal.toFixed(2)} THB`]);
  sheet.addRow(['Net Cash', `${netCash.toFixed(2)} THB`]);
  
  // Format currency columns
  sheet.getColumn('B').numFmt = '#,##0.00';
  sheet.getColumn('B').width = 20;
  sheet.getColumn('A').width = 25;
}

module.exports = {
  generateExcelReport,
};
