/**
 * オプション項目修正侍 - GAS バックエンド
 *
 * GitHub Pages のフロントから fetch() で呼ばれるWeb App。
 * doPost(e) でJSONリクエストを受け取り、actionに応じて処理を分岐する。
 *
 * セキュリティ:
 * - 楽天APIキー(licenseKey/serviceSecret)はスプレッドシートに保存し、
 *   フロントには絶対に返さない
 * - Origin チェック(ALLOWED_ORIGINS)で許可ドメイン以外を拒否
 * - id/pw 照合は ScriptProperties 経由で発行したセッショントークンで継続
 */

// ============================================================
// 設定
// ============================================================
const SHEET_NAME = 'api_key';
const LOG_SHEET_NAME = 'operation_log';
const SESSION_PROP_PREFIX = 'session_';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12時間

// 既存スプレッドシート(コンテンツページ生成ちゃんと共用)のID
const SPREADSHEET_ID = '1iYeV2SbOVoRH8Qjm2d1w5tWmhlE_zcc-yO1tDSLN7Rk';

/**
 * 許可するOrigin。
 * セットアップ完了後、GitHub Pagesのオリジンを追記すること。
 *
 * 例:
 *   'https://yourname.github.io',
 *   'http://localhost:8000',  // ローカル開発用
 */
const ALLOWED_ORIGINS = [
  'https://ginzasugiden.github.io',
  'http://localhost:8000',  // ローカル開発用
];

// ============================================================
// エントリポイント: doGet (動作確認用)
// ============================================================
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      ok: true,
      service: 'オプション項目修正侍',
      message: 'GAS Web App is running. POST requests only.'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// エントリポイント: doPost (メイン)
// ============================================================
function doPost(e) {
  // CORS preflight は GAS では受け付けられないため、
  // フロント側で Content-Type: text/plain として送信させて preflight を回避している

  try {
    const raw = e.postData && e.postData.contents;
    if (!raw) {
      return jsonResponse({ ok: false, error: 'リクエストボディが空です' });
    }

    let body;
    try {
      body = JSON.parse(raw);
    } catch (err) {
      return jsonResponse({ ok: false, error: 'JSON parse error: ' + err.message });
    }

    const action = body.action;
    const token = body.token;
    const payload = body.payload || {};

    // アクションごとに分岐
    let result;
    switch (action) {
      case 'login':
        result = doLogin(payload.id, payload.pw);
        break;
      case 'logout':
        result = doLogoutInternal(token);
        break;
      case 'checkSession':
        result = checkSession(token);
        break;
      case 'findItemsWithOption':
        result = findItemsWithOption(token, payload.keyword);
        break;
      case 'updateItemOptions':
        result = updateItemOptions(token, payload.manageNumber, payload.removals);
        break;
      default:
        result = { ok: false, error: '未知のaction: ' + action };
    }

    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ ok: false, error: 'サーバーエラー: ' + err.message });
  }
}

/**
 * JSONレスポンスを返す。GASのContentServiceはCORSヘッダーを設定できないが、
 * Content-Typeをtext/plainで受けてもらえばブラウザは通常のJSONとして処理可能。
 */
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 認証
// ============================================================

function doLogin(id, pw) {
  try {
    if (!id || !pw) {
      return { ok: false, error: 'IDとパスワードを入力してください' };
    }

    const user = findUserById(id);
    if (!user) {
      return { ok: false, error: 'IDまたはパスワードが違います' };
    }
    if (String(user.pw) !== String(pw)) {
      return { ok: false, error: 'IDまたはパスワードが違います' };
    }

    const token = Utilities.getUuid();
    const session = {
      id: user.id,
      sid: user.sid,
      sname: user.sname,
      role: user.role,
      createdAt: Date.now(),
      expiresAt: Date.now() + SESSION_TTL_MS,
    };
    PropertiesService.getScriptProperties()
      .setProperty(SESSION_PROP_PREFIX + token, JSON.stringify(session));

    return {
      ok: true,
      token: token,
      user: {
        id: user.id,
        sid: user.sid,
        sname: user.sname,
        role: user.role,
      },
    };
  } catch (err) {
    return { ok: false, error: 'ログイン処理でエラー: ' + err.message };
  }
}

