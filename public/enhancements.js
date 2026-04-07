/**
 * Enhanced Daily Reports - Item Classification & Expense Tracking
 * Performs full client-side Excel export using ExcelJS
 * Matches User Template: BestBuds_Report_2026-03-13.xlsx
 */

let currentEditingExpenseId = null;
let currentEditingClosingStaffId = null;

/**
 * Real-time SSE Listener
 */
let eventSource = null;

function setupRealtimeListener() {
  if (eventSource) return;

  // Handle "Other" category custom input
  const expenseCategorySelect = document.getElementById('expenseCategory');
  const customCategoryInput = document.getElementById('customExpenseCategory');
  if (expenseCategorySelect && customCategoryInput) {
    expenseCategorySelect.addEventListener('change', () => {
      if (expenseCategorySelect.value === 'Other') {
        customCategoryInput.classList.remove('d-none');
      } else {
        customCategoryInput.classList.add('d-none');
        customCategoryInput.value = '';
      }
    });
  }

  eventSource = new EventSource('/api/events');

  eventSource.onmessage = (event) => {
    try {
      let rawData = event.data;
      if (typeof rawData === 'string' && (rawData.startsWith('"') || rawData.startsWith('{'))) {
        try {
          const parsedOnce = JSON.parse(rawData);
          if (typeof parsedOnce === 'string') {
            rawData = parsedOnce;
          }
        } catch(e) {}
      }
      
      const data = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      const currentDate = document.getElementById("reportDate")?.value;

      if (data.date === currentDate) {
        if (typeof window.loadReportData === 'function') {
          window.loadReportData(currentDate);
        } else {
          fetchExpenses(currentDate);
          fetchStaff(currentDate);
        }
      }
    } catch (error) {
      console.error('SSE parse error:', error);
    }
  };

  eventSource.onerror = () => {
    eventSource.close();
    eventSource = null;
    setTimeout(setupRealtimeListener, 3000);
  };
}

/**
 * Fetch expenses from backend
 */
async function fetchExpenses(date) {
  try {
    const response = await fetch(`/api/expenses/${date}`);
    if (response.ok) {
      const data = await response.json();
      const expenses = data.expenses || [];
      localStorage.setItem(`dailyExpenses_${date}`, JSON.stringify(expenses));
      renderExpensesList(expenses, date);
      return expenses;
    }
    // Fallback for non-ok response
    console.warn(`Fetch expenses failed with status ${response.status}. Falling back to local storage.`);
    const local = getLocalExpenses(date);
    renderExpensesList(local, date);
    return local;
  } catch (error) {
    console.error('Error fetching expenses:', error);
    const local = getLocalExpenses(date);
    renderExpensesList(local, date);
    return local;
  }
  return [];
}

/**
 * Fetch staff from backend
 */
async function fetchStaff(date) {
  try {
    const response = await fetch(`/api/staff/${date}`);
    if (response.ok) {
      const data = await response.json();
      const staff = data.staff || [];
      localStorage.setItem(`dailyClosingStaff_${date}`, JSON.stringify(staff));
      if (typeof renderClosingStaffList === 'function') {
        renderClosingStaffList(staff, date);
      }
      return data.staff;
    }
    // Fallback for non-ok response
    console.warn(`Fetch staff failed with status ${response.status}. Falling back to local storage.`);
    const local = getClosingStaffEntries(date);
    renderClosingStaffList(local, date);
    return local;
  } catch (error) {
    console.error('Error fetching staff:', error);
    const local = getClosingStaffEntries(date);
    renderClosingStaffList(local, date);
    return local;
  }
  return [];
}

function getLocalExpenses(date) {
  const key = `dailyExpenses_${date}`;
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : [];
}

function getClosingStaffEntries(date) {
  if (!date) return [];
  const listKey = `dailyClosingStaff_${date}`;
  const stored = localStorage.getItem(listKey);
  if (stored) {
    try { return JSON.parse(stored); } catch (e) { return []; }
  }
  return [];
}

