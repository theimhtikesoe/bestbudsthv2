/**
 * Enhanced Daily Reports - Item Classification & Expense Tracking
 * Performs full client-side Excel export using ExcelJS
 * Matches User Template: BestBuds_Report_2026-03-13.xlsx
 */

let currentEditingExpenseId = null;

/**
 * Get expenses from LocalStorage
 */
function getLocalExpenses(date) {
  const key = `dailyExpenses_${date}`;
  const stored = localStorage.getItem(key);
  return stored ? JSON.parse(stored) : [];
}

/**
 * Save expenses to LocalStorage
 */
function saveLocalExpenses(date, expenses) {
  const key = `dailyExpenses_${date}`;
  localStorage.setItem(key, JSON.stringify(expenses));
}

/**
 * Get Closing Staff from LocalStorage
 */
function getClosingStaff(date) {
  const key = `closingStaff_${date}`;
  return localStorage.getItem(key) || "";
}

/**
 * Save Closing Staff to LocalStorage
 */
function saveClosingStaff(date, name) {
  localStorage.setItem(`closingStaff_${date}`, name);
}

/**
 * Render expenses list in UI
 */
function renderExpensesList(expenses, date) {
  const container = document.getElementById("expensesList");
  if (!container) return;
  if (!expenses || expenses.length === 0) {
    container.innerHTML = "<p class=\"text-muted\">No expenses recorded</p>";
    return;
  }
  let html = `<div class=\"table-responsive\"><table class=\"table table-sm table-hover align-middle\"><thead class=\"table-dark\"><tr><th>Category</th><th>Description</th><th>Amount</th><th class=\"text-end\">Actions</th></tr></thead><tbody>`;
  let total = 0;
  expenses.forEach(expense => {
    const amount = parseFloat(expense.amount) || 0;
    total += amount;
    html += `<tr><td><span class=\"badge bg-secondary\">${expense.category}</span></td><td>${expense.description || "-"}</td><td class=\"fw-bold\">${amount.toLocaleString()} THB</td><td class=\"text-end\"><button class=\"btn btn-xs btn-outline-info me-1\" onclick=\"editExpense(${expense.id}, '${date}')\">Edit</button><button class=\"btn btn-xs btn-outline-danger\" onclick=\"deleteExpense(${expense.id}, '${date}')\">Delete</button></td></tr>`;
  });
  html += `</tbody><tfoot class=\"table-light\"><tr class=\"fw-bold\"><td colspan=\"2\">Total Expenses</td><td colspan=\"2\" class=\"text-primary\">${total.toLocaleString()} THB</td></tr></tfoot></table></div>`;
  container.innerHTML = html;
}

/**
 * Add or Update expense
 */
window.addExpenseToReport = async function() {
  const dateInput = document.getElementById("reportDate");
  const categorySelect = document.getElementById("expenseCategory");
  const descriptionInput = document.getElementById("expenseDescription");
  const amountInput = document.getElementById("expenseAmount");
  const submitBtn = document.querySelector("#expenseSection button");

  const date = dateInput?.value;
  const category = categorySelect?.value;
  const description = descriptionInput?.value || "";
  const amount = parseFloat(amountInput?.value) || 0;

  if (!date || !category || amount <= 0) {
    window.showMessage("Please fill in all expense fields", "warning");
    return;
  }

  try {
    let expenses = getLocalExpenses(date);

    if (currentEditingExpenseId) {
      expenses = expenses.map(exp => {
        if (exp.id === currentEditingExpenseId) {
          return { ...exp, category, description, amount };
        }
        return exp;
      });
      window.showMessage("Expense updated successfully", "success");
      currentEditingExpenseId = null;
      if (submitBtn) submitBtn.textContent = "Add Expense";
    } else {
      const newExpense = {
        id: Date.now(),
        date,
        category,
        description,
        amount,
        created_at: new Date().toISOString()
      };
      expenses.push(newExpense);
      window.showMessage("Expense added successfully", "success");
    }
    
    saveLocalExpenses(date, expenses);
    if (categorySelect) categorySelect.value = "";
    if (descriptionInput) descriptionInput.value = "";
    if (amountInput) amountInput.value = "";
    renderExpensesList(expenses, date);
  } catch (error) {
    window.showMessage(`Error: ${error.message}`, "danger");
  }
};

window.editExpense = function(id, date) {
  const expenses = getLocalExpenses(date);
  const expense = expenses.find(e => e.id === id);
  if (!expense) return;
  if (document.getElementById("expenseCategory")) document.getElementById("expenseCategory").value = expense.category;
  if (document.getElementById("expenseDescription")) document.getElementById("expenseDescription").value = expense.description || "";
  if (document.getElementById("expenseAmount")) document.getElementById("expenseAmount").value = expense.amount;
  currentEditingExpenseId = id;
  const submitBtn = document.querySelector("#expenseSection button");
  if (submitBtn) submitBtn.textContent = "Update Expense";
  document.getElementById("expenseSection")?.scrollIntoView({ behavior: "smooth" });
};

window.deleteExpense = async function(id, date) {
  if (!confirm("Are you sure you want to delete this expense?")) return;
  try {
    let expenses = getLocalExpenses(date);
    expenses = expenses.filter(e => e.id !== id);
    saveLocalExpenses(date, expenses);
    window.showMessage("Expense deleted", "success");
    renderExpensesList(expenses, date);
    if (currentEditingExpenseId === id) {
        currentEditingExpenseId = null;
        const submitBtn = document.querySelector("#expenseSection button");
        if (submitBtn) submitBtn.textContent = "Add Expense";
    }
  } catch (error) {
    window.showMessage(`Error: ${error.message}`, "danger");
  }
};

window.loadReportData = function(date) {
  const expenses = getLocalExpenses(date);
  renderExpensesList(expenses, date);
  const staffName = getClosingStaff(date);
  const staffInput = document.getElementById("closingStaff");
  if (staffInput) staffInput.value = staffName;
};

/**
 * Full Client-Side Excel Export
 */