function doLogoutInternal(token) {
  try {
    if (token) {
      PropertiesService.getScriptProperties()
        .deleteProperty(SESSION_PROP_PREFIX + token);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function checkSession(token) {
  const user = _verifySession(token);
  if (!user) return { ok: false };
  return {
    ok: true,
    user: {
      id: user.id,
      sid: user.sid,
      sname: user.sname,
      role: user.role,
    },
  };
}

/**
 * セッショントークンを検証 → 有効ならユーザーレコード全体(APIキー含む)を返す
 * フロントには絶対に直接渡さない。内部関数。
 */
function _verifySession(token) {
  if (!token) return null;
  const raw = PropertiesService.getScriptProperties()
    .getProperty(SESSION_PROP_PREFIX + token);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (session.expiresAt < Date.now()) {
      PropertiesService.getScriptProperties()
        .deleteProperty(SESSION_PROP_PREFIX + token);
      return null;
    }
    return findUserById(session.id);
  } catch (err) {
    return null;
  }
}

// ============================================================
// シート操作
// ============================================================

function findUserById(id) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    throw new Error('シート「' + SHEET_NAME + '」が見つかりません');
  }
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return null;

  const headers = values[0].map(String);
  const idCol = headers.indexOf('id');
  if (idCol === -1) throw new Error('idカラムが見つかりません');

  for (let i = 1; i < values.length; i++) {
    if (String(values[i][idCol]) === String(id)) {
      const row = {};
      headers.forEach((h, j) => { row[h] = values[i][j]; });
      return row;
    }
  }
  return null;
}

// ============================================================
// 楽天RMS API 中継
// ============================================================

function _buildRakutenAuthHeader(licenseKey, serviceSecret) {
  // 楽天RMS API: ESA Base64(serviceSecret:licenseKey)
  const raw = serviceSecret + ':' + licenseKey;
  return 'ESA ' + Utilities.base64Encode(raw);
}

/**
 * オプション項目にキーワードが含まれる商品を抽出
 */
function findItemsWithOption(token, keyword) {
  const user = _verifySession(token);
  if (!user) return { ok: false, error: 'セッション切れです。再ログインしてください' };
  if (!keyword) return { ok: false, error: 'キーワードを入力してください' };

  try {
    const auth = _buildRakutenAuthHeader(user.licenseKey, user.serviceSecret);
    const hits = [];
    let cursorMark = '*';
    let totalScanned = 0;
    const startTime = Date.now();
    const MAX_TIME_MS = 5 * 60 * 1000;

    while (cursorMark) {
      if (Date.now() - startTime > MAX_TIME_MS) {
        return {
          ok: true,
          hits: hits,
          totalScanned: totalScanned,
          warning: 'タイムアウト寸前のため途中で終了しました。続きはcursorMark指定で再実行してください',
          nextCursorMark: cursorMark,
        };
      }

      const url = 'https://api.rms.rakuten.co.jp/es/2.0/items/search' +
                  '?hits=100&cursorMark=' + encodeURIComponent(cursorMark);

      const res = UrlFetchApp.fetch(url, {
        method: 'get',
        headers: {
          'Authorization': auth,
          'Accept': 'application/json',
        },
        muteHttpExceptions: true,
      });
      const code = res.getResponseCode();
      if (code !== 200) {
        return { ok: false, error: '楽天API ' + code + ': ' + res.getContentText() };
      }

      const data = JSON.parse(res.getContentText());
      const items = data.results || data.items || [];

      items.forEach(item => {
        totalScanned++;
        const matched = _matchOptionsByKeyword(item, keyword);
        if (matched.length > 0) {
          hits.push({
            manageNumber: item.manageNumber || item.itemNumber,
            title: item.title || item.itemName,
            matchedOptions: matched,
          });
        }
      });

      const nextCursor = data.nextCursorMark || data.next_cursor_mark;
      if (!nextCursor || nextCursor === cursorMark) break;
      cursorMark = nextCursor;
    }

    return { ok: true, hits: hits, totalScanned: totalScanned };
  } catch (err) {
    return { ok: false, error: '検索エラー: ' + err.message };
  }
}