function getClosingStaff(date) {
  const stored = localStorage.getItem(`dailyClosingStaff_${date}`);
  if (stored) {
    try {
      const entries = JSON.parse(stored);
      return entries.map((entry) => entry.name).join(", ");
    } catch (e) {}
  }
  return "";
}

function getMoney(...candidates) {
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    let val = candidate;
    if (typeof val === 'object') {
      val = (val.amount !== undefined) ? val.amount : val.value;
    }
    const num = Number(val);
    if (!isNaN(num)) return num;
  }
  return null;
}

/**
 * Filter out refund receipts
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
  
  if (hasRefunds || hasRefundItems || hasReturns) return true;

  // Check for negative total
  const total = getMoney(receipt.total_money, receipt.total_price_money, receipt.amount_money, receipt.amount) || 0;
  if (total < 0) return true;

  // Check for voided status
  const status = String(receipt.status || '').toUpperCase();
  if (['VOIDED', 'VOID', 'CANCELLED', 'CANCELED', 'DELETED'].includes(status)) return true;

  return false;
}

/**
 * Item Classification Logic
 */
function processItemsForExcel(receipts) {
  const flowerItems = [];
  const fbItems = [];
  let totalFlowerGrams = 0;

  let totalFbAmount = 0;
  receipts.forEach(receipt => {
    if (!receipt || typeof receipt !== 'object') return;
    
    // Skip refund receipts
    if (isRefundReceipt(receipt)) return;

    const items = receipt.line_items || receipt.items || [];
    const paymentMethod = (receipt.payments && receipt.payments[0]?.payment_type?.name) || 
                           (receipt.payments && receipt.payments[0]?.name) || "N/A";
    const receiptNumber = receipt.receipt_number || receipt.number || "N/A";

    items.forEach(item => {
      if (!item || typeof item !== 'object') return;

      let itemName = String(item.name || item.item_name || "").toLowerCase();
      let category = String(item.category_name || "").toLowerCase();
      let qty = Number(item.quantity || 0);
      let grossPrice = getMoney(item.gross_total_money, item.subtotal_money);
      if (grossPrice === null) grossPrice = (getMoney(item.price) || 0) * qty;
      
      let lineItemDiscount = getMoney(item.total_discount_money, item.discount_money) || 0;
      let itemNetPrice = getMoney(item.total_money);
      if (itemNetPrice === null) itemNetPrice = Math.max(0, grossPrice - lineItemDiscount);

      const totalItemDiscount = Math.max(0, grossPrice - itemNetPrice);
      const discountPercent = grossPrice > 0 ? (totalItemDiscount / grossPrice * 100) : 0;

      if (itemNetPrice <= 0.01 || discountPercent >= 99.9) return;
      const discountStr = totalItemDiscount > 0.01 ? `${discountPercent.toFixed(0)}%` : "-";

      const flowerStrains = ['grape soda', 'blue pave', 'devil driver', 'lemon cherry gelato', 'moonbow', 'emergen c', 'tea time', 'silver shadow', 'rozay cake', 'truffaloha', 'the planet of grape', 'crunch berriez', 'big foot', 'honey bee', 'jealousy mintz', 'crystal candy', 'alien mint', 'rocket fuel', 'gold dust', 'darth vader', 'cherry pop tarts', 'white cherry gelato', 'dosidos', 'obama runtz', 'free pina colada', 'thc gummy', 'flower', 'bud', 'pre-roll', 'joint'];
      const fbKeywords = ['water', 'soda', 'beer', 'drink', 'beverage', 'alcohol', 'wine', 'cider', 'spirit', 'cocktail', 'milk', 'coffee', 'tea', 'juice', 'cookie', 'brownie', 'cake', 'soju', 'gummy', 'snack', 'food', 'bakery'];
      const accessoryKeywords = ['accessories', 'merchandise', 'bong', 'paper', 'tip', 'grinder', 'shirt', 'hat', 'lighter', 'the lobby', 'merch', 'ashtray', 'ash tray', 'pipe', 'small pipe', 'best buds grinder', 'best buds shirt'];

      let isFlowerStrain = flowerStrains.some(s => itemName.includes(s));
      let isThcGummy = itemName.includes("thc gummy");
      let isAccessory = accessoryKeywords.some(k => itemName.includes(k) || category.includes(k));
      let isFB = !isFlowerStrain && !isThcGummy && (fbKeywords.some(k => itemName.includes(k) || category.includes(k)));

      if (!isFlowerStrain && !isFB && !isThcGummy && !isAccessory) {
        if (grossPrice / (qty || 1) <= 50) isFB = true; else isFlowerStrain = true;
      }

      let displayQty = qty;
      let displayGram = "-";
      let displayType = isFB ? "F&B" : (isAccessory ? "Accessories" : "Flower/Main");

      if (isFlowerStrain && !isThcGummy && !isAccessory) {
        displayQty = "-";
        displayGram = `${qty.toFixed(3)} G`;
        totalFlowerGrams += qty;
      }

      const exportItem = {
        type: displayType,
        name: item.name || item.item_name,
        qty: displayQty,
        gram: displayGram,
        unitPrice: Number((itemNetPrice / (qty || 1)).toFixed(2)),
        discount: discountStr,
        netPrice: Number(itemNetPrice.toFixed(2)),
        payment: paymentMethod,
        note: receiptNumber
      };

      if (isFB) {
        fbItems.push(exportItem);
        totalFbAmount += itemNetPrice;
      } else {
        flowerItems.push(exportItem);
      }
    });
  });

  return { flowerItems, fbItems, totalFlowerGrams, totalFbAmount };
}

