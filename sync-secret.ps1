$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

. (Join-Path $PSScriptRoot "setup-common.ps1")

$Strings = Merge-Strings @{
    en = @{
        Title            = "  Browser Control MCP - secret key"
        NotBuilt         = "[error] The server is not built yet: {0}"
        NotBuiltHint     = "        Run setup.ps1 first."
        CodeRegistered   = "  Claude Code      the MCP server is registered, its Secret Key will be refreshed"
        CodePending      = "  Claude Code      the MCP server is not registered yet, it will be added"
        DesktopReg       = "  Claude Desktop   the MCP server is registered, its Secret Key will be refreshed"
        DesktopPending   = "  Claude Desktop   the app is there but the MCP server is not registered, it will be added"
        NoticeHeading    = "  What happens after the Secret Key"
        NoticeDeskKill   = "  Claude Desktop will be closed by force. It reads this config only at startup"
        NoticeDeskKill2  = "  and rewrites the file on exit, so it cannot be running while the file is written."
        NoticeDeskIdle   = "  Claude Desktop is not running, so it only has to be started again afterwards."
        NoticeCodeOpen   = "  Claude Code sessions that are already open keep their old settings. Open a new"
        NoticeCodeOpen2  = "  session once this is done."
        NoticeNonStop    = "  Nothing else is asked from here on: the registration and the config file"
        NoticeNonStop2   = "  are written in one go."
        DeskClosing      = "  Closing Claude Desktop..."
        DeskClosed       = "  Claude Desktop      closed"
        DeskCloseFail    = "[error] Claude Desktop is still running. Quit it by hand and run this again."
        SecretHint1      = "Copy the Secret Key from the extension settings page and paste it here."
        SecretHint2      = "  about:addons - Browser Control MCP - Preferences - Secret Key - [Show]"
        SecretPrompt     = "Secret Key"
        SecretEmpty      = "[error] The Secret Key is empty."
        NotUuidWarn      = "[warning] That does not look like a UUID."
        NotUuidExample   = "          It usually looks like 148c4345-1398-4d16-b56c-4462847036bf."
        CodeHeading      = "  Claude Code"
        CodeRemoving     = "  Removing the old registration..."
        CodeAdding       = "  Registering..."
        CodeFailed       = "[error] Registration failed. Check the messages above."
        CodeVerify       = "  Verifying"
        DesktopHeading   = "  Claude Desktop"
        DesktopCreating  = "  Creating {0}"
        DesktopUpdating  = "  Updating {0}"
        DesktopBackup    = "  The previous file was backed up as {0}"
        DesktopBadJson   = "[error] The existing config file is not valid JSON, so it was left alone."
        DesktopBadJsonAt = "        {0}"
        DesktopDone      = "  browser-control was written into mcpServers."
        DesktopRestart   = "  Claude Desktop has to be restarted to pick it up."
        ShadowRemoved    = "  The shadowed config at {0} does not match this install, so it was backed up and removed."
        DxtBuilding      = "  Building the DXT package as a fallback..."
        DxtDone          = "  Built {0}"
        DxtHint          = "  Open that file with Claude Desktop if the entry above does not take effect."
        DxtFailed        = "[warning] The DXT build failed. The config entry above is what matters, so this is not fatal."
        DoneBody1        = "  Sessions that are already open will not see this."
        DoneBody2        = "  Open a new session for the tools to appear."
        DoneBody3        = "  Several sessions at once are fine. If the base port is taken the server"
        DoneBody4        = "  claims a free port above {0} on its own, and the extension follows."
    }
    ko = @{
        Title            = "  Browser Control MCP - Secret Key"
        NotBuilt         = "[오류] 서버가 아직 빌드되지 않았습니다: {0}"
        NotBuiltHint     = "       setup.ps1 을 먼저 실행하세요."
        CodeRegistered   = "  Claude Code      MCP 서버가 등록돼 있습니다, Secret Key 를 갱신합니다"
        CodePending      = "  Claude Code      MCP 서버가 등록돼 있지 않습니다, 새로 등록합니다"
        DesktopReg       = "  Claude Desktop   MCP 서버가 등록돼 있습니다, Secret Key 를 갱신합니다"
        DesktopPending   = "  Claude Desktop   앱은 있으나 MCP 서버가 등록돼 있지 않습니다, 새로 등록합니다"
        NoticeHeading    = "  Secret Key 다음에 일어나는 일"
        NoticeDeskKill   = "  Claude Desktop 을 강제로 종료합니다. 이 설정은 앱이 켜질 때만 읽히고 종료할 때"
        NoticeDeskKill2  = "  앱이 파일을 다시 쓰기 때문에, 살아 있는 앱에는 쓸 수 없습니다."
        NoticeDeskIdle   = "  Claude Desktop 은 실행 중이 아니어서, 끝난 뒤 다시 켜기만 하면 됩니다."
        NoticeCodeOpen   = "  이미 열려 있는 Claude Code 세션은 예전 설정을 그대로 씁니다. 끝난 뒤에 새 세션을"
        NoticeCodeOpen2  = "  열어야 반영됩니다."
        NoticeNonStop    = "  여기서부터는 아무것도 묻지 않습니다. 등록과 설정 파일 기록을"
        NoticeNonStop2   = "  한 번에 진행합니다."
        DeskClosing      = "  Claude Desktop 을 종료하는 중..."
        DeskClosed       = "  Claude Desktop   종료했습니다"
        DeskCloseFail    = "[오류] Claude Desktop 이 아직 살아 있습니다. 직접 종료한 뒤 다시 실행하세요."
        SecretHint1      = "확장의 설정 페이지에서 Secret Key 를 복사해 붙여 넣으세요."
        SecretHint2      = "  about:addons - Browser Control MCP - 설정 - Secret Key - [보기]"
        SecretPrompt     = "Secret Key"
        SecretEmpty      = "[오류] Secret Key 가 비어 있습니다."
        NotUuidWarn      = "[경고] 입력한 값이 UUID 형태가 아닙니다."
        NotUuidExample   = "       보통 148c4345-1398-4d16-b56c-4462847036bf 같은 모양입니다."
        CodeHeading      = "  Claude Code"
        CodeRemoving     = "  기존 등록을 지우는 중..."
        CodeAdding       = "  등록하는 중..."
        CodeFailed       = "[오류] 등록에 실패했습니다. 위의 메시지를 확인하세요."
        CodeVerify       = "  확인"
        DesktopHeading   = "  Claude Desktop"
        DesktopCreating  = "  {0} 을 새로 만드는 중"
        DesktopUpdating  = "  {0} 을 고치는 중"
        DesktopBackup    = "  이전 파일은 {0} 로 백업했습니다"
        DesktopBadJson   = "[오류] 기존 설정 파일이 올바른 JSON 이 아니라 손대지 않았습니다."
        DesktopBadJsonAt = "       {0}"
        DesktopDone      = "  mcpServers 에 browser-control 을 적었습니다."
        DesktopRestart   = "  Claude Desktop 을 다시 켜야 반영됩니다."
        ShadowRemoved    = "  이 설치와 맞지 않는 설정 {0} 은 백업한 뒤 지웠습니다."
        DxtBuilding      = "  대안으로 쓸 DXT 패키지를 만드는 중..."
        DxtDone          = "  {0} 을 만들었습니다"
        DxtHint          = "  위 설정이 먹히지 않으면 이 파일을 Claude Desktop 으로 여세요."
        DxtFailed        = "[경고] DXT 빌드에 실패했습니다. 중요한 것은 위의 설정 기록이라 치명적이지 않습니다."
        DoneBody1        = "  이미 열려 있던 세션에는 반영되지 않습니다."
        DoneBody2        = "  새 세션을 열어야 도구가 잡힙니다."
        DoneBody3        = "  세션을 여러 개 열어도 됩니다. 기준 포트가 막혀 있으면 서버가"
        DoneBody4        = "  {0} 위쪽의 빈 포트를 알아서 잡고, 확장이 따라 붙습니다."
    }
}

