[CmdletBinding()]
param(
  [string]$Profile = 'health-log-dev',
  [string]$Region = 'ap-northeast-1',
  [string]$StackName = 'health-log-dev'
)

$ErrorActionPreference = 'Stop'

$awsCommand = (Get-Command aws.exe -ErrorAction SilentlyContinue).Source
if (-not $awsCommand) {
  $defaultAwsCommand = 'C:\Program Files\Amazon\AWSCLIV2\aws.exe'
  if (Test-Path -LiteralPath $defaultAwsCommand) {
    $awsCommand = $defaultAwsCommand
  } else {
    throw 'AWS CLI was not found.'
  }
}

$tableName = & $awsCommand cloudformation describe-stacks `
  --stack-name $StackName `
  --profile $Profile `
  --region $Region `
  --query "Stacks[0].Outputs[?OutputKey=='MeasurementsTableName'].OutputValue | [0]" `
  --output text

if ($LASTEXITCODE -ne 0 -or -not $tableName -or $tableName -eq 'None') {
  throw 'Could not resolve the DynamoDB table name from CloudFormation.'
}

Write-Host "Health Log backup status"
Write-Host "Table: $tableName"

& $awsCommand dynamodb describe-table `
  --table-name $tableName `
  --profile $Profile `
  --region $Region `
  --query 'Table.{Status:TableStatus,ItemCount:ItemCount,SizeBytes:TableSizeBytes,BillingMode:BillingModeSummary.BillingMode,DeletionProtection:DeletionProtectionEnabled}' `
  --output table
if ($LASTEXITCODE -ne 0) { throw 'Could not read the DynamoDB table.' }

& $awsCommand dynamodb describe-continuous-backups `
  --table-name $tableName `
  --profile $Profile `
  --region $Region `
  --query 'ContinuousBackupsDescription.PointInTimeRecoveryDescription' `
  --output table
if ($LASTEXITCODE -ne 0) { throw 'Could not read the PITR status.' }

& $awsCommand dynamodb list-backups `
  --table-name $tableName `
  --profile $Profile `
  --region $Region `
  --query 'BackupSummaries[].{Name:BackupName,Status:BackupStatus,Created:BackupCreationDateTime,SizeBytes:BackupSizeBytes}' `
  --output table
if ($LASTEXITCODE -ne 0) { throw 'Could not list the on-demand backups.' }
