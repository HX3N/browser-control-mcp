$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $repoRoot "mcp-server\dist\server.js"
$serverArg = ($serverPath -replace '\\', '/')
$serverDir = Join-Path $repoRoot "mcp-server"
$extensionDir = Join-Path $repoRoot "firefox-extension"
$extensionBundle = Join-Path $extensionDir "dist\background.js"
$port = "8089"

$Strings = @{
    en = @{
        Title            = "  Browser Control MCP - setup"
        LanguagePrompt   = "Language / 언어  [1] English  [2] 한국어"
        BuildHeading     = "  Checking the build"
        BuildReady       = "  Build            the MCP server and the extension are ready"
        BuildNeeded      = "  Build            not built yet, building now"
        NodeMissing      = "  Node.js          npm is not on PATH"
        NodeInstallAsk   = "Install Node.js LTS now? (y/N)"
        NodeInstallSkip  = "  Node.js          skipped"
        NodeInstalling   = "  Installing Node.js LTS with winget..."
        NodeInstallFail  = "[error] npm is still not on PATH. Open a new terminal and run this again."
        DepsInstalling   = "  Installing the dependencies (npm install)..."
        DepsFailed       = "[error] npm install failed. Check the messages above."
        Building         = "  Building (npm run build)..."
        BuildFailed      = "[error] npm run build failed. Check the messages above."
        BuildMissing     = "[error] The build finished but this is still missing: {0}"
        DetectHeading    = "  Looking for the clients"
        CodeMissing      = "  Claude Code      the CLI is not on PATH"
        CodeInstallAsk   = "Install Claude Code now? (y/N)"
        CodeInstallSkip  = "  Claude Code      skipped"
        CodeInstalling   = "  Installing Claude Code with winget..."
        CodeInstallNpm   = "  winget did not work, falling back to npm -g..."
        CodeInstallFail  = "[error] Claude Code is still not on PATH. Open a new terminal and run this again."
        CodeRegistered   = "  Claude Code      the MCP server is registered, its Secret Key will be refreshed"
        CodePending      = "  Claude Code      the MCP server is not registered yet, it will be added"
        DesktopMissing   = "  Claude Desktop   the app is not installed"
        DesktopInstAsk   = "Install Claude Desktop now? (y/N)"
        DesktopInstSkip  = "  Claude Desktop   skipped"
        DesktopInstNow   = "  Installing Claude Desktop with winget..."
        DesktopLaunch    = "[warning] Claude Desktop has to be started once before its config folder exists."
        DesktopLaunch2   = "          Launch it, close it, then run this again."
        NoWinget         = "[error] winget was not found, so nothing can be installed automatically."
        NoWingetHint     = "        Install from https://claude.ai/download and run this again."
        DesktopReg       = "  Claude Desktop   the MCP server is registered, its Secret Key will be refreshed"
        DesktopPending   = "  Claude Desktop   the app is there but the MCP server is not registered, it will be added"
        DesktopConfigAt  = "                   config: {0}"
        NothingToDo      = "  Neither client is available, so there is nothing to register."
        NothingHint      = "  Install Claude Code or Claude Desktop first, then run this again."
        RunningWarn      = "[warning] Claude Code is running ({0} process(es))."
        RunningBody1     = "        A running session can rewrite its settings later and drop what you"
        RunningBody2     = "        register now. Closing every Claude Code window and the VSCode Claude"
        RunningBody3     = "        panel before running this is recommended."
        DeskRunWarn      = "[warning] Claude Desktop is running ({0} process(es))."
        DeskRunBody1     = "        It reads this config only at startup, and it rewrites the file on exit,"
        DeskRunBody2     = "        which can drop what is registered now. Quit it fully, run this again,"
        DeskRunBody3     = "        then start it."
        ContinueQuestion = "Continue anyway? (y/N)"
        Cancelled        = "Cancelled."
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
        DxtBuilding      = "  Building the DXT package as a fallback..."
        DxtDone          = "  Built {0}"
        DxtHint          = "  Open that file with Claude Desktop if the entry above does not take effect."
        DxtFailed        = "[warning] The DXT build failed. The config entry above is what matters, so this is not fatal."
        DoneHeading      = "  Finished."
        DoneBody1        = "  Sessions that are already open will not see this."
        DoneBody2        = "  Open a new session for the tools to appear."
        DoneBody3        = "  Several sessions at once are fine. If the base port is taken the server"
        DoneBody4        = "  claims a free port above {0} on its own, and the extension follows."
        PressEnter       = "Press Enter to close this window"
    }
    ko = @{
        Title            = "  Browser Control MCP - 설치"
        LanguagePrompt   = "Language / 언어  [1] English  [2] 한국어"
        BuildHeading     = "  빌드를 확인하는 중"
        BuildReady       = "  빌드             MCP 서버와 확장이 준비돼 있습니다"
        BuildNeeded      = "  빌드             아직 빌드되지 않아 지금 빌드합니다"
        NodeMissing      = "  Node.js          npm 을 PATH 에서 찾지 못했습니다"
        NodeInstallAsk   = "Node.js LTS 를 지금 설치할까요? (y/N)"
        NodeInstallSkip  = "  Node.js          건너뜁니다"
        NodeInstalling   = "  winget 으로 Node.js LTS 를 설치하는 중..."
        NodeInstallFail  = "[오류] npm 이 여전히 PATH 에 없습니다. 새 터미널에서 다시 실행하세요."
        DepsInstalling   = "  의존성을 설치하는 중 (npm install)..."
        DepsFailed       = "[오류] npm install 이 실패했습니다. 위 메시지를 확인하세요."
        Building         = "  빌드하는 중 (npm run build)..."
        BuildFailed      = "[오류] npm run build 가 실패했습니다. 위 메시지를 확인하세요."
        BuildMissing     = "[오류] 빌드가 끝났는데도 이 파일이 없습니다: {0}"
        DetectHeading    = "  클라이언트를 찾는 중"
        CodeMissing      = "  Claude Code      CLI 를 PATH 에서 찾지 못했습니다"
        CodeInstallAsk   = "Claude Code 를 지금 설치할까요? (y/N)"
        CodeInstallSkip  = "  Claude Code      건너뜁니다"
        CodeInstalling   = "  winget 으로 Claude Code 를 설치하는 중..."
        CodeInstallNpm   = "  winget 이 안 되어 npm -g 로 다시 시도합니다..."
        CodeInstallFail  = "[오류] Claude Code 가 여전히 PATH 에 없습니다. 새 터미널에서 다시 실행하세요."
        CodeRegistered   = "  Claude Code      MCP 서버가 등록돼 있습니다, Secret Key 를 갱신합니다"
        CodePending      = "  Claude Code      MCP 서버가 등록돼 있지 않습니다, 새로 등록합니다"
        DesktopMissing   = "  Claude Desktop   앱이 설치되어 있지 않습니다"
        DesktopInstAsk   = "Claude Desktop 을 지금 설치할까요? (y/N)"
        DesktopInstSkip  = "  Claude Desktop   건너뜁니다"
        DesktopInstNow   = "  winget 으로 Claude Desktop 을 설치하는 중..."
        DesktopLaunch    = "[경고] Claude Desktop 은 한 번 실행해야 설정 폴더가 만들어집니다."
        DesktopLaunch2   = "       한 번 켰다 끈 뒤에 이 스크립트를 다시 실행하세요."
        NoWinget         = "[오류] winget 을 찾지 못해 자동 설치를 할 수 없습니다."
        NoWingetHint     = "       https://claude.ai/download 에서 설치한 뒤 다시 실행하세요."
        DesktopReg       = "  Claude Desktop   MCP 서버가 등록돼 있습니다, Secret Key 를 갱신합니다"
        DesktopPending   = "  Claude Desktop   앱은 있으나 MCP 서버가 등록돼 있지 않습니다, 새로 등록합니다"
        DesktopConfigAt  = "                   설정 파일: {0}"
        NothingToDo      = "  쓸 수 있는 클라이언트가 없어 등록할 것이 없습니다."
        NothingHint      = "  Claude Code 나 Claude Desktop 을 먼저 설치한 뒤 다시 실행하세요."
        RunningWarn      = "[경고] Claude Code 가 실행 중입니다 (프로세스 {0}개)."
        RunningBody1     = "       실행 중인 세션이 나중에 설정 파일을 다시 쓰면서 지금 등록한 내용을"
        RunningBody2     = "       지워 버릴 수 있습니다. VSCode 의 Claude 패널과 모든 Claude Code 창을"
        RunningBody3     = "       닫은 뒤에 다시 실행하는 것을 권합니다."
        DeskRunWarn      = "[경고] Claude Desktop 이 실행 중입니다 (프로세스 {0}개)."
        DeskRunBody1     = "       이 설정은 앱이 켜질 때만 읽히고, 종료할 때 앱이 파일을 다시 쓰면서"
        DeskRunBody2     = "       지금 등록한 내용을 지울 수 있습니다. 완전히 종료한 뒤 이 스크립트를"
        DeskRunBody3     = "       다시 돌리고, 그다음에 켜는 순서를 권합니다."
        ContinueQuestion = "그래도 계속할까요? (y/N)"
        Cancelled        = "취소했습니다."
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
        DxtBuilding      = "  대안으로 쓸 DXT 패키지를 만드는 중..."
        DxtDone          = "  {0} 을 만들었습니다"
        DxtHint          = "  위 설정이 먹히지 않으면 이 파일을 Claude Desktop 으로 여세요."
        DxtFailed        = "[경고] DXT 빌드에 실패했습니다. 중요한 것은 위의 설정 기록이라 치명적이지 않습니다."
        DoneHeading      = "  끝났습니다."
        DoneBody1        = "  이미 열려 있던 세션에는 반영되지 않습니다."
        DoneBody2        = "  새 세션을 열어야 도구가 잡힙니다."
        DoneBody3        = "  세션을 여러 개 열어도 됩니다. 기준 포트가 막혀 있으면 서버가"
        DoneBody4        = "  {0} 위쪽의 빈 포트를 알아서 잡고, 확장이 따라 붙습니다."
        PressEnter       = "엔터를 누르면 창이 닫힙니다"
    }
}

