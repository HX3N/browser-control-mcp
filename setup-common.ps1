$repoRoot = $PSScriptRoot
$serverPath = Join-Path $repoRoot "mcp-server\dist\server.js"
$serverArg = ($serverPath -replace '\\', '/')
$serverDir = Join-Path $repoRoot "mcp-server"
$extensionDir = Join-Path $repoRoot "firefox-extension"
$extensionBundle = Join-Path $extensionDir "dist\background.js"
$port = "8089"

$CommonStrings = @{
    en = @{
        LanguagePrompt  = "Language / 언어  [1] English  [2] 한국어"
        PressEnter      = "Press Enter to close this window"
        DetectHeading   = "  Looking for the clients"
        CodeMissing     = "  Claude Code      the CLI is not on PATH"
        DesktopMissing  = "  Claude Desktop   the app is not installed"
        DesktopConfigAt = "                   config: {0}"
        StatusHeading   = "  Current state"
        StatusRunning   = "                   running right now ({0} process(es))"
        StatusCodeNone  = "  Claude Code      not available, it will be skipped"
        StatusDeskNone  = "  Claude Desktop   not available, it will be skipped"
        NothingToDo     = "  Neither client is available, so there is nothing to register."
        NothingHint     = "  Install Claude Code or Claude Desktop first, then run this again."
        DoneHeading     = "  Finished."
    }
    ko = @{
        LanguagePrompt  = "Language / 언어  [1] English  [2] 한국어"
        PressEnter      = "엔터를 누르면 창이 닫힙니다"
        DetectHeading   = "  클라이언트를 찾는 중"
        CodeMissing     = "  Claude Code      CLI 를 PATH 에서 찾지 못했습니다"
        DesktopMissing  = "  Claude Desktop   앱이 설치되어 있지 않습니다"
        DesktopConfigAt = "                   설정 파일: {0}"
        StatusHeading   = "  현재 상태"
        StatusRunning   = "                   지금 실행 중입니다 (프로세스 {0}개)"
        StatusCodeNone  = "  Claude Code      쓸 수 없어 건너뜁니다"
        StatusDeskNone  = "  Claude Desktop   쓸 수 없어 건너뜁니다"
        NothingToDo     = "  쓸 수 있는 클라이언트가 없어 등록할 것이 없습니다."
        NothingHint     = "  Claude Code 나 Claude Desktop 을 먼저 설치한 뒤 다시 실행하세요."
        DoneHeading     = "  끝났습니다."
    }
}

function Merge-Strings($own) {
    $merged = @{}
    foreach ($lang in $CommonStrings.Keys) {
        $table = @{}
        foreach ($pair in $CommonStrings[$lang].GetEnumerator()) {
            $table[$pair.Key] = $pair.Value
        }
        foreach ($pair in $own[$lang].GetEnumerator()) {
            $table[$pair.Key] = $pair.Value
        }
        $merged[$lang] = $table
    }
    return $merged
}

function Write-Rule {
    Write-Host ("=" * 60) -ForegroundColor DarkGray
}

function Select-Language($strings) {
    Write-Host ""
    Write-Rule
    Write-Host "  Browser Control MCP" -ForegroundColor Cyan
    Write-Rule
    Write-Host ""

    $answer = (Read-Host $strings.en.LanguagePrompt).Trim()
    if ($answer -eq "2") {
        return $strings.ko
    }
    return $strings.en
}

function Exit-With($code) {
    Write-Host ""
    Read-Host $T.PressEnter | Out-Null
    exit $code
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

function Get-ClaudeProcesses {
    $all = @(Get-Process -Name claude -ErrorAction SilentlyContinue)
    return [PSCustomObject]@{
        Code    = @($all | Where-Object { $_.Path -notlike "*WindowsApps*" })
        Desktop = @($all | Where-Object {
                $_.Path -like "*WindowsApps*" -or $_.Path -like "*AnthropicClaude*" -or $_.Path -like "*Programs\Claude*"
            })
    }
}
