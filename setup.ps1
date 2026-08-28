$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

. (Join-Path $PSScriptRoot "setup-common.ps1")

$Strings = Merge-Strings @{
    en = @{
        Title            = "  Browser Control MCP - install"
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
        CodeInstallAsk   = "Install Claude Code now? (y/N)"
        CodeInstallSkip  = "  Claude Code      skipped"
        CodeInstalling   = "  Installing Claude Code with winget..."
        CodeInstallNpm   = "  winget did not work, falling back to npm -g..."
        CodeInstallFail  = "[error] Claude Code is still not on PATH. Open a new terminal and run this again."
        CodeReady        = "  Claude Code      found"
        DesktopInstAsk   = "Install Claude Desktop now? (y/N)"
        DesktopInstSkip  = "  Claude Desktop   skipped"
        DesktopInstNow   = "  Installing Claude Desktop with winget..."
        DesktopLaunch    = "[warning] Claude Desktop has to be started once before its config folder exists."
        DesktopLaunch2   = "          Launch it, close it, then run this again."
        DesktopReady     = "  Claude Desktop   found"
        NoWinget         = "[error] winget was not found, so nothing can be installed automatically."
        NoWingetHint     = "        Install from https://claude.ai/download and run this again."
        StatusBuildReady = "  Build            already built, it will be rebuilt to match this checkout"
        StatusBuildTodo  = "  Build            not built yet, it will be built in a moment"
        InstallHeading   = "  Build"
        PackHeading      = "  Extension package"
        PackBuilding     = "  Packaging the extension (npm run package)..."
        PackDone         = "  Built {0}"
        PackHintDebug    = "  Or load {0} from about:debugging for a temporary install that lasts until the browser closes."
        PackFailed       = "[warning] The extension zip failed to build. If the extension is already installed, its key still works."
        NextHeading      = "  Next"
        NextStep1        = "  1. Install or update that zip from about:addons."
        NextStep2        = "  2. Copy the Secret Key from the extension preferences."
        NextStep3        = "  3. Run this to hand that key to Claude Code and Claude Desktop:"
        NextStep4        = "     powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-secret.ps1"
    }
    ko = @{
        Title            = "  Browser Control MCP - 설치"
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
        CodeInstallAsk   = "Claude Code 를 지금 설치할까요? (y/N)"
        CodeInstallSkip  = "  Claude Code      건너뜁니다"
        CodeInstalling   = "  winget 으로 Claude Code 를 설치하는 중..."
        CodeInstallNpm   = "  winget 이 안 되어 npm -g 로 다시 시도합니다..."
        CodeInstallFail  = "[오류] Claude Code 가 여전히 PATH 에 없습니다. 새 터미널에서 다시 실행하세요."
        CodeReady        = "  Claude Code      찾았습니다"
        DesktopInstAsk   = "Claude Desktop 을 지금 설치할까요? (y/N)"
        DesktopInstSkip  = "  Claude Desktop   건너뜁니다"
        DesktopInstNow   = "  winget 으로 Claude Desktop 을 설치하는 중..."
        DesktopLaunch    = "[경고] Claude Desktop 은 한 번 실행해야 설정 폴더가 만들어집니다."
        DesktopLaunch2   = "       한 번 켰다 끈 뒤에 이 스크립트를 다시 실행하세요."
        DesktopReady     = "  Claude Desktop   찾았습니다"
        NoWinget         = "[오류] winget 을 찾지 못해 자동 설치를 할 수 없습니다."
        NoWingetHint     = "       https://claude.ai/download 에서 설치한 뒤 다시 실행하세요."
        StatusBuildReady = "  빌드             빌드돼 있습니다. 현재 소스에 맞춰 다시 빌드합니다"
        StatusBuildTodo  = "  빌드             아직 빌드되지 않아 곧 빌드합니다"
        InstallHeading   = "  빌드"
        PackHeading      = "  확장 패키지"
        PackBuilding     = "  확장을 패키징하는 중 (npm run package)..."
        PackDone         = "  {0} 을 만들었습니다"
        PackHintDebug    = "  또는 about:debugging 에서 {0} 을 지목해 임시로 로드할 수도 있습니다(브라우저를 닫으면 사라집니다)."
        PackFailed       = "[경고] 확장 zip 만들기에 실패했습니다. 확장이 이미 설치돼 있다면 그 키로 계속할 수 있습니다."
        NextHeading      = "  다음 순서"
        NextStep1        = "  1. about:addons 에서 이 zip 을 설치(또는 갱신)합니다."
        NextStep2        = "  2. 확장 설정에서 Secret Key 를 복사합니다."
        NextStep3        = "  3. 아래를 실행해 그 키를 Claude Code 와 Claude Desktop 에 넘깁니다."
        NextStep4        = "     powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-secret.ps1"
    }
}

