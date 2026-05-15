/**
 * GAS API 呼び出し共通モジュール
 *
 * グローバル `API` オブジェクトとして公開:
 * - API.call(action, params)   - 検索系API(認証不要)
 * - API.callAdmin(action, params) - 編集系API(adminPasswordを自動付与)
 * - API.adminPassword           - sessionStorageに保存された管理者パスワード(getter)
 * - API.setAdminPassword(pw)    - パスワードを保存
 * - API.clearAdminPassword()    - パスワードを削除
 */
(function() {
  const CFG = window.APP_CONFIG;
  const SS = sessionStorage;
  const PW_KEY = 'plant_admin_pw';

  function checkConfig() {
    if (!CFG || !CFG.API_URL || CFG.API_URL.indexOf('XXXXX') !== -1) {
      throw new Error('config.js の API_URL が未設定です');
    }
  }

  async function call(action, params) {
    checkConfig();
    const body = Object.assign({ action: action }, params || {});

    const res = await fetch(CFG.API_URL, {
      method: 'POST',
      mode: 'cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow'
    });
    if (!res.ok) throw new Error('通信エラー: ' + res.status);
    const data = await res.json();
    if (!data.ok) {
      const err = new Error(data.error || 'APIエラー');
      err.code = data.code;
      throw err;
    }
    return data;
  }

  async function callAdmin(action, params) {
    const pw = SS.getItem(PW_KEY);
    if (!pw) {
      const err = new Error('未ログイン');
      err.code = 401;
      throw err;
    }
    try {
      return await call(action, Object.assign({ adminPassword: pw }, params || {}));
    } catch (err) {
      // 認証エラーならパスワードを削除
      if (err.code === 401) SS.removeItem(PW_KEY);
      throw err;
    }
  }

  window.API = {
    call: call,
    callAdmin: callAdmin,
    get adminPassword() { return SS.getItem(PW_KEY); },
    setAdminPassword: function(pw) { SS.setItem(PW_KEY, pw); },
    clearAdminPassword: function() { SS.removeItem(PW_KEY); }
  };
})();
