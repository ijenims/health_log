# Health Log 開発メモ

## 1. 目的

過去の健康診断結果を時系列で可視化し、自分自身の健康指標の変化をスマートフォンやPCのブラウザから確認できる個人用Webアプリを作る。

アプリ名は **Health Log** とする。

---

## 2. 基本要件

- 対象ユーザーは基本的に1人
- データの時間粒度は年月単位
- グラフは折れ線グラフ
- 健診項目を機能別・分類別に表示できる
- スマートフォンのブラウザで閲覧できる
- UIはシンプルで必要最小限
- 将来的に過去データの追加・修正ができる
- AWSを使ったサーバレス構成を基本とする

---

## 3. 想定する分類

初期分類は以下を想定する。

| 分類 | 主な項目 |
|---|---|
| 身体 | 身長、体重、BMI、腹囲 |
| 血圧 | 収縮期血圧、拡張期血圧 |
| 脂質 | 中性脂肪、LDL、HDL、総コレステロール |
| 肝機能 | AST、ALT、γ-GTP、ALP、LD |
| 腎機能 | クレアチニン、eGFR、尿素窒素 |
| 糖代謝 | 血糖、HbA1c |
| 尿酸 | 尿酸 |
| 血球 | 赤血球、白血球、血色素、血小板 |
| 尿検査 | 尿糖、尿蛋白、尿潜血 |

中性脂肪は独立分類ではなく、基本的には「脂質」に含める。

---

## 4. 推奨アーキテクチャ

```text
スマホ／PCブラウザ
        │
        ▼
Amplify Hosting
  └─ React + Vite + JavaScript
        │
        ├─ ログイン：Amazon Cognito
        │
        ▼
API Gateway
        │
        ▼
AWS Lambda
        │
        ▼
Amazon DynamoDB
        │
        └─ バックアップ：S3へCSV出力
```

### 各サービスの役割

- **Amplify Hosting**
  - Webアプリの画面側を公開
  - GitHubと連携して自動ビルド・自動デプロイ
  - HTTPS、CDN、公開URLを提供

- **Amazon Cognito**
  - 個人用ログイン認証
  - 自己サインアップは無効
  - 管理者作成ユーザーのみ利用

- **API Gateway**
  - ブラウザとLambdaの間のAPI窓口

- **AWS Lambda**
  - 健診データの登録、取得、修正、削除
  - CSV取込み、CSV書出し

- **Amazon DynamoDB**
  - 健診結果の保存

- **Amazon S3**
  - CSVバックアップ
  - AWSをやめた場合でも移行可能な原本データを保持

---

## 5. フロントエンド構成

初期構成は以下を推奨する。

- React
- Vite
- JavaScript
- Recharts
- CSS
- 外部UIフレームワークは使わない

### 初期画面イメージ

```text
Health Log

［肝機能 ▼］

［AST］［ALT］［γ-GTP］

┌────────────────────┐
│     折れ線グラフ         │
│  基準範囲を背景帯で表示   │
└────────────────────┘

最新値：48 U/L
前回比：-6
検査年月：2026年7月
```

### 操作は最小限にする

1. 分類を選ぶ
2. 検査項目を選ぶ
3. グラフを見る

スマートフォンでは分類を横スクロール式のボタンにする案もある。

```text
［身体］［血圧］［脂質］［肝機能］［腎機能］［尿酸］
```

---

## 6. グラフ表示方針

基本は **1グラフ＝1検査項目** とする。

理由は、単位が異なる項目を同じグラフに重ねると見づらいため。

例：

- AST、ALT、γ-GTPは同じU/Lなので比較表示可能
- 体重、BMI、腹囲は単位が異なるため別表示が望ましい

### グラフに表示したい情報

- 年月ごとの測定値
- 折れ線
- 各点の値
- 単位
- 基準範囲
- 基準値外の点の強調
- 最新値
- 前回との差
- 最大値・最小値

基準範囲は医療機関や検査法で変わる場合があるため、可能であれば検査時点の基準値を保存する。

---

## 7. データ構造案

DynamoDBには、**1検査項目・1測定値を1レコード**として保存する。

### measurements テーブル例