window.exportReportToExcel = async function() {
  const dateInput = document.getElementById("reportDate");
  const staffInput = document.getElementById("closingStaff");
  const date = dateInput?.value;
  const staffName = staffInput?.value || "N/A";

  if (!date) {
    window.showMessage("Please select a date first", "warning");
    return;
  }

  saveClosingStaff(date, staffName);

  try {
    window.showMessage("Generating Excel file...", "info");
    
    // Ensure we use the correct data for the selected date
    let rawData = window.lastSyncedData;
    
    // If the date in lastSyncedData doesn't match the selected date, we must re-sync
    if (rawData && rawData.date !== date) {
      console.log(`Date mismatch: selected ${date}, but data is for ${rawData.date}. Re-syncing...`);
      rawData = null;
    }

    const expenses = getLocalExpenses(date);

    // Check for synced data in various possible formats
    // Backend returns receipts in 'orders'
    let receipts = rawData?.orders || rawData?.receipts || rawData?.items || [];
    
    console.log('Exporting data. RawData:', rawData);
    console.log('Extracted receipts count:', receipts.length);

    // If no data in memory, try to trigger a sync or show error
    if (!rawData || (receipts.length === 0 && !rawData.net_sale)) {
      window.showMessage("No synced data found in memory. Attempting to re-sync...", "info");
      
      if (typeof window.syncFromLoyverse === 'function') {
        await window.syncFromLoyverse();
        const newData = window.lastSyncedData;
        const newReceipts = newData?.orders || newData?.receipts || newData?.items || [];
        if (!newData || (newReceipts.length === 0 && !newData.net_sale)) {
          window.showMessage("Still no data available after re-sync. Please check Loyverse for this date.", "danger");
          return;
        }
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

    function toMoneyNumber(value) {
      if (value === null || value === undefined) return null;
      if (typeof value === "number") return Number.isFinite(value) ? value : null;
      if (typeof value === "string") {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      if (typeof value === "object") {
        if (Object.prototype.hasOwnProperty.call(value, "amount")) {
          return toMoneyNumber(value.amount);
        }
        if (Object.prototype.hasOwnProperty.call(value, "value")) {
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
                             (receipt.payments && receipt.payments[0]?.name) || "N/A";
      const receiptNumber = receipt.receipt_number || receipt.number || "N/A";
      
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

        // Only skip if both price and qty are zero
        if (itemNetPrice <= 0 && qty <= 0) return;

        const totalItemDiscount = Math.max(0, grossPrice - itemNetPrice);
        const discountPercent = grossPrice > 0 ? Math.round(totalItemDiscount / grossPrice * 100) : 0;
        const discountStr = totalItemDiscount > 0.01 ? `${discountPercent}% (${totalItemDiscount.toFixed(2)} THB)` : "-";

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

        let isFlowerStrain = flowerStrains.some(strain => itemName.includes(strain));
        let isThcGummy = itemName.includes("thc gummy");
        let isLobbyShirt = itemName.includes("the lobby shirt");
        let isAccessory = accessoryKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword));

        // THC Gummy should be Main, not F&B
        let isFB = !isFlowerStrain && !isThcGummy && (fbKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword)) ||
                   (['tea'].some(keyword => itemName.includes(keyword) || category.includes(keyword)) && !itemName.includes('tea time')));

        if (!isFlowerStrain && !isFB && !isThcGummy && !isAccessory) {
          const unitPrice = grossPrice / (qty || 1);
          if (unitPrice <= 50 && unitPrice > 0) {
            isFB = true;
          } else {
            const isAcc = accessoryKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword));
            if (!isAcc) {
              isFlowerStrain = true; 
            }
          }
        }

        // If it's THC Gummy, it's Main/Flower but counted by Qty
        const isMain = (isFlowerStrain && !isAccessory) || isThcGummy;
        const exportType = isFB ? "F&B" : (isAccessory ? "Accessories" : "Flower/Main");

        const exportItem = {
          type: exportType,
          name: item.name || item.item_name,
          qty: (isMain && !isThcGummy && !isLobbyShirt) ? "-" : qty,
          gram: (isMain && !isThcGummy && !isLobbyShirt) ? `${qty.toFixed(3)} G` : "-",
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
          // Only add to total grams if it's actual flower (not gummy or shirt)
          if (isFlowerStrain && !isThcGummy && !isLobbyShirt && !isAccessory) {
            totalFlowerGrams += qty;
          }
        }
      });
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Daily Report");
    sheet.properties.defaultRowHeight = 22;
    sheet.pageSetup = {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true
    };

    const allCols = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
    const itemHeaders = ["Item Type", "Item Name", "Qty", "Gram", "Unit Price", "Discount", "Net Price", "Payment", "Note"];

    const border = { top: { style: "thin", color: { argb: "FFD5B68A" } }, left: { style: "thin", color: { argb: "FFD5B68A" } }, bottom: { style: "thin", color: { argb: "FFD5B68A" } }, right: { style: "thin", color: { argb: "FFD5B68A" } } };
    const titleFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2A2010" } };
    const sectionFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3D2A14" } };
    const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1D8AC" } };
    const mainRowLight = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBF4" } };
    const mainRowDark = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4E0" } };
    const fbRowLight = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8ED" } };
    const fbRowDark = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF1DA" } };
    const expenseRowLight = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFAF1" } };
    const expenseRowDark = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4E2" } };
    const summaryLabelFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAECD0" } };
    const summaryValueFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7E8" } };
    const titleFont = { name: "Calibri", size: 14, bold: true, color: { argb: "FFF8EBCF" } };
    const subtitleFont = { name: "Calibri", size: 11.5, bold: true, color: { argb: "FF6E4A1A" } };
    const sectionFont = { name: "Calibri", size: 11.5, bold: true, color: { argb: "FFF6E5C4" } };
    const headerFont = { name: "Calibri", size: 11, bold: true, color: { argb: "FF4A3210" } };
    const bodyFont = { name: "Calibri", size: 11, color: { argb: "FF4E342E" } };
    const strongBodyFont = { name: "Calibri", size: 11, bold: true, color: { argb: "FF3D2A14" } };

    sheet.mergeCells("A1:I1");
    sheet.getCell("A1").value = `BestBuds Daily Report - ${date}`;
    sheet.getCell("A1").fill = titleFill;
    sheet.getCell("A1").font = titleFont;
    sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
    allCols.forEach((col) => { sheet.getCell(`${col}1`).border = border; });
    sheet.getRow(1).height = 26;

    sheet.mergeCells("A2:I2");
    sheet.getCell("A2").value = `Closing Staff: ${staffName}`;
    sheet.getCell("A2").font = subtitleFont;
    sheet.getCell("A2").alignment = { horizontal: "left", vertical: "middle" };
    allCols.forEach((col) => { sheet.getCell(`${col}2`).border = border; });
    sheet.getRow(2).height = 20;

    function paintSectionTitle(row, label) {
      sheet.mergeCells(`A${row}:I${row}`);
      const cell = sheet.getCell(`A${row}`);
      cell.value = label;
      cell.fill = sectionFill;
      cell.font = sectionFont;
      cell.alignment = { horizontal: "left", vertical: "middle" };
      allCols.forEach((col) => { sheet.getCell(`${col}${row}`).border = border; });
      sheet.getRow(row).height = 21;
    }

    function paintItemHeader(row) {
      itemHeaders.forEach((header, i) => {
        const cell = sheet.getCell(row, i + 1);
        cell.value = header;
        cell.fill = headerFill;
        cell.font = headerFont;
        cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
        cell.border = border;
      });
      sheet.getRow(row).height = 20;
    }

    function paintItemRow(row, item, fill) {
      sheet.getCell(`A${row}`).value = item.type;
      sheet.getCell(`B${row}`).value = item.name;
      sheet.getCell(`C${row}`).value = item.qty;
      sheet.getCell(`D${row}`).value = item.gram;
      sheet.getCell(`E${row}`).value = item.unitPrice;
      sheet.getCell(`F${row}`).value = item.discount;
      sheet.getCell(`G${row}`).value = item.netPrice;
      sheet.getCell(`H${row}`).value = item.payment;
      sheet.getCell(`I${row}`).value = item.note;

      allCols.forEach((col) => {
        const cell = sheet.getCell(`${col}${row}`);
        cell.fill = fill;
        cell.font = bodyFont;
        cell.border = border;
        cell.alignment = { horizontal: "left", vertical: "middle" };
      });

      sheet.getCell(`C${row}`).alignment = { horizontal: "center", vertical: "middle" };
      sheet.getCell(`D${row}`).alignment = { horizontal: "center", vertical: "middle" };
      sheet.getCell(`E${row}`).alignment = { horizontal: "right", vertical: "middle" };
      sheet.getCell(`F${row}`).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      sheet.getCell(`G${row}`).alignment = { horizontal: "right", vertical: "middle" };
      sheet.getCell(`I${row}`).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      sheet.getCell(`E${row}`).numFmt = "#,##0.00";
      sheet.getCell(`G${row}`).numFmt = "#,##0.00";
      sheet.getRow(row).height = 22;
    }

    function getCellText(value) {
      if (value === null || value === undefined) return "";
      if (typeof value === "object") {
        if (Array.isArray(value.richText)) {
          return value.richText.map((part) => part?.text || "").join("");
        }
        if (Object.prototype.hasOwnProperty.call(value, "result")) {
          return String(value.result ?? "");
        }
      }
      return String(value);
    }

    function autoSizeWorksheetColumns() {
      const minWidths = [18, 24, 8, 10, 12, 18, 12, 12, 14];
      const maxWidths = [28, 36, 10, 12, 14, 28, 14, 14, 20];

      minWidths.forEach((minWidth, idx) => {
        const column = sheet.getColumn(idx + 1);
        let width = minWidth;

        column.eachCell({ includeEmpty: true }, (cell) => {
          const text = getCellText(cell.value).replace(/\r?\n/g, " ");
          if (!text) return;
          width = Math.max(width, text.length + 2);
        });

        column.width = Math.min(width, maxWidths[idx]);
      });
    }

    let currRow = 4;
    paintSectionTitle(currRow, "Flower / Main / Accessories");
    currRow++;
    paintItemHeader(currRow);
    currRow++;
    flowerItems.forEach((item, idx) => {
      paintItemRow(currRow, item, idx % 2 === 0 ? mainRowLight : mainRowDark);
      currRow++;
    });
    currRow++;

    paintSectionTitle(currRow, "Expenses");
    currRow++;
    ["Category", "Description", "Amount"].forEach((h, i) => {
      const cell = sheet.getCell(currRow, i + 1);
      cell.value = h;
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = border;
    });
    ["D", "E", "F", "G", "H", "I"].forEach((col) => {
      sheet.getCell(`${col}${currRow}`).fill = headerFill;
      sheet.getCell(`${col}${currRow}`).border = border;
    });
    currRow++;

    const fbTotal = fbItems.reduce((acc, item) => acc + item.netPrice, 0);
    let totalExp = 0;
    if (expenses.length === 0) {
      sheet.getCell(`A${currRow}`).value = "-";
      sheet.getCell(`B${currRow}`).value = "No expenses";
      sheet.getCell(`C${currRow}`).value = 0;
      ["A", "B", "C"].forEach((col) => {
        const cell = sheet.getCell(`${col}${currRow}`);
        cell.fill = expenseRowLight;
        cell.font = bodyFont;
        cell.border = border;
      });
      sheet.getCell(`C${currRow}`).alignment = { horizontal: "right", vertical: "middle" };
      sheet.getCell(`C${currRow}`).numFmt = "#,##0.00";
      ["D", "E", "F", "G", "H", "I"].forEach((col) => {
        sheet.getCell(`${col}${currRow}`).fill = expenseRowLight;
        sheet.getCell(`${col}${currRow}`).border = border;
      });
      currRow++;
    } else {
      expenses.forEach((exp, idx) => {
        const rowFill = idx % 2 === 0 ? expenseRowLight : expenseRowDark;
        const amount = Number(exp.amount || 0);
        sheet.getCell(`A${currRow}`).value = exp.category;
        sheet.getCell(`B${currRow}`).value = exp.description || "-";
        sheet.getCell(`C${currRow}`).value = amount;
        totalExp += amount;
        ["A", "B", "C"].forEach((col) => {
          const cell = sheet.getCell(`${col}${currRow}`);
          cell.fill = rowFill;
          cell.font = bodyFont;
          cell.border = border;
        });
        sheet.getCell(`C${currRow}`).alignment = { horizontal: "right", vertical: "middle" };
        sheet.getCell(`C${currRow}`).numFmt = "#,##0.00";
        ["D", "E", "F", "G", "H", "I"].forEach((col) => {
          sheet.getCell(`${col}${currRow}`).fill = rowFill;
          sheet.getCell(`${col}${currRow}`).border = border;
        });
        currRow++;
      });
    }
    currRow++;

    paintSectionTitle(currRow, "Food & Drinks");
    currRow++;
    paintItemHeader(currRow);
    currRow++;
    fbItems.forEach((item, idx) => {
      paintItemRow(currRow, item, idx % 2 === 0 ? fbRowLight : fbRowDark);
      currRow++;
    });
    currRow++;

    paintSectionTitle(currRow, "Daily Summary Dashboard");
    currRow++;

    const summaryData = [
      ["Total Grams Sold", totalFlowerGrams, "G"],
      ["Cash In", cashTotal, "THB"],
      ["Card In", cardTotal, "THB"],
      ["Transfer In", transferTotal, "THB"],
      ["F&B Total", fbTotal, "THB"],
      ["Total Expenses", totalExp, "THB"],
      ["Net Sales (Total)", netSale, "THB"],
      ["Net Profit (After Expenses)", netSale - totalExp, "THB"]
    ];

    summaryData.forEach((row, idx) => {
      sheet.mergeCells(`A${currRow}:C${currRow}`);
      const labelCell = sheet.getCell(`A${currRow}`);
      const labelTailCell = sheet.getCell(`B${currRow}`);
      const labelTailCell2 = sheet.getCell(`C${currRow}`);
      const valueCell = sheet.getCell(`D${currRow}`);
      const unitCell = sheet.getCell(`E${currRow}`);
      labelCell.value = row[0];
      valueCell.value = row[1];
      unitCell.value = row[2];

      labelCell.fill = summaryLabelFill;
      labelCell.font = strongBodyFont;
      labelCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
      labelCell.border = border;
      labelTailCell.fill = summaryLabelFill;
      labelTailCell.border = border;
      labelTailCell2.fill = summaryLabelFill;
      labelTailCell2.border = border;

      valueCell.fill = summaryValueFill;
      valueCell.font = strongBodyFont;
      valueCell.alignment = { horizontal: "right", vertical: "middle" };
      valueCell.border = border;
      valueCell.numFmt = row[2] === "G" ? "#,##0.000" : "#,##0.00";

      unitCell.fill = summaryValueFill;
      unitCell.font = strongBodyFont;
      unitCell.alignment = { horizontal: "center", vertical: "middle" };
      unitCell.border = border;

      ["F", "G", "H", "I"].forEach((col) => {
        const cell = sheet.getCell(`${col}${currRow}`);
        cell.fill = idx % 2 === 0 ? summaryValueFill : summaryLabelFill;
        cell.border = border;
      });
      sheet.getRow(currRow).height = 24;
      currRow++;
    });

    autoSizeWorksheetColumns();
    sheet.views = [{ state: "frozen", ySplit: 3, xSplit: 1, activeCell: "B4", zoomScale: 115, zoomScaleNormal: 115 }];

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `BestBuds_Report_${date}.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);

    window.showMessage("Excel report exported successfully", "success");
  } catch (error) {
    console.error("Excel Export Error:", error);
    window.showMessage(`Error: ${error.message}`, "danger");
  }
};

function sanitizeExcelSheetName(name) {
  return String(name || "Sheet")
    .replace(/[\\/?*\[\]:]/g, "-")
    .slice(0, 31);
}

function getMonthDates(monthValue) {
  const [yearStr, monthStr] = String(monthValue || "").split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return [];
  }

  const dates = [];
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  while (cursor.getUTCMonth() === month - 1) {
    const y = cursor.getUTCFullYear();
    const m = String(cursor.getUTCMonth() + 1).padStart(2, "0");
    const d = String(cursor.getUTCDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${d}`);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function toMoneyNumberMonthly(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object") {
    if (Object.prototype.hasOwnProperty.call(value, "amount")) {
      return toMoneyNumberMonthly(value.amount);
    }
    if (Object.prototype.hasOwnProperty.call(value, "value")) {
      return toMoneyNumberMonthly(value.value);
    }
  }
  return null;
}

