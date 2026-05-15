(function() {
  let plants = [];

  document.addEventListener('DOMContentLoaded', boot);

  function boot() {
    injectIcons();

    if (!window.APP_CONFIG || !window.APP_CONFIG.API_URL ||
        window.APP_CONFIG.API_URL.indexOf('XXXXX') !== -1) {
      alert('config.js のセットアップが未完了です');
      return;
    }

    document.getElementById('loginForm').addEventListener('submit', onLoginSubmit);

    if (API.adminPassword) {
      tryLogin(API.adminPassword, true);
    } else {
      showLoginScreen();
    }
  }

  function injectIcons() {
    const loginMark = document.getElementById('loginBrandMark');
    if (loginMark) loginMark.innerHTML = ICONS.settings;
    const mark = document.getElementById('brandMark');
    if (mark) mark.innerHTML = ICONS.settings;
    const backLink = document.getElementById('backLink');
    if (backLink) backLink.innerHTML = ICONS.arrowLeft + ' 検索画面へ戻る';
    const searchLink = document.getElementById('searchLink');
    if (searchLink) searchLink.innerHTML = ICONS.search + '<span>検索画面</span>';
    document.querySelectorAll('[data-icon]').forEach(el => {
      const name = el.dataset.icon;
      if (ICONS[name]) el.insertAdjacentHTML('afterbegin', ICONS[name]);
    });
  }

  function showLoginScreen() {
    document.getElementById('loginScreen').style.display = '';
    document.getElementById('mainScreen').style.display = 'none';
    setTimeout(() => {
      const el = document.getElementById('loginPassword');
      if (el) el.focus();
    }, 50);
  }

  function showMainScreen() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = '';
    initMainUI();
  }

  function onLoginSubmit(e) {
    e.preventDefault();
    const pw = document.getElementById('loginPassword').value;
    if (!pw) return;
    tryLogin(pw, false);
  }

  async function tryLogin(pw, silent) {
    const btn = document.getElementById('loginBtn');
    const errEl = document.getElementById('loginError');
    if (btn) { btn.disabled = true; btn.textContent = '確認中...'; }
    if (errEl) errEl.textContent = '';

    try {
      API.setAdminPassword(pw);
      await API.callAdmin('verifyAdmin');
      showMainScreen();
    } catch (err) {
      API.clearAdminPassword();
      if (!silent && errEl) errEl.textContent = err.message || 'ログイン失敗';
      showLoginScreen();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'ログイン'; }
    }
  }

  function logout() {
    API.clearAdminPassword();
    plants = [];
    document.getElementById('loginPassword').value = '';
    showLoginScreen();
  }

  function initMainUI() {
    if (initMainUI._done) {
      reload();
      loadCacheStats();
      return;
    }
    initMainUI._done = true;

    document.getElementById('logoutBtn').addEventListener('click', logout);
    document.getElementById('addBtn').addEventListener('click', openAddModal);
    document.getElementById('reloadBtn').addEventListener('click', () => {
      reload();
      loadCacheStats();
    });
    document.getElementById('filter').addEventListener('input', render);
    document.getElementById('clearCacheBtn').addEventListener('click', clearCache);
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.getElementById('saveBtn').addEventListener('click', save);

    reload();
    loadCacheStats();
  }

  async function reload() {
    document.getElementById('tableArea').innerHTML = '<div class="empty">読み込み中...</div>';
    try {
      const data = await API.call('list');
      plants = data.plants || [];
      render();
    } catch (err) {
      showStatus('読込失敗: ' + err.message, true);
    }
  }

  async function loadCacheStats() {
    try {
      const s = await API.callAdmin('getCacheStats');
      updateMeter(s.usageToday, s.dailyLimit);
      document.getElementById('statCache').textContent = s.cacheEntries;
      document.getElementById('cacheTtlLabel').textContent = s.cacheTtlDays + '日間有効';
    } catch (err) {
      console.warn('stats failed:', err);
      if (err.code === 401) showLoginScreen();
    }
  }

  function updateMeter(used, limit) {
    const numEl = document.getElementById('meterNum');
    const maxEl = document.getElementById('meterMax');
    const remainEl = document.getElementById('meterRemain');
    const fillEl = document.getElementById('meterFill');
    if (!numEl || !fillEl) return;

    const SOFT_LIMIT = 500;
    const pct = Math.min(100, Math.round((used / SOFT_LIMIT) * 100));

    numEl.textContent = used;
    maxEl.textContent = '回';
    remainEl.textContent = '目安: ' + SOFT_LIMIT + '回/日';
    fillEl.style.width = pct + '%';

    let level = '';
    if (used >= SOFT_LIMIT) level = 'danger';
    else if (used >= SOFT_LIMIT * 0.6) level = 'warn';

    numEl.className = 'meter-num' + (level === 'danger' ? ' danger' : '');
    remainEl.className = 'meter-remain' + (level ? ' ' + level : '');
    fillEl.className = 'meter-bar-fill' + (level ? ' ' + level : '');
  }

  function render() {
    const q = document.getElementById('filter').value.trim().toLowerCase();
    let list = plants;
    if (q) {
      list = plants.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.address || '').toLowerCase().includes(q)
      );
    }
    if (list.length === 0) {
      document.getElementById('tableArea').innerHTML = '<div class="empty">該当なし</div>';
      return;
    }
    let html = '<table class="admin-table"><thead><tr>';
    html += '<th>会社名</th><th>住所</th><th>電話</th><th>FAX</th><th>備考</th><th style="width:130px"></th>';
    html += '</tr></thead><tbody>';
    list.forEach(p => {
      html += '<tr>';
      html += '<td style="font-weight:500;color:var(--ink)">' + esc(p.name) + '</td>';
      html += '<td>' + esc(p.address) + '</td>';
      html += '<td>' + esc(p.phone) + '</td>';
      html += '<td>' + esc(p.fax) + '</td>';
      html += '<td>' + esc(p.note) + '</td>';
      html += '<td><div style="display:flex;gap:4px;justify-content:flex-end">';
      html += '<button class="btn-icon" data-edit="' + p.id + '">' + ICONS.edit + '編集</button>';
      html += '<button class="btn-icon danger" data-del="' + p.id + '">' + ICONS.trash + '</button>';
      html += '</div></td></tr>';
    });
    html += '</tbody></table>';
    const area = document.getElementById('tableArea');
    area.innerHTML = html;
    area.querySelectorAll('button[data-edit]').forEach(b => {
      b.addEventListener('click', () => openEditModal(parseInt(b.dataset.edit, 10)));
    });
    area.querySelectorAll('button[data-del]').forEach(b => {
      b.addEventListener('click', () => del(parseInt(b.dataset.del, 10)));
    });
  }

  function openAddModal() {
    document.getElementById('modalTitle').textContent = 'プラント追加';
    document.getElementById('f_id').value = '';
    ['f_name', 'f_address', 'f_phone', 'f_fax', 'f_note'].forEach(id => {
      document.getElementById(id).value = '';
    });
    document.getElementById('modal').classList.add('show');
    setTimeout(() => document.getElementById('f_name').focus(), 50);
  }

  function openEditModal(id) {
    const p = plants.find(x => x.id === id);
    if (!p) return;
    document.getElementById('modalTitle').textContent = 'プラント編集';
    document.getElementById('f_id').value = p.id;
    document.getElementById('f_name').value = p.name || '';
    document.getElementById('f_address').value = p.address || '';
    document.getElementById('f_phone').value = p.phone || '';
    document.getElementById('f_fax').value = p.fax || '';
    document.getElementById('f_note').value = p.note || '';
    document.getElementById('modal').classList.add('show');
  }

  function closeModal() {
    document.getElementById('modal').classList.remove('show');
  }

  async function save() {
    const data = {
      id: parseInt(document.getElementById('f_id').value, 10) || null,
      name: document.getElementById('f_name').value.trim(),
      address: document.getElementById('f_address').value.trim(),
      phone: document.getElementById('f_phone').value.trim(),
      fax: document.getElementById('f_fax').value.trim(),
      note: document.getElementById('f_note').value.trim()
    };
    if (!data.name) { alert('会社名は必須です'); return; }
    if (!data.address) { alert('住所は必須です'); return; }

    const btn = document.getElementById('saveBtn');
    btn.disabled = true; btn.textContent = '保存中...';

    try {
      if (data.id) {
        await API.callAdmin('updatePlant', { plant: data });
        showStatus('更新しました', false);
      } else {
        await API.callAdmin('addPlant', { plant: data });
        showStatus('追加しました', false);
      }
      closeModal();
      reload();
    } catch (err) {
      showStatus('保存失敗: ' + err.message, true);
      if (err.code === 401) showLoginScreen();
    } finally {
      btn.disabled = false; btn.textContent = '保存';
    }
  }

  async function del(id) {
    const p = plants.find(x => x.id === id);
    if (!p) return;
    if (!confirm('「' + p.name + '」を削除します。よろしいですか?')) return;
    try {
      await API.callAdmin('deletePlant', { id: id });
      showStatus('削除しました', false);
      reload();
    } catch (err) {
      showStatus('削除失敗: ' + err.message, true);
      if (err.code === 401) showLoginScreen();
    }
  }

  async function clearCache() {
    if (!confirm('距離キャッシュをすべて削除します。\n'
      + 'プラント住所を変更した場合のみ実行してください。\n'
      + '実行しますか?')) return;
    try {
      const r = await API.callAdmin('clearCache');
      showStatus('キャッシュをクリアしました(' + r.deletedKeys + ' 件削除)', false);
      loadCacheStats();
    } catch (err) {
      showStatus('クリア失敗: ' + err.message, true);
      if (err.code === 401) showLoginScreen();
    }
  }

  function showStatus(msg, isError) {
    const el = document.getElementById('status');
    el.innerHTML = (isError ? ICONS.alert : ICONS.check) + '<span>' + esc(msg) + '</span>';
    el.className = 'status-msg show ' + (isError ? 'error' : 'success');
    setTimeout(() => { el.classList.remove('show'); }, 3000);
  }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }
})();
