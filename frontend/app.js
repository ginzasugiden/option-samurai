/**
 * オプション項目修正侍 - フロントエンドロジック
 *
 * GitHub Pages から GAS Web App を fetch() で呼び出すSPA。
 *
 * 設計:
 * - google.script.run は使えないため fetch を使う
 * - GAS Web Appは独自CORSヘッダー設定不可なので、
 *   Content-Type: text/plain でJSONを送る(preflight回避の定番テクニック)
 */

(function () {
  'use strict';

  // ============================================================
  // 状態管理
  // ============================================================
  const STATE = {
    token: null,
    user: null,
    currentHits: [],
  };

  const CONFIG = window.SAMURAI_CONFIG || {};

  // ============================================================
  // GAS API クライアント
  // ============================================================

  /**
   * GAS Web App にリクエスト送信
   * @param {string} action - GAS側のアクション名(login, searchなど)
   * @param {Object} payload - 追加データ
   * @returns {Promise<Object>}
   */
  async function callGas(action, payload = {}) {
    if (!CONFIG.GAS_URL || CONFIG.GAS_URL.includes('PASTE_YOUR_DEPLOYMENT_ID')) {
      throw new Error('config.js の GAS_URL が未設定です');
    }

    const body = JSON.stringify({
      action: action,
      token: STATE.token,
      payload: payload,
    });

    // Content-Type を text/plain にすることでCORS preflight (OPTIONS) を回避
    // GAS Web App は OPTIONS リクエストに応答できないため、これが定石
    const res = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: body,
      redirect: 'follow',
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    return data;
  }

  // ============================================================
  // 画面切り替え
  // ============================================================
  function showLogin() {
    document.getElementById('loginView').style.display = '';
    document.getElementById('mainView').style.display = 'none';
  }

  function showMain() {
    document.getElementById('loginView').style.display = 'none';
    document.getElementById('mainView').style.display = '';
    const label = document.getElementById('userLabel');
    label.textContent = `${STATE.user.sname || STATE.user.id} (${STATE.user.id})`;
  }

  // ============================================================
  // 初期化: セッション復元
  // ============================================================
  function init() {
    const savedToken = sessionStorage.getItem('samurai_token');
    if (savedToken) {
      STATE.token = savedToken;
      callGas('checkSession')
        .then(res => {
          if (res.ok) {
            STATE.user = res.user;
            showMain();
          } else {
            sessionStorage.removeItem('samurai_token');
            STATE.token = null;
            showLogin();
          }
        })
        .catch(() => {
          sessionStorage.removeItem('samurai_token');
          STATE.token = null;
          showLogin();
        });
    } else {
      showLogin();
    }

    // イベントバインド
    document.getElementById('loginBtn').addEventListener('click', doLogin);
    document.getElementById('loginPw').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') doLogin();
    });
    document.getElementById('logoutBtn').addEventListener('click', doLogout);
    document.getElementById('searchBtn').addEventListener('click', doSearch);
    document.getElementById('selectAllBtn').addEventListener('click', () => toggleAllChecks(true));
    document.getElementById('deselectAllBtn').addEventListener('click', () => toggleAllChecks(false));
    document.getElementById('updateBtn').addEventListener('click', doUpdate);
  }

  // ============================================================
  // ログイン
  // ============================================================
  async function doLogin() {
    const id = document.getElementById('loginId').value.trim();
    const pw = document.getElementById('loginPw').value;
    const btn = document.getElementById('loginBtn');
    const status = document.getElementById('loginStatus');

    if (!id || !pw) {
      showStatus(status, 'error', 'IDとパスワードを入力してください');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'ログイン中…';
    showStatus(status, 'info', '認証中…');

    try {
      const res = await callGas('login', { id, pw });
      if (res.ok) {
        STATE.token = res.token;
        STATE.user = res.user;
        sessionStorage.setItem('samurai_token', res.token);
        showMain();
      } else {
        showStatus(status, 'error', res.error || 'ログイン失敗');
      }
    } catch (err) {
      showStatus(status, 'error', '通信エラー: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'ログイン';
    }
  }

  async function doLogout() {
    try {
      await callGas('logout');
    } catch (err) {
      // ログアウト失敗してもクライアント側はクリア
    }
    sessionStorage.removeItem('samurai_token');
    STATE.token = null;
    STATE.user = null;
    showLogin();
    document.getElementById('loginId').value = '';
    document.getElementById('loginPw').value = '';
  }

  // ============================================================
  // 検索
  // ============================================================
  async function doSearch() {
    const keyword = document.getElementById('keyword').value.trim();
    const btn = document.getElementById('searchBtn');
    const status = document.getElementById('searchStatus');

    if (!keyword) {
      showStatus(status, 'error', 'キーワードを入力してください');
      return;
    }

    btn.disabled = true;
    btn.textContent = '検索中…';
    showStatus(status, 'info', '全商品をスキャン中です。商品数によっては数分かかります…');
    document.getElementById('resultPanel').style.display = 'none';

    try {
      const res = await callGas('findItemsWithOption', { keyword });
      if (res.ok) {
        STATE.currentHits = res.hits;
        const msg = `スキャン: ${res.totalScanned}件 / ヒット: ${res.hits.length}件` +
                    (res.warning ? `\n${res.warning}` : '');
        showStatus(status, 'ok', msg);
        renderResults();
      } else {
        showStatus(status, 'error', res.error || '検索失敗');
      }
    } catch (err) {
      showStatus(status, 'error', '通信エラー: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '全商品検索';
    }
  }

  function renderResults() {
    const panel = document.getElementById('resultPanel');
    const count = document.getElementById('resultCount');
    const tableDiv = document.getElementById('resultTable');

    count.textContent = `(${STATE.currentHits.length}件)`;

    if (STATE.currentHits.length === 0) {
      tableDiv.innerHTML = '<p class="small muted">該当する商品はありませんでした</p>';
      panel.style.display = '';
      return;
    }

    const accountId = STATE.user.id;
    let html = '<table><thead><tr>';
    html += '<th style="width:200px;">商品管理番号</th>';
    html += '<th>商品名</th>';
    html += '<th style="width:50%;">該当オプション(チェック=削除対象)</th>';
    html += '</tr></thead><tbody>';

    STATE.currentHits.forEach((hit, hitIdx) => {
      const itemPageUrl = `https://item.rakuten.co.jp/${encodeURIComponent(accountId)}/${encodeURIComponent(hit.manageNumber)}/`;
      const rmsEditUrl = `https://rms.rakuten.co.jp/rms/mall/rsm/item/iteminfo/list?item_number_search=${encodeURIComponent(hit.manageNumber)}`;
      html += `<tr>
        <td>
          <code>${escapeHtml(hit.manageNumber)}</code><br>
          <a href="${itemPageUrl}" target="_blank" rel="noopener" class="small">商品ページ↗</a>
          &nbsp;
          <a href="${rmsEditUrl}" target="_blank" rel="noopener" class="small">RMS編集↗</a>
        </td>
        <td>${escapeHtml(hit.title)}</td>
        <td>${renderOptions(hit, hitIdx)}</td>
      </tr>`;
    });
    html += '</tbody></table>';
    tableDiv.innerHTML = html;
    panel.style.display = '';
  }

  function renderOptions(hit, hitIdx) {
    let html = '';
    hit.matchedOptions.forEach((opt, optIdx) => {
      html += '<div class="opt-block">';
      // 項目名自体を削除するチェック
      if (opt.matchInName) {
        html += `<label>
          <input type="checkbox" class="rm-check"
            data-hit="${hitIdx}" data-opt="${optIdx}" data-kind="option">
          <span class="opt-name">${escapeHtml(opt.name)}</span>
          <span class="small muted">(項目全体を削除)</span>
        </label>`;
      } else {
        html += `<div class="opt-name">${escapeHtml(opt.name)}</div>`;
      }

      // 選択肢一覧
      if (opt.allSelections && opt.allSelections.length > 0) {
        html += '<div style="margin-top:4px; margin-left:16px;">';
        opt.allSelections.forEach((sel, selIdx) => {
          const selName = sel.name || sel.displayName || sel.value || '';
          const isMatched = opt.matchedSelections.some(ms =>
            (ms.name || ms.displayName || ms.value) === selName
          );
          if (isMatched) {
            html += `<label class="sel-item matched" style="display:block;">
              <input type="checkbox" class="rm-check"
                data-hit="${hitIdx}" data-opt="${optIdx}" data-sel="${selIdx}" data-kind="selection">
              ${escapeHtml(selName)}
            </label>`;
          } else {
            html += `<div class="sel-item">・${escapeHtml(selName)}</div>`;
          }
        });
        html += '</div>';
      }
      html += '</div>';
    });
    return html;
  }

  function toggleAllChecks(checked) {
    document.querySelectorAll('.rm-check').forEach(cb => { cb.checked = checked; });
  }

  // ============================================================
  // 更新
  // ============================================================
  async function doUpdate() {
    // チェック済み項目を商品ごとに集約
    const updatesByItem = {};
    document.querySelectorAll('.rm-check:checked').forEach(cb => {
      const hitIdx = parseInt(cb.dataset.hit, 10);
      const optIdx = parseInt(cb.dataset.opt, 10);
      const kind = cb.dataset.kind;
      const hit = STATE.currentHits[hitIdx];
      const opt = hit.matchedOptions[optIdx];

      if (!updatesByItem[hit.manageNumber]) {
        updatesByItem[hit.manageNumber] = { title: hit.title, removals: [] };
      }

      if (kind === 'option') {
        updatesByItem[hit.manageNumber].removals.push({ name: opt.name });
      } else if (kind === 'selection') {
        const selIdx = parseInt(cb.dataset.sel, 10);
        const sel = opt.allSelections[selIdx];
        const selName = sel.name || sel.displayName || sel.value;
        updatesByItem[hit.manageNumber].removals.push({
          name: opt.name,
          selectionName: selName,
        });
      }
    });

    const manageNumbers = Object.keys(updatesByItem);
    if (manageNumbers.length === 0) {
      alert('更新対象が選択されていません');
      return;
    }

    const totalRemovals = Object.values(updatesByItem).reduce((s, v) => s + v.removals.length, 0);
    const msg = `${manageNumbers.length}件の商品のオプションを更新します。\n` +
                `削除対象 計${totalRemovals}件。\n\n` +
                `本当に実行しますか?(この操作は取り消せません)`;
    if (!confirm(msg)) return;

    const status = document.getElementById('updateStatus');
    showStatus(status, 'info', `更新中… (0 / ${manageNumbers.length})`);

    let done = 0;
    const failed = [];

    for (const mn of manageNumbers) {
      const removals = updatesByItem[mn].removals;
      try {
        const res = await callGas('updateItemOptions', {
          manageNumber: mn,
          removals: removals,
        });
        if (!res.ok) failed.push({ mn, err: res.error });
      } catch (err) {
        failed.push({ mn, err: err.message });
      }
      done++;
      showStatus(status, 'info', `更新中… (${done} / ${manageNumbers.length})`);
    }

    if (failed.length === 0) {
      showStatus(status, 'ok', `全${manageNumbers.length}件の更新が完了しました`);
    } else {
      showStatus(status, 'error',
        `${manageNumbers.length - failed.length}件成功 / ${failed.length}件失敗:\n` +
        failed.map(f => `${f.mn}: ${f.err}`).join('\n')
      );
    }
  }

  // ============================================================
  // ユーティリティ
  // ============================================================
  function showStatus(el, kind, msg) {
    el.className = 'status show ' + kind;
    el.textContent = msg;
  }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // ============================================================
  // 起動
  // ============================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