function getMoneyMonthly(...candidates) {
  for (const candidate of candidates) {
    const amount = toMoneyNumberMonthly(candidate);
    if (amount !== null) return amount;
  }
  return null;
}

function buildExportItemsForDay(receipts) {
  const flowerItems = [];
  const fbItems = [];
  let totalFlowerGrams = 0;

  receipts.forEach((receipt) => {
    const items = receipt.line_items || receipt.items || [];
    const paymentMethod = (receipt.payments && receipt.payments[0]?.payment_type?.name) ||
      (receipt.payments && receipt.payments[0]?.name) || "N/A";
    const receiptNumber = receipt.receipt_number || receipt.number || "N/A";

    const orderDiscount = getMoneyMonthly(
      receipt.total_discount_money,
      receipt.total_discounts_money,
      receipt.total_discount,
      receipt.discount_money,
      receipt.discount_amount,
      receipt.discount
    ) || 0;

    const orderGrossTotal = getMoneyMonthly(
      receipt.total_money_before_discounts,
      receipt.gross_total_money,
      receipt.total_price,
      receipt.total_money,
      receipt.total
    );

    items.forEach((item) => {
      let itemName = String(item?.name || item?.item_name || "").toLowerCase();
      let category = String(item?.category_name || "").toLowerCase();
      let qty = Number(item?.quantity ?? item?.qty ?? 0);

      const lineNetRaw = item?.total_money?.amount ?? item?.total_money;
      const hasLineNetPrice = lineNetRaw !== undefined && lineNetRaw !== null;
      const grossRaw = item?.gross_total_money?.amount ?? item?.gross_total_money;

      let grossPrice = Number(grossRaw);
      if (!Number.isFinite(grossPrice)) grossPrice = Number(lineNetRaw);
      if (!Number.isFinite(grossPrice)) grossPrice = Number(item?.price ?? 0) * qty;
      if (!Number.isFinite(grossPrice)) grossPrice = 0;

      let lineItemNetPrice = Number(lineNetRaw ?? 0);
      if (!Number.isFinite(lineItemNetPrice)) lineItemNetPrice = 0;
      if (!hasLineNetPrice && grossPrice > 0) {
        lineItemNetPrice = grossPrice - Number(
          item?.total_discount_money?.amount ??
          item?.total_discount_money ??
          item?.discount_money?.amount ??
          item?.discount_money ??
          item?.discount_amount ??
          item?.discount ??
          0
        );
      }

      let itemNetPrice = lineItemNetPrice;
      if (!hasLineNetPrice && orderDiscount > 0 && orderGrossTotal && orderGrossTotal > 0 && lineItemNetPrice > 0) {
        itemNetPrice = lineItemNetPrice - ((lineItemNetPrice / orderGrossTotal) * orderDiscount);
      }

      if (itemNetPrice <= 0.01) return;

      const itemDiscountAbs = Math.max(0, grossPrice - itemNetPrice);
      const hasDiscount = itemDiscountAbs > 0.01;
      const itemDiscountPct = grossPrice > 0 ? (itemDiscountAbs / grossPrice) * 100 : 0;
      const discountStr = hasDiscount ? `${itemDiscountPct.toFixed(2)}% (${itemDiscountAbs.toFixed(2)} THB)` : "-";

      const flowerStrains = [
        "grape soda", "blue pave", "devil driver", "lemon cherry gelato",
        "moonbow", "emergen c", "tea time", "silver shadow",
        "rozay cake", "truffaloha", "the planet of grape", "crunch berriez",
        "big foot", "honey bee", "jealousy mintz", "crystal candy",
        "alien mint", "rocket fuel", "gold dust", "darth vader",
        "cherry pop tarts", "white cherry gelato", "dosidos", "obama runtz",
        "free pina colada", "flower", "bud", "pre-roll", "joint"
      ];

      const fbKeywords = [
        "water", "soda", "beer", "drink", "beverage", "alcohol", "wine",
        "cider", "spirit", "cocktail", "milk", "coffee", "tea", "juice",
        "cookie", "brownie", "cake", "soju", "gummy", "snack", "food", "bakery"
      ];

      const accessoryKeywords = [
        "accessories", "merchandise", "bong", "paper", "tip", "grinder",
        "shirt", "hat", "lighter", "the lobby", "merch", "ashtray", "ash tray",
        "pipe", "small pipe", "best buds grinder", "best buds shirt",
        "nf best buds shirt", "sw best buds shirt"
      ];

      let isFlowerStrain = flowerStrains.some((strain) => itemName.includes(strain));
      let isThcGummy = itemName.includes("thc gummy");
      let isLobbyShirt = itemName.includes("the lobby shirt");
      let isAccessory = accessoryKeywords.some((keyword) => itemName.includes(keyword) || category.includes(keyword));

      let isFB = !isFlowerStrain && !isThcGummy && (
        fbKeywords.some((keyword) => itemName.includes(keyword) || category.includes(keyword)) ||
        (["tea"].some((keyword) => itemName.includes(keyword) || category.includes(keyword)) && !itemName.includes("tea time"))
      );

      if (!isFlowerStrain && !isFB && !isThcGummy && !isAccessory) {
        const unitPrice = grossPrice / (qty || 1);
        if (unitPrice <= 50 && unitPrice > 0) {
          isFB = true;
        } else {
          const isAcc = accessoryKeywords.some((keyword) => itemName.includes(keyword) || category.includes(keyword));
          if (!isAcc) isFlowerStrain = true;
        }
      }

      const isMain = (isFlowerStrain && !isAccessory) || isThcGummy;
      const exportType = isFB ? "F&B" : (isAccessory ? "Accessories" : "Flower/Main");

      const exportItem = {
        type: exportType,
        name: item.name || item.item_name,
        qty: (isMain && !isThcGummy && !isLobbyShirt) ? "-" : qty,
        gram: (isMain && !isThcGummy && !isLobbyShirt) ? `${qty.toFixed(3)} G` : "-",
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
        if (isFlowerStrain && !isThcGummy && !isLobbyShirt && !isAccessory) {
          totalFlowerGrams += qty;
        }
      }
    });
  });

  return { flowerItems, fbItems, totalFlowerGrams };
}