/**
 * Excel Painting Logic
 */
function paintDailySheet(sheet, date, staffName, rawData, expenses, flowerItems, fbItems, totalFlowerGrams) {
  sheet.properties.defaultRowHeight = 22;
  sheet.columns = [
    { key: 'type', width: 18 },
    { key: 'name', width: 40 },
    { key: 'qty', width: 10 },
    { key: 'gram', width: 12 },
    { key: 'unitPrice', width: 15 },
    { key: 'discount', width: 12 },
    { key: 'netPrice', width: 15 },
    { key: 'payment', width: 15 },
    { key: 'note', width: 30 }
  ];

  const border = { top: { style: "thin", color: { argb: "FFD5B68A" } }, left: { style: "thin", color: { argb: "FFD5B68A" } }, bottom: { style: "thin", color: { argb: "FFD5B68A" } }, right: { style: "thin", color: { argb: "FFD5B68A" } } };
  const titleFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2A2010" } };
  const sectionFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3D2A14" } };
  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1D8AC" } };
  const rowLight = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBF4" } };
  const rowDark = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4E0" } };

  // Title
  sheet.mergeCells("A1:I1");
  const titleCell = sheet.getCell("A1");
  titleCell.value = `BestBuds Daily Report - ${date}`;
  titleCell.fill = titleFill;
  titleCell.font = { size: 14, bold: true, color: { argb: "FFF8EBCF" } };
  titleCell.alignment = { horizontal: "center", vertical: "middle" };

  sheet.mergeCells("A2:I2");
  const staffCell = sheet.getCell("A2");
  staffCell.value = `Closing Staff: ${staffName}`;
  staffCell.font = { bold: true };

  let currRow = 4;
  const paintSection = (label) => {
    sheet.mergeCells(`A${currRow}:I${currRow}`);
    const c = sheet.getCell(`A${currRow}`);
    c.value = label; c.fill = sectionFill; c.font = { bold: true, color: { argb: "FFF6E5C4" } };
    c.alignment = { vertical: "middle" };
    currRow++;
  };

  const paintHeader = (headers) => {
    headers.forEach((h, i) => {
      const c = sheet.getCell(currRow, i + 1);
      c.value = h; c.fill = headerFill; c.font = { bold: true }; c.border = border;
      c.alignment = { horizontal: "center", vertical: "middle" };
    });
    currRow++;
  };

  // Flower Section
  paintSection("Flower / Main / Accessories");
  paintHeader(["Item Type", "Item Name", "Qty", "Gram", "Unit Price", "Discount", "Net Price", "Payment", "Note"]);
  flowerItems.forEach((item, i) => {
    const rowValues = [item.type, item.name, item.qty, item.gram, item.unitPrice, item.discount, item.netPrice, item.payment, item.note];
    rowValues.forEach((v, idx) => {
      const c = sheet.getCell(currRow, idx + 1);
      c.value = v; c.fill = i % 2 === 0 ? rowLight : rowDark; c.border = border;
      c.alignment = { vertical: 'middle', wrapText: true };
      if (idx === 4 || idx === 6) c.numFmt = '#,##0.00';
    });
    currRow++;
  });

  // Flower Total
  sheet.getCell(`A${currRow}`).value = "TOTAL FLOWERS";
  sheet.getCell(`A${currRow}`).font = { bold: true };
  sheet.getCell(`D${currRow}`).value = `${totalFlowerGrams.toFixed(3)} G`;
  sheet.getCell(`D${currRow}`).font = { bold: true };
  ["A", "D"].forEach(col => { sheet.getCell(`${col}${currRow}`).fill = headerFill; sheet.getCell(`${col}${currRow}`).border = border; });
  currRow += 2;

  // Expenses Section
  paintSection("Expenses");
  paintHeader(["Category", "Description", "Amount", "", "", "", "", "", ""]);
  let totalExp = 0;
  if (expenses.length === 0) {
    sheet.getCell(`A${currRow}`).value = "No expenses";
    sheet.getCell(`C${currRow}`).value = 0;
    ["A", "B", "C"].forEach(col => { sheet.getCell(`${col}${currRow}`).border = border; });
    currRow++;
  } else {
    expenses.forEach((exp, i) => {
      const amt = Number(exp.amount || 0); totalExp += amt;
      sheet.getCell(`A${currRow}`).value = exp.category;
      sheet.getCell(`B${currRow}`).value = exp.description;
      sheet.getCell(`C${currRow}`).value = amt;
      sheet.getCell(`C${currRow}`).numFmt = '#,##0.00';
      ["A", "B", "C"].forEach(col => { sheet.getCell(`${col}${currRow}`).fill = i % 2 === 0 ? rowLight : rowDark; sheet.getCell(`${col}${currRow}`).border = border; });
      currRow++;
    });
  }
  currRow += 2;

  // F&B Section
  paintSection("Food & Drinks");
  paintHeader(["Item Name", "Qty", "Unit Price", "Total Price", "Payment", "", "", "", ""]);
  let calculatedFbTotal = 0;
  fbItems.forEach((item, i) => {
    const rowValues = [item.name, item.qty === "-" ? 1 : item.qty, item.unitPrice, item.netPrice, item.payment];
    rowValues.forEach((v, idx) => {
      const c = sheet.getCell(currRow, idx + 1);
      c.value = v; c.fill = i % 2 === 0 ? rowLight : rowDark; c.border = border;
      c.alignment = { vertical: 'middle', wrapText: true };
      if (idx === 2 || idx === 3) c.numFmt = '#,##0.00';
    });
    calculatedFbTotal += item.netPrice;
    currRow++;
  });
  sheet.getCell(`A${currRow}`).value = "TOTAL F&B";
  sheet.getCell(`A${currRow}`).font = { bold: true };
  sheet.getCell(`D${currRow}`).value = calculatedFbTotal;
  sheet.getCell(`D${currRow}`).font = { bold: true };
  sheet.getCell(`D${currRow}`).numFmt = '#,##0.00';
  ["A", "D"].forEach(col => { sheet.getCell(`${col}${currRow}`).fill = headerFill; sheet.getCell(`${col}${currRow}`).border = border; });
  currRow += 2;

  // Dashboard Section
  paintSection("Dashboard (Daily Summary)");
  const fbTotal = Number(rawData.fb_total || calculatedFbTotal || 0);
  const cashTotal = Number(rawData.cash_total || 0);
  const cardTotal = Number(rawData.card_total || 0);
  const transferTotal = Number(rawData.transfer_total || 0);
  const netSale = Number(rawData.net_sale || 0);
  
  const summaryData = [
    ["Flower Sales (grams)", Number(totalFlowerGrams || rawData.total_grams || 0)],
    ["Cash In", cashTotal],
    ["Card In", cardTotal],
    ["Transfer In", transferTotal],
    ["F&B Total", fbTotal],
    ["Total Expenses", totalExp],
    ["Net Sales", netSale]
  ];
  
  paintHeader(["Metric", "Value", "", "", "", "", "", "", ""]);
  summaryData.forEach((row, i) => {
    sheet.getCell(`A${currRow}`).value = row[0];
    sheet.getCell(`B${currRow}`).value = row[1];
    sheet.getCell(`B${currRow}`).numFmt = (i === 0) ? '#,##0.000 "G"' : '#,##0.00';
    ["A", "B"].forEach(col => { sheet.getCell(`${col}${currRow}`).border = border; sheet.getCell(`${col}${currRow}`).fill = i % 2 === 0 ? rowLight : rowDark; });
    currRow++;
  });
}

