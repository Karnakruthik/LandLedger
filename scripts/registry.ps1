param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('Configure','Database','Api')]
    [string]$Action,
    [string]$SettingsFile = '.local/settings.json'
)
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
function New-Secret {
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    return [Convert]::ToBase64String($bytes)
}
if ($Action -eq 'Configure') {
    if (Test-Path -LiteralPath $SettingsFile) { throw "Settings already exist at $SettingsFile." }
    $adminEmail = Read-Host 'Registry administrator email'
    if ($adminEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw 'Enter a valid email address.' }
    $settings = [ordered]@{
        DB_URL = 'jdbc:mysql://127.0.0.1:3306/landledger?serverTimezone=UTC'
        DB_USER = 'landledger'
        DB_PASSWORD = New-Secret
        MYSQL_ROOT_PASSWORD = New-Secret
        JWT_SECRET = New-Secret
        ADMIN_EMAIL = $adminEmail
        ADMIN_PASSWORD = New-Secret
    }
    $parent = Split-Path -Parent $SettingsFile
    if ($parent) { New-Item -Force -ItemType Directory -Path $parent | Out-Null }
    $settings | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $SettingsFile
    Write-Output "Created $SettingsFile with your local database and administrator credentials."
    return
}
$settings = Get-Content -Raw -LiteralPath $SettingsFile | ConvertFrom-Json
if ($Action -eq 'Database') {
    $env:DB_PASSWORD=$settings.DB_PASSWORD
    $env:MYSQL_ROOT_PASSWORD=$settings.MYSQL_ROOT_PASSWORD
    docker compose -f database/compose.yaml up -d
    exit $LASTEXITCODE
}
foreach ($key in 'DB_URL','DB_USER','DB_PASSWORD','JWT_SECRET','ADMIN_EMAIL','ADMIN_PASSWORD') {
    [Environment]::SetEnvironmentVariable($key,[string]$settings.$key,'Process')
}
$jar = 'backend/target/registry-1.0.0.jar'
if (!(Test-Path -LiteralPath $jar)) { throw 'Build the backend first with mvn -f backend/pom.xml package.' }
& java -jar $jar
exit $LASTEXITCODE
