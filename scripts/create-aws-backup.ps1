[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [string]$Profile = 'health-log-dev',
  [string]$Region = 'ap-northeast-1',
  [string]$StackName = 'health-log-dev',
  [string]$BackupName = "health-log-$(Get-Date -Format 'yyyyMMdd-HHmm')"
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

if ($PSCmdlet.ShouldProcess($tableName, "Create on-demand backup '$BackupName'")) {
  & $awsCommand dynamodb create-backup `
    --table-name $tableName `
    --backup-name $BackupName `
    --profile $Profile `
    --region $Region `
    --query 'BackupDetails.{Name:BackupName,Status:BackupStatus,Created:BackupCreationDateTime,Arn:BackupArn}' `
    --output table
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the on-demand backup.' }
}