$T = $Strings.en

function Confirm-Yes($question) {
    Write-Host ""
    $answer = Read-Host $question
    return ($answer -eq "y" -or $answer -eq "Y")
}

function Update-PathFromRegistry {
    $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $user = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = @($machine, $user) -join ";"
}

$T = Select-Language $Strings

Write-Host ""
Write-Rule
Write-Host $T.Title -ForegroundColor Cyan
Write-Rule

$hasWinget = [bool](Get-Command winget -ErrorAction SilentlyContinue)

$needsDeps = @($repoRoot, $serverDir, $extensionDir) |
    Where-Object { -not (Test-Path (Join-Path $_ "node_modules")) } |
    Select-Object -First 1
$needsDeps = [bool]$needsDeps
$needsBuild = (-not (Test-Path $serverPath)) -or (-not (Test-Path $extensionBundle))

Write-Host ""
Write-Host $T.DetectHeading
Write-Host ""

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

$claudeProcesses = Get-ClaudeProcesses

Write-Host ""
Write-Rule
Write-Host $T.StatusHeading -ForegroundColor Cyan
Write-Rule
Write-Host ""

if ($needsDeps -or $needsBuild) {
    Write-Host $T.StatusBuildTodo -ForegroundColor Yellow
}
else {
    Write-Host $T.StatusBuildReady -ForegroundColor Green
}

if ($hasCodeCli) {
    Write-Host $T.CodeReady -ForegroundColor Green
    if ($claudeProcesses.Code.Count -gt 0) {
        Write-Host ($T.StatusRunning -f $claudeProcesses.Code.Count) -ForegroundColor Yellow
    }
}
else {
    Write-Host $T.StatusCodeNone -ForegroundColor DarkGray
}

if ($hasDesktop) {
    Write-Host $T.DesktopReady -ForegroundColor Green
    Write-Host ($T.DesktopConfigAt -f $desktopPaths.Config) -ForegroundColor DarkGray
    if ($claudeProcesses.Desktop.Count -gt 0) {
        Write-Host ($T.StatusRunning -f $claudeProcesses.Desktop.Count) -ForegroundColor Yellow
    }
}
else {
    Write-Host $T.StatusDeskNone -ForegroundColor DarkGray
}

if (-not $hasCodeCli -and -not $hasDesktop) {
    Write-Host ""
    Write-Host $T.NothingToDo -ForegroundColor Yellow
    Write-Host $T.NothingHint
}

Write-Host ""
Write-Rule
Write-Host $T.InstallHeading -ForegroundColor Cyan
Write-Rule

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

Write-Host ""
Write-Rule
Write-Host $T.PackHeading -ForegroundColor Cyan
Write-Rule

Write-Host $T.PackBuilding
$packStartedAt = Get-Date
Push-Location $repoRoot
try {
    Invoke-Native "npm" @("run", "package") -Quiet | Out-Null
}
finally {
    Pop-Location
}
$packed = Get-ChildItem (Join-Path $extensionDir "web-ext-artifacts") -Filter "*.zip" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -ge $packStartedAt } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1
if ($packed) {
    Write-Host ($T.PackDone -f $packed.FullName)
}
else {
    Write-Host $T.PackFailed -ForegroundColor Yellow
}
Write-Host ($T.PackHintDebug -f (Join-Path $extensionDir "manifest.json"))

Write-Host ""
Write-Rule
Write-Host $T.DoneHeading -ForegroundColor Green
Write-Rule
Write-Host ""
Write-Host $T.NextHeading -ForegroundColor Cyan
Write-Host ""
Write-Host $T.NextStep1
Write-Host $T.NextStep2
Write-Host $T.NextStep3
Write-Host $T.NextStep4 -ForegroundColor Cyan
Exit-With 0
