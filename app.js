document.addEventListener('DOMContentLoaded', () => {
  const els = {
    reportDate: document.getElementById('reportDate'),
    loadButton: document.getElementById('loadButton'),
    syncButton: document.getElementById('syncButton'),
    saveButton: document.getElementById('saveButton'),
    printButton: document.getElementById('printButton'),
    cashTotal: document.getElementById('cashTotal'),
    cardTotal: document.getElementById('cardTotal'),
    transferTotal: document.getElementById('transferTotal'),
    totalOrders: document.getElementById('totalOrders'),
    netSale: document.getElementById('netSale'),
    cashEntriesList: document.getElementById('cashEntriesList'),
    cardEntriesList: document.getElementById('cardEntriesList'),
    transferEntriesList: document.getElementById('transferEntriesList'),
    discountEntriesList: document.getElementById('discountEntriesList'),
    cashEntriesTotal: document.getElementById('cashEntriesTotal'),
    cardEntriesTotal: document.getElementById('cardEntriesTotal'),
    transferEntriesTotal: document.getElementById('transferEntriesTotal'),
    discountEntriesTotal: document.getElementById('discountEntriesTotal'),
    message: document.getElementById('message')
  };

  // Set default date to Thailand Today (UTC+7)
  function getThailandDate() {
    const now = new Date();
    // UTC time + 7 hours for Thailand
    const thailandTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    return thailandTime.toISOString().slice(0, 10);
  }

  if (els.reportDate) els.reportDate.value = getThailandDate();

  function showMessage(text, type = 'success') {
    if (!els.message) return;
    els.message.textContent = text;
    els.message.className = `alert alert-${type}`;
    els.message.classList.remove('d-none');
    setTimeout(() => els.message.classList.add('d-none'), 5000);
  }

  function renderEntries(listEl, totalEl, entries, type = 'THB', isDiscount = false) {
    if (!listEl || !totalEl) return;
    listEl.innerHTML = '';
    let total = 0;
    
    if (!entries || entries.length === 0) {
      listEl.innerHTML = '<li>-</li>';
      totalEl.textContent = `${type} 0.00`;
      return;
    }

    entries.forEach((entry, index) => {
      const li = document.createElement('li');
      const amount = parseFloat(entry.amount || 0);
      
      if (isDiscount) {
        // For discount entries, show percentage only
        const percentage = parseFloat(entry.percentage || 0);
        li.textContent = `${index + 1}. ${percentage.toFixed(0)}%`;
      } else {
        // For other entries, show THB amount
        li.textContent = `${index + 1}. THB ${amount.toFixed(2)}`;
      }
      
      listEl.appendChild(li);
      total += amount;
    });

    totalEl.textContent = `${type} ${total.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
  }

  async function syncFromLoyverse() {
    if (!els.syncButton) return;
    const originalText = els.syncButton.textContent;
    els.syncButton.textContent = 'Syncing...';
    els.syncButton.disabled = true;

    try {
      const date = els.reportDate.value;
      const response = await fetch(`/api/loyverse/sync?date=${date}`);
      const result = await response.json();

      if (response.ok) {
        const data = result || {};
        
        // Update Summary Fields
        if (els.cashTotal) els.cashTotal.value = (data.cash_total || 0).toFixed(2);
        if (els.cardTotal) els.cardTotal.value = (data.card_total || 0).toFixed(2);
        if (els.transferTotal) els.transferTotal.value = (data.transfer_total || 0).toFixed(2);
        if (els.totalOrders) els.totalOrders.value = data.total_orders || 0;
        
        const netSale = (data.cash_total || 0) + (data.card_total || 0) + (data.transfer_total || 0);
        if (els.netSale) els.netSale.value = netSale.toFixed(2);

        // Render Lists
        renderEntries(els.cashEntriesList, els.cashEntriesTotal, data.cash_entries || [], 'THB', false);
        renderEntries(els.cardEntriesList, els.cardEntriesTotal, data.card_entries || [], 'THB', false);
        renderEntries(els.transferEntriesList, els.transferEntriesTotal, data.transfer_entries || [], 'THB', false);
        renderEntries(els.discountEntriesList, els.discountEntriesTotal, data.discount_entries || [], 'THB', true);

        showMessage('Data synced successfully from Loyverse');
      } else {
        showMessage(result.message || 'Failed to sync data', 'danger');
      }
    } catch (error) {
      console.error('Sync Error:', error);
      showMessage('Error connecting to server', 'danger');
    } finally {
      els.syncButton.textContent = originalText;
      els.syncButton.disabled = false;
    }
  }

  if (els.syncButton) els.syncButton.addEventListener('click', syncFromLoyverse);
  
  // Keep event listeners for hidden buttons to avoid errors
  if (els.saveButton) els.saveButton.addEventListener('click', () => {});
  if (els.printButton) els.printButton.addEventListener('click', () => window.print());
  if (els.loadButton) els.loadButton.addEventListener('click', () => {});

  // Initial sync
  syncFromLoyverse();
});