function addDailySheetToWorkbook(workbook, { date, staffName, rawData, expenses, sheetName }) {
  const receipts = rawData?.orders || rawData?.receipts || rawData?.items || [];
  const cashTotal = Number(rawData?.cash_total || 0);
  const cardTotal = Number(rawData?.card_total || 0);
  const transferTotal = Number(rawData?.transfer_total || 0);
  const netSale = Number(rawData?.net_sale || 0);

  const { flowerItems, fbItems, totalFlowerGrams } = buildExportItemsForDay(receipts);
  const fbTotal = fbItems.reduce((acc, item) => acc + Number(item.netPrice || 0), 0);
  const totalExp = (Array.isArray(expenses) ? expenses : []).reduce((acc, exp) => acc + Number(exp?.amount || 0), 0);

  const sheet = workbook.addWorksheet(sanitizeExcelSheetName(sheetName || date || "Daily Report"));
  sheet.properties.defaultRowHeight = 22;
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    horizontalCentered: true
  };

  const allCols = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  const itemHeaders = ["Item Type", "Item Name", "Qty", "Gram", "Unit Price", "Discount", "Net Price", "Payment", "Note"];

  const border = { top: { style: "thin", color: { argb: "FFD5B68A" } }, left: { style: "thin", color: { argb: "FFD5B68A" } }, bottom: { style: "thin", color: { argb: "FFD5B68A" } }, right: { style: "thin", color: { argb: "FFD5B68A" } } };
  const titleFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2A2010" } };
  const sectionFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF3D2A14" } };
  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1D8AC" } };
  const mainRowLight = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBF4" } };
  const mainRowDark = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4E0" } };
  const fbRowLight = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF8ED" } };
  const fbRowDark = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF1DA" } };
  const expenseRowLight = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFAF1" } };
  const expenseRowDark = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4E2" } };
  const summaryLabelFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAECD0" } };
  const summaryValueFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF7E8" } };
  const titleFont = { name: "Calibri", size: 14, bold: true, color: { argb: "FFF8EBCF" } };
  const subtitleFont = { name: "Calibri", size: 11.5, bold: true, color: { argb: "FF6E4A1A" } };
  const sectionFont = { name: "Calibri", size: 11.5, bold: true, color: { argb: "FFF6E5C4" } };
  const headerFont = { name: "Calibri", size: 11, bold: true, color: { argb: "FF4A3210" } };
  const bodyFont = { name: "Calibri", size: 11, color: { argb: "FF4E342E" } };
  const strongBodyFont = { name: "Calibri", size: 11, bold: true, color: { argb: "FF3D2A14" } };

  sheet.mergeCells("A1:I1");
  sheet.getCell("A1").value = `BestBuds Daily Report - ${date}`;
  sheet.getCell("A1").fill = titleFill;
  sheet.getCell("A1").font = titleFont;
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  allCols.forEach((col) => { sheet.getCell(`${col}1`).border = border; });
  sheet.getRow(1).height = 26;

  sheet.mergeCells("A2:I2");
  sheet.getCell("A2").value = `Closing Staff: ${staffName || "N/A"}`;
  sheet.getCell("A2").font = subtitleFont;
  sheet.getCell("A2").alignment = { horizontal: "left", vertical: "middle" };
  allCols.forEach((col) => { sheet.getCell(`${col}2`).border = border; });
  sheet.getRow(2).height = 20;

  function paintSectionTitle(row, label) {
    sheet.mergeCells(`A${row}:I${row}`);
    const cell = sheet.getCell(`A${row}`);
    cell.value = label;
    cell.fill = sectionFill;
    cell.font = sectionFont;
    cell.alignment = { horizontal: "left", vertical: "middle" };
    allCols.forEach((col) => { sheet.getCell(`${col}${row}`).border = border; });
    sheet.getRow(row).height = 21;
  }

  function paintItemHeader(row) {
    itemHeaders.forEach((header, i) => {
      const cell = sheet.getCell(row, i + 1);
      cell.value = header;
      cell.fill = headerFill;
      cell.font = headerFont;
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = border;
    });
    sheet.getRow(row).height = 20;
  }

  function paintItemRow(row, item, fill) {
    sheet.getCell(`A${row}`).value = item.type;
    sheet.getCell(`B${row}`).value = item.name;
    sheet.getCell(`C${row}`).value = item.qty;
    sheet.getCell(`D${row}`).value = item.gram;
    sheet.getCell(`E${row}`).value = item.unitPrice;
    sheet.getCell(`F${row}`).value = item.discount;
    sheet.getCell(`G${row}`).value = item.netPrice;
    sheet.getCell(`H${row}`).value = item.payment;
    sheet.getCell(`I${row}`).value = item.note;

    allCols.forEach((col) => {
      const cell = sheet.getCell(`${col}${row}`);
      cell.fill = fill;
      cell.font = bodyFont;
      cell.border = border;
      cell.alignment = { horizontal: "left", vertical: "middle" };
    });

    sheet.getCell(`C${row}`).alignment = { horizontal: "center", vertical: "middle" };
    sheet.getCell(`D${row}`).alignment = { horizontal: "center", vertical: "middle" };
    sheet.getCell(`E${row}`).alignment = { horizontal: "right", vertical: "middle" };
    sheet.getCell(`F${row}`).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    sheet.getCell(`G${row}`).alignment = { horizontal: "right", vertical: "middle" };
    sheet.getCell(`I${row}`).alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    sheet.getCell(`E${row}`).numFmt = "#,##0.00";
    sheet.getCell(`G${row}`).numFmt = "#,##0.00";
    sheet.getRow(row).height = 22;
  }

  function getCellText(value) {
    if (value === null || value === undefined) return "";
    if (typeof value === "object") {
      if (Array.isArray(value.richText)) {
        return value.richText.map((part) => part?.text || "").join("");
      }
      if (Object.prototype.hasOwnProperty.call(value, "result")) {
        return String(value.result ?? "");
      }
    }
    return String(value);
  }

  function autoSizeWorksheetColumns() {
    const minWidths = [18, 24, 8, 10, 12, 18, 12, 12, 14];
    const maxWidths = [28, 36, 10, 12, 14, 28, 14, 14, 20];

    minWidths.forEach((minWidth, idx) => {
      const column = sheet.getColumn(idx + 1);
      let width = minWidth;

      column.eachCell({ includeEmpty: true }, (cell) => {
        const text = getCellText(cell.value).replace(/\r?\n/g, " ");
        if (!text) return;
        width = Math.max(width, text.length + 2);
      });

      column.width = Math.min(width, maxWidths[idx]);
    });
  }

  let currRow = 4;
  paintSectionTitle(currRow, "Flower / Main / Accessories");
  currRow++;
  paintItemHeader(currRow);
  currRow++;
  flowerItems.forEach((item, idx) => {
    paintItemRow(currRow, item, idx % 2 === 0 ? mainRowLight : mainRowDark);
    currRow++;
  });
  currRow++;

  paintSectionTitle(currRow, "Expenses");
  currRow++;
  ["Category", "Description", "Amount"].forEach((h, i) => {
    const cell = sheet.getCell(currRow, i + 1);
    cell.value = h;
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = border;
  });
  ["D", "E", "F", "G", "H", "I"].forEach((col) => {
    sheet.getCell(`${col}${currRow}`).fill = headerFill;
    sheet.getCell(`${col}${currRow}`).border = border;
  });
  currRow++;

  if ((expenses || []).length === 0) {
    sheet.getCell(`A${currRow}`).value = "-";
    sheet.getCell(`B${currRow}`).value = "No expenses";
    sheet.getCell(`C${currRow}`).value = 0;
    ["A", "B", "C"].forEach((col) => {
      const cell = sheet.getCell(`${col}${currRow}`);
      cell.fill = expenseRowLight;
      cell.font = bodyFont;
      cell.border = border;
    });
    sheet.getCell(`C${currRow}`).alignment = { horizontal: "right", vertical: "middle" };
    sheet.getCell(`C${currRow}`).numFmt = "#,##0.00";
    ["D", "E", "F", "G", "H", "I"].forEach((col) => {
      sheet.getCell(`${col}${currRow}`).fill = expenseRowLight;
      sheet.getCell(`${col}${currRow}`).border = border;
    });
    currRow++;
  } else {
    expenses.forEach((exp, idx) => {
      const rowFill = idx % 2 === 0 ? expenseRowLight : expenseRowDark;
      const amount = Number(exp.amount || 0);
      sheet.getCell(`A${currRow}`).value = exp.category;
      sheet.getCell(`B${currRow}`).value = exp.description || "-";
      sheet.getCell(`C${currRow}`).value = amount;
      ["A", "B", "C"].forEach((col) => {
        const cell = sheet.getCell(`${col}${currRow}`);
        cell.fill = rowFill;
        cell.font = bodyFont;
        cell.border = border;
      });
      sheet.getCell(`C${currRow}`).alignment = { horizontal: "right", vertical: "middle" };
      sheet.getCell(`C${currRow}`).numFmt = "#,##0.00";
      ["D", "E", "F", "G", "H", "I"].forEach((col) => {
        sheet.getCell(`${col}${currRow}`).fill = rowFill;
        sheet.getCell(`${col}${currRow}`).border = border;
      });
      currRow++;
    });
  }
  currRow++;

  paintSectionTitle(currRow, "Food & Drinks");
  currRow++;
  paintItemHeader(currRow);
  currRow++;
  fbItems.forEach((item, idx) => {
    paintItemRow(currRow, item, idx % 2 === 0 ? fbRowLight : fbRowDark);
    currRow++;
  });
  currRow++;

  paintSectionTitle(currRow, "Daily Summary Dashboard");
  currRow++;

  const summaryData = [
    ["Total Grams Sold", totalFlowerGrams, "G"],
    ["Cash In", cashTotal, "THB"],
    ["Card In", cardTotal, "THB"],
    ["Transfer In", transferTotal, "THB"],
    ["F&B Total", fbTotal, "THB"],
    ["Total Expenses", totalExp, "THB"],
    ["Net Sales (Total)", netSale, "THB"],
    ["Net Profit (After Expenses)", netSale - totalExp, "THB"]
  ];

  summaryData.forEach((row, idx) => {
    sheet.mergeCells(`A${currRow}:C${currRow}`);
    const labelCell = sheet.getCell(`A${currRow}`);
    const labelTailCell = sheet.getCell(`B${currRow}`);
    const labelTailCell2 = sheet.getCell(`C${currRow}`);
    const valueCell = sheet.getCell(`D${currRow}`);
    const unitCell = sheet.getCell(`E${currRow}`);
    labelCell.value = row[0];
    valueCell.value = row[1];
    unitCell.value = row[2];

    labelCell.fill = summaryLabelFill;
    labelCell.font = strongBodyFont;
    labelCell.alignment = { horizontal: "left", vertical: "middle", wrapText: true };
    labelCell.border = border;
    labelTailCell.fill = summaryLabelFill;
    labelTailCell.border = border;
    labelTailCell2.fill = summaryLabelFill;
    labelTailCell2.border = border;

    valueCell.fill = summaryValueFill;
    valueCell.font = strongBodyFont;
    valueCell.alignment = { horizontal: "right", vertical: "middle" };
    valueCell.border = border;
    valueCell.numFmt = row[2] === "G" ? "#,##0.000" : "#,##0.00";

    unitCell.fill = summaryValueFill;
    unitCell.font = strongBodyFont;
    unitCell.alignment = { horizontal: "center", vertical: "middle" };
    unitCell.border = border;

    ["F", "G", "H", "I"].forEach((col) => {
      const cell = sheet.getCell(`${col}${currRow}`);
      cell.fill = idx % 2 === 0 ? summaryValueFill : summaryLabelFill;
      cell.border = border;
    });
    sheet.getRow(currRow).height = 24;
    currRow++;
  });

  autoSizeWorksheetColumns();
  sheet.views = [{ state: "frozen", ySplit: 3, xSplit: 1, activeCell: "B4", zoomScale: 115, zoomScaleNormal: 115 }];

  return {
    date,
    staffName: staffName || "N/A",
    ordersCount: receipts.length,
    cashTotal,
    cardTotal,
    transferTotal,
    netSale,
    fbTotal,
    expensesTotal: totalExp,
    netProfit: netSale - totalExp
  };
}