$T = $Strings.en

function Write-Rule {
    Write-Host ("=" * 60) -ForegroundColor DarkGray
}

function Exit-With($code) {
    Write-Host ""
    Read-Host $T.PressEnter | Out-Null
    exit $code
}

function Confirm-Yes($question) {
    Write-Host ""
    $answer = Read-Host $question
    return ($answer -eq "y" -or $answer -eq "Y")
}

function Confirm-Continue {
    if (-not (Confirm-Yes $T.ContinueQuestion)) {
        Write-Host ""
        Write-Host $T.Cancelled
        Exit-With 0
    }
    Write-Host ""
}

# node ships npm.ps1 / npx.ps1 alongside the .cmd shims, and PowerShell picks the .ps1 first.
# Those return 1 even on success, so the .cmd has to be addressed by name.
function Resolve-Native($name) {
    $found = Get-Command $name -All -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandType -eq "Application" -and $_.Source -match '\.(cmd|bat|exe)$' } |
        Select-Object -First 1
    if ($found) {
        return $found.Source
    }
    return $name
}

function Invoke-Native {
    param([string]$File, [string[]]$Arguments, [switch]$Quiet, [string]$Redact)

    $target = Resolve-Native $File
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        $output = & $target @Arguments 2>&1
        $code = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }
    if (-not $Quiet) {
        $output | ForEach-Object {
            $line = "$_"
            if ($Redact) {
                $line = $line.Replace($Redact, "********")
            }
            Write-Host $line
        }
    }
    return $code
}

