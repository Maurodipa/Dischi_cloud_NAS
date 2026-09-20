// fileManager.js

let currentPath = '/';
let currentFiles = [];
let currentSortBy = 'name';
let currentSortOrder = 'asc';
let searchQuery = '';

document.addEventListener('DOMContentLoaded', async () => {
  // Check auth first
  const isAuth = await checkAuthStatus();
  if (!isAuth) {
    window.location.href = '/index.html';
    return;
  }
  
  initUI();
  loadFiles(currentPath);
  pollSyncStatus();
  setInterval(pollSyncStatus, 15000); // Check every 15s

  // Monitoraggio S.M.A.R.T. (solo admin)
  if (currentUser && currentUser.role === 'admin') {
    pollDiskStatus();
    setInterval(pollDiskStatus, 60000); // Check ogni 60s
  }
});

async function pollSyncStatus() {
  const statusSpan = document.getElementById('sync-status');
  
  if (!currentUser || currentUser.role !== 'admin') {
    if (statusSpan) statusSpan.style.display = 'none';
    return;
  }

  try {
    const res = await apiFetch('/api/sync/status');
    const data = await res.json();
    
    if (statusSpan) {
      statusSpan.style.display = 'inline-flex';
      if (!data.isHealthy || data.errors > 0) {
        statusSpan.innerHTML = `🔴 Errore Backup (${data.errors})`;
        statusSpan.title = "Ci sono stati errori durante il salvataggio sul disco di backup.";
        statusSpan.style.color = "#ff4444";
        statusSpan.style.cursor = "help";
      } else {
        statusSpan.innerHTML = `🟢 Sincronizzato`;
        statusSpan.title = `Ultima sync: ${data.lastSyncTime ? new Date(data.lastSyncTime).toLocaleTimeString() : 'Mai'}\nFile copiati: ${data.totalSynced}`;
        statusSpan.style.color = "inherit";
        statusSpan.style.cursor = "help";
      }
    }
  } catch (e) {
    console.error('Failed to fetch sync status', e);
  }
}

// ─────────────────────────────────────────────────────────────
// S.M.A.R.T. Disk Health Badge (solo per admin)
// ─────────────────────────────────────────────────────────────
async function pollDiskStatus() {
  const badge = document.getElementById('disk-alert-badge');
  if (!badge) return;

  try {
    const res = await apiFetch('/api/system/disk-status');
    if (!res.ok) return;
    const data = await res.json();

    if (data.active) {
      // Mostra il bollino rosso
      badge.style.display = 'inline-flex';
      badge.title = `Disco: ${data.disk}\nMessaggio: ${data.message}\nRilevato: ${new Date(data.alertedAt).toLocaleString('it-IT')}`;

      // Pulsante dettagli
      const btnDetails = document.getElementById('btn-disk-alert-details');
      if (btnDetails) {
        btnDetails.onclick = () => {
          alert(`🔴 ALLERTA S.M.A.R.T.\n\nDisco: ${data.disk}\nProblema: ${data.message}\nRilevato: ${new Date(data.alertedAt).toLocaleString('it-IT')}\n\nVerifica il disco e clicca "✓ Risolto" per archiviare l'allerta.`);
        };
      }

      // Pulsante risolvi
      const btnResolve = document.getElementById('btn-resolve-disk-alert');
      if (btnResolve) {
        btnResolve.onclick = async () => {
          if (!confirm('Confermi di aver verificato e risolto il problema con il disco?\n\nVerrà inviata un\'email di conferma e il bollino scomparirà.')) return;
          try {
            const r = await apiFetch('/api/system/disk-resolve', { method: 'POST' });
            if (r.ok) {
              badge.style.display = 'none';
              alert('✅ Allerta marcata come risolta. Hai ricevuto una email di conferma.');
            } else {
              alert('Errore nella risoluzione dell\'allerta. Riprova.');
            }
          } catch (err) {
            console.error('Errore nella risoluzione:', err);
          }
        };
      }
    } else {
      // Nessuna allerta attiva: nascondi il bollino
      badge.style.display = 'none';
    }
  } catch (e) {
    console.error('Failed to fetch disk status', e);
  }
}

