function showMessage(text, type = 'success') {
  const messageEl = document.getElementById('message');
  if (!messageEl) return;
  messageEl.textContent = text;
  messageEl.className = `alert alert-${type}`;
  messageEl.classList.remove('d-none');
  setTimeout(() => messageEl.classList.add('d-none'), 5000);
}

window.showMessage = showMessage;

document.addEventListener('DOMContentLoaded', () => {
  const els = {
    reportDate: document.getElementById('reportDate'),
    loadButton: document.getElementById('loadButton'),
    syncButton: document.getElementById('syncButton'),
    saveButton: document.getElementById('saveButton'),
    printButton: document.getElementById('printButton'),
    exportButton: document.getElementById('exportCsvBtn'),
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

  function getThailandDate() {
    const now = new Date();
    const thailandTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    return thailandTime.toISOString().slice(0, 10);
  }

  if (els.reportDate) {
    els.reportDate.value = getThailandDate();
    els.reportDate.addEventListener('change', (e) => {
      if (typeof loadReportData === 'function') {
        loadReportData(e.target.value);
      }
    });
    // Initial load
    setTimeout(() => {
      if (typeof loadReportData === 'function') {
        loadReportData(els.reportDate.value);
      }
    }, 500);
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

    entries.forEach((entry) => {
      const li = document.createElement('li');
      let amount = parseFloat(entry.amount || 0);
      
      // Clean up any potential numbering or text from amount if it was a string
      if (typeof entry.amount === 'string') {
        const matches = entry.amount.match(/-?\d+(?:,\d+)*(?:\.\d+)?/g);
        if (matches) amount = parseFloat(matches[matches.length - 1].replace(/,/g, ''));
      }

      if (isDiscount) {
        const percentage = parseFloat(entry.percentage || 0);
        li.textContent = `${percentage.toFixed(0)}%`;
      } else {
        const mainTotal = parseFloat(entry.main_acc_total || 0);
        const fbTotal = parseFloat(entry.fb_total || 0);
        
        if (mainTotal > 0 && fbTotal > 0) {
          li.textContent = `THB ${mainTotal.toFixed(2)} / ${fbTotal.toFixed(2)}`;
        } else if (fbTotal > 0) {
          li.textContent = `F&B THB ${fbTotal.toFixed(2)}`;
        } else {
          li.textContent = `THB ${mainTotal.toFixed(2)}`;
        }
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
        if (els.cashTotal) els.cashTotal.value = (data.cash_total || 0).toFixed(2);
        if (els.cardTotal) els.cardTotal.value = (data.card_total || 0).toFixed(2);
        if (els.transferTotal) els.transferTotal.value = (data.transfer_total || 0).toFixed(2);
        if (els.totalOrders) els.totalOrders.value = data.total_orders || 0;
        
        const netSale = (data.cash_total || 0) + (data.card_total || 0) + (data.transfer_total || 0);
        if (els.netSale) els.netSale.value = netSale.toFixed(2);

        renderEntries(els.cashEntriesList, els.cashEntriesTotal, data.cash_entries || [], 'THB', false);
        renderEntries(els.cardEntriesList, els.cardEntriesTotal, data.card_entries || [], 'THB', false);
        renderEntries(els.transferEntriesList, els.transferEntriesTotal, data.transfer_entries || [], 'THB', false);
        renderEntries(els.discountEntriesList, els.discountEntriesTotal, data.discount_entries || [], 'THB', true);

        window.lastSyncedData = data; // Ensure data is available for Excel export
        console.log('Data stored in window.lastSyncedData:', window.lastSyncedData);
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

  window.syncFromLoyverse = syncFromLoyverse;
  if (els.syncButton) els.syncButton.addEventListener('click', syncFromLoyverse);
  if (els.saveButton) els.saveButton.addEventListener('click', () => {});
  if (els.printButton) els.printButton.addEventListener('click', () => window.print());
  
  if (els.exportButton) {
    els.exportButton.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof exportReportToExcel === 'function') {
        exportReportToExcel();
      } else if (typeof exportToExcel === 'function') {
        exportToExcel();
      } else {
        alert('Excel Export logic is still loading. Please wait a moment.');
      }
    });
  }
  if (els.loadButton) els.loadButton.addEventListener('click', () => {});

  syncFromLoyverse();
});