$T = $Strings.en

function Read-DesktopConfig($path) {
    if (-not (Test-Path $path)) {
        return $null
    }
    $raw = Get-Content $path -Raw -Encoding UTF8
    if ([string]::IsNullOrWhiteSpace($raw)) {
        return (New-Object PSObject)
    }
    try {
        return ($raw | ConvertFrom-Json)
    }
    catch {
        return "invalid"
    }
}

$T = Select-Language $Strings

Write-Host ""
Write-Rule
Write-Host $T.Title -ForegroundColor Cyan
Write-Rule

if (-not (Test-Path $serverPath)) {
    Write-Host ""
    Write-Host ($T.NotBuilt -f $serverPath) -ForegroundColor Red
    Write-Host $T.NotBuiltHint
    Exit-With 1
}

Write-Host ""
Write-Host $T.DetectHeading
Write-Host ""

$wantsCode = [bool](Get-Command claude -ErrorAction SilentlyContinue)
$codeRegistered = $false

if ($wantsCode) {
    $codeRegistered = (Invoke-Native "claude" @("mcp", "get", "browser-control") -Quiet) -eq 0
}
else {
    Write-Host $T.CodeMissing -ForegroundColor Yellow
}

$desktopPaths = Resolve-DesktopPaths
$desktopConfigPath = $desktopPaths.Config
$desktopConfig = $null
$wantsDesktop = Test-DesktopPresent $desktopPaths
$desktopRegistered = $false