function initUI() {
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-refresh').addEventListener('click', () => loadFiles(currentPath));
  document.getElementById('btn-new-folder').addEventListener('click', showCreateFolderModal);
  
  if (currentUser) {
    const userSpan = document.getElementById('current-username');
    userSpan.textContent = `👤 ${currentUser.username}`;
    userSpan.addEventListener('click', showChangePasswordModal);
  }

  const btnAddPasskey = document.getElementById('btn-add-passkey');
  if (btnAddPasskey) {
    if (!window.SimpleWebAuthnBrowser || !window.SimpleWebAuthnBrowser.browserSupportsWebAuthn()) {
      btnAddPasskey.style.display = 'none';
    } else {
      btnAddPasskey.addEventListener('click', async () => {
        try {
          const resp = await apiFetch('/api/auth/webauthn/register/generate-options');
          const options = await resp.json();
          if (options.error) throw new Error(options.error);
          
          const attResp = await window.SimpleWebAuthnBrowser.startRegistration(options);
          
          const verifyResp = await apiFetch('/api/auth/webauthn/register/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(attResp)
          });
          
          const verifyData = await verifyResp.json();
          if (verifyData.verified) {
            showToast('Dispositivo registrato con successo!', 'success');
          } else {
            showToast('Errore durante la verifica', 'error');
          }
        } catch (e) {
          if (e.name !== 'NotAllowedError') {
            console.error(e);
            showToast('Errore: impossibile registrare il dispositivo', 'error');
          }
        }
      });
    }
  }
  
  if (currentUser && currentUser.role === 'admin') {
    const btnAdmin = document.getElementById('btn-admin');
    btnAdmin.style.display = 'inline-block';
    btnAdmin.addEventListener('click', showAdminModal);
  }
  
  const uploadZone = document.getElementById('upload-zone');
  uploadZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadZone.classList.add('dragover');
  });
  uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
  uploadZone.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadZone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      uploadFiles(e.dataTransfer.files, currentPath);
    }
  });

  const fileInput = document.getElementById('file-upload-input');
  document.getElementById('btn-upload-file').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) uploadFiles(e.target.files, currentPath);
    fileInput.value = ''; // Reset to allow selecting the same file again
  });

  const folderInput = document.getElementById('folder-upload-input');
  document.getElementById('btn-upload-folder').addEventListener('click', () => folderInput.click());
  folderInput.addEventListener('change', (e) => {
    if (e.target.files.length) uploadFiles(e.target.files, currentPath);
    folderInput.value = '';
  });
  
  // Modals close logic
  document.getElementById('btn-cancel-modal').addEventListener('click', closeModal);
  
  // Search input
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim().toLowerCase();
      renderFiles(currentFiles);
    });
  }
  
  // Mobile sidebar toggle
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      document.querySelector('.sidebar').classList.toggle('open');
    });
  }
  
  // Sort logic
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const sortBy = th.dataset.sort;
      if (currentSortBy === sortBy) {
        currentSortOrder = currentSortOrder === 'asc' ? 'desc' : 'asc';
      } else {
        currentSortBy = sortBy;
        currentSortOrder = 'asc';
      }
      updateSortIcons();
      renderFiles(currentFiles);
    });
  });
  updateSortIcons();
}

function updateSortIcons() {
  document.querySelectorAll('th[data-sort]').forEach(th => {
    const icon = th.querySelector('.sort-icon');
    if (th.dataset.sort === currentSortBy) {
      icon.innerText = currentSortOrder === 'asc' ? ' ▲' : ' ▼';
    } else {
      icon.innerText = '';
    }
  });
}

async function loadFiles(path) {
  try {
    const res = await apiFetch(`/api/files/list?path=${encodeURIComponent(path)}`);
    if (res.ok) {
      const data = await res.json();
      currentPath = path;
      currentFiles = data.files || [];
      renderBreadcrumb(path);
      renderFiles(currentFiles);
    } else {
      showToast('Errore nel caricamento dei file', 'error');
    }
    // Update disk usage whenever we load files
    loadDiskUsage();
  } catch (e) {
    showToast('Errore di rete', 'error');
  }
}

async function loadDiskUsage() {
  try {
    const res = await apiFetch('/api/files/disk-usage');
    if (res.ok) {
      const data = await res.json();
      const usedBytes = data.usedSpace || 0;
      const freeBytes = data.freeSpace || 0;
      
      const percent = Math.min(100, (usedBytes / (usedBytes + freeBytes)) * 100);
      
      document.getElementById('disk-usage-text').innerHTML = `Tuo Spazio: <b>${formatFileSize(usedBytes)}</b><br><span style="font-size: 0.8em; color: #aaa;">Libero su Server: ${formatFileSize(freeBytes)}</span>`;
      document.getElementById('disk-usage-bar').style.width = `${percent}%`;
    }
  } catch (e) {
    console.error('Failed to load disk usage', e);
  }
}