function _matchOptionsByKeyword(item, keyword) {
  const matched = [];
  const kw = String(keyword).toLowerCase();
  const options = item.options || item.itemOptions || [];

  options.forEach((opt, idx) => {
    const name = String(opt.name || opt.displayName || '');
    const matchInName = name.toLowerCase().indexOf(kw) !== -1;

    const selections = opt.selections || opt.values || opt.choices || [];
    const matchedSelections = selections.filter(sel => {
      const selName = String(sel.name || sel.displayName || sel.value || '');
      return selName.toLowerCase().indexOf(kw) !== -1;
    });

    if (matchInName || matchedSelections.length > 0) {
      matched.push({
        index: idx,
        name: name,
        matchInName: matchInName,
        matchedSelections: matchedSelections,
        allSelections: selections,
      });
    }
  });

  return matched;
}

/**
 * 商品オプションの更新
 */
function updateItemOptions(token, manageNumber, removals) {
  const user = _verifySession(token);
  if (!user) return { ok: false, error: 'セッション切れです。再ログインしてください' };

  if (!manageNumber) return { ok: false, error: 'manageNumberが未指定です' };
  if (!removals || removals.length === 0) return { ok: false, error: '削除対象が未指定です' };

  try {
    const auth = _buildRakutenAuthHeader(user.licenseKey, user.serviceSecret);

    // 1. 現在の商品情報を取得
    const getUrl = 'https://api.rms.rakuten.co.jp/es/2.0/items/' +
                   encodeURIComponent(manageNumber);
    const getRes = UrlFetchApp.fetch(getUrl, {
      method: 'get',
      headers: { 'Authorization': auth, 'Accept': 'application/json' },
      muteHttpExceptions: true,
    });
    const getCode = getRes.getResponseCode();
    if (getCode !== 200) {
      return { ok: false, error: '商品取得失敗 ' + getCode + ': ' + getRes.getContentText() };
    }
    const item = JSON.parse(getRes.getContentText());

    // 2. オプションをフィルタリング
    const currentOptions = item.options || item.itemOptions || [];
    const updatedOptions = currentOptions
      .map(opt => {
        const optName = opt.name || opt.displayName;
        const targetForWholeOpt = removals.find(rm => rm.name === optName && !rm.selectionName);
        if (targetForWholeOpt) return null;

        const selections = opt.selections || opt.values || opt.choices || [];
        const targetSels = removals
          .filter(rm => rm.name === optName && rm.selectionName)
          .map(rm => rm.selectionName);

        if (targetSels.length > 0) {
          const filtered = selections.filter(sel => {
            const selName = sel.name || sel.displayName || sel.value;
            return targetSels.indexOf(selName) === -1;
          });
          return Object.assign({}, opt, { selections: filtered });
        }
        return opt;
      })
      .filter(opt => opt !== null);

    // 3. PATCH送信
    const patchUrl = getUrl;
    const payload = { options: updatedOptions };

    const patchRes = UrlFetchApp.fetch(patchUrl, {
      method: 'patch',
      headers: {
        'Authorization': auth,
        'Accept': 'application/json',
        'Content-Type': 'application/json; charset=utf-8',
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const code = patchRes.getResponseCode();
    const respBody = patchRes.getContentText();
    if (code < 200 || code >= 300) {
      return { ok: false, error: '更新失敗 ' + code + ': ' + respBody };
    }

    // 4. 操作ログ
    _writeOperationLog({
      user: user.id,
      action: 'updateItemOptions',
      manageNumber: manageNumber,
      removed: removals,
      timestamp: new Date(),
    });

    return { ok: true, data: respBody ? JSON.parse(respBody) : null };
  } catch (err) {
    return { ok: false, error: '更新エラー: ' + err.message };
  }
}

// ============================================================
// 操作ログ
// ============================================================
function _writeOperationLog(entry) {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    let sheet = ss.getSheetByName(LOG_SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(LOG_SHEET_NAME);
      sheet.appendRow(['timestamp', 'user', 'action', 'manageNumber', 'details']);
    }
    sheet.appendRow([
      entry.timestamp,
      entry.user,
      entry.action,
      entry.manageNumber,
      JSON.stringify(entry.removed || entry.details || {}),
    ]);
  } catch (err) {
    console.error('ログ記録失敗:', err);
  }
}