function Update-PathFromRegistry {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = @($machine, $user) -join ";"
}

# The Store build is MSIX, and MSIX redirects %APPDATA% into the package container: a file
# written to the plain %APPDATA%\Claude path is shadowed and the app never reads it.
function Resolve-DesktopPaths {
    $package = Get-ChildItem (Join-Path $env:LOCALAPPDATA "Packages") -Directory -Force -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -like "Claude_*" } |
        Select-Object -First 1

    if ($package) {
        $dir = Join-Path $package.FullName "LocalCache\Roaming\Claude"
        return [PSCustomObject]@{ Packaged = $true; Dir = $dir; Config = (Join-Path $dir "claude_desktop_config.json") }
    }

    $dir = Join-Path $env:APPDATA "Claude"
    return [PSCustomObject]@{ Packaged = $false; Dir = $dir; Config = (Join-Path $dir "claude_desktop_config.json") }
}

function Test-DesktopPresent($paths) {
    if ($paths.Packaged) {
        return $true
    }
    if (Test-Path $paths.Config) {
        return $true
    }
    $exes = @(
        (Join-Path $env:LOCALAPPDATA "AnthropicClaude\claude.exe"),
        (Join-Path $env:LOCALAPPDATA "AnthropicClaude\app-*\claude.exe"),
        (Join-Path $env:LOCALAPPDATA "Programs\Claude\Claude.exe")
    )
    foreach ($exe in $exes) {
        if (Test-Path $exe) {
            return $true
        }
    }
    return $false
}

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