function renderBreadcrumb(path) {
  const breadcrumbEl = document.getElementById('breadcrumb');
  const parts = path.split('/').filter(p => p);
  
  let html = `<span class="breadcrumb-link" data-nav="/">Home</span>`;
  let currentAccumulated = '';
  
  parts.forEach(part => {
    currentAccumulated += `/${part}`;
    html += ` / <span class="breadcrumb-link" data-nav="${escapeHtml(currentAccumulated)}">${escapeHtml(part)}</span>`;
  });
  
  breadcrumbEl.innerHTML = html;
  
  // Aggiunge listener DOPO aver impostato innerHTML (gli onclick inline via innerHTML
  // vengono ignorati dai browser moderni e da qualsiasi Content Security Policy)
  breadcrumbEl.querySelectorAll('.breadcrumb-link').forEach(span => {
    span.addEventListener('click', () => navigateTo(span.dataset.nav));
  });
}

function navigateTo(path) {
  clearSelection();
  loadFiles(path);
}

// ─── Selezione multipla ───────────────────────────────────────────────
const selectedPaths = new Set();

function updateSelectionBar() {
  const bar      = document.getElementById('selection-bar');
  const countEl  = document.getElementById('selection-count');
  const selectAllCb = document.getElementById('select-all-cb');
  const n = selectedPaths.size;

  if (n === 0) {
    bar.style.display = 'none';
  } else {
    bar.style.display = 'flex';
    countEl.textContent = n === 1 ? '1 elemento selezionato' : `${n} elementi selezionati`;
  }

  // Aggiorna stato della checkbox "seleziona tutto"
  if (selectAllCb) {
    const allCbs = document.querySelectorAll('.file-select-cb');
    selectAllCb.checked = allCbs.length > 0 && [...allCbs].every(cb => cb.checked);
    selectAllCb.indeterminate = n > 0 && !selectAllCb.checked;
  }
}

function clearSelection() {
  selectedPaths.clear();
  document.querySelectorAll('.file-select-cb').forEach(cb => { cb.checked = false; });
  const selectAllCb = document.getElementById('select-all-cb');
  if (selectAllCb) { selectAllCb.checked = false; selectAllCb.indeterminate = false; }
  updateSelectionBar();
}

