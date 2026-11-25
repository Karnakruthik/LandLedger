# Windows launcher for the local classroom stack. Each fresh Hardhat chain gets its own database.
[CmdletBinding()]
param([string]$MySqlHome='C:\Program Files\MySQL\MySQL Server 8.0')
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location $root
$state=Join-Path $root '.local'
$settingsPath=Join-Path $state 'preview-secrets.json'
New-Item -ItemType Directory -Force $state | Out-Null
function Port-IsOpen([int]$Port) {
    $client=New-Object Net.Sockets.TcpClient
    try { $client.Connect('127.0.0.1',$Port); return $true } catch { return $false } finally { $client.Dispose() }
}
function Wait-Port([int]$Port) {
    for($attempt=0;$attempt -lt 90;$attempt++){
        if(Port-IsOpen $Port){return}
        Start-Sleep -Milliseconds 500
    }
    throw "Service on port $Port did not start. Check the logs in .local."
}
function Start-LocalProcess($Label,$Program,$Arguments,$Directory) {
    $argsForProcess=@{FilePath=$Program;ArgumentList=$Arguments;WorkingDirectory=$Directory;WindowStyle='Hidden';PassThru=$true;RedirectStandardOutput=(Join-Path $state "$Label.out.log");RedirectStandardError=(Join-Path $state "$Label.err.log")}
    $process=Start-Process @argsForProcess
    Write-Output "$Label started (PID $($process.Id))"
}
function New-Token { return ([guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')) }
if((Port-IsOpen 5173) -and (Port-IsOpen 8080)){
    try {
        $website=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:5173/' -TimeoutSec 4
        $network=Invoke-RestMethod 'http://127.0.0.1:5173/api/public/config' -TimeoutSec 6
        if($website.Content.Contains('LandLedger') -and $network.chainId -eq 31337 -and $network.available){
            Write-Output 'LandLedger is running at http://127.0.0.1:5173/'
            return
        }
    }catch{}
    throw 'The preview ports are already in use. Check the existing services before starting a second instance.'
}
$mysql=Join-Path $MySqlHome 'bin/mysql.exe'
$mysqld=Join-Path $MySqlHome 'bin/mysqld.exe'
$jar=Join-Path $root 'backend/target/registry-1.0.0.jar'
$node=(Get-Command node.exe).Source
$java=(Get-Command java.exe).Source
if(!(Test-Path $jar) -or !(Test-Path 'node_modules/hardhat/internal/cli/cli.js')){throw 'Run npm ci and mvn -f backend/pom.xml package first.'}
if(!(Test-Path $mysqld)){throw 'Supply -MySqlHome pointing to your MySQL Server installation.'}
if(!(Test-Path $settingsPath)){
    $settings=[ordered]@{DB_PASSWORD=New-Token;MYSQL_ROOT_PASSWORD=New-Token;JWT_SECRET=New-Token;ADMIN_EMAIL='admin@landledger.local';ADMIN_PASSWORD=New-Token;DB_USER='landledger';DB_URL=''}
    $settings | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $settingsPath
}
$settings=Get-Content -Raw -LiteralPath $settingsPath | ConvertFrom-Json
$data=Join-Path $state 'mysql-data'
if(!(Port-IsOpen 33307)){
    $initArgs=@()
    if(!(Test-Path (Join-Path $data 'mysql'))){
        New-Item -ItemType Directory -Force $data | Out-Null
        & $mysqld --no-defaults --initialize-insecure "--basedir=$MySqlHome" "--datadir=$data"
        if($LASTEXITCODE){throw 'Could not initialize the private MySQL data directory.'}
        $init=Join-Path $state 'mysql-first-start.sql'
        $dbPassword=$settings.DB_PASSWORD.Replace("'","''")
        $rootPassword=$settings.MYSQL_ROOT_PASSWORD.Replace("'","''")
        @("ALTER USER 'root'@'localhost' IDENTIFIED BY '$rootPassword';","CREATE USER 'landledger'@'localhost' IDENTIFIED BY '$dbPassword';") | Set-Content -Encoding ASCII -LiteralPath $init
        $initArgs+=('--init-file="'+$init+'"')
    }
    Start-LocalProcess 'mysql' $mysqld (@('--no-defaults',('--basedir="'+$MySqlHome+'"'),('--datadir="'+$data+'"'),'--bind-address=127.0.0.1','--port=33307','--mysqlx=OFF','--console')+$initArgs) $root
    Wait-Port 33307
    if($initArgs.Count){Remove-Item -LiteralPath $init}
}
$chain=Join-Path $root 'blockchain'
if(!(Port-IsOpen 8545)){
    Start-LocalProcess 'ethereum' $node @('"../node_modules/hardhat/internal/cli/cli.js"','node','--hostname','127.0.0.1') $chain
    Wait-Port 8545
}
$client=(Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8545' -ContentType 'application/json' -Body '{"jsonrpc":"2.0","id":1,"method":"web3_clientVersion","params":[]}').result
if($client -notmatch 'HardhatNetwork'){throw 'The RPC port belongs to a different Ethereum client.'}
$deploymentPath=Join-Path $chain 'deployments/localhost.json'
$valid=$false
if(Test-Path $deploymentPath){
    $manifest=Get-Content -Raw -LiteralPath $deploymentPath | ConvertFrom-Json
    $query=@{jsonrpc='2.0';id=1;method='eth_getBlockByNumber';params=@(('0x'+([int]$manifest.startBlock).ToString('x')),$false)} | ConvertTo-Json
    $block=(Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:8545' -ContentType 'application/json' -Body $query).result
    $valid=$block -and $block.hash -eq $manifest.deploymentBlockHash
}
if(!$valid){
    & npm.cmd run chain:local
    if($LASTEXITCODE){throw 'Contract deployment failed.'}
    $manifest=Get-Content -Raw -LiteralPath $deploymentPath | ConvertFrom-Json
}
$binding=$manifest.deploymentBlockHash+' '+$manifest.address
$bindingFile=Join-Path $state 'preview-binding.txt'
if(!(Test-Path $bindingFile) -or (Get-Content -Raw $bindingFile).Trim() -ne $binding){
    $dbName='landledger_demo_'+$manifest.deploymentBlockHash.Substring(2,12)
    $sql="CREATE DATABASE IF NOT EXISTS $dbName; GRANT ALL ON $dbName.* TO 'landledger'@'localhost';"
    $env:MYSQL_PWD=$settings.MYSQL_ROOT_PASSWORD
    try {
        $sql | & $mysql --no-defaults --protocol=TCP -h 127.0.0.1 -P 33307 -u root
        if($LASTEXITCODE){throw 'Could not provision the demo database.'}
    } finally {Remove-Item Env:MYSQL_PWD -ErrorAction SilentlyContinue}
    $settings.DB_URL="jdbc:mysql://127.0.0.1:33307/${dbName}?serverTimezone=UTC"
    $settings | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath $settingsPath
    $binding | Set-Content -LiteralPath $bindingFile
}
$env:REGISTRY_NETWORK='localhost'
if(!(Port-IsOpen 8546)){Start-LocalProcess 'bridge' $node @('bridge.cjs') $chain;Wait-Port 8546}
foreach($key in 'DB_URL','DB_USER','DB_PASSWORD','JWT_SECRET','ADMIN_EMAIL','ADMIN_PASSWORD'){[Environment]::SetEnvironmentVariable($key,[string]$settings.$key,'Process')}
if(!(Port-IsOpen 8080)){Start-LocalProcess 'api' $java @('-jar',('"'+$jar+'"')) $root;Wait-Port 8080}
if(!(Port-IsOpen 5173)){Start-LocalProcess 'web' $node @('../node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5173','--strictPort') (Join-Path $root 'frontend');Wait-Port 5173}
$result=Invoke-RestMethod 'http://127.0.0.1:5173/api/public/config' -TimeoutSec 20
if(!$result.available -or $result.address -ne $manifest.address){throw 'Services started but the API has not verified the expected contract. Check .local logs.'}
Write-Output 'LandLedger is running at http://127.0.0.1:5173/'
Write-Output "Administrator credentials: $settingsPath"
