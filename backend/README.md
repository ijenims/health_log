# Health Log backend

AWS SAMで定義した、認証必須のHealth Log APIです。実データをAWSへ送信せずにローカルで開発・テストできます。

## 構成

- Amazon Cognito：管理者作成ユーザーのみ。自己登録禁止
- Amazon API Gateway HTTP API：Cognito JWT認証必須
- AWS Lambda：Node.js 22、CRUDを1関数で処理
- Amazon DynamoDB：オンデマンド、暗号化、ポイントインタイムリカバリ

## データキー

```text
PK: USER#{Cognito sub}
SK: DATE#{YYYY-MM}#ITEM#{item_code}
```

1検査項目・1測定値を1レコードとして保存します。

## テスト

```bash
cd backend/functions/measurements
npm install
npm test
```

## SAM検証

AWS SAM CLIがインストールされている場合：

```bash
cd backend
sam validate --lint
sam build
```

## セキュリティ

- APIにはCognito JWT authorizerを設定済みです。
- Cognitoの自己サインアップは禁止しています。
- MFAはデプロイ前に利用方式を決めて追加します。
- DynamoDBテーブルとCognito User Poolには`DeletionPolicy: Retain`を設定しています。
- DynamoDBは暗号化とポイントインタイムリカバリを有効にしています。
- ローカルテスト以外で`ALLOW_LOCAL_USER=true`を設定しないでください。

現段階ではデプロイしていません。AWSアカウント、利用リージョン、予算アラートを確認してからデプロイしてください。

## 現在のローカル検証状況

- AWS SAM CLI 1.165.0を導入済み。
- Lambda依存パッケージをインストール済み。
- Node.jsによるLambda単体テスト（2件）は成功。
- `sam validate --lint`によるテンプレート検証は成功。
- `sam build`によるNode.js 22 / arm64向けビルドは成功。
- Docker Desktopは導入しない。ローカルのLambda実行は行わず、結合確認はAWSの開発環境で行う。
- AWS CLI 2.36.16を導入済み。AWS認証設定とデプロイは未実施。
