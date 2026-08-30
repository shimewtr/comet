# 依存関係の更新

CometはDependabot Alerts、Dependabot Security Updates、Dependabot Version Updatesを利用します。

## 通常更新

通常のバージョン更新は月1回確認し、リリース直後の問題を避けるため次の待機期間を設けます。

- patch: 7日
- minor: 21日
- major: 60日

同時に開くnpm更新PRは最大3件です。AWS SDK、開発ツール、GitHub Actionsは関連する更新をまとめ、レビュー件数を抑えます。

## セキュリティ更新

GitHubのDependabot Security Updatesは通常更新の待機期間とは別に動作します。脆弱性alertを確認し、修正版への更新PRを作成します。リポジトリ設定でDependency graph、Dependabot alerts、Dependabot security updatesを有効にします。

## CIと自動マージ

すべてのPRで`build-and-test`と`macos-app`を実行し、mainの必須status checkに指定します。

Dependabotが作成したpatch・minor更新はGitHub Auto-mergeを予約し、両方の必須checkが成功して競合がない場合だけsquash mergeします。major更新、CI失敗、競合があるPRは自動マージせず、人が変更内容を確認します。

自動マージworkflowは`pull_request_target`で動作しますが、PRのコードをcheckout・実行しません。書き込み権限はGitHub標準のauto-mergeを予約する処理だけに使用します。