/**
 * Export Monthly Detailed Report
 */
  window.exportMonthlyToExcel = async function() {
  const monthInput = document.getElementById("reportMonth");
  const month = monthInput?.value;
  const exportBtn = document.getElementById("exportMonthlyBtn");
  const originalBtnText = exportBtn ? exportBtn.innerText : "📦 Export Monthly Excel";
  const progressContainer = document.getElementById("exportProgressContainer");
  const progressBar = document.getElementById("exportProgressBar");
  const progressLabel = document.getElementById("exportProgressLabel");
  const progressPercent = document.getElementById("exportProgressPercent");

  if (!month) {
    window.showMessage("Please select a month first", "warning");
    return;
  }

  const updateProgress = (text, percent) => {
    if (exportBtn) exportBtn.innerText = text;
    if (progressBar && percent !== undefined) {
      progressBar.style.width = percent + '%';
      progressBar.setAttribute('aria-valuenow', percent);
    }
    if (progressLabel) progressLabel.innerText = text;
    if (progressPercent) progressPercent.innerText = (percent || 0) + '%';
    window.showMessage(text, "info");
    console.log(text + ' - ' + (percent || 0) + '%');
  };

  try {
    if (exportBtn) exportBtn.disabled = true;
    if (progressContainer) progressContainer.classList.remove('d-none');
    updateProgress(`Preparing for ${month}...`, 5);

    // Get all days in the selected month
    const [year, monthNum] = month.split('-').map(Number);
    const lastDay = new Date(year, monthNum, 0).getDate();
    const daysInMonth = [];
    for (let d = 1; d <= lastDay; d++) {
      daysInMonth.push(`${month}-${String(d).padStart(2, '0')}`);
    }

    // Filter out future dates
    const today = new Date().toISOString().split('T')[0];
    const targetDays = daysInMonth.filter(d => d <= today);

    // Fetch existing reports to see what's missing
    const listRes = await fetch(`/api/reports`);
    const existingReports = listRes.ok ? await listRes.json() : [];
    const existingDates = new Set(existingReports.map(r => 
      typeof r.date === 'string' ? r.date.split('T')[0] : new Date(r.date).toISOString().split('T')[0]
    ));

    // Sync missing days from Loyverse to Database
    const missingDays = targetDays.filter(d => !existingDates.has(d));
    const totalSteps = missingDays.length + targetDays.length + 2;
    let currentStep = 1;
    
    for (let i = 0; i < missingDays.length; i++) {
      const dateStr = missingDays[i];
      const percent = Math.round((currentStep / totalSteps) * 100);
      updateProgress(`Syncing ${i+1}/${missingDays.length}: ${dateStr}...`, percent);
      try {
        const syncRes = await fetch(`/api/loyverse/sync?date=${dateStr}`);
        if (syncRes.ok) console.log(`Synced ${dateStr}`);
      } catch (e) {
        console.warn(`Failed to sync ${dateStr}:`, e);
      }
      currentStep++;
    }

    // Now fetch the updated reports list
    currentStep++;
    updateProgress("Loading Data...", Math.round((currentStep / totalSteps) * 100));
    const response = await fetch(`/api/reports`);
    if (!response.ok) throw new Error("Failed to fetch updated reports list");
    const updatedReports = await response.json();
    
    // Build a lookup map from date string -> report object
    const reportByDate = new Map();
    updatedReports.forEach(report => {
      const rDate = typeof report.date === 'string' ? report.date.split('T')[0] : new Date(report.date).toISOString().split('T')[0];
      if (rDate.startsWith(month)) reportByDate.set(rDate, report);
    });

    if (reportByDate.size === 0 && targetDays.length === 0) {
      window.showMessage("No data found for this month.", "warning");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    
    // Summary Sheet
    const summarySheet = workbook.addWorksheet("Monthly Summary");
    summarySheet.columns = [
      { width: 18 }, // Date
      { width: 22 }, // Flower (grams)
      { width: 18 }, // Cash In
      { width: 18 }, // Card In
      { width: 18 }, // Transfer In
      { width: 18 }, // F&B Total
      { width: 18 }  // Net Sales
    ];
    const border = { top: { style: "thin", color: { argb: "FFD5B68A" } }, left: { style: "thin", color: { argb: "FFD5B68A" } }, bottom: { style: "thin", color: { argb: "FFD5B68A" } }, right: { style: "thin", color: { argb: "FFD5B68A" } } };
    const titleFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2A2010" } };
    const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1D8AC" } };

    summarySheet.mergeCells("A1:G1");
    const sTitle = summarySheet.getCell("A1");
    sTitle.value = `BestBuds Monthly Summary - ${month}`;
    sTitle.fill = titleFill; sTitle.font = { size: 14, bold: true, color: { argb: "FFF8EBCF" } };
    sTitle.alignment = { horizontal: "center" };

    const headers = ["Date", "Flower (grams)", "Cash In", "Card In", "Transfer In", "F&B Total", "Net Sales"];
    headers.forEach((h, i) => {
      const c = summarySheet.getCell(3, i + 1);
      c.value = h; c.fill = headerFill; c.font = { bold: true }; c.border = border; c.alignment = { horizontal: "center" };
    });

    let totalGrams = 0, totalCash = 0, totalCard = 0, totalTransfer = 0, totalFb = 0, totalNet = 0;
    let sRow = 4;

    // Iterate over ALL days in the month (not just days with data)
    for (let i = 0; i < targetDays.length; i++) {
      const dateStr = targetDays[i];
      const report = reportByDate.get(dateStr) || null;
      
      const percent = Math.round(((currentStep + i) / totalSteps) * 100);
      updateProgress(`Adding Day ${i+1}/${targetDays.length}: ${dateStr}...`, percent);

      // Fetch details for daily sheet
      let detailedData = null;
      try {
        const syncRes = await fetch(`/api/loyverse/sync?date=${dateStr}`);
        if (syncRes.ok) detailedData = await syncRes.json();
      } catch (e) {}

      const expRes = await fetch(`/api/expenses/${dateStr}`);
      const expenses = expRes.ok ? (await expRes.json()).expenses : [];
      const staff = getClosingStaff(dateStr) || "N/A";

      // Use report data if available, otherwise default to 0
      const grams = Number((report && report.total_grams) || 0);
      const cash = Number((report && report.cash_total) || 0);
      const card = Number((report && report.card_total) || 0);
      const transfer = Number((report && report.transfer_total) || 0);
      const fb = Number((report && report.fb_total) || 0);
      const net = Number((report && report.net_sale) || 0);

      totalGrams += grams; totalCash += cash; totalCard += card; totalTransfer += transfer; totalFb += fb; totalNet += net;

      const rowValues = [dateStr, grams, cash, card, transfer, fb, net];
      rowValues.forEach((v, i) => {
        const c = summarySheet.getCell(sRow, i + 1);
        c.value = v; c.border = border;
        c.alignment = { vertical: 'middle', wrapText: true };
        if (i > 0) c.numFmt = (i === 1) ? '#,##0.000' : '#,##0.00';
      });
      sRow++;

      // Create Daily Sheet
      const sheetName = dateStr.split('-').reverse().join('.');
      const daySheet = workbook.addWorksheet(sheetName);
      const { flowerItems, fbItems, totalFlowerGrams: dailyFlowerGrams, totalFbAmount: dailyFbTotal } = processItemsForExcel(detailedData?.orders || detailedData?.receipts || []);
      paintDailySheet(daySheet, dateStr, staff, detailedData || report || { date: dateStr }, expenses, flowerItems, fbItems, dailyFlowerGrams);
      
      // Update summary values with live calculated data if available
      if (detailedData) {
        if (dailyFlowerGrams > 0) {
          const diff = dailyFlowerGrams - grams;
          totalGrams += diff;
          summarySheet.getCell(sRow - 1, 2).value = dailyFlowerGrams;
        }
        if (dailyFbTotal > 0) {
          const diff = dailyFbTotal - fb;
          totalFb += diff;
          summarySheet.getCell(sRow - 1, 6).value = dailyFbTotal;
        }
      }

      // Small delay to keep UI responsive
      await new Promise(r => setTimeout(r, 10));
    }

    // Monthly Total Row
    const totals = ["TOTAL", totalGrams, totalCash, totalCard, totalTransfer, totalFb, totalNet];
    totals.forEach((v, i) => {
      const c = summarySheet.getCell(sRow, i + 1);
      c.value = v; c.fill = headerFill; c.font = { bold: true }; c.border = border;
      if (i > 0) c.numFmt = (i === 1) ? '#,##0.000' : '#,##0.00';
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `BestBuds_Monthly_Detailed_${month}.xlsx`; a.click();
    updateProgress("✓ Complete!", 100);
    if (progressBar) progressBar.classList.add('complete');
    window.showMessage("Monthly report exported successfully", "success");
    
    // Hide progress bar after 2 seconds
    setTimeout(() => {
      if (progressContainer) progressContainer.classList.add('d-none');
      if (progressBar) progressBar.classList.remove('complete');
      progressBar.style.width = '0%';
    }, 2000);
  } catch (error) {
    console.error('Monthly export error:', error);
    window.showMessage(`Error: ${error.message}`, "danger");
    if (progressContainer) progressContainer.classList.add('d-none');
  } finally {
    if (exportBtn) {
      exportBtn.disabled = false;
      exportBtn.innerText = originalBtnText;
    }
  }
};

/**
 * Standard Daily Export
 */
window.exportReportToExcel = async function() {
  const dateInput = document.getElementById("reportDate");
  const date = dateInput?.value;
  if (!date) { window.showMessage("Please select a date", "warning"); return; }

  try {
    window.showMessage("Generating daily report...", "info");
    let rawData = window.lastSyncedData;
    if (!rawData || rawData.date !== date) {
      const syncRes = await fetch(`/api/loyverse/sync?date=${date}`);
      if (syncRes.ok) rawData = await syncRes.json();
    }
    if (!rawData) { window.showMessage("No data found for this date", "danger"); return; }

    const expenses = await fetchExpenses(date);
    const staff = getClosingStaff(date) || "N/A";
    const { flowerItems, fbItems, totalFlowerGrams } = processItemsForExcel(rawData.orders || rawData.receipts || []);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Daily Report");
    paintDailySheet(sheet, date, staff, rawData, expenses, flowerItems, fbItems, totalFlowerGrams);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `BestBuds_Daily_Report_${date}.xlsx`; a.click();
    window.showMessage("Daily report exported successfully", "success");
  } catch (error) {
    console.error('Daily export error:', error);
    window.showMessage(`Error: ${error.message}`, "danger");
  }
};

// UI Rendering Helpers
function renderExpensesList(expenses, date) {
  const container = document.getElementById('expensesList');
  if (!container) return;
  container.innerHTML = expenses.length ? '' : '<p class="text-muted">No expenses added</p>';
  const list = document.createElement('ul');
  list.className = 'list-group';
  expenses.forEach(exp => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `<div><strong>${exp.category}</strong><br><small>${exp.description || ''}</small></div>
      <div><span class="badge bg-primary">THB ${Number(exp.amount).toFixed(2)}</span>
      <button class="btn btn-sm btn-danger ms-2" onclick="removeExpense(${exp.id}, '${date}')">Remove</button></div>`;
    list.appendChild(li);
  });
  if (expenses.length) container.appendChild(list);
}

window.addExpenseToReport = async function() {
  const btn = event?.currentTarget || document.querySelector('#expenseSection button.btn-success');
  if (btn && btn.disabled) return;
  
  const date = document.getElementById('reportDate')?.value;
  let cat = document.getElementById('expenseCategory')?.value;
  const customCat = document.getElementById('customExpenseCategory')?.value;
  if (cat === 'Other' && customCat) {
    cat = customCat;
  }
  const desc = document.getElementById('expenseDescription')?.value;
  const amtInput = document.getElementById('expenseAmount');
  const amt = amtInput?.value;
  
  if (!date || !cat || !amt) return window.showMessage('Fill all fields', 'warning');
  
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/expenses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, category: cat, description: desc, amount: Number(amt) })
    });
    if (res.ok) { 
      window.showMessage('Added', 'success'); 
      if (amtInput) amtInput.value = '';
      if (document.getElementById('expenseDescription')) document.getElementById('expenseDescription').value = '';
      if (document.getElementById('customExpenseCategory')) {
        document.getElementById('customExpenseCategory').value = '';
        document.getElementById('customExpenseCategory').classList.add('d-none');
      }
      if (document.getElementById('expenseCategory')) {
        document.getElementById('expenseCategory').value = '';
      }
      fetchExpenses(date); 
    }
  } catch (e) {
    console.error('Add expense error:', e);
  } finally {
    if (btn) btn.disabled = false;
  }
};

