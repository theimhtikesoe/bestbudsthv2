/**
 * Enhanced Daily Reports - Item Classification & Expense Tracking
 * Integrates with the existing app.js and index.html
 */

// Expense categories
const EXPENSE_CATEGORIES = [
  'Taxi',
  'Ice',
  'Deli',
  'Supplies',
  'Maintenance',
  'Utilities',
  'Other'
];

let currentEditingExpenseId = null;

/**
 * Get expenses from LocalStorage
 */
function getLocalExpenses(date) {
  const allExpenses = JSON.parse(localStorage.getItem('daily_expenses') || '{}');
  return allExpenses[date] || [];
}

/**
 * Save expenses to LocalStorage
 */
function saveLocalExpenses(date, expenses) {
  const allExpenses = JSON.parse(localStorage.getItem('daily_expenses') || '{}');
  allExpenses[date] = expenses;
  localStorage.setItem('daily_expenses', JSON.stringify(allExpenses));
}

/**
 * Add or Update expense (LocalStorage Version)
 */
async function addExpenseToReport() {
  const dateInput = document.getElementById('reportDate');
  const categorySelect = document.getElementById('expenseCategory');
  const descriptionInput = document.getElementById('expenseDescription');
  const amountInput = document.getElementById('expenseAmount');
  const submitBtn = document.querySelector('#expenseSection button');

  const date = dateInput?.value;
  const category = categorySelect?.value;
  const description = descriptionInput?.value || '';
  const amount = parseFloat(amountInput?.value) || 0;

  if (!date || !category || amount <= 0) {
    showMessage('Please fill in all expense fields', 'warning');
    return;
  }

  try {
    let expenses = getLocalExpenses(date);

    if (currentEditingExpenseId) {
      // Update existing
      expenses = expenses.map(exp => {
        if (exp.id === currentEditingExpenseId) {
          return { ...exp, category, description, amount };
        }
        return exp;
      });
      showMessage('Expense updated successfully', 'success');
      currentEditingExpenseId = null;
      if (submitBtn) submitBtn.textContent = 'Add Expense';
    } else {
      // Add new
      const newExpense = {
        id: Date.now(),
        date,
        category,
        description,
        amount,
        created_at: new Date().toISOString()
      };
      expenses.push(newExpense);
      showMessage('Expense added successfully', 'success');
    }
    
    saveLocalExpenses(date, expenses);

    // Clear form
    categorySelect.value = '';
    descriptionInput.value = '';
    amountInput.value = '';
    
    renderExpensesList(expenses, date);
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'danger');
  }
}

/**
 * Edit an expense (Load into form)
 */
function editExpense(id, date) {
  const expenses = getLocalExpenses(date);
  const expense = expenses.find(e => e.id === id);
  
  if (!expense) return;

  document.getElementById('expenseCategory').value = expense.category;
  document.getElementById('expenseDescription').value = expense.description || '';
  document.getElementById('expenseAmount').value = expense.amount;
  
  currentEditingExpenseId = id;
  const submitBtn = document.querySelector('#expenseSection button');
  if (submitBtn) submitBtn.textContent = 'Update Expense';
  
  // Scroll to form
  document.getElementById('expenseSection').scrollIntoView({ behavior: 'smooth' });
}

/**
 * Cancel editing
 */
function cancelEdit() {
  currentEditingExpenseId = null;
  document.getElementById('expenseCategory').value = '';
  document.getElementById('expenseDescription').value = '';
  document.getElementById('expenseAmount').value = '';
  const submitBtn = document.querySelector('#expenseSection button');
  if (submitBtn) submitBtn.textContent = 'Add Expense';
}

/**
 * Load expenses for a specific date
 */
async function loadExpenses(date) {
  const expenses = getLocalExpenses(date);
  renderExpensesList(expenses, date);
}

/**
 * Render expenses list in the UI with Edit and Delete buttons
 */