function renderFiles(files) {
  const tbody = document.getElementById('file-list-body');
  const emptyState = document.getElementById('empty-state');
  
  let filesToRender = [...files];
  
  if (searchQuery) {
    filesToRender = filesToRender.filter(f => {
      const sizeMatch = searchQuery.match(/^([<>])\s*(\d+(?:\.\d+)?)\s*(kb|mb|gb|tb)$/i);
      if (sizeMatch) {
        const op = sizeMatch[1];
        const num = parseFloat(sizeMatch[2]);
        const unit = sizeMatch[3].toLowerCase();
        let bytes = num;
        if (unit === 'kb') bytes *= 1024;
        if (unit === 'mb') bytes *= 1024 * 1024;
        if (unit === 'gb') bytes *= 1024 * 1024 * 1024;
        if (unit === 'tb') bytes *= 1024 * 1024 * 1024 * 1024;
        if (op === '>') return (f.size || 0) > bytes;
        if (op === '<') return (f.size || 0) < bytes;
      }
      return f.name.toLowerCase().includes(searchQuery);
    });
  }
  
  if (filesToRender.length === 0) {
    tbody.innerHTML = '';
    emptyState.style.display = 'block';
    updateSelectionBar();
    return;
  }
  
  emptyState.style.display = 'none';
  
  filesToRender.sort((a, b) => {
    if (a.isDirectory && !b.isDirectory) return -1;
    if (!a.isDirectory && b.isDirectory) return 1;
    let res = 0;
    if (currentSortBy === 'name')       res = a.name.localeCompare(b.name);
    else if (currentSortBy === 'size')  res = (a.size || 0) - (b.size || 0);
    else if (currentSortBy === 'date')  res = new Date(a.modifiedAt) - new Date(b.modifiedAt);
    return currentSortOrder === 'asc' ? res : -res;
  });
  
  tbody.innerHTML = filesToRender.map(file => {
    const icon     = getFileIcon(file.name, file.isDirectory);
    const size     = file.isDirectory ? '-' : formatFileSize(file.size);
    const date     = formatDate(file.modifiedAt);
    const fullPath = currentPath === '/' ? `/${file.name}` : `${currentPath}/${file.name}`;
    const checked  = selectedPaths.has(fullPath) ? 'checked' : '';

    return `
      <tr>
        <td style="text-align:center;">
          <input type="checkbox" class="file-select-cb" data-path="${escapeHtml(fullPath)}" ${checked}>
        </td>
        <td>
          <div class="file-item-name" style="cursor: pointer;" data-action="navigate" data-path="${escapeHtml(fullPath)}" data-isdir="${file.isDirectory}">
            <span>${icon}</span>
            <span>${escapeHtml(file.name)}</span>
          </div>
        </td>
        <td>${size}</td>
        <td>${date}</td>
        <td>
          <div class="file-actions">
            <button class="btn-icon" title="Scarica"  data-action="download" data-path="${escapeHtml(fullPath)}" data-isdir="${file.isDirectory}">⬇️</button>
            <button class="btn-icon" title="Sposta"   data-action="move"     data-path="${escapeHtml(fullPath)}">✂️</button>
            <button class="btn-icon" title="Rinomina" data-action="rename"   data-path="${escapeHtml(fullPath)}">✏️</button>
            <button class="btn-icon" title="Elimina"  data-action="delete"   data-path="${escapeHtml(fullPath)}" data-name="${escapeHtml(file.name)}">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Aggiorna il contatore elementi
  const countEl = document.getElementById('file-count-display');
  if (countEl) {
    const total = filesToRender.length;
    const dirs  = filesToRender.filter(f => f.isDirectory).length;
    const fls   = total - dirs;
    const parts = [];
    if (dirs > 0) parts.push(`${dirs} cartel${dirs === 1 ? 'la' : 'le'}`);
    if (fls > 0)  parts.push(`${fls} fil${fls === 1 ? 'e' : 'es'}`);
    countEl.textContent = `${total} element${total === 1 ? 'o' : 'i'}` + (parts.length ? ` (${parts.join(', ')})` : '');
  }

  // Ricalcola la barra di selezione dopo il re-render
  updateSelectionBar();
}

// ─── Move modal ───────────────────────────────────────────────────────

let moveTargetPaths = [];  // path(s) da spostare
let moveBrowsePath  = '/'; // cartella attualmente esplorata nel modal

async function showMoveModal(paths) {
  moveTargetPaths = [...paths];
  moveBrowsePath  = '/';
  await refreshMoveBrowser();
  document.getElementById('move-modal').style.display = 'flex';
}

async function refreshMoveBrowser() {
  const bcEl      = document.getElementById('move-modal-breadcrumb');
  const foldersEl = document.getElementById('move-modal-folders');

  // Breadcrumb del modal
  const parts = moveBrowsePath.split('/').filter(p => p);
  let bcHtml = `<span class="breadcrumb-link" data-movenav="/">🏠 Home</span>`;
  let acc = '';
  parts.forEach(p => {
    acc += '/' + p;
    bcHtml += ` / <span class="breadcrumb-link" data-movenav="${escapeHtml(acc)}">${escapeHtml(p)}</span>`;
  });
  bcEl.innerHTML = bcHtml;
  bcEl.querySelectorAll('[data-movenav]').forEach(span => {
    span.addEventListener('click', () => {
      moveBrowsePath = span.dataset.movenav;
      refreshMoveBrowser();
    });
  });

  // Lista cartelle nella posizione corrente
  foldersEl.innerHTML = '<p style="color:var(--text-muted); padding:0.5rem;">Caricamento...</p>';
  try {
    const res  = await apiFetch(`/api/files/list?path=${encodeURIComponent(moveBrowsePath)}`);
    const data = res.ok ? await res.json() : { files: [] };
    const dirs = (data.files || []).filter(f => f.isDirectory);

    if (dirs.length === 0) {
      foldersEl.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:1rem;">Nessuna sottocartella</p>';
    } else {
      foldersEl.innerHTML = dirs.map(d => {
        const fp = moveBrowsePath === '/' ? `/${d.name}` : `${moveBrowsePath}/${d.name}`;
        return `<div class="move-folder-item" data-path="${escapeHtml(fp)}"
                     style="padding:0.5rem 0.75rem; cursor:pointer; border-radius:5px; display:flex; align-items:center; gap:0.5rem;">
                  📁 ${escapeHtml(d.name)}
                </div>`;
      }).join('');

      foldersEl.querySelectorAll('.move-folder-item').forEach(el => {
        // Hover
        el.addEventListener('mouseenter', () => el.style.background = 'var(--hover-color, #ffffff18)');
        el.addEventListener('mouseleave', () => el.style.background = '');
        // Click → naviga dentro
        el.addEventListener('click', () => {
          moveBrowsePath = el.dataset.path;
          refreshMoveBrowser();
        });
      });
    }
  } catch {
    foldersEl.innerHTML = '<p style="color:#ff4444; padding:0.5rem;">Errore di rete</p>';
  }
}

async function executeMoveToFolder() {
  if (!moveTargetPaths.length) return;

  document.getElementById('move-modal').style.display = 'none';

  let errors = 0;
  for (const fromPath of moveTargetPaths) {
    try {
      const res = await apiFetch('/api/files/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromPath, toFolder: moveBrowsePath })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showToast(err.error || 'Errore nello spostamento', 'error');
        errors++;
      }
    } catch { errors++; }
  }

  clearSelection();
  loadFiles(currentPath);
  const label = moveTargetPaths.length === 1 ? '1 elemento' : `${moveTargetPaths.length} elementi`;
  if (errors === 0) showToast(`${label} spostati in "${moveBrowsePath}"`, 'success');
}


// ─── Azioni bulk ─────────────────────────────────────────────────────

async function deleteSelected() {
  const paths = [...selectedPaths];
  if (paths.length === 0) return;
  const label = paths.length === 1 ? '1 elemento' : `${paths.length} elementi`;
  if (!confirm(`Eliminare definitivamente ${label}?\nQuesta azione non può essere annullata.`)) return;

  let errors = 0;
  for (const p of paths) {
    try {
      const res = await apiFetch('/api/files/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: p })
      });
      if (!res.ok) errors++;
    } catch { errors++; }
  }

  clearSelection();
  loadFiles(currentPath);
  if (errors === 0) {
    showToast(`${label} eliminati con successo`, 'success');
  } else {
    showToast(`Completato con ${errors} errori`, 'error');
  }
}

async function downloadSelected() {
  const paths = [...selectedPaths];
  if (paths.length === 0) return;

  // Se è un solo elemento e non è una cartella → download diretto
  if (paths.length === 1) {
    const isDir = document.querySelector(`.file-select-cb[data-path="${CSS.escape(paths[0])}"]`)?.closest('tr')
      ?.querySelector('[data-action="download"]')?.dataset?.isdir === 'true';
    return downloadItem(paths[0], !!isDir);
  }

  // Multipli → richiedi uno ZIP al server con i path selezionati
  showToast('Preparazione ZIP...', 'info');
  try {
    const res = await apiFetch('/api/files/download-zip-selection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths })
    });
    if (!res.ok) { showToast('Errore nella preparazione dello ZIP', 'error'); return; }

    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'selezione.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch { showToast('Errore di rete', 'error'); }
}

// ─── Event delegation per file actions e checkbox ────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Selezione multipla: checkbox "seleziona tutto"
  const selectAllCb = document.getElementById('select-all-cb');
  if (selectAllCb) {
    selectAllCb.addEventListener('change', () => {
      const allCbs = document.querySelectorAll('.file-select-cb');
      allCbs.forEach(cb => {
        cb.checked = selectAllCb.checked;
        const p = cb.dataset.path;
        if (selectAllCb.checked) selectedPaths.add(p);
        else selectedPaths.delete(p);
      });
      updateSelectionBar();
    });
  }

  // Selezione multipla: bottoni nella barra
  document.getElementById('btn-delete-selected')?.addEventListener('click', deleteSelected);
  document.getElementById('btn-download-selected')?.addEventListener('click', downloadSelected);
  document.getElementById('btn-move-selected')?.addEventListener('click', () => showMoveModal([...selectedPaths]));
  document.getElementById('btn-clear-selection')?.addEventListener('click', clearSelection);

  // Modal Sposta
  document.getElementById('btn-cancel-move')?.addEventListener('click',  () => { document.getElementById('move-modal').style.display = 'none'; });
  document.getElementById('btn-confirm-move')?.addEventListener('click', executeMoveToFolder);

  const tbody = document.getElementById('file-list-body');
  if (tbody) {
    tbody.addEventListener('click', (e) => {
      // Checkbox singola riga
      const cb = e.target.closest('.file-select-cb');
      if (cb) {
        const p = cb.dataset.path;
        if (cb.checked) selectedPaths.add(p);
        else selectedPaths.delete(p);
        updateSelectionBar();
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const path   = btn.dataset.path;

      // Chiudi sidebar su mobile
      document.querySelector('.sidebar')?.classList.remove('open');

      if (action === 'navigate') {
        if (btn.dataset.isdir === 'true') navigateTo(path);
      } else if (action === 'download') {
        downloadItem(path, btn.dataset.isdir === 'true');
      } else if (action === 'move') {
        showMoveModal([path]);
      } else if (action === 'rename') {
        renameItem(path);
      } else if (action === 'delete') {
        confirmDelete(path, btn.dataset.name);
      }
    });
  }
});

const uploadQueue = [];
let isUploading = false;
let uploadBatchTotal = 0;     // Totale file nell'ondata corrente
let uploadBatchCompleted = 0; // File già completati (ok o errore)

function updateUploadTitle() {
  const titleEl = document.getElementById('upload-manager-title');
  if (!titleEl) return;

  if (uploadBatchTotal === 0) {
    titleEl.textContent = 'Caricamento in corso...';
    return;
  }

  if (!isUploading && uploadQueue.length === 0) {
    titleEl.textContent = `✅ Completati ${uploadBatchCompleted} file su ${uploadBatchTotal}`;
    return;
  }

  const inProgress = uploadBatchCompleted + 1; // Il file attualmente in upload
  const remaining  = uploadBatchTotal - uploadBatchCompleted - 1; // Quelli ancora in coda
  titleEl.textContent = `File ${inProgress} di ${uploadBatchTotal}${remaining > 0 ? ` · ${remaining} in coda` : ''}`;
}

function uploadFiles(fileList, targetPath) {
  const manager = document.getElementById('upload-manager');
  const body = document.getElementById('upload-manager-body');
  
  // Se stiamo iniziando una nuova ondata di caricamenti, svuotiamo la lista e resettiamo i contatori
  if (!isUploading && uploadQueue.length === 0) {
    body.innerHTML = '';
    uploadBatchTotal = 0;
    uploadBatchCompleted = 0;
  }
  
  // Aggiunge i nuovi file al totale dell'ondata corrente
  uploadBatchTotal += fileList.length;
  
  manager.style.display = 'flex';
  
  for (let i = 0; i < fileList.length; i++) {
    const file = fileList[i];
    // Create UI item
    const itemId = 'upload-' + Date.now() + '-' + i;
    const name = file.webkitRelativePath || file.name;
    
    const itemHtml = `
      <div class="upload-item" id="${itemId}">
        <div class="upload-item-header">
          <span class="upload-item-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
          <span class="upload-item-status" id="${itemId}-status">In coda...</span>
        </div>
        <div class="upload-item-progress-bar">
          <div class="upload-item-progress-bar-fill" id="${itemId}-progress"></div>
        </div>
      </div>
    `;
    body.insertAdjacentHTML('afterbegin', itemHtml);
    
    uploadQueue.push({
      file,
      targetPath,
      itemId,
      name
    });
  }
  
  processUploadQueue();
}

async function processUploadQueue() {
  if (uploadQueue.length === 0) {
    isUploading = false;
    updateUploadTitle(); // "✅ Completati N file su TOTAL"
    return;
  }
  
  if (isUploading) return;
  isUploading = true;
  
  updateUploadTitle(); // "File X di Y · Z in coda"
  
  const currentUpload = uploadQueue.shift();
  const { file, targetPath, itemId, name } = currentUpload;
  
  const statusEl = document.getElementById(`${itemId}-status`);
  const progressEl = document.getElementById(`${itemId}-progress`);
  
  if (statusEl) statusEl.textContent = 'Inizializzazione...';
  
  // Extract relative path if uploading folder
  let uploadPath = targetPath;
  if (file.webkitRelativePath) {
    const parts = file.webkitRelativePath.split('/');
    parts.pop(); // remove filename
    if (parts.length > 0) {
      uploadPath += '/' + parts.join('/');
    }
  }

  if (uploadPath && uploadPath !== '/' && uploadPath.endsWith('/')) {
    uploadPath = uploadPath.slice(0, -1);
  }

  if (!window.tus) {
    if (statusEl) {
      statusEl.textContent = 'Errore libreria TUS non caricata';
      statusEl.style.color = '#ff4444';
    }
    if (progressEl) progressEl.style.background = '#ff4444';
    uploadBatchCompleted++;
    isUploading = false;
    return processUploadQueue();
  }

  // TUS chunk size: 10 MB (più leggero per il Raspberry Pi 3 e i suoi dischi USB lenti)
  const chunkSize = 10 * 1024 * 1024;

  // STEP 1: Assicurati che il token sia valido PRIMA di creare l'upload.
  // ensureValidToken() è async e viene correttamente awaited qui nel contesto di processUploadQueue.
  if (typeof ensureValidToken === 'function') {
    await ensureValidToken();
  }

  // DEBUG: verifica stato token
  const dbgHeaders = typeof getAuthHeaders === 'function' ? getAuthHeaders() : {};
  console.log('[TUS DEBUG] accessToken presente:', !!(typeof accessToken !== 'undefined' && accessToken));
  console.log('[TUS DEBUG] getAuthHeaders:', JSON.stringify(dbgHeaders));

  // STEP 2: Leggi il token fresco - lo passiamo nel metadata TUS
  const currentToken = dbgHeaders.Authorization
    ? dbgHeaders.Authorization.replace('Bearer ', '').trim()
    : '';

  console.log('[TUS DEBUG] currentToken lunghezza:', currentToken.length);

  const options = {
    endpoint: '/api/tus/',
    retryDelays: [0, 3000, 5000, 10000, 20000],
    chunkSize: chunkSize,
    metadata: {
      filename: file.name,
      filetype: file.type || 'application/octet-stream',
      relativePath: uploadPath || '/',
      token: currentToken   // Chiave minuscola per evitare problemi di case-sensitivity nel parsing TUS
    },
    // Funzione di fingerprint custom: ignoriamo il metadata (che contiene il token variabile)
    // In questo modo, lo stesso file avrà sempre lo stesso ID e riprenderà correttamente
    fingerprint: function (file, options) {
      return Promise.resolve([
        'tus-resumable',
        file.name,
        file.type,
        file.size,
        file.lastModified,
        options.endpoint
      ].join('-'));
    },
    onBeforeRequest: function(req) {
      // withCredentials per i cookie di sessione come backup
      const xhr = req.getUnderlyingObject();
      if (xhr && typeof xhr.withCredentials !== 'undefined') {
        xhr.withCredentials = true;
      }
    },
    onError: function(error) {
      console.error('TUS Upload failed:', error);
      if (statusEl) {
        statusEl.textContent = 'Errore Rete (Riprova per riprendere)';
        statusEl.style.color = '#ff4444';
        statusEl.title = error.message || 'Errore di connessione';
      }
      if (progressEl) progressEl.style.background = '#ff4444';
      
      uploadBatchCompleted++;
      isUploading = false;
      processUploadQueue();
    },
    onProgress: function(bytesUploaded, bytesTotal) {
      if (progressEl) {
        const percentComplete = Math.max(1, Math.round((bytesUploaded / bytesTotal) * 100));
        progressEl.style.width = percentComplete + '%';
        if (statusEl) statusEl.textContent = percentComplete + '%';
      }
    },
    onSuccess: function() {
      if (statusEl) {
        statusEl.textContent = 'Completato ✅';
        statusEl.style.color = '#4caf50';
      }
      if (progressEl) {
        progressEl.style.width = '100%';
        progressEl.style.background = '#4caf50';
      }
      
      // Aggiorna UI se siamo nella cartella di destinazione
      if (uploadPath === currentPath || uploadPath.startsWith(currentPath)) {
        loadFiles(currentPath);
      }
      
      uploadBatchCompleted++;
      isUploading = false;
      processUploadQueue();
    }
  };

  const upload = new tus.Upload(file, options);

  // Implementazione del resume automatico in tus-js-client v3+
  upload.findPreviousUploads().then(function (previousUploads) {
    if (previousUploads.length > 0) {
      // Trovato un caricamento precedente per questo file, lo riprendiamo
      upload.resumeFromPreviousUpload(previousUploads[0]);
    }
    upload.start();
  }).catch(function (error) {
    // Se fallisce la ricerca, iniziamo un caricamento da zero
    upload.start();
  });
}

// Bind upload manager buttons
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-toggle-upload-manager').addEventListener('click', () => {
    document.getElementById('upload-manager').classList.toggle('minimized');
  });
  document.getElementById('btn-close-upload-manager').addEventListener('click', () => {
    document.getElementById('upload-manager').style.display = 'none';
  });
});

function downloadItem(path, isDirectory) {
  if (isDirectory) {
    downloadFolder(path);
  } else {
    downloadFile(path);
  }
}

function downloadFile(path) {
  // Can be implemented via creating a temporary link with token, or fetching as blob
  const url = `/api/files/download?path=${encodeURIComponent(path)}&token=${accessToken}`;
  window.location.href = url;
}

function downloadFolder(path) {
  const url = `/api/files/download-zip?path=${encodeURIComponent(path)}&token=${accessToken}`;
  window.location.href = url;
}

let itemToDelete = null;

function confirmDelete(path, name) {
  itemToDelete = path;
  document.getElementById('modal-title').innerText = 'Conferma Eliminazione';
  document.getElementById('modal-body').innerHTML = `Sei sicuro di voler eliminare <b>${name}</b>?`;
  
  const confirmBtn = document.getElementById('btn-confirm-modal');
  confirmBtn.innerText = 'Elimina';
  confirmBtn.className = 'btn-danger';
  confirmBtn.onclick = executeDelete;
  
  document.getElementById('modal-overlay').classList.add('active');
}

async function executeDelete() {
  if (!itemToDelete) return;
  closeModal();
  
  try {
    const res = await apiFetch(`/api/files/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: itemToDelete })
    });
    
    if (res.ok) {
      showToast('Elemento eliminato', 'success');
      loadFiles(currentPath);
    } else {
      showToast('Errore durante l\'eliminazione', 'error');
    }
  } catch (e) {
    showToast('Errore di rete', 'error');
  }
  itemToDelete = null;
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('active');
}