| 項目 | 例 |
|---|---|
| user_id | mineyan |
| examination_date | 2026-07 |
| item_code | gamma_gtp |
| item_name | γ-GTP |
| category | liver |
| value | 48 |
| unit | U/L |
| lower_limit | null |
| upper_limit | 79 |
| source | 2026年度健康診断 |

### キー例

```text
PK：USER#mineyan
SK：DATE#2026-07#ITEM#gamma_gtp
```

### API例

```text
GET    /measurements
POST   /measurements
PUT    /measurements/{id}
DELETE /measurements/{id}
POST   /import-csv
GET    /export-csv
```

初期段階ではLambdaを細かく分割せず、API用Lambdaを1本から始める。

---

## 8. 項目マスタ

健診帳票では名称が変わることがあるため、内部では共通コードに統一する。

例：

| item_code | 表示名 | 分類 | 単位 |
|---|---|---|---|
| ast | AST（GOT） | 肝機能 | U/L |
| alt | ALT（GPT） | 肝機能 | U/L |
| gamma_gtp | γ-GTP | 肝機能 | U/L |
| triglyceride | 中性脂肪 | 脂質 | mg/dL |
| uric_acid | 尿酸 | 尿酸 | mg/dL |
| weight | 体重 | 身体 | kg |

「GOT」と「AST」、「GPT」と「ALT」などの名称差を同じ項目として扱う。

---

## 9. データ入力方針

最初からOCRやPDF自動取込みは作らない。

### Phase 1

- サンプルJSON表示
- CSV一括登録
- 手入力
- 修正
- CSV書出し

CSV例：

```csv
examination_date,item_code,value
2022-06,gamma_gtp,72
2023-06,gamma_gtp,65
2024-07,gamma_gtp,58
2025-07,gamma_gtp,54
2026-07,gamma_gtp,48
```

初回のみExcelで過去データを整理し、CSVで一括登録する。

以降は年1回程度なので、画面から手入力でも十分。

---

## 10. 開発手順

### Phase 1：ローカル画面版

まずAWSには接続せず、ローカルだけで動く画面を作る。

目標：

- スマートフォン対応
- 分類選択
- 検査項目選択
- 折れ線グラフ
- サンプルJSON表示
- 日本語UI
- npm run devで起動
- README作成

### Phase 2：データ保存

- DynamoDB
- Lambda
- API Gateway
- CSV取込み
- CSV書出し
- 手入力・修正

### Phase 3：認証と公開

- Cognito
- Amplify Hosting
- GitHub連携
- HTTPS公開

### Phase 4：追加機能

- 基準範囲表示
- 前回差
- 最大値・最小値
- 複数項目比較
- PDF・画像読取り
- 医療機関ごとの項目名変換
- コメント、服薬、生活習慣の記録

---

## 11. 初期プロジェクト構成案

```text
health-log/
├─ src/
│  ├─ components/
│  ├─ data/
│  │  └─ sampleData.js
│  ├─ App.jsx
│  └─ main.jsx
├─ package.json
├─ README.md
└─ .gitignore
```

---

## 12. Codexへの初期実装指示案

```text
健康診断結果を時系列表示する個人用Webアプリを新規作成してください。

アプリ名:
- Health Log

技術構成:
- React
- Vite
- JavaScript
- Recharts
- 外部UIフレームワークは使用しない

要件:
- スマートフォン優先のレスポンシブデザイン
- シンプルで必要最小限のUI
- 健診項目を「身体」「血圧」「脂質」「肝機能」「腎機能」
  「糖代謝」「尿酸」「血球」「尿検査」に分類
- 分類を選択すると対象の検査項目を選択できる
- 選択した検査項目を年月単位の折れ線グラフで表示
- グラフの各点で年月と測定値を確認できる
- 現時点ではバックエンドを作らず、ローカルのサンプルJSONを使用
- 日本語UI
- npm run devで起動可能
- READMEに起動方法を書く

まず初期プロジェクトを作成し、必要なファイルを実装してください。
```

---

## 13. 現時点の重要判断

- アプリ名は **Health Log**
- 最初はローカル画面だけ作る
- AWSを最初から全部つながない
- グラフライブラリはRecharts
- UIは必要最小限
- データ原本はCSVとして保持できる構成にする
- 将来的にAmplify Hostingへ公開する
- 個人用なのでCognitoユーザーは1人、自己登録は禁止
