/**
 * プラント検索 - フロントエンド
 *
 * パスワード認証 → GAS APIに password を付けてリクエスト。
 * パスワードは sessionStorage に保存(ブラウザを閉じるまで記憶)。
 */

(function() {
  const CFG = window.APP_CONFIG;
  const SS = sessionStorage;
  const PASSWORD_KEY = 'plant_search_pw';
  const CACHE_KEY = 'plants_cache';

  let allPlants = [];
  let currentResults = [];

  // ============================================================
  // 起動
  // ============================================================

  document.addEventListener('DOMContentLoaded', boot);

  function boot() {
    // 設定チェック
    if (!CFG || !CFG.API_URL || CFG.API_URL.indexOf('XXXXX') !== -1) {
      showSetupError();
      return;
    }

    // ログインフォームのイベント登録
    document.getElementById('loginForm').addEventListener('submit', onLoginSubmit);

    // 保存されたパスワードがあればそれで自動ログイン試行
    const saved = SS.getItem(PASSWORD_KEY);
    if (saved) {
      tryLogin(saved, true);  // silent=true: 失敗してもエラー表示せずログイン画面を出す
    } else {
      showLoginScreen();
    }
  }

  function showSetupError() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainScreen').style.display = '';
    document.getElementById('results').innerHTML =
      '<div class="empty" style="color:#d93025">' +
      '⚠️ config.js のセットアップが未完了です。<br>' +
      'API_URL を設定してください。' +
      '</div>';
  }

  // ============================================================
  // ログイン処理
  // ============================================================

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

  /**
   * 入力されたパスワードでAPIにping的なリクエストを投げて検証
   * @param {string} pw
   * @param {boolean} silent - true: エラー時もログイン画面を黙って出すだけ
   */
  async function tryLogin(pw, silent) {
    const btn = document.getElementById('loginBtn');
    const errEl = document.getElementById('loginError');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '確認中...';
    }
    if (errEl) errEl.textContent = '';

    try {
      // usage アクションを認証チェック用に使う(軽量)
      await callApi('usage', {}, pw);
      // 成功 → 保存してメイン画面へ
      SS.setItem(PASSWORD_KEY, pw);
      showMainScreen();
    } catch (err) {
      SS.removeItem(PASSWORD_KEY);
      if (!silent) {
        if (errEl) errEl.textContent = err.message || 'ログイン失敗';
      }
      showLoginScreen();
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'ログイン';
      }
    }
  }

  function logout() {
    SS.removeItem(PASSWORD_KEY);
    SS.removeItem(CACHE_KEY);
    allPlants = [];
    currentResults = [];
    document.getElementById('loginPassword').value = '';
    showLoginScreen();
  }

  // ============================================================
  // API呼び出し
  // ============================================================

  /**
   * GAS APIを呼ぶ
   * 注意: text/plainでPOSTすることでCORSプリフライトを回避する
   */
  async function callApi(action, extraParams, passwordOverride) {
    const pw = passwordOverride !== undefined ? passwordOverride : SS.getItem(PASSWORD_KEY);
    if (!pw) {
      showLoginScreen();
      throw new Error('未ログイン');
    }

    const body = Object.assign(
      { password: pw, action: action },
      extraParams || {}
    );

    const res = await fetch(CFG.API_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    });

    if (!res.ok) throw new Error('通信エラー: ' + res.status);
    const data = await res.json();

    // 認証エラー → ログイン画面に戻す
    if (!data.ok && data.code === 401) {
      SS.removeItem(PASSWORD_KEY);
      throw new Error(data.error || 'パスワードが違います');
    }
    if (!data.ok) throw new Error(data.error || 'APIエラー');
    return data;
  }

  // ============================================================
  // メイン画面の初期化
  // ============================================================

  function initMainUI() {
    // 多重初期化を防ぐ
    if (initMainUI._done) {
      // 既に初期化済み → キャッシュからの一覧再読込だけ
      loadPlants();
      return;
    }
    initMainUI._done = true;

    // 管理画面リンク
    if (CFG.ADMIN_URL) {
      const link = document.getElementById('adminLink');
      link.href = CFG.ADMIN_URL;
      link.classList.add('show');
    }

    // タブ切替
    document.getElementById('tabDistance').addEventListener('click', () => switchMode('distance'));
    document.getElementById('tabFilter').addEventListener('click', () => switchMode('filter'));

    // 検索ボタン
    document.getElementById('searchBtn').addEventListener('click', searchDistance);
    document.getElementById('origin').addEventListener('keydown', e => {
      if (e.key === 'Enter') searchDistance();
    });

    // フィルタ
    document.getElementById('filterText').addEventListener('input', applyFilter);

    // ログアウト
    document.getElementById('logoutBtn').addEventListener('click', logout);

    // 一覧を先読み
    loadPlants();
  }

  async function loadPlants() {
    const cached = SS.getItem(CACHE_KEY);
    if (cached) {
      try {
        allPlants = JSON.parse(cached);
        return;
      } catch (e) { /* fall through */ }
    }
    try {
      const data = await callApi('list');
      allPlants = data.plants || [];
      SS.setItem(CACHE_KEY, JSON.stringify(allPlants));
    } catch (err) {
      console.error('プラント一覧の取得失敗:', err);
    }
  }

  // ============================================================
  // モード切替
  // ============================================================

  function switchMode(mode) {
    document.getElementById('tabDistance').classList.toggle('active', mode === 'distance');
    document.getElementById('tabFilter').classList.toggle('active', mode === 'filter');
    document.getElementById('modeDistance').style.display = (mode === 'distance') ? '' : 'none';
    document.getElementById('modeFilter').style.display = (mode === 'filter') ? '' : 'none';

    if (mode === 'filter') {
      applyFilter();
    } else if (currentResults.length > 0) {
      renderResults(currentResults, true);
    }
  }

  // ============================================================
  // 近い順検索
  // ============================================================

  async function searchDistance() {
    const origin = document.getElementById('origin').value.trim();
    if (!origin) {
      setStatus('statusDist', '現場住所を入力してください', true);
      return;
    }

    const btn = document.getElementById('searchBtn');
    btn.disabled = true;
    btn.textContent = '計算中...';

    document.getElementById('results').innerHTML =
      '<div class="loading">⏳ 各プラントへの距離を計算中...<br>' +
      '<small>15〜60秒ほどかかります</small></div>';

    try {
      const data = await callApi('search', { origin: origin });
      currentResults = data.results || [];
      setStatus('statusDist',
        '本日の検索: ' + data.usageToday + ' / ' + data.dailyLimit + ' 回', false);
      renderResults(currentResults, true);
    } catch (err) {
      setStatus('statusDist', '❌ ' + err.message, true);
      document.getElementById('results').innerHTML = '<div class="empty">検索失敗</div>';
      // パスワードエラーならログイン画面に戻る
      if (!SS.getItem(PASSWORD_KEY)) showLoginScreen();
    } finally {
      btn.disabled = false;
      btn.textContent = '距離計算';
    }
  }

  // ============================================================
  // フィルタ検索
  // ============================================================

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

  // ============================================================
  // 描画
  // ============================================================

  function setStatus(id, msg, isError) {
    const el = document.getElementById(id);
    el.textContent = msg;
    el.className = 'status' + (isError ? ' error' : '');
  }

  function renderResults(list, showDistance) {
    const container = document.getElementById('results');
    if (!list || list.length === 0) {
      container.innerHTML = '<div class="empty">該当なし</div>';
      return;
    }

    let html = '<table><thead><tr>';
    if (showDistance) html += '<th style="width:80px">距離</th>';
    html += '<th>会社名</th><th>住所</th><th>電話</th><th>FAX</th>';
    html += '</tr></thead><tbody>';

    list.forEach(p => {
      html += '<tr>';
      if (showDistance) {
        if (p.distance !== null && p.distance !== undefined) {
          html += '<td class="dist">' + p.distance + ' km</td>';
        } else {
          html += '<td class="dist-error">' + (p.error || '-') + '</td>';
        }
      }
      html += '<td>' + esc(p.name) + '</td>';
      html += '<td>' + esc(p.address) + '</td>';
      html += '<td>' + esc(p.phone) + copyBtn(p.phone) + '</td>';
      html += '<td>' + esc(p.fax) + copyBtn(p.fax) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll('button.copy').forEach(btn => {
      btn.addEventListener('click', () => copyText(btn, btn.dataset.text));
    });
  }

  function copyBtn(text) {
    if (!text) return '';
    return ' <button class="copy" data-text="' + esc(text) + '">コピー</button>';
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
    try { document.execCommand('copy'); flashCopy(btn); } catch(e) {}
    document.body.removeChild(ta);
  }

  function flashCopy(btn) {
    const orig = btn.textContent;
    btn.textContent = '✓';
    btn.classList.add('ok');
    setTimeout(() => { btn.textContent = orig; btn.classList.remove('ok'); }, 1200);
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