Write-Host ""
Write-Rule
Write-Host "  Browser Control MCP" -ForegroundColor Cyan
Write-Rule
Write-Host ""

$language = (Read-Host $T.LanguagePrompt).Trim()
if ($language -eq "2") {
    $T = $Strings.ko
}

Write-Host ""
Write-Rule
Write-Host $T.Title -ForegroundColor Cyan
Write-Rule

$hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)

Write-Host ""
Write-Host $T.BuildHeading
Write-Host ""

$needsDeps = @($repoRoot, $serverDir, $extensionDir) |
    Where-Object { -not (Test-Path (Join-Path $_ "node_modules")) } |
    Select-Object -First 1
$needsDeps = [bool]$needsDeps
$needsBuild = (-not (Test-Path $serverPath)) -or (-not (Test-Path $extensionBundle))

if (-not ($needsDeps -or $needsBuild)) {
    Write-Host $T.BuildReady -ForegroundColor Green
}
else {
    Write-Host $T.BuildNeeded -ForegroundColor Yellow

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        Write-Host $T.NodeMissing -ForegroundColor Yellow
        if (Confirm-Yes $T.NodeInstallAsk) {
            if ($hasWinget) {
                Write-Host $T.NodeInstalling
                Invoke-Native "winget" @(
                    "install", "--id", "OpenJS.NodeJS.LTS", "-e",
                    "--accept-package-agreements", "--accept-source-agreements"
                ) | Out-Null
            }
            else {
                Write-Host $T.NoWinget -ForegroundColor Red
            }
            Update-PathFromRegistry
        }
        else {
            Write-Host $T.NodeInstallSkip -ForegroundColor DarkGray
        }
        if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
            Write-Host ""
            Write-Host $T.NodeInstallFail -ForegroundColor Red
            Exit-With 1
        }
    }

    Push-Location $repoRoot
    try {
        if ($needsDeps) {
            Write-Host ""
            Write-Host $T.DepsInstalling
            if ((Invoke-Native "npm" @("install")) -ne 0) {
                Write-Host ""
                Write-Host $T.DepsFailed -ForegroundColor Red
                Exit-With 1
            }
        }
        Write-Host ""
        Write-Host $T.Building
        if ((Invoke-Native "npm" @("run", "build")) -ne 0) {
            Write-Host ""
            Write-Host $T.BuildFailed -ForegroundColor Red
            Exit-With 1
        }
    }
    finally {
        Pop-Location
    }

    foreach ($artifact in @($serverPath, $extensionBundle)) {
        if (-not (Test-Path $artifact)) {
            Write-Host ""
            Write-Host ($T.BuildMissing -f $artifact) -ForegroundColor Red
            Exit-With 1
        }
    }
}

Write-Host ""
Write-Host $T.DetectHeading
Write-Host ""

$hasCodeCli = [bool](Get-Command claude -ErrorAction SilentlyContinue)

if (-not $hasCodeCli) {
    Write-Host $T.CodeMissing -ForegroundColor Yellow
    if (Confirm-Yes $T.CodeInstallAsk) {
        $installed = $false
        if ($hasWinget) {
            Write-Host $T.CodeInstalling
            $installed = (Invoke-Native "winget" @(
                    "install", "--id", "Anthropic.ClaudeCode", "-e",
                    "--accept-package-agreements", "--accept-source-agreements"
                )) -eq 0
        }
        if (-not $installed -and (Get-Command npm -ErrorAction SilentlyContinue)) {
            Write-Host $T.CodeInstallNpm
            Invoke-Native "npm" @("install", "-g", "@anthropic-ai/claude-code") | Out-Null
        }
        Update-PathFromRegistry
        $hasCodeCli = [bool](Get-Command claude -ErrorAction SilentlyContinue)
        Write-Host ""
        if (-not $hasCodeCli) {
            Write-Host $T.CodeInstallFail -ForegroundColor Red
        }
    }
    else {
        Write-Host $T.CodeInstallSkip -ForegroundColor DarkGray
    }
}