if ($wantsDesktop) {
    $desktopConfig = Read-DesktopConfig $desktopConfigPath
    if ($desktopConfig -is [string] -and $desktopConfig -eq "invalid") {
        Write-Host ""
        Write-Host $T.DesktopBadJson -ForegroundColor Red
        Write-Host ($T.DesktopBadJsonAt -f $desktopConfigPath)
        Exit-With 1
    }

    if ($desktopConfig -and ($desktopConfig.PSObject.Properties.Name -contains "mcpServers")) {
        if ($desktopConfig.mcpServers.PSObject.Properties.Name -contains "browser-control") {
            $desktopRegistered = $true
        }
    }
}
else {
    Write-Host $T.DesktopMissing -ForegroundColor Yellow
}

$claudeProcesses = Get-ClaudeProcesses
$codeRunning = $claudeProcesses.Code
$deskRunning = $claudeProcesses.Desktop

Write-Host ""
Write-Rule
Write-Host $T.StatusHeading -ForegroundColor Cyan
Write-Rule
Write-Host ""

if ($wantsCode) {
    if ($codeRegistered) {
        Write-Host $T.CodeRegistered -ForegroundColor Green
    }
    else {
        Write-Host $T.CodePending -ForegroundColor Green
    }
    if ($codeRunning.Count -gt 0) {
        Write-Host ($T.StatusRunning -f $codeRunning.Count) -ForegroundColor Yellow
    }
}
else {
    Write-Host $T.StatusCodeNone -ForegroundColor DarkGray
}

if ($wantsDesktop) {
    if ($desktopRegistered) {
        Write-Host $T.DesktopReg -ForegroundColor Green
    }
    else {
        Write-Host $T.DesktopPending -ForegroundColor Green
    }
    Write-Host ($T.DesktopConfigAt -f $desktopConfigPath) -ForegroundColor DarkGray
    if ($deskRunning.Count -gt 0) {
        Write-Host ($T.StatusRunning -f $deskRunning.Count) -ForegroundColor Yellow
    }
}
else {
    Write-Host $T.StatusDeskNone -ForegroundColor DarkGray
}

if (-not $wantsCode -and -not $wantsDesktop) {
    Write-Host ""
    Write-Rule
    Write-Host $T.NothingToDo -ForegroundColor Yellow
    Write-Host $T.NothingHint
    Write-Rule
    Exit-With 0
}

Write-Host ""
Write-Rule
Write-Host $T.NoticeHeading -ForegroundColor Cyan
Write-Rule
Write-Host ""

if ($wantsDesktop) {
    if ($deskRunning.Count -gt 0) {
        Write-Host $T.NoticeDeskKill -ForegroundColor Yellow
        Write-Host $T.NoticeDeskKill2 -ForegroundColor Yellow
    }
    else {
        Write-Host $T.NoticeDeskIdle
    }
}

if ($wantsCode) {
    Write-Host $T.NoticeCodeOpen
    Write-Host $T.NoticeCodeOpen2
}

Write-Host ""
Write-Host $T.NoticeNonStop
Write-Host $T.NoticeNonStop2

Write-Host ""
Write-Host $T.SecretHint1
Write-Host $T.SecretHint2 -ForegroundColor DarkGray
Write-Host ""

$secretBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR(
    (Read-Host $T.SecretPrompt -AsSecureString))
try {
    $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretBstr).Trim()
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretBstr)
}

if ([string]::IsNullOrWhiteSpace($secret)) {
    Write-Host ""
    Write-Host $T.SecretEmpty -ForegroundColor Red
    Exit-With 1
}

if ($secret -notmatch '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$') {
    Write-Host ""
    Write-Host $T.NotUuidWarn -ForegroundColor Yellow
    Write-Host $T.NotUuidExample
}

if ($wantsDesktop -and $deskRunning.Count -gt 0) {
    Write-Host ""
    Write-Host $T.DeskClosing
    foreach ($proc in $deskRunning) {
        try { Stop-Process -Id $proc.Id -Force -ErrorAction Stop } catch {}
    }
    # The config is rewritten on exit, so writing before every process is gone loses it.
    $deadline = (Get-Date).AddSeconds(15)
    while ((Get-Date) -lt $deadline) {
        $left = @(Get-Process -Name claude -ErrorAction SilentlyContinue |
            Where-Object { $_.Id -in $deskRunning.Id })
        if ($left.Count -eq 0) { break }
        Start-Sleep -Milliseconds 500
    }
    $left = @(Get-Process -Name claude -ErrorAction SilentlyContinue |
        Where-Object { $_.Id -in $deskRunning.Id })
    if ($left.Count -gt 0) {
        Write-Host ""
        Write-Host $T.DeskCloseFail -ForegroundColor Red
        Exit-With 1
    }
    Write-Host $T.DeskClosed
}

