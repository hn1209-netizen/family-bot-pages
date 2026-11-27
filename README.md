# family-bot-pages

家族Bot（LINE）のメニューから開くページ（プリント・ピアノの一覧、買い物リスト、家事リスト、使い方）の画面だけを置くリポジトリ。GitHub Pages で公開する。

- データの読み書きは、非公開リポジトリ family-bot の Google Apps Script（Api.js）が行う
- Apps Script のデプロイIDと鍵は、メニューのURLの `#` 以降で渡す（`#s=<デプロイID>&k=<鍵>&p=<ページ>`）。`#` 以降はサーバーに送られない
- **このリポジトリには秘密の情報（APIキー・トークン・鍵・デプロイID）を入れない**

ページ：`p` なし＝プリント・ピアノ、`p=past-print`／`p=past-piano`＝過去の一覧、`p=shop`＝買い物リスト、`p=chores`／`p=chores-routines`／`p=chores-stats`＝家事リスト（リスト・ルーティン・集計）、`p=help`＝使い方