function showCreateFolderModal() {
  document.getElementById('modal-title').innerText = 'Nuova Cartella';
  document.getElementById('modal-body').innerHTML = `
    <input type="text" id="new-folder-name" placeholder="Nome cartella" autocomplete="off" />
  `;
  
  const confirmBtn = document.getElementById('btn-confirm-modal');
  confirmBtn.innerText = 'Crea';
  confirmBtn.className = 'btn-primary';
  confirmBtn.onclick = executeCreateFolder;
  
  document.getElementById('modal-overlay').classList.add('active');
  setTimeout(() => document.getElementById('new-folder-name').focus(), 100);
}

async function executeCreateFolder() {
  const folderName = document.getElementById('new-folder-name').value.trim();
  if (!folderName) return;
  
  closeModal();
  
  try {
    const res = await apiFetch(`/api/files/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: currentPath, name: folderName })
    });
    
    if (res.ok) {
      showToast('Cartella creata', 'success');
      loadFiles(currentPath);
    } else {
      showToast('Errore durante la creazione', 'error');
    }
  } catch (e) {
    showToast('Errore di rete', 'error');
  }
}

function renameItem(path) {
  const newName = prompt('Inserisci il nuovo nome:');
  if (newName) {
    executeRename(path, newName);
  }
}

async function executeRename(oldPath, newName) {
  try {
    const lastSlashIndex = oldPath.lastIndexOf('/');
    const dir = oldPath.substring(0, lastSlashIndex);
    const newPath = dir + '/' + newName;
    
    const res = await apiFetch(`/api/files/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPath, newPath })
    });
    
    if (res.ok) {
      showToast('Rinominato con successo', 'success');
      loadFiles(currentPath);
    } else {
      showToast('Errore durante la rinomina', 'error');
    }
  } catch (e) {
    showToast('Errore di rete', 'error');
  }
}

