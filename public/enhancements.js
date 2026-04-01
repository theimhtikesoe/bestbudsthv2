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

  eventSource = new EventSource('/api/events');

  eventSource.onmessage = (event) => {
    try {
      // Handle potential double-stringified data from some SSE implementations
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
      console.log('Received real-time event:', data);
      
      const currentDate = document.getElementById("reportDate")?.value;

      if (data.date === currentDate) {
        console.log(`Received ${data.type} for ${data.date}. Triggering UI update.`);
        // Any update type (EXPENSE, STAFF, REPORT) should refresh relevant parts
        // To be safe and meet the user's "auto refresh/syncing" requirement, 
        // we refresh everything when any update occurs for the current date.
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
    console.warn('SSE connection lost, will retry...');
    eventSource.close();
    eventSource = null;
    setTimeout(setupRealtimeListener, 3000);
  };
}

/**
 * Fetch expenses from backend (with fallback to LocalStorage)
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
  } catch (error) {
    console.error('Error fetching expenses:', error);
    // Fallback to local storage
    const local = getLocalExpenses(date);
    renderExpensesList(local, date);
    return local;
  }
  return [];
}

/**
 * Fetch staff from backend (with fallback to LocalStorage)
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
  } catch (error) {
    console.error('Error fetching staff:', error);
    // Fallback to local storage
    const local = getClosingStaffEntries(date);
    renderClosingStaffList(local, date);
    return local;
  }
  return [];
}

/**
 * Get expenses from LocalStorage (Fallback)
 */
function getLocalExpenses(date) {
  const key = `dailyExpenses_${date}`;
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : [];
}

/**
 * Get Closing Staff entries
 */
function getClosingStaffEntries(date) {
  if (!date) return [];
  const listKey = `dailyClosingStaff_${date}`;
  const stored = localStorage.getItem(listKey);
  if (stored) {
    try {
      return JSON.parse(stored);
    } catch (e) {
      return [];
    }
  }
  return [];
}

/**
 * Get Closing Staff display string
 */
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

/**
 * Export Daily Report to Excel
 */
window.exportReportToExcel = async function() {
  const dateInput = document.getElementById("reportDate");
  const staffInput = document.getElementById("closingStaff");
  const date = dateInput?.value;
  const typedStaffName = String(staffInput?.value || "").trim();

  if (!date) {
    window.showMessage("Please select a date first", "warning");
    return;
  }

  const staffName = getClosingStaff(date) || typedStaffName || "N/A";

  try {
    window.showMessage("Generating Excel file...", "info");
    let rawData = window.lastSyncedData;
    if (rawData && rawData.date !== date) rawData = null;

    const expenses = getLocalExpenses(date);
    let receipts = rawData?.orders || rawData?.receipts || rawData?.items || [];

    if (!rawData || (receipts.length === 0 && !rawData.net_sale)) {
      if (typeof window.syncFromLoyverse === 'function') {
        await window.syncFromLoyverse();
        return exportReportToExcel(); 
      } else {
        window.showMessage("No synced data available. Please click 'Sync From Loyverse' first.", "danger");
        return;
      }
    }

    const cashTotal = Number(rawData.cash_total || 0);
    const cardTotal = Number(rawData.card_total || 0);
    const transferTotal = Number(rawData.transfer_total || 0);
    const netSale = Number(rawData.net_sale || 0);

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

    const flowerItems = [];
    const fbItems = [];
    let totalFlowerGrams = 0;

    receipts.forEach(receipt => {
      // Ensure receipt is a valid object
      if (!receipt || typeof receipt !== 'object') {
        console.warn('Invalid receipt object:', receipt);
        return;
      }

      const items = receipt.line_items || receipt.items || [];
      const paymentMethod = (receipt.payments && receipt.payments[0]?.payment_type?.name) || 
                             (receipt.payments && receipt.payments[0]?.name) || "N/A";
      const receiptNumber = receipt.receipt_number || receipt.number || "N/A";
      
      const orderDiscount = getMoney(receipt.total_discount_money, receipt.discount_money) || 0;
      const orderTotal = getMoney(receipt.total_money, receipt.amount) || 0;

      items.forEach(item => {
        // Ensure item is a valid object
        if (!item || typeof item !== 'object') {
          console.warn('Invalid item object:', item);
          return;
        }

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
        const discountStr = totalItemDiscount > 0.01 ? `${discountPercent}% (${totalItemDiscount.toFixed(2)} THB)` : "-";

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

        let isFlowerStrain = flowerStrains.some(s => itemName.includes(s));
        let isThcGummy = itemName.includes("thc gummy");
        let isAccessory = accessoryKeywords.some(k => itemName.includes(k) || category.includes(k));
        let isLobbyShirt = itemName.includes("the lobby shirt");
        let isFB = !isFlowerStrain && !isThcGummy && (fbKeywords.some(k => itemName.includes(k) || category.includes(k)) ||
                   (['tea'].some(k => itemName.includes(k) || category.includes(k)) && !itemName.includes('tea time')));

        if (!isFlowerStrain && !isFB && !isThcGummy && !isAccessory) {
          if (grossPrice / (qty || 1) <= 50) isFB = true; else isFlowerStrain = true;
        }

        // Determine display values based on item type (matching UI logic)
        let displayQty = qty;
        let displayGram = "-";
        let displayType = isFB ? "F&B" : (isAccessory ? "Accessories" : "Flower/Main");

        // For flower strains (not gummy, not accessories), show gram instead of qty
        if (isFlowerStrain && !isThcGummy && !isAccessory && !isLobbyShirt) {
          displayQty = "-";
          displayGram = `${qty.toFixed(3)} G`;
          totalFlowerGrams += qty;
        }

        const exportItem = {
          type: displayType,
          name: item.name || item.item_name,
          qty: displayQty,
          gram: displayGram,
          unitPrice: (itemNetPrice / (qty || 1)).toFixed(2),
          discount: discountStr,
          netPrice: itemNetPrice.toFixed(2),
          payment: paymentMethod,
          note: receiptNumber
        };

        if (isFB) fbItems.push(exportItem); else {
          flowerItems.push(exportItem);
        }
      });
    });

    // Ensure ExcelJS is available
    if (typeof ExcelJS === 'undefined') {
      throw new Error('ExcelJS library not loaded. Please refresh the page and try again.');
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Daily Report");
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

    const border = { top: { style: "thin", color: { argb: "FFD5B68A" } }, left: { style: "thin", color: { argb: "FFD5B68A" } }, bottom: { style: "thin", color: { argb: "FFD5B68A" } }, right: { style: "thin", color: { argb: "FFD5B68A" } } };
    const titleFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2A2010" } };
    const sectionFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3D2A14" } };
    const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1D8AC" } };
    const rowLight = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBF4" } };
    const rowDark = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4E0" } };

    sheet.mergeCells("A1:I1");
    sheet.getCell("A1").value = `BestBuds Daily Report - ${date}`;
    sheet.getCell("A1").fill = titleFill;
    sheet.getCell("A1").font = { size: 14, bold: true, color: { argb: "FFF8EBCF" } };
    sheet.getCell("A1").alignment = { horizontal: "center" };

    sheet.mergeCells("A2:I2");
    sheet.getCell("A2").value = `Closing Staff: ${staffName}`;
    sheet.getCell("A2").font = { bold: true };

    let currRow = 4;
    const paintSection = (label) => {
      sheet.mergeCells(`A${currRow}:I${currRow}`);
      const c = sheet.getCell(`A${currRow}`);
      c.value = label; c.fill = sectionFill; c.font = { bold: true, color: { argb: "FFF6E5C4" } };
      currRow++;
    };

    const paintHeader = () => {
      ["Item Type", "Item Name", "Qty", "Gram", "Unit Price", "Discount", "Net Price", "Payment", "Note"].forEach((h, i) => {
        const c = sheet.getCell(currRow, i + 1);
        c.value = h; c.fill = headerFill; c.font = { bold: true }; c.border = border;
      });
      currRow++;
    };

    paintSection("Flower / Main / Accessories");
    paintHeader();
    flowerItems.forEach((item, i) => {
      const r = sheet.getRow(currRow);
      [item.type, item.name, item.qty, item.gram, item.unitPrice, item.discount, item.netPrice, item.payment, item.note].forEach((v, idx) => {
        const c = r.getCell(idx + 1);
        c.value = v; c.fill = i % 2 === 0 ? rowLight : rowDark; c.border = border;
        c.alignment = { vertical: 'middle' };
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
    paintSection("Expenses");
    ["Category", "Description", "Amount"].forEach((h, i) => {
      const c = sheet.getCell(currRow, i + 1);
      c.value = h; c.fill = headerFill; c.border = border;
    });
    currRow++;
    let totalExp = 0;
    if (expenses.length === 0) {
      sheet.getCell(`A${currRow}`).value = "-";
      sheet.getCell(`B${currRow}`).value = "No expenses";
      sheet.getCell(`C${currRow}`).value = 0;
      ["A", "B", "C"].forEach(col => { sheet.getCell(`${col}${currRow}`).border = border; });
      currRow++;
    } else {
      expenses.forEach((exp, i) => {
        const amt = Number(exp.amount || 0);
        totalExp += amt;
        sheet.getCell(`A${currRow}`).value = exp.category;
        sheet.getCell(`B${currRow}`).value = exp.description;
        sheet.getCell(`C${currRow}`).value = amt;
        ["A", "B", "C"].forEach(col => { sheet.getCell(`${col}${currRow}`).fill = i % 2 === 0 ? rowLight : rowDark; sheet.getCell(`${col}${currRow}`).border = border; });
        currRow++;
      });
    }

    currRow++;
    paintSection("Food & Drinks");
    paintHeader();
    let calculatedFbTotal = 0;
    fbItems.forEach((item, i) => {
      const r = sheet.getRow(currRow);
      [item.type, item.name, item.qty, item.gram, item.unitPrice, item.discount, item.netPrice, item.payment, item.note].forEach((v, idx) => {
        const c = r.getCell(idx + 1);
        c.value = v; c.fill = i % 2 === 0 ? rowLight : rowDark; c.border = border;
        c.alignment = { vertical: 'middle' };
      });
      if (typeof item.netPrice === 'number') calculatedFbTotal += item.netPrice;
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
    paintSection("Daily Summary Dashboard");
    
    // Use F&B Total directly from synced data to match UI
    const fbTotal = Number(rawData.fb_total || 0);
    
    // Calculate Main/Accessories Total from flower items
    const mainAccTotal = flowerItems.reduce((a, b) => {
      const val = Number(b.netPrice);
      return a + (isNaN(val) || val <= 0.01 ? 0 : val);
    }, 0);
    
    const summaryData = [
      ["Total Grams Sold", `${Number(rawData.total_grams || totalFlowerGrams || 0).toFixed(3)} G`],
      ["Cash In", `${cashTotal.toLocaleString()} THB`],
      ["Card In", `${cardTotal.toLocaleString()} THB`],
      ["Transfer In", `${transferTotal.toLocaleString()} THB`],
      ["F&B Total", `${(fbTotal || calculatedFbTotal || 0).toLocaleString()} THB`],
      ["Total Expenses", `${totalExp.toLocaleString()} THB`],
      ["Net Sales (Total)", `${netSale.toLocaleString()} THB`],
      ["Net Profit (After Expenses)", `${(netSale - totalExp).toLocaleString()} THB`]
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

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `BestBuds_Report_${date}.xlsx`; a.click();
    window.showMessage("Exported successfully", "success");
  } catch (error) {
    console.error('Export error:', error);
    window.showMessage(`Export Error: ${error.message}`, "danger");
  }
};

/**
 * Export Monthly Report to Excel
 * Aggregates all reports for the selected month
 */
window.exportMonthlyToExcel = async function() {
  const monthInput = document.getElementById("reportMonth");
  const month = monthInput?.value;

  if (!month) {
    window.showMessage("Please select a month first", "warning");
    return;
  }

  try {
    window.showMessage("Generating monthly Excel file...", "info");

    // Fetch all reports for the selected month
    const response = await fetch(`/api/reports`);
    if (!response.ok) {
      window.showMessage("Failed to fetch reports", "danger");
      return;
    }

    const allReports = await response.json();
    
    // Ensure allReports is an array
    const reportsArray = Array.isArray(allReports) ? allReports : [];

    // Filter reports for the selected month
    // Month is in YYYY-MM format, report.date is YYYY-MM-DD
    const monthReports = reportsArray
      .filter(report => {
        if (!report.date) return false;
        // Handle potential Date object or ISO string from API
        const reportDate = typeof report.date === 'string' ? report.date : new Date(report.date).toISOString().split('T')[0];
        return reportDate.startsWith(month);
      })
      .sort((a, b) => {
        const dateA = typeof a.date === 'string' ? a.date : new Date(a.date).toISOString().split('T')[0];
        const dateB = typeof b.date === 'string' ? b.date : new Date(b.date).toISOString().split('T')[0];
        return dateA.localeCompare(dateB);
      });

    if (monthReports.length === 0) {
      window.showMessage("No reports found for the selected month", "warning");
      return;
    }

    // Ensure ExcelJS is available
    if (typeof ExcelJS === 'undefined') {
      throw new Error('ExcelJS library not loaded. Please refresh the page and try again.');
    }

    const workbook = new ExcelJS.Workbook();
    
    // Create Summary Sheet
    const summarySheet = workbook.addWorksheet("Monthly Summary");
    summarySheet.properties.defaultRowHeight = 22;

    const titleFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2A2010" } };
    const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1D8AC" } };
    const rowLight = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBF4" } };
    const rowDark = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4E0" } };
    const border = { top: { style: "thin", color: { argb: "FFD5B68A" } }, left: { style: "thin", color: { argb: "FFD5B68A" } }, bottom: { style: "thin", color: { argb: "FFD5B68A" } }, right: { style: "thin", color: { argb: "FFD5B68A" } } };

    // Add title
    summarySheet.mergeCells("A1:F1");
    summarySheet.getCell("A1").value = `BestBuds Monthly Report - ${month}`;
    summarySheet.getCell("A1").fill = titleFill;
    summarySheet.getCell("A1").font = { size: 14, bold: true, color: { argb: "FFF8EBCF" } };
    summarySheet.getCell("A1").alignment = { horizontal: "center" };

    // Add headers
    let currRow = 3;
    const headers = ["Date", "Net Sales", "Cash In", "Card In", "Transfer In", "Total Grams"];
    headers.forEach((h, i) => {
      const c = summarySheet.getCell(currRow, i + 1);
      c.value = h;
      c.fill = headerFill;
      c.font = { bold: true };
      c.border = border;
    });
    currRow++;

    // Add daily data
    let totalNetSales = 0;
    let totalCash = 0;
    let totalCard = 0;
    let totalTransfer = 0;
    let totalGrams = 0;

    monthReports.forEach((report, index) => {
      const netSale = Number(report.net_sale || 0);
      const cashIn = Number(report.cash_total || 0);
      const cardIn = Number(report.card_total || 0);
      const transferIn = Number(report.transfer_total || 0);
      const grams = Number(report.total_grams || 0);

      totalNetSales += netSale;
      totalCash += cashIn;
      totalCard += cardIn;
      totalTransfer += transferIn;
      totalGrams += grams;

      const reportDate = typeof report.date === 'string' ? report.date : new Date(report.date).toISOString().split('T')[0];
      const rowData = [
        reportDate,
        netSale.toFixed(2),
        cashIn.toFixed(2),
        cardIn.toFixed(2),
        transferIn.toFixed(2),
        grams.toFixed(3)
      ];

      rowData.forEach((value, colIndex) => {
        const cell = summarySheet.getCell(currRow, colIndex + 1);
        cell.value = value;
        cell.fill = index % 2 === 0 ? rowLight : rowDark;
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: colIndex === 0 ? 'left' : 'right' };
      });
      currRow++;
    });

    // Add totals row
    currRow++;
    const totalRow = [
      "MONTHLY TOTAL",
      totalNetSales.toFixed(2),
      totalCash.toFixed(2),
      totalCard.toFixed(2),
      totalTransfer.toFixed(2),
      totalGrams.toFixed(3)
    ];

    totalRow.forEach((value, colIndex) => {
      const cell = summarySheet.getCell(currRow, colIndex + 1);
      cell.value = value;
      cell.fill = headerFill;
      cell.font = { bold: true };
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: colIndex === 0 ? 'left' : 'right' };
    });

    // Set column widths
    summarySheet.columns = [
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 },
      { width: 15 }
    ];

    // Generate the Excel file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `BestBuds_Monthly_Report_${month}.xlsx`;
    a.click();
    window.showMessage("Monthly report exported successfully", "success");
  } catch (error) {
    console.error('Monthly export error:', error);
    window.showMessage(`Export Error: ${error.message}`, "danger");
  }
};

/**
 * Render expenses list
 */
function renderExpensesList(expenses, date) {
  const container = document.getElementById('expensesList');
  if (!container) return;

  container.innerHTML = '';
  if (!expenses || expenses.length === 0) {
    container.innerHTML = '<p class="text-muted">No expenses added</p>';
    return;
  }

  const list = document.createElement('ul');
  list.className = 'list-group';
  expenses.forEach((exp) => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `
      <div>
        <strong>${exp.category}</strong>
        ${exp.description ? `<br><small class="text-muted">${exp.description}</small>` : ''}
      </div>
      <div class="text-end">
        <span class="badge bg-primary">THB ${Number(exp.amount || 0).toFixed(2)}</span>
        <button class="btn btn-sm btn-danger ms-2" onclick="removeExpense(${exp.id}, '${date}')">Remove</button>
      </div>
    `;
    list.appendChild(li);
  });
  container.appendChild(list);
}

/**
 * Remove expense
 */
async function removeExpense(id, date) {
  try {
    const response = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (response.ok) {
      window.showMessage('Expense removed', 'success');
      await fetchExpenses(date);
    }
  } catch (error) {
    console.error('Error removing expense:', error);
    window.showMessage('Error removing expense', 'danger');
  }
}

/**
 * Add expense to report
 */
window.addExpenseToReport = async function() {
  const dateInput = document.getElementById('reportDate');
  const categorySelect = document.getElementById('expenseCategory');
  const descriptionInput = document.getElementById('expenseDescription');
  const amountInput = document.getElementById('expenseAmount');

  const date = dateInput?.value;
  const category = categorySelect?.value;
  const description = descriptionInput?.value || '';
  const amount = amountInput?.value;

  if (!date || !category || !amount) {
    window.showMessage('Please fill in all required fields', 'warning');
    return;
  }

  try {
    const response = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, category, description, amount: Number(amount) })
    });

    if (response.ok) {
      window.showMessage('Expense added', 'success');
      amountInput.value = '';
      descriptionInput.value = '';
      categorySelect.value = '';
      await fetchExpenses(date);
    } else {
      const error = await response.json();
      window.showMessage(error.message || 'Error adding expense', 'danger');
    }
  } catch (error) {
    console.error('Error adding expense:', error);
    window.showMessage('Error adding expense', 'danger');
  }
};

/**
 * Render closing staff list
 */
function renderClosingStaffList(staff, date) {
  const container = document.getElementById('closingStaffList');
  if (!container) return;

  container.innerHTML = '';
  if (!staff || staff.length === 0) {
    container.innerHTML = '<p class="text-muted">No staff added</p>';
    return;
  }

  const list = document.createElement('ul');
  list.className = 'list-group';
  staff.forEach((s) => {
    const li = document.createElement('li');
    li.className = 'list-group-item d-flex justify-content-between align-items-center';
    li.innerHTML = `
      <span>${s.name}</span>
      <button class="btn btn-sm btn-danger" onclick="removeClosingStaff(${s.id}, '${date}')">Remove</button>
    `;
    list.appendChild(li);
  });
  container.appendChild(list);
}

/**
 * Remove closing staff
 */
async function removeClosingStaff(id, date) {
  try {
    const response = await fetch(`/api/staff/${id}`, { method: 'DELETE' });
    if (response.ok) {
      window.showMessage('Staff removed', 'success');
      await fetchStaff(date);
    }
  } catch (error) {
    console.error('Error removing staff:', error);
    window.showMessage('Error removing staff', 'danger');
  }
}

/**
 * Add closing staff to report
 */
window.addClosingStaffToReport = async function() {
  const dateInput = document.getElementById('reportDate');
  const staffInput = document.getElementById('closingStaff');

  const date = dateInput?.value;
  const name = staffInput?.value?.trim();

  if (!date || !name) {
    window.showMessage('Please enter staff name', 'warning');
    return;
  }

  try {
    const response = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, name })
    });

    if (response.ok) {
      window.showMessage('Staff added', 'success');
      staffInput.value = '';
      await fetchStaff(date);
    } else {
      const error = await response.json();
      window.showMessage(error.message || 'Error adding staff', 'danger');
    }
  } catch (error) {
    console.error('Error adding staff:', error);
    window.showMessage('Error adding staff', 'danger');
  }
};

// Initialize on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setupRealtimeListener();
  });
} else {
  setupRealtimeListener();
}
