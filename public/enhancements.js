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
    const rawData = window.lastSyncedData;
    const expenses = getLocalExpenses(date);

    // Check for synced data in various possible formats
    const receipts = rawData?.orders || rawData?.receipts || rawData?.items || [];
    
    console.log('Exporting data. RawData:', rawData);
    console.log('Extracted receipts:', receipts);

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

    const flowerItems = [];
    const fbItems = [];
    let totalFlowerGrams = 0;

    receipts.forEach(receipt => {
      const items = receipt.line_items || receipt.items || [];
      const paymentMethod = (receipt.payments && receipt.payments[0]?.payment_type?.name) || 
                             (receipt.payments && receipt.payments[0]?.name) || "N/A";
      const receiptNumber = receipt.receipt_number || receipt.number || "N/A";
      
      const orderDiscount = parseFloat(receipt.total_discount_money?.amount || 0);
      const orderTotal = parseFloat(receipt.total_money?.amount || 0);
      const hasOrderDiscount = orderDiscount > 0;

      items.forEach(item => {
        let itemName = String(item.name || item.item_name || "").toLowerCase();
        let category = String(item.category_name || "").toLowerCase();
        let qty = Number(item.quantity || item.qty || 0);
        
        let grossPrice = Number(item.gross_total_money?.amount ?? item.total_money?.amount ?? 0);
        const lineItemDiscount = parseFloat(item.total_discount_money?.amount || item.discount_money?.amount || item.discount_amount || 0);
        let itemNetPrice = item.total_money?.amount !== undefined ? parseFloat(item.total_money.amount) : (grossPrice - lineItemDiscount);
        
        if (hasOrderDiscount && orderTotal > 0 && itemNetPrice > 0) {
          let allocatedOrderDiscount = (itemNetPrice / (orderTotal + orderDiscount)) * orderDiscount;
          itemNetPrice = Math.max(0, itemNetPrice - allocatedOrderDiscount);
        }

        if (itemNetPrice <= 0.01) return;

        const totalItemDiscount = grossPrice - itemNetPrice;
        const discountPercent = grossPrice > 0 ? (totalItemDiscount / grossPrice * 100) : 0;
        const discountStr = totalItemDiscount > 0.01 ? `${discountPercent.toFixed(0)}% (${totalItemDiscount.toFixed(2)} THB)` : "-";

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
          'shirt', 'hat', 'lighter', 'the lobby', 'merch'
        ];

        let isFlowerStrain = flowerStrains.some(strain => itemName.includes(strain));
        let isThcGummy = itemName.includes("thc gummy");
        let isLobbyShirt = itemName.includes("the lobby shirt");

        // THC Gummy should be Main, not F&B
        let isFB = !isFlowerStrain && !isThcGummy && (fbKeywords.some(keyword => itemName.includes(keyword) || category.includes(keyword)) ||
                   (['tea'].some(keyword => itemName.includes(keyword) || category.includes(keyword)) && !itemName.includes('tea time')));

        if (!isFlowerStrain && !isFB && !isThcGummy) {
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
        const isMain = isFlowerStrain || isThcGummy;

        const exportItem = {
          type: isFB ? "F&B" : "Flower/Main",
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
          if (isFlowerStrain && !isThcGummy && !isLobbyShirt) {
            totalFlowerGrams += qty;
          }
        }
      });
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Daily Report");

    const border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    const boldFont = { bold: true };
    const headerFill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD3D3D3" } };

    sheet.getCell("A1").value = `Daily Report - ${date}`;
    sheet.getCell("A1").font = { size: 14, bold: true };

    sheet.getCell("A2").value = `Closing Staff: ${staffName}`;
    sheet.getCell("A2").font = { size: 11, bold: true };

    let currRow = 4;
    sheet.getCell(`A${currRow}`).value = "Flower / Main / Accessories";
    sheet.getCell(`A${currRow}`).font = { bold: true };
    currRow++;

    const headers = ["Item Type", "Item Name", "Qty", "Gram", "Unit Price", "Discount", "Net Price", "Payment", "Note"];
    headers.forEach((h, i) => {
      const cell = sheet.getCell(currRow, i + 1);
      cell.value = h;
      cell.fill = headerFill;
      cell.font = boldFont;
      cell.alignment = { horizontal: "center" };
      cell.border = border;
    });
    currRow++;

    flowerItems.forEach(item => {
      sheet.getCell(`A${currRow}`).value = item.type;
      sheet.getCell(`B${currRow}`).value = item.name;
      sheet.getCell(`C${currRow}`).value = item.qty;
      sheet.getCell(`D${currRow}`).value = item.gram;
      sheet.getCell(`E${currRow}`).value = item.unitPrice;
      sheet.getCell(`F${currRow}`).value = item.discount;
      sheet.getCell(`G${currRow}`).value = item.netPrice;
      sheet.getCell(`H${currRow}`).value = item.payment;
      sheet.getCell(`I${currRow}`).value = item.note;
      ["A","B","C","D","E","F","G","H","I"].forEach(col => sheet.getCell(`${col}${currRow}`).border = border);
      currRow++;
    });
    currRow += 2;

    sheet.getCell(`A${currRow}`).value = "Expenses";
    sheet.getCell(`A${currRow}`).font = { bold: true };
    currRow++;

    const expenseHeaders = ["Category", "Description", "Amount"];
    expenseHeaders.forEach((h, i) => {
      const cell = sheet.getCell(currRow, i + 1);
      cell.value = h;
      cell.fill = headerFill;
      cell.font = boldFont;
      cell.alignment = { horizontal: "center" };
      cell.border = border;
    });
    currRow++;

    let totalExp = 0;
    expenses.forEach(exp => {
      sheet.getCell(`A${currRow}`).value = exp.category;
      sheet.getCell(`B${currRow}`).value = exp.description || "-";
      sheet.getCell(`C${currRow}`).value = exp.amount;
      totalExp += exp.amount;
      ["A","B","C"].forEach(col => sheet.getCell(`${col}${currRow}`).border = border);
      currRow++;
    });
    currRow += 2;

    sheet.getCell(`A${currRow}`).value = "Food & Drinks";
    sheet.getCell(`A${currRow}`).font = { bold: true };
    currRow++;

    headers.forEach((h, i) => {
      const cell = sheet.getCell(currRow, i + 1);
      cell.value = h;
      cell.fill = headerFill;
      cell.font = boldFont;
      cell.alignment = { horizontal: "center" };
      cell.border = border;
    });
    currRow++;

    fbItems.forEach(item => {
      sheet.getCell(`A${currRow}`).value = item.type;
      sheet.getCell(`B${currRow}`).value = item.name;
      sheet.getCell(`C${currRow}`).value = item.qty;
      sheet.getCell(`D${currRow}`).value = item.gram;
      sheet.getCell(`E${currRow}`).value = item.unitPrice;
      sheet.getCell(`F${currRow}`).value = item.discount;
      sheet.getCell(`G${currRow}`).value = item.netPrice;
      sheet.getCell(`H${currRow}`).value = item.payment;
      sheet.getCell(`I${currRow}`).value = item.note;
      ["A","B","C","D","E","F","G","H","I"].forEach(col => sheet.getCell(`${col}${currRow}`).border = border);
      currRow++;
    });
    currRow += 2;

    sheet.getCell(`A${currRow}`).value = "Daily Summary Dashboard";
    sheet.getCell(`A${currRow}`).font = { bold: true };
    currRow++;

    const fbTotal = fbItems.reduce((acc, item) => acc + item.netPrice, 0);
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

    summaryData.forEach(row => {
      sheet.getCell(`A${currRow}`).value = row[0];
      sheet.getCell(`B${currRow}`).value = row[1];
      sheet.getCell(`C${currRow}`).value = row[2];
      ["A","B","C"].forEach(col => sheet.getCell(`${col}${currRow}`).border = border);
      currRow++;
    });

    sheet.columns.forEach(column => {
      column.width = 15;
    });
    sheet.getColumn(2).width = 30; // Item Name
    sheet.getColumn(6).width = 20; // Discount

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