// ADMIN PANEL LOGIC
async function showAdminModal() {
  document.getElementById('admin-modal').classList.add('active');
  document.getElementById('btn-close-admin-modal').onclick = () => {
    document.getElementById('admin-modal').classList.remove('active');
  };
  
  document.getElementById('btn-create-user').onclick = async () => {
    const nameInput = document.getElementById('new-user-name');
    const passInput = document.getElementById('new-user-pass');
    
    if (!nameInput.value || !passInput.value) {
      return showToast('Compila tutti i campi', 'error');
    }
    
    try {
      const res = await apiFetch('/api/auth/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: nameInput.value, password: passInput.value })
      });
      
      if (res.ok) {
        showToast('Utente creato con successo', 'success');
        nameInput.value = '';
        passInput.value = '';
        loadUsersList();
      } else {
        const err = await res.json();
        showToast(err.error || 'Errore nella creazione', 'error');
      }
    } catch (e) {
      showToast('Errore di rete', 'error');
    }
  };
  
  await loadUsersList();
}

async function loadUsersList() {
  const listEl = document.getElementById('users-list');
  listEl.innerHTML = '<li>Caricamento...</li>';
  
  try {
    const res = await apiFetch('/api/auth/users');
    if (res.ok) {
      const users = await res.json();
      listEl.innerHTML = '';
      users.forEach(u => {
        const li = document.createElement('li');
        li.style.padding = '8px';
        li.style.borderBottom = '1px solid #444';
        li.innerHTML = `
          <strong>${u.username}</strong> 
          <span style="color: #aaa; font-size: 0.9em;">(${u.role})</span>
          ${u.hasAuthenticator ? '🔒' : ''}
        `;
        listEl.appendChild(li);
      });
    } else {
      listEl.innerHTML = '<li>Errore nel caricamento utenti</li>';
    }
  } catch (e) {
    listEl.innerHTML = '<li>Errore di rete</li>';
  }
}

// CHANGE PASSWORD MODAL LOGIC
function showChangePasswordModal() {
  const modal = document.getElementById('password-modal');
  const oldPassInput = document.getElementById('old-password-input');
  const newPassInput = document.getElementById('new-password-input');
  
  oldPassInput.value = '';
  newPassInput.value = '';
  modal.classList.add('active');

  document.getElementById('btn-cancel-password-modal').onclick = () => {
    modal.classList.remove('active');
  };

  document.getElementById('btn-save-password').onclick = async () => {
    const oldPassword = oldPassInput.value;
    const newPassword = newPassInput.value;

    if (!oldPassword || !newPassword) {
      return showToast('Inserisci sia la password attuale che quella nuova', 'error');
    }

    try {
      const res = await apiFetch('/api/auth/password', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword, newPassword })
      });

      const data = await res.json();

      if (res.ok) {
        showToast('Password modificata! Effettua nuovamente il login.', 'success');
        modal.classList.remove('active');
        setTimeout(() => {
          logout();
        }, 1500);
      } else {
        showToast(data.error || 'Impossibile modificare la password', 'error');
      }
    } catch (e) {
      showToast('Errore durante il cambio password', 'error');
    }
  };
}