function renderMonthlySummarySheet(sheet, monthValue, summaries) {
  const columns = [
    { header: "Date", key: "date", width: 14 },
    { header: "Staff", key: "staff", width: 20 },
    { header: "Orders", key: "orders", width: 10 },
    { header: "Cash", key: "cash", width: 14 },
    { header: "Card", key: "card", width: 14 },
    { header: "Transfer", key: "transfer", width: 14 },
    { header: "Net Sale", key: "netSale", width: 14 },
    { header: "F&B Total", key: "fbTotal", width: 14 },
    { header: "Expenses", key: "expenses", width: 14 },
    { header: "Net Profit", key: "netProfit", width: 14 }
  ];
  sheet.columns = columns;

  const border = { top: { style: "thin", color: { argb: "FFD5B68A" } }, left: { style: "thin", color: { argb: "FFD5B68A" } }, bottom: { style: "thin", color: { argb: "FFD5B68A" } }, right: { style: "thin", color: { argb: "FFD5B68A" } } };
  const titleFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2A2010" } };
  const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1D8AC" } };
  const rowLight = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFBF4" } };
  const rowDark = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4E0" } };
  const totalFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFAECD0" } };

  sheet.mergeCells("A1:J1");
  sheet.getCell("A1").value = `BestBuds Monthly Report - ${monthValue}`;
  sheet.getCell("A1").fill = titleFill;
  sheet.getCell("A1").font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFF8EBCF" } };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 26;

  sheet.getRow(3).values = columns.map((col) => col.header);
  sheet.getRow(3).eachCell((cell) => {
    cell.fill = headerFill;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF4A3210" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = border;
  });
  sheet.getRow(3).height = 20;

  let rowIndex = 4;
  summaries.forEach((item, idx) => {
    sheet.getRow(rowIndex).values = [
      item.date,
      item.staffName,
      item.ordersCount,
      item.cashTotal,
      item.cardTotal,
      item.transferTotal,
      item.netSale,
      item.fbTotal,
      item.expensesTotal,
      item.netProfit
    ];

    sheet.getRow(rowIndex).eachCell((cell, colNumber) => {
      cell.fill = idx % 2 === 0 ? rowLight : rowDark;
      cell.font = { name: "Calibri", size: 11, color: { argb: "FF4E342E" } };
      cell.border = border;
      if (colNumber >= 4) {
        cell.alignment = { horizontal: "right", vertical: "middle" };
        cell.numFmt = "#,##0.00";
      } else if (colNumber === 3) {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      } else {
        cell.alignment = { horizontal: "left", vertical: "middle" };
      }
    });
    rowIndex++;
  });

  const totals = summaries.reduce((acc, item) => {
    acc.orders += Number(item.ordersCount || 0);
    acc.cash += Number(item.cashTotal || 0);
    acc.card += Number(item.cardTotal || 0);
    acc.transfer += Number(item.transferTotal || 0);
    acc.netSale += Number(item.netSale || 0);
    acc.fbTotal += Number(item.fbTotal || 0);
    acc.expenses += Number(item.expensesTotal || 0);
    acc.netProfit += Number(item.netProfit || 0);
    return acc;
  }, { orders: 0, cash: 0, card: 0, transfer: 0, netSale: 0, fbTotal: 0, expenses: 0, netProfit: 0 });

  sheet.getRow(rowIndex).values = [
    "TOTAL",
    "-",
    totals.orders,
    totals.cash,
    totals.card,
    totals.transfer,
    totals.netSale,
    totals.fbTotal,
    totals.expenses,
    totals.netProfit
  ];

  sheet.getRow(rowIndex).eachCell((cell, colNumber) => {
    cell.fill = totalFill;
    cell.font = { name: "Calibri", size: 11, bold: true, color: { argb: "FF3D2A14" } };
    cell.border = border;
    if (colNumber >= 4) {
      cell.alignment = { horizontal: "right", vertical: "middle" };
      cell.numFmt = "#,##0.00";
    } else if (colNumber === 3) {
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.numFmt = "#,##0";
    } else {
      cell.alignment = { horizontal: "left", vertical: "middle" };
    }
  });

  sheet.views = [{ state: "frozen", ySplit: 3, xSplit: 1, activeCell: "B4", zoomScale: 115, zoomScaleNormal: 115 }];
}

