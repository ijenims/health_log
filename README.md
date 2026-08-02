# Health Log

健康診断結果を分類・検査項目ごとに時系列表示する個人用Webアプリです。現在はローカルのサンプルJSONを読み込んで表示します。

## 使用技術

- React
- Vite
- JavaScript
- Recharts

## 起動方法

Node.js 18以降とnpmが必要です。

```bash
npm install
npm run dev
```

起動後、ターミナルに表示されるURL（通常は `http://localhost:5173`）をブラウザで開いてください。

## その他のコマンド

```bash
# 本番用ビルド
npm run build

# ビルド結果をローカルで確認
npm run preview
```

## データの場所

検査項目マスタは `src/data/item-master.json`、サンプル測定結果は `src/data/measurements.json` にあります。項目情報と測定結果を分離し、`itemCode`で関連付けています。