function renderExpensesList(expenses, date) {
  const container = document.getElementById('expensesList');
  if (!container) return;

  if (expenses.length === 0) {
    container.innerHTML = '<p class="text-muted">No expenses recorded</p>';
    return;
  }

  let html = `
    <div class="table-responsive">
      <table class="table table-sm table-hover align-middle">
        <thead class="table-dark">
          <tr>
            <th>Category</th>
            <th>Description</th>
            <th>Amount</th>
            <th class="text-end">Actions</th>
          </tr>
        </thead>
        <tbody>
  `;

  let total = 0;
  expenses.forEach(expense => {
    const amount = parseFloat(expense.amount) || 0;
    total += amount;
    html += `
      <tr>
        <td><span class="badge bg-secondary">${expense.category}</span></td>
        <td>${expense.description || '-'}</td>
        <td class="fw-bold">${amount.toLocaleString()} THB</td>
        <td class="text-end">
          <button class="btn btn-xs btn-outline-info me-1" onclick="editExpense(${expense.id}, '${date}')">Edit</button>
          <button class="btn btn-xs btn-outline-danger" onclick="deleteExpense(${expense.id}, '${date}')">Delete</button>
        </td>
      </tr>
    `;
  });

  html += `
        </tbody>
        <tfoot class="table-light">
          <tr class="fw-bold">
            <td colspan="2">Total Expenses</td>
            <td colspan="2" class="text-primary">${total.toLocaleString()} THB</td>
          </tr>
        </tfoot>
      </table>
    </div>
  `;

  container.innerHTML = html;
}

/**
 * Delete expense (LocalStorage Version)
 */
async function deleteExpense(id, date) {
  if (!confirm('Are you sure you want to delete this expense?')) return;

  try {
    let expenses = getLocalExpenses(date);
    expenses = expenses.filter(e => e.id !== id);
    saveLocalExpenses(date, expenses);

    showMessage('Expense deleted', 'success');
    renderExpensesList(expenses, date);
    
    if (currentEditingExpenseId === id) {
      cancelEdit();
    }
  } catch (error) {
    showMessage(`Error: ${error.message}`, 'danger');
  }
}

/**
 * Export report to Excel with classification
 */
async function exportReportToExcel() {
  const dateInput = document.getElementById('reportDate');
  const date = dateInput?.value;

  if (!date) {
    showMessage('Please select a date first', 'warning');
    return;
  }

  try {
    const expenses = getLocalExpenses(date);
    const expensesParam = encodeURIComponent(JSON.stringify(expenses));
    
    const response = await fetch(`/api/reports/${date}/export?expenses=${expensesParam}`);
    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.message || 'Failed to export report');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BestBuds_Report_${date}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  } catch (error) {
    showMessage(`Export failed: ${error.message}`, 'danger');
  }
}

/**
 * Show message to user
 */
function showMessage(text, type = 'info') {
  const messageEl = document.getElementById('message');
  if (!messageEl) return;

  messageEl.className = `alert alert-${type}`;
  messageEl.textContent = text;
  messageEl.classList.remove('d-none');

  setTimeout(() => {
    messageEl.classList.add('d-none');
  }, 5000);
}

/**
 * Initialize enhancements
 */
function initializeEnhancements() {
  console.log('Initializing Enhancements...');
  
  // 1. Setup Export Button
  const exportBtn = document.getElementById('exportCsvBtn');
  if (exportBtn) {
    console.log('Binding Export Button...');
    exportBtn.onclick = function(e) {
      e.preventDefault();
      exportReportToExcel();
    };
  }

  // 2. Date Change Listener
  const dateInput = document.getElementById('reportDate');
  if (dateInput) {
    dateInput.addEventListener('change', (e) => {
      if (e.target.value) {
        loadExpenses(e.target.value);
      }
    });
    // Initial load if date is already set
    if (dateInput.value) {
      loadExpenses(dateInput.value);
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeEnhancements);
} else {
  initializeEnhancements();
}
