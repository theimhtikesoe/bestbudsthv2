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
      console.error('Error processing real-time event:', error, event.data);
    }
  };

  eventSource.onerror = (error) => {
    console.error('SSE connection error:', error);
    eventSource.close();
    eventSource = null;
    // Reconnect after 5 seconds
    setTimeout(setupRealtimeListener, 5000);
  };
}

// Initialize real-time listener
setupRealtimeListener();

/**
 * Fetch expenses from API
 */
async function fetchExpenses(date) {
  try {
    const response = await fetch(`/api/expenses/${date}`);
    const data = await response.json();
    if (data.expenses) {
      renderExpensesList(data.expenses, date);
      // Keep local storage as backup/cache
      localStorage.setItem(`dailyExpenses_${date}`, JSON.stringify(data.expenses));
      return data.expenses;
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
 * Fetch staff from API
 */
async function fetchStaff(date) {
  try {
    const response = await fetch(`/api/staff/${date}`);
    const data = await response.json();
    if (data.staff) {
      renderClosingStaffList(data.staff, date);
      // Keep local storage as backup/cache
      localStorage.setItem(`dailyClosingStaff_${date}`, JSON.stringify(data.staff));
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

  if (submitBtn && submitBtn.disabled) return;
  if (submitBtn) submitBtn.disabled = true;

  const date = dateInput?.value;
  const category = categorySelect?.value;
  const description = descriptionInput?.value || "";
  const amount = parseFloat(amountInput?.value) || 0;

  if (!date || !category || amount <= 0) {
    window.showMessage("Please fill in all expense fields", "warning");
    if (submitBtn) submitBtn.disabled = false;
    return;
  }

  try {
    if (currentEditingExpenseId) {
      await fetch(`/api/expenses/${currentEditingExpenseId}`, { method: 'DELETE' });
      currentEditingExpenseId = null;
      if (submitBtn) submitBtn.textContent = "Add Expense";
    }

    const response = await fetch('/api/expenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, category, description, amount })
    });

    if (response.ok) {
      window.showMessage("Expense saved successfully", "success");
      if (categorySelect) categorySelect.value = "";
      if (descriptionInput) descriptionInput.value = "";
      if (amountInput) amountInput.value = "";
      // SSE will trigger re-fetch, no manual call here to avoid double-render
    } else {
      throw new Error('Failed to save expense');
    }
  } catch (error) {
    window.showMessage(`Error: ${error.message}`, "danger");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
};

window.editExpense = async function(id, date) {
  const expenses = getLocalExpenses(date);
  const expense = expenses.find(e => Number(e.id) === Number(id));
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
    const response = await fetch(`/api/expenses/${id}`, { method: 'DELETE' });
    if (response.ok) {
      window.showMessage("Expense deleted", "success");
      // SSE will handle refresh
      if (currentEditingExpenseId === id) {
          currentEditingExpenseId = null;
          const submitBtn = document.querySelector("#expenseSection button");
          if (submitBtn) submitBtn.textContent = "Add Expense";
      }
    } else {
      throw new Error('Failed to delete expense');
    }
  } catch (error) {
    window.showMessage(`Error: ${error.message}`, "danger");
  }
};

function renderClosingStaffList(staffEntries, date) {
  const container = document.getElementById("closingStaffList");
  if (!container) return;

  if (!Array.isArray(staffEntries) || staffEntries.length === 0) {
    container.innerHTML = "<p class=\"text-muted mb-0\">No closing staff recorded</p>";
    return;
  }

  let html = "<div class=\"table-responsive\"><table class=\"table table-sm table-hover align-middle\"><thead class=\"table-dark\"><tr><th>#</th><th>Name</th><th class=\"text-end\">Actions</th></tr></thead><tbody>";
  staffEntries.forEach((entry, index) => {
    html += `<tr>
      <td>${index + 1}</td>
      <td class=\"fw-semibold\">${entry.name}</td>
      <td class=\"text-end\">
        <button class=\"btn btn-xs btn-outline-info me-1\" onclick=\"editClosingStaff('${entry.id}', '${date}')\">Edit</button>
        <button class=\"btn btn-xs btn-outline-danger\" onclick=\"deleteClosingStaff('${entry.id}', '${date}')\">Delete</button>
      </td>
    </tr>`;
  });
  html += "</tbody></table></div>";
  container.innerHTML = html;
}

window.addClosingStaffToReport = async function() {
  const date = document.getElementById("reportDate")?.value;
  const staffInput = document.getElementById("closingStaff");
  const addBtn = document.getElementById("addClosingStaffBtn");

  if (addBtn && addBtn.disabled) return;
  if (addBtn) addBtn.disabled = true;

  const staffName = String(staffInput?.value || "").trim();

  if (!date || !staffName) {
    window.showMessage("Please fill in staff name", "warning");
    if (addBtn) addBtn.disabled = false;
    return;
  }

  try {
    if (currentEditingClosingStaffId) {
      await fetch(`/api/staff/${currentEditingClosingStaffId}`, { method: 'DELETE' });
      currentEditingClosingStaffId = null;
      if (addBtn) addBtn.textContent = "➕ Add Closing Staff";
    }

    const response = await fetch('/api/staff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, name: staffName })
    });

    if (response.ok) {
      window.showMessage("Staff saved successfully", "success");
      if (staffInput) staffInput.value = "";
      // SSE will handle refresh
    } else {
      throw new Error('Failed to save staff');
    }
  } catch (error) {
    window.showMessage(`Error: ${error.message}`, "danger");
  } finally {
    if (addBtn) addBtn.disabled = false;
  }
};

window.editClosingStaff = function(id, date) {
  const staffInput = document.getElementById("closingStaff");
  const addBtn = document.getElementById("addClosingStaffBtn");
  const entries = getClosingStaffEntries(date);
  const staff = entries.find((entry) => String(entry.id) === String(id));
  if (!staff || !staffInput) return;

  staffInput.value = staff.name;
  currentEditingClosingStaffId = staff.id;
  if (addBtn) addBtn.textContent = "Update Closing Staff";
  document.getElementById("closingStaffSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
};

window.deleteClosingStaff = async function(id, date) {
  if (!confirm("Are you sure you want to delete this staff member?")) return;
  try {
    const response = await fetch(`/api/staff/${id}`, { method: 'DELETE' });
    if (response.ok) {
      window.showMessage("Staff member removed", "success");
      // SSE will handle refresh
      if (String(currentEditingClosingStaffId) === String(id)) {
        currentEditingClosingStaffId = null;
        const addBtn = document.getElementById("addClosingStaffBtn");
        if (addBtn) addBtn.textContent = "➕ Add Closing Staff";
      }
    } else {
      throw new Error('Failed to delete staff');
    }
  } catch (error) {
    window.showMessage(`Error: ${error.message}`, "danger");
  }
};

window.loadReportData = async function(date) {
  fetchExpenses(date);
  fetchStaff(date);
  
  // Fetch persisted report data
  try {
    const res = await fetch(`/api/reports/${date}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.date) {
        // Update UI fields if they exist
        const fields = {
          'netSale': data.net_sale,
          'cashTotal': data.cash_total,
          'cardTotal': data.card_total,
          'transferTotal': data.transfer_total,
          'totalOrders': data.total_orders,
          'tip': data.tip,
          '1k_qty': data['1k_qty'],
          'opening_cash': data.opening_cash,
          'actual_cash_counted': data.actual_cash_counted
        };
        
        for (const [id, val] of Object.entries(fields)) {
          const el = document.getElementById(id);
          if (el) el.value = val;
        }
        
        // Update read-only displays
        const gramsEl = document.getElementById('totalGramsSold');
        if (gramsEl) gramsEl.innerText = (Number(data.total_grams) || 0).toFixed(3) + ' G';
        
        const fbEl = document.getElementById('orderEntriesFbTotal');
        if (fbEl) fbEl.textContent = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'THB' }).format(data.fb_total || 0);
        
        // Trigger any dependent calculations (like difference)
        if (typeof window.calculateDifference === 'function') window.calculateDifference();
      }
    }
  } catch (e) {
    console.error("Error loading persisted report:", e);
  }

  const staffInput = document.getElementById("closingStaff");
  if (staffInput) {
    staffInput.value = "";
    staffInput.placeholder = "Enter name";
  }
  currentEditingClosingStaffId = null;
  const addBtn = document.getElementById("addClosingStaffBtn");
  if (addBtn) addBtn.textContent = "➕ Add Closing Staff";
};

/**
 * Full Client-Side Excel Export
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
        let val = candidate;
        if (typeof val === 'object' && val !== null) val = val.amount || val.value;
        const num = Number(val);
        if (Number.isFinite(num)) return num;
      }
      return 0;
    }

    const flowerItems = [];
    const fbItems = [];
    let totalFlowerGrams = 0;

    receipts.forEach(receipt => {
      const items = receipt.line_items || receipt.items || [];
      const paymentMethod = (receipt.payments && receipt.payments[0]?.payment_type?.name) || 
                             (receipt.payments && receipt.payments[0]?.name) || "N/A";
      const receiptNumber = receipt.receipt_number || receipt.number || "N/A";
      
      const orderDiscount = getMoney(receipt.total_discount_money, receipt.discount_money) || 0;
      const orderTotal = getMoney(receipt.total_money, receipt.amount) || 0;

      items.forEach(item => {
        let itemName = String(item.name || "").toLowerCase();
        let category = String(item.category_name || "").toLowerCase();
        let qty = Number(item.quantity || 0);
        let grossPrice = getMoney(item.gross_total_money, item.subtotal_money) || (getMoney(item.price) * qty);
        let lineItemDiscount = getMoney(item.total_discount_money, item.discount_money) || 0;
        let itemNetPrice = getMoney(item.total_money) || Math.max(0, grossPrice - lineItemDiscount);

        if (itemNetPrice <= 0.01) return;

        const totalItemDiscount = Math.max(0, grossPrice - itemNetPrice);
        const discountPercent = grossPrice > 0 ? Math.round(totalItemDiscount / grossPrice * 100) : 0;
        const discountStr = totalItemDiscount > 0.01 ? `${discountPercent}% (${totalItemDiscount.toFixed(2)} THB)` : "-";

        const flowerStrains = ['grape soda', 'big foot', 'honey bee', 'jealousy mintz', 'crystal candy', 'alien mint', 'rocket fuel', 'gold dust', 'darth vader', 'cherry pop tarts', 'white cherry gelato', 'dosidos', 'obama runtz', 'free pina colada', 'flower', 'bud', 'pre-roll', 'joint'];
        const fbKeywords = ['water', 'soda', 'beer', 'drink', 'beverage', 'alcohol', 'wine', 'cider', 'spirit', 'cocktail', 'milk', 'coffee', 'tea', 'juice', 'cookie', 'brownie', 'cake', 'soju', 'gummy', 'snack', 'food', 'bakery'];
        const accessoryKeywords = ['accessories', 'merchandise', 'bong', 'paper', 'tip', 'grinder', 'shirt', 'hat', 'lighter', 'the lobby', 'merch', 'ashtray', 'ash tray', 'pipe', 'small pipe'];

        let isFlowerStrain = flowerStrains.some(s => itemName.includes(s));
        let isThcGummy = itemName.includes("thc gummy");
        let isLobbyShirt = itemName.includes("the lobby shirt");
        let isAccessory = accessoryKeywords.some(k => itemName.includes(k) || category.includes(k));
        let isFB = !isFlowerStrain && !isThcGummy && fbKeywords.some(k => itemName.includes(k) || category.includes(k));

        if (!isFlowerStrain && !isFB && !isThcGummy && !isAccessory) {
          if (grossPrice / (qty || 1) <= 50) isFB = true; else isFlowerStrain = true;
        }

        const isMain = (isFlowerStrain && !isAccessory) || isThcGummy;
        const exportType = isFB ? "F&B" : (isAccessory ? "Accessories" : "Flower/Main");

        const exportItem = {
          type: exportType,
          name: item.name,
          qty: (isMain && !isThcGummy && !isLobbyShirt) ? "-" : qty,
          gram: (isMain && !isThcGummy && !isLobbyShirt) ? `${qty.toFixed(3)} G` : "-",
          unitPrice: grossPrice / (qty || 1),
          discount: discountStr,
          netPrice: itemNetPrice,
          payment: paymentMethod,
          note: receiptNumber
        };

        if (isFB) fbItems.push(exportItem); else {
          flowerItems.push(exportItem);
          if (isFlowerStrain && !isThcGummy && !isLobbyShirt && !isAccessory) totalFlowerGrams += qty;
        }
      });
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Daily Report");
    sheet.properties.defaultRowHeight = 22;

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
      ["Type", "Name", "Qty", "Gram", "Price", "Discount", "Net", "Payment", "Note"].forEach((h, i) => {
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
      });
      currRow++;
    });

    currRow++;
    paintSection("Expenses");
    ["Category", "Description", "Amount"].forEach((h, i) => {
      const c = sheet.getCell(currRow, i + 1);
      c.value = h; c.fill = headerFill; c.border = border;
    });
    currRow++;
    let totalExp = 0;
    expenses.forEach((exp, i) => {
      const amt = Number(exp.amount || 0);
      totalExp += amt;
      sheet.getCell(`A${currRow}`).value = exp.category;
      sheet.getCell(`B${currRow}`).value = exp.description;
      sheet.getCell(`C${currRow}`).value = amt;
      ["A", "B", "C"].forEach(col => { sheet.getCell(`${col}${currRow}`).fill = i % 2 === 0 ? rowLight : rowDark; sheet.getCell(`${col}${currRow}`).border = border; });
      currRow++;
    });

    currRow++;
    paintSection("Food & Drinks");
    paintHeader();
    fbItems.forEach((item, i) => {
      const r = sheet.getRow(currRow);
      [item.type, item.name, item.qty, item.gram, item.unitPrice, item.discount, item.netPrice, item.payment, item.note].forEach((v, idx) => {
        const c = r.getCell(idx + 1);
        c.value = v; c.fill = i % 2 === 0 ? rowLight : rowDark; c.border = border;
      });
      currRow++;
    });

    currRow++;
    paintSection("Summary");
    const fbTotal = fbItems.reduce((a, b) => a + b.netPrice, 0);
    const summary = [["Total Grams", totalFlowerGrams], ["Cash", cashTotal], ["Card", cardTotal], ["Transfer", transferTotal], ["F&B Total", fbTotal], ["Total Expenses", totalExp], ["Net Sales", netSale], ["Net Profit", netSale - totalExp]];
    summary.forEach(s => {
      sheet.getCell(`A${currRow}`).value = s[0];
      sheet.getCell(`B${currRow}`).value = s[1];
      sheet.getCell(`A${currRow}`).border = border;
      sheet.getCell(`B${currRow}`).border = border;
      currRow++;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `BestBuds_Report_${date}.xlsx`; a.click();
    window.showMessage("Exported successfully", "success");
  } catch (error) {
    window.showMessage(`Export Error: ${error.message}`, "danger");
  }
};
