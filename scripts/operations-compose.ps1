param(
    [Parameter(Mandatory=$true)][string]$Configuration,
    [ValidateSet('Status','WorkerOnce','StartWorker')][string]$Action='Status'
)
$ErrorActionPreference='Stop'
# The configuration contains paths only; key and password stay outside the repo.
$taskConfiguration=Get-Content -LiteralPath $Configuration -Raw | ConvertFrom-Json
if (-not (Test-Path -LiteralPath $taskConfiguration.backup_key_file_host) -or -not (Test-Path -LiteralPath $taskConfiguration.restore_password_file_host)) { throw 'Private operational configuration is unavailable.' }
$taskOldKey=$env:BACKUP_KEY_FILE_HOST
$taskOldPassword=$env:RESTORE_PASSWORD_FILE_HOST
$taskOldUrl=$env:RESTORE_TEST_URL
try {
    $env:BACKUP_KEY_FILE_HOST=$taskConfiguration.backup_key_file_host
    $env:RESTORE_PASSWORD_FILE_HOST=$taskConfiguration.restore_password_file_host
    $taskRestorePassword=[System.IO.File]::ReadAllText($taskConfiguration.restore_password_file_host).Trim()
    $env:RESTORE_TEST_URL='postgresql+psycopg://recovery_operator:'+ [Uri]::EscapeDataString($taskRestorePassword)+'@restore-db:5432/postgres'
    $taskCompose=@('compose','-p','i-saveprototype-main','-f','compose.yaml','-f','compose.mailpit.yaml','-f','compose.operations.yaml')
    switch ($Action) {
        'Status' { & docker @taskCompose ps --all }
        'WorkerOnce' { & docker @taskCompose run --rm --no-deps operations-worker python -m app.operations_worker --once }
        'StartWorker' { & docker @taskCompose up -d --no-deps --no-build scanner restore-db operations-worker }
    }
    $taskExit=$LASTEXITCODE
} finally {
    $env:BACKUP_KEY_FILE_HOST=$taskOldKey
    $env:RESTORE_PASSWORD_FILE_HOST=$taskOldPassword
    $env:RESTORE_TEST_URL=$taskOldUrl
    $taskRestorePassword=$null
}
exit $taskExit