if ($wantsCode) {
    Write-Host ""
    Write-Rule
    Write-Host $T.CodeHeading -ForegroundColor Cyan
    Write-Rule

    if ($codeRegistered) {
        Write-Host $T.CodeRemoving
        Invoke-Native "claude" @("mcp", "remove", "browser-control", "-s", "user") -Quiet | Out-Null
    }

    Write-Host $T.CodeAdding

    $added = Invoke-Native "claude" @(
        "mcp", "add", "browser-control",
        "--scope", "user",
        "--env", "EXTENSION_SECRET=$secret",
        "--", "node", $serverArg
    ) -Redact $secret
    if ($added -ne 0) {
        Write-Host ""
        Write-Host $T.CodeFailed -ForegroundColor Red
        Exit-With 1
    }

    Write-Host ""
    Write-Host $T.CodeVerify
    Invoke-Native "claude" @("mcp", "get", "browser-control") -Redact $secret | Out-Null
}

if ($wantsDesktop) {
    Write-Host ""
    Write-Rule
    Write-Host $T.DesktopHeading -ForegroundColor Cyan
    Write-Rule

    if (Test-Path $desktopConfigPath) {
        Write-Host ($T.DesktopUpdating -f $desktopConfigPath)
        $backupPath = "$desktopConfigPath.bak"
        Copy-Item $desktopConfigPath $backupPath -Force
        Write-Host ($T.DesktopBackup -f $backupPath)
    }
    else {
        Write-Host ($T.DesktopCreating -f $desktopConfigPath)
        if (-not (Test-Path $desktopPaths.Dir)) {
            New-Item -ItemType Directory -Path $desktopPaths.Dir -Force | Out-Null
        }
    }

    if (-not $desktopConfig) {
        $desktopConfig = New-Object PSObject
    }
    if (-not ($desktopConfig.PSObject.Properties.Name -contains "mcpServers")) {
        $desktopConfig | Add-Member -MemberType NoteProperty -Name "mcpServers" -Value (New-Object PSObject)
    }

    $entry = [PSCustomObject]@{
        command = "node"
        args    = @($serverArg)
        env     = [PSCustomObject]@{
            EXTENSION_SECRET = $secret
        }
    }

    if ($desktopConfig.mcpServers.PSObject.Properties.Name -contains "browser-control") {
        $desktopConfig.mcpServers."browser-control" = $entry
    }
    else {
        $desktopConfig.mcpServers | Add-Member -MemberType NoteProperty -Name "browser-control" -Value $entry
    }

    $json = $desktopConfig | ConvertTo-Json -Depth 10
    [System.IO.File]::WriteAllText($desktopConfigPath, $json, (New-Object System.Text.UTF8Encoding($false)))

    Write-Host $T.DesktopDone
    Write-Host $T.DesktopRestart

    if ($desktopPaths.Packaged) {
        $shadowPath = Join-Path (Join-Path $env:APPDATA "Claude") "claude_desktop_config.json"
        if (Test-Path $shadowPath) {
            Copy-Item $shadowPath "$shadowPath.bak" -Force
            Remove-Item $shadowPath -Force
            Write-Host ($T.ShadowRemoved -f $shadowPath)
        }
    }

    if (Get-Command npx -ErrorAction SilentlyContinue) {
        Write-Host ""
        Write-Host $T.DxtBuilding
        $startedAt = Get-Date
        Push-Location $serverDir
        try {
            Invoke-Native "npx" @("--yes", "@anthropic-ai/dxt", "pack") -Quiet | Out-Null
        }
        finally {
            Pop-Location
        }
        # A freshly written package is the only signal npx cannot get wrong.
        $built = Get-ChildItem $serverDir -Filter "*.dxt" -ErrorAction SilentlyContinue |
            Where-Object { $_.LastWriteTime -ge $startedAt } |
            Sort-Object LastWriteTime -Descending |
            Select-Object -First 1
        if ($built) {
            Write-Host ($T.DxtDone -f $built.FullName)
            Write-Host $T.DxtHint
        }
        else {
            Write-Host $T.DxtFailed -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Rule
Write-Host $T.DoneHeading -ForegroundColor Green
Write-Host ""
if ($wantsCode) {
    Write-Host $T.DoneBody1
    Write-Host $T.DoneBody2
    Write-Host ""
}
Write-Host $T.DoneBody3
Write-Host ($T.DoneBody4 -f $port)
Write-Rule
Exit-With 0
