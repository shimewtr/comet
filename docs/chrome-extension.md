# Chrome拡張

Chrome拡張は、受信したコメントとスタンプをGoogleスライド上へオーバーレイ表示します。

## build

```bash
pnpm --filter @comet/chrome-extension build
```

開発中はwatch modeを利用できます。

```bash
pnpm --filter @comet/chrome-extension dev
```

生成先は `packages/chrome-extension/dist` です。

## Chromeへの読み込み

1. Chromeで `chrome://extensions` を開く
2. 「デベロッパーモード」を有効にする
3. 「パッケージ化されていない拡張機能を読み込む」を選ぶ
4. `packages/chrome-extension/dist` を指定する
5. Googleスライドを再読み込みする

再buildした場合は、`chrome://extensions` のCometカードにある再読み込みボタンを押してから対象タブを再読み込みします。

## 接続設定

1. Comet拡張のポップアップを開く
2. デプロイ済みのWebアプリURLを入力する
3. 「接続設定を再取得」を押す
4. 取得成功後に「保存」を押す

拡張はWebアプリの `/comet-config.json` からWebSocket URL、履歴API URL、認証設定を取得します。必要なホスト権限は設定取得時にChromeから確認されます。

WebSocket URLを手入力することもできますが、API再作成時に自動追従できるWebアプリURL方式を推奨します。

## Roomと表示設定

- ポップアップで表示対象Roomを選択できます。
- 参加用QRコードには選択中RoomのWeb URLが反映されます。
- コメント・スタンプのサイズ、不透明度などを設定できます。
- Chrome Syncが利用可能な設定はブラウザ間で同期されます。

## 認証付き環境

WebアプリでOIDC認証が有効な場合、拡張は「ログイン」を表示します。ログイン操作ではWebアプリの `/auth/extension` を開き、認証済みWebセッションから短命なCometチケットを取得します。

IdPのアクセストークンやclient secretを拡張へ保存することはありません。

## 動作対象

現在のcontent scriptは `https://docs.google.com/*` で動作します。別サイトへ対応する場合はmanifestの権限だけでなく、対象ページ上での表示・操作を検証してください。

## トラブルシューティング

### 接続設定を取得できない

- WebアプリURLが `https://` から始まっているか確認する
- Web URLの `/comet-config.json` が開けるか確認する
- Chromeの権限確認を拒否していないか確認する

### コメントが表示されない

- Webと拡張で同じRoomを選択しているか確認する
- 拡張を再読み込みした後、Googleスライドのタブも再読み込みする
- ポップアップで表示が有効になっているか確認する

### 認証が必要と表示される

- Webアプリへブラウザでログインする
- 拡張の「ログイン」を再実行する
- WebアプリURLが認証対象の環境と一致しているか確認する
