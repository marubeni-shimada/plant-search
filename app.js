(function() {
  const SS = sessionStorage;
  const CACHE_KEY = 'plants_cache';

  let allPlants = [];
  let currentResults = [];

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    injectIcons();

    if (!window.APP_CONFIG || !window.APP_CONFIG.API_URL ||
        window.APP_CONFIG.API_URL.indexOf('XXXXX') !== -1) {
      showSetupError();
      return;
    }

    document.getElementById('tabDistance').addEventListener('click', () => switchMode('distance'));
    document.getElementById('tabFilter').addEventListener('click', () => switchMode('filter'));
    document.getElementById('searchBtn').addEventListener('click', searchDistance);
    document.getElementById('origin').addEventListener('keydown', e => {
      if (e.key === 'Enter') searchDistance();
    });
    document.getElementById('filterText').addEventListener('input', applyFilter);

    loadPlants();
  }

  function injectIcons() {
    document.getElementById('brandMark').innerHTML = ICONS.factory;
    document.getElementById('adminLink').innerHTML = ICONS.settings + '<span>管理画面</span>';

    document.querySelectorAll('[data-icon]').forEach(el => {
      const name = el.dataset.icon;
      if (ICONS[name]) el.insertAdjacentHTML('afterbegin', ICONS[name]);
    });
  }

  function showSetupError() {
    document.getElementById('results').innerHTML =
      '<div class="results-empty" style="color:var(--danger)">' + ICONS.alert +
      '<div style="margin-top:8px">config.js のセットアップが未完了です</div>' +
      '<div style="font-size:11px;margin-top:4px">API_URL を設定してください</div></div>';
  }

  async function loadPlants() {
    const cached = SS.getItem(CACHE_KEY);
    if (cached) {
      try {
        allPlants = JSON.parse(cached);
        return;
      } catch (e) {}
    }
    try {
      const data = await API.call('list');
      allPlants = data.plants || [];
      SS.setItem(CACHE_KEY, JSON.stringify(allPlants));
    } catch (err) {
      console.error('一覧取得失敗:', err);
    }
  }

  function switchMode(mode) {
    document.getElementById('tabDistance').classList.toggle('active', mode === 'distance');
    document.getElementById('tabFilter').classList.toggle('active', mode === 'filter');
    document.getElementById('modeDistance').style.display = (mode === 'distance') ? '' : 'none';
    document.getElementById('modeFilter').style.display = (mode === 'filter') ? '' : 'none';

    if (mode === 'filter') {
      applyFilter();
    } else if (currentResults.length > 0) {
      renderResults(currentResults, true);
    } else {
      document.getElementById('results').innerHTML =
        '<div class="results-empty">上で現場住所を入力してください</div>';
    }
  }

  async function searchDistance() {
    const origin = document.getElementById('origin').value.trim();
    if (!origin) {
      setStatus('statusDist', '現場住所を入力してください', true);
      return;
    }

    const btn = document.getElementById('searchBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>計算中...';

    document.getElementById('results').innerHTML =
      '<div class="results-loading"><span class="spinner"></span>距離計算中<small>初回は15〜60秒ほど(キャッシュがあれば一瞬)</small></div>';

    try {
      const data = await API.call('search', { origin: origin });
      currentResults = data.results || [];
      const cacheCount = data.cacheHitsThisSearch || 0;
      const apiCount = data.apiCallsThisSearch || 0;
      let info = 'API使用 ' + data.usageToday + '/' + data.dailyLimit;
      if (cacheCount > 0) info += ' · キャッシュ ' + cacheCount + '件';
      if (apiCount > 0) info += ' · 新規 ' + apiCount + '件';
      setStatus('statusDist', info, false);
      renderResults(currentResults, true);
    } catch (err) {
      setStatus('statusDist', err.message, true);
      document.getElementById('results').innerHTML =
        '<div class="results-empty" style="color:var(--danger)">検索失敗</div>';
    } finally {
      btn.disabled = false;
      btn.innerHTML = ICONS.search + '距離計算';
    }
  }

  function applyFilter() {
    const q = document.getElementById('filterText').value.trim().toLowerCase();
    let filtered = allPlants;
    if (q) {
      filtered = allPlants.filter(p =>
        (p.name || '').toLowerCase().includes(q) ||
        (p.address || '').toLowerCase().includes(q)
      );
    }
    setStatus('statusFilter', filtered.length + ' 件ヒット', false);
    renderResults(filtered, false);
  }

  function setStatus(id, msg, isError) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.className = 'status' + (isError ? ' error' : '');
  }

  function renderResults(list, showDistance) {
    const container = document.getElementById('results');
    if (!list || list.length === 0) {
      container.innerHTML = '<div class="results-empty">該当なし</div>';
      return;
    }

    let html = '<div class="result-list">';
    list.forEach((p, i) => {
      html += '<div class="result-row">';

      if (showDistance) {
        if (p.distance !== null && p.distance !== undefined) {
          const cls = p.fromCache ? 'dist-pill cached' : 'dist-pill';
          html += '<div class="' + cls + '">' + p.distance + ' km</div>';
        } else {
          html += '<div class="dist-pill error">' + esc(p.error || '-') + '</div>';
        }
      } else {
        const num = String(i + 1).padStart(2, '0');
        html += '<div class="dist-pill" style="background:var(--surface-2);color:var(--muted);font-weight:400;">' + num + '</div>';
      }

      html += '<div class="result-main">';
      html += '<div class="result-name">' + esc(p.name) + '</div>';
      html += '<div class="result-addr">' + esc(p.address) + '</div>';
      html += '</div>';

      html += '<div class="result-contacts">';
      if (p.phone) {
        html += '<button class="contact-chip" data-text="' + esc(p.phone) + '" title="クリックでコピー">' +
          ICONS.phone + '<span class="label-text">TEL</span>' + esc(p.phone) + '</button>';
      }
      if (p.fax) {
        html += '<button class="contact-chip" data-text="' + esc(p.fax) + '" title="クリックでコピー">' +
          ICONS.fax + '<span class="label-text">FAX</span>' + esc(p.fax) + '</button>';
      }
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
    container.innerHTML = html;

    container.querySelectorAll('button.contact-chip').forEach(btn => {
      btn.addEventListener('click', () => copyText(btn, btn.dataset.text));
    });
  }

  function copyText(btn, text) {
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text)
        .then(() => flashCopy(btn))
        .catch(() => fallbackCopy(text, btn));
    } else {
      fallbackCopy(text, btn);
    }
  }

  function fallbackCopy(text, btn) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); flashCopy(btn); } catch (e) {}
    document.body.removeChild(ta);
  }

  function flashCopy(btn) {
    const orig = btn.innerHTML;
    btn.innerHTML = ICONS.check + '<span class="label-text">COPIED</span>';
    btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 1200);
  }

  function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
})();
