# Health Log

健康診断結果を分類・検査項目ごとに時系列表示する個人用Webアプリです。

ローカルではサンプルJSONまたはブラウザ内データを表示できます。本番構成ではCognitoでログインし、API Gateway・Lambda・DynamoDBに保存したデータを利用します。

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

## AWS接続設定

`.env.example`を`.env.local`へコピーし、デプロイ済みAWS環境の値を設定します。

```env
VITE_AWS_REGION=ap-northeast-1
VITE_COGNITO_USER_POOL_ID=ap-northeast-1_xxxxxxxxx
VITE_COGNITO_USER_POOL_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_API_URL=https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/v1
```

`.env.local`はGit管理対象外です。上記の値はフロントエンドの接続設定であり、AWSアクセスキーやパスワードは保存しません。

## Amplify Hosting

GitHubの`main`ブランチをAmplify Hostingへ接続します。ビルド設定はリポジトリ直下の`amplify.yml`に保存しています。

Amplify側にも次の環境変数を設定してください。

- `VITE_AWS_REGION`
- `VITE_COGNITO_USER_POOL_ID`
- `VITE_COGNITO_USER_POOL_CLIENT_ID`
- `VITE_API_URL`

`main`へのプッシュを契機に、`npm ci`、`npm run build`、`dist`の配信が自動実行されます。

## データの場所

検査項目マスタは `src/data/item-master.json`、サンプル測定結果は `src/data/measurements.json` にあります。項目情報と測定結果を分離し、`itemCode`で関連付けています。