$wantsCode = $hasCodeCli
$codeRegistered = $false

if ($hasCodeCli) {
    $codeRegistered = (Invoke-Native "claude" @("mcp", "get", "browser-control") -Quiet) -eq 0
    if ($codeRegistered) {
        Write-Host $T.CodeRegistered -ForegroundColor Green
    }
    else {
        Write-Host $T.CodePending -ForegroundColor Green
    }
}

$desktopPaths = Resolve-DesktopPaths
$hasDesktop = Test-DesktopPresent $desktopPaths

if (-not $hasDesktop) {
    Write-Host $T.DesktopMissing -ForegroundColor Yellow
    if (Confirm-Yes $T.DesktopInstAsk) {
        if ($hasWinget) {
            Write-Host $T.DesktopInstNow
            Invoke-Native "winget" @(
                "install", "--id", "Anthropic.Claude", "-e",
                "--accept-package-agreements", "--accept-source-agreements"
            ) | Out-Null
            $desktopPaths = Resolve-DesktopPaths
            $hasDesktop = Test-DesktopPresent $desktopPaths
            Write-Host ""
            if (-not $hasDesktop) {
                Write-Host $T.DesktopLaunch -ForegroundColor Yellow
                Write-Host $T.DesktopLaunch2
            }
        }
        else {
            Write-Host ""
            Write-Host $T.NoWinget -ForegroundColor Red
            Write-Host $T.NoWingetHint
        }
    }
    else {
        Write-Host $T.DesktopInstSkip -ForegroundColor DarkGray
    }
}

$desktopConfigPath = $desktopPaths.Config
$desktopConfig = $null
$wantsDesktop = $false

if ($hasDesktop) {
    $desktopConfig = Read-DesktopConfig $desktopConfigPath
    if ($desktopConfig -is [string] -and $desktopConfig -eq "invalid") {
        Write-Host ""
        Write-Host $T.DesktopBadJson -ForegroundColor Red
        Write-Host ($T.DesktopBadJsonAt -f $desktopConfigPath)
        Exit-With 1
    }

    $wantsDesktop = $true
    $alreadyThere = $false
    if ($desktopConfig -and ($desktopConfig.PSObject.Properties.Name -contains "mcpServers")) {
        if ($desktopConfig.mcpServers.PSObject.Properties.Name -contains "browser-control") {
            $alreadyThere = $true
        }
    }

    if ($alreadyThere) {
        Write-Host $T.DesktopReg -ForegroundColor Green
    }
    else {
        Write-Host $T.DesktopPending -ForegroundColor Green
    }
    Write-Host ($T.DesktopConfigAt -f $desktopConfigPath) -ForegroundColor DarkGray
}

if (-not $wantsCode -and -not $wantsDesktop) {
    Write-Host ""
    Write-Rule
    Write-Host $T.NothingToDo -ForegroundColor Yellow
    Write-Host $T.NothingHint
    Write-Rule
    Exit-With 0
}

$claudeProcesses = @(Get-Process -Name claude -ErrorAction SilentlyContinue)

if ($wantsCode) {
    $running = @($claudeProcesses | Where-Object { $_.Path -notlike "*WindowsApps*" })
    if ($running.Count -gt 0) {
        Write-Host ""
        Write-Host ($T.RunningWarn -f $running.Count) -ForegroundColor Yellow
        Write-Host ""
        Write-Host $T.RunningBody1
        Write-Host $T.RunningBody2
        Write-Host $T.RunningBody3
        Confirm-Continue
    }
}

if ($wantsDesktop) {
    $deskRunning = @($claudeProcesses | Where-Object { $_.Path -like "*WindowsApps*" -or $_.Path -like "*AnthropicClaude*" -or $_.Path -like "*Programs\Claude*" })
    if ($deskRunning.Count -gt 0) {
        Write-Host ""
        Write-Host ($T.DeskRunWarn -f $deskRunning.Count) -ForegroundColor Yellow
        Write-Host ""
        Write-Host $T.DeskRunBody1
        Write-Host $T.DeskRunBody2
        Write-Host $T.DeskRunBody3
        Confirm-Continue
    }
}

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
    Confirm-Continue
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
