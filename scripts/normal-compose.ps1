param(
    [Parameter(Mandatory = $true)][string]$PrivateEnvironmentFile,
    [ValidateSet('status', 'build', 'start')][string]$Action = 'status',
    [ValidateSet('backend', 'account-worker', 'operations-worker', 'frontend', 'db', 'scanner', 'restore-db')]
    [string[]]$Services = @()
)

# The activated normal stack always includes the purpose-specific role overlay.
# Never start dependencies implicitly: in particular, leave Mailpit's state alone.
$taskEnvironmentPath = (Resolve-Path -LiteralPath $PrivateEnvironmentFile -ErrorAction Stop).Path
if ($Action -ne 'status' -and $Services.Count -eq 0) {
    throw 'Specify the services explicitly. This helper never starts the entire stack.'
}
$taskComposeArgs = @('compose', '--env-file', $taskEnvironmentPath, '-p', 'i-saveprototype-main',
    '-f', 'compose.yaml', '-f', 'compose.mailpit.yaml', '-f', 'compose.operations.yaml',
    '-f', 'compose.database-roles.yaml')
if ($Action -eq 'status') { $taskComposeArgs += @('ps', '-a') }
elseif ($Action -eq 'build') { $taskComposeArgs += @('build') + $Services }
else { $taskComposeArgs += @('up', '-d', '--no-deps') + $Services }
Push-Location (Join-Path $PSScriptRoot '..')
try {
    & docker @taskComposeArgs
    $taskExitStatus = $LASTEXITCODE
}
finally { Pop-Location }
exit $taskExitStatus