async function removeExpense(id, date) {
  if (await fetch(`/api/expenses/${id}`, { method: 'DELETE' })) fetchExpenses(date);
}

function renderClosingStaffList(staff, date) {
  const container = document.getElementById('closingStaffList');
  if (!container) return;
  container.innerHTML = staff.length ? '' : '<p class="text-muted">No staff added</p>';
  const list = document.createElement('ul');
  list.className = 'list-group';
  staff.forEach(s => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `<span>${s.name}</span><button class="btn btn-sm btn-danger" onclick="removeClosingStaff(${s.id}, '${date}')">Remove</button>`;
    list.appendChild(li);
  });
  if (staff.length) container.appendChild(list);
}

window.addClosingStaffToReport = async function() {
  const btn = event?.currentTarget || document.getElementById('addClosingStaffBtn');
  if (btn && btn.disabled) return;

  const date = document.getElementById('reportDate')?.value;
  const nameInput = document.getElementById('closingStaff');
  const name = nameInput?.value;
  
  if (!date || !name) return;
  
  if (btn) btn.disabled = true;
  try {
    const res = await fetch('/api/staff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, name })
    });
    if (res.ok) { 
      if (nameInput) nameInput.value = ''; 
      fetchStaff(date); 
    }
  } catch (e) {
    console.error('Add staff error:', e);
  } finally {
    if (btn) btn.disabled = false;
  }
};

async function removeClosingStaff(id, date) {
  if (await fetch(`/api/staff/${id}`, { method: 'DELETE' })) fetchStaff(date);
}

setupRealtimeListener();