async function fetchSyncedDataForDateMonthly(date) {
  const response = await fetch(`/api/loyverse/sync?date=${encodeURIComponent(date)}`);
  if (!response.ok) {
    throw new Error(`Sync failed for ${date}`);
  }
  return response.json();
}

window.exportMonthlyToExcel = async function() {
  const monthInput = document.getElementById("reportMonth");
  const monthValue = monthInput?.value;

  if (!monthValue) {
    window.showMessage("Please select a month first", "warning");
    return;
  }

  const dates = getMonthDates(monthValue);
  if (dates.length === 0) {
    window.showMessage("Invalid month format", "danger");
    return;
  }

  try {
    window.showMessage(`Generating monthly workbook for ${monthValue}...`, "info");

    const workbook = new ExcelJS.Workbook();
    const summarySheet = workbook.addWorksheet("Monthly Summary");
    const summaries = [];
    const failedDates = [];

    for (let i = 0; i < dates.length; i++) {
      const date = dates[i];
      window.showMessage(`Syncing ${date} (${i + 1}/${dates.length})...`, "info");

      let rawData;
      try {
        rawData = await fetchSyncedDataForDateMonthly(date);
      } catch (error) {
        console.warn(`Monthly export sync failed for ${date}:`, error);
        failedDates.push(date);
        rawData = {
          date,
          orders: [],
          cash_total: 0,
          card_total: 0,
          transfer_total: 0,
          net_sale: 0
        };
      }

      const expenses = getLocalExpenses(date);
      const staffName = getClosingStaff(date) || "N/A";
      const summary = addDailySheetToWorkbook(workbook, {
        date,
        staffName,
        rawData,
        expenses,
        sheetName: date
      });
      summaries.push(summary);
    }

    renderMonthlySummarySheet(summarySheet, monthValue, summaries);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `BestBuds_Monthly_Report_${monthValue}.xlsx`;
    anchor.click();
    window.URL.revokeObjectURL(url);

    if (failedDates.length > 0) {
      window.showMessage(`Monthly export completed with fallback data on: ${failedDates.join(", ")}`, "warning");
      return;
    }

    window.showMessage("Monthly Excel report exported successfully", "success");
  } catch (error) {
    console.error("Monthly Export Error:", error);
    window.showMessage(`Monthly export failed: ${error.message}`, "danger");
  }
};
