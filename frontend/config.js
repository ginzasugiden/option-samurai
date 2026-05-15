/**
 * オプション項目修正侍 - 設定ファイル
 *
 * このファイルにはGAS Web AppのURLを記載します。
 * URL自体は秘密ではありません(楽天APIキーはGAS側にあり、id/pwなしには何もできない設計)。
 *
 * セットアップ手順:
 * 1. clasp deploy で GAS Web App をデプロイ
 * 2. デプロイURLをコピー
 * 3. 以下の GAS_URL を置き換え
 * 4. git commit & push
 */

window.SAMURAI_CONFIG = {
  // ↓↓↓ ここを clasp deploy で取得した URL に書き換える ↓↓↓
  GAS_URL: 'https://script.google.com/macros/s/AKfycbznyHABIrDBrbJA0hlBRLdcdFg1lJwNsNxTHW_96YrwX0b-yEC6EFhwaRelM5rNTEQa/exec',

  // タイムアウト設定(ミリ秒)
  REQUEST_TIMEOUT_MS: 5 * 60 * 1000,  // 5分(全商品スキャンが長い場合に備える)
};
