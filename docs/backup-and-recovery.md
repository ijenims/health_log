# Health Log バックアップ・復旧手順

## 方針

Health Logは次の三層でデータを保護する。

1. アプリから書き出すJSON：人が保管し、1件単位の復旧にも使う。
2. DynamoDB PITR：誤更新・誤削除前の時点へ戻すための35日間の連続バックアップ。
3. DynamoDBオンデマンドバックアップ：本番公開時点など、長期保管したい基準点を残す。

IndexedDBはAWS取得後に同期される補助コピーであり、単独の正式バックアップとはみなさない。

## 日常運用

### 月1回と大きな変更前

1. 本番URLへログインする。
2. ヘッダーが`AWS同期済み 59件`など正常な件数であることを確認する。
3. `データ管理`を開き、`JSON書出し`を実行する。
4. 必要なら閲覧・確認用に`CSV書出し`も実行する。
5. JSONを`private-data/backups/`へ移動する。
6. ファイル名の日時、健診件数、最古・最新年月を簡単に記録する。

JSONが復旧用の正本。CSVは表計算ソフトでの確認用とする。どちらにも健康情報が含まれるためGitへ追加せず、外部共有しない。PC外にも置く場合は、本人だけが利用できる暗号化済みストレージを使う。

### AWS状態確認

AWS CLIへログインした後、プロジェクト直下で実行する。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-aws-backup-status.ps1
```

次を確認する。

- テーブル状態が`ACTIVE`
- `PointInTimeRecoveryStatus`が`ENABLED`
- `RecoveryPeriodInDays`が`35`
- `DeletionProtection`が`True`
- 必要なオンデマンドバックアップが`AVAILABLE`

### 長期基準点を作る

本番公開、大量取込み、データ構造変更の直前に実行する。実行時に確認プロンプトが表示される。

```powershell
powershell -ExecutionPolicy Bypass -File scripts/create-aws-backup.ps1
```

名前を指定する場合：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/create-aws-backup.ps1 `
  -BackupName health-log-before-major-import-20260808
```

## 復旧判断

### ブラウザのデータだけ消えた

本番URLを再読み込みしてAWSから再取得する。AWSが59件など正常なら、それ以上の復旧操作は不要。

### 1件の値を誤って変更した

バックアップJSONまたはCSVで正しい値を確認し、`データ管理`の`既存データ編集`から該当年月だけ修正する。全テーブル復元は行わない。

### 1健診年月を誤って削除した

1. 削除前のJSONバックアップを`データを読み込む`からブラウザへ読み込む。
2. 件数と期間を確認してブラウザ内データを置き換える。
3. `AWSへ移行`を開く。
4. `今回追加`が削除した年月の1件だけであることを確認する。
5. AWSへ追加し、`AWS同期済み`の件数が戻ったことを確認する。

移行処理は既存年月を上書きしないため、削除済み年月の追加に限定できる。

### 多数のデータを誤更新・誤削除した

操作を止め、復旧したい時刻を日本時間で記録する。PITRは元テーブルを上書きせず、新しいテーブルとして復元される。

1. `scripts/check-aws-backup-status.ps1`で復旧可能期間を確認する。
2. DynamoDBコンソールで対象テーブルの`バックアップ`を開く。
3. PITRの`復元`を選び、事故直前の時刻と新しいテーブル名を指定する。
4. 復元先テーブルが`ACTIVE`になるまで待つ。
5. 元テーブルは削除しない。
6. 復元先の件数とデータ内容を確認する。
7. Lambdaの参照先とIAM権限を復元先へ切り替える前に、コード変更とCloudFormation差分を必ず確認する。

PITR復元は常に新しいテーブルを作る。復元しただけではHealth Logの参照先は変わらない。切替は別作業として実施する。

### テーブル自体を誤って削除した

DynamoDB削除保護とCloudFormationの`DeletionPolicy: Retain`で通常の削除を防ぐ。万一削除された場合は、PITR削除時バックアップまたはオンデマンドバックアップから新しいテーブルへ復元し、多数データの復旧と同じ手順で切り替える。

## 復旧後の確認

1. 本番URLへログインできる。
2. `AWS同期済み`の件数が期待値と一致する。
3. 最古・最新の健診年月が正しい。
4. 複数分類のグラフと基準範囲が表示される。
5. テスト用年月を追加・修正・削除できる。
6. JSONバックアップを新しく書き出す。
7. 復旧用に作った不要なテーブルは、確認期間を置いてから明示的に削除する。

## AWS公式資料

- [DynamoDBのポイントインタイムリカバリ](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Point-in-time-recovery.html)
- [DynamoDBテーブルの復元](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/pointintimerecovery_restores.html)
- [DynamoDBのバックアップと復元](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Backup-and-Restore.html)
