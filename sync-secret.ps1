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
        CodexRegistered  = "  Codex            the MCP server is registered, its Secret Key will be refreshed"
        CodexPending     = "  Codex            the MCP server is not registered yet, it will be added"
        CodexMissing     = "  Codex            the CLI is not on PATH"
        StatusCodexNone  = "  Codex            not available, it will be skipped"
        NoticeCodexOpen  = "  Codex sessions that are already open keep their old settings too. Open a new one."
        CodexHeading     = "  Codex"
        NothingToDo      = "  No client is available, so there is nothing to register."
        NothingHint      = "  Install Claude Code or Codex first, then run this again."
        NoticeHeading    = "  What happens after the Secret Key"
        NoticeCodeOpen   = "  Claude Code sessions that are already open keep their old settings. Open a new"
        NoticeCodeOpen2  = "  session once this is done."
        NoticeNonStop    = "  Nothing else is asked from here on: the client registrations are written"
        NoticeNonStop2   = "  in one go."
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
        CodexRegistered  = "  Codex            MCP 서버가 등록돼 있습니다, Secret Key 를 갱신합니다"
        CodexPending     = "  Codex            MCP 서버가 등록돼 있지 않습니다, 새로 등록합니다"
        CodexMissing     = "  Codex            CLI 를 PATH 에서 찾지 못했습니다"
        StatusCodexNone  = "  Codex            쓸 수 없어 건너뜁니다"
        NoticeCodexOpen  = "  이미 열려 있는 Codex 세션도 예전 설정을 그대로 씁니다. 새 세션을 열어야 반영됩니다."
        CodexHeading     = "  Codex"
        NothingHint      = "  Claude Code 나 Codex 를 먼저 설치한 뒤 다시 실행하세요."
        NoticeHeading    = "  Secret Key 다음에 일어나는 일"
        NoticeCodeOpen   = "  이미 열려 있는 Claude Code 세션은 예전 설정을 그대로 씁니다. 끝난 뒤에 새 세션을"
        NoticeCodeOpen2  = "  열어야 반영됩니다."
        NoticeNonStop    = "  여기서부터는 아무것도 묻지 않습니다. 클라이언트 등록을"
        NoticeNonStop2   = "  한 번에 진행합니다."
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
        DoneBody1        = "  이미 열려 있던 세션에는 반영되지 않습니다."
        DoneBody2        = "  새 세션을 열어야 도구가 잡힙니다."
        DoneBody3        = "  세션을 여러 개 열어도 됩니다. 기준 포트가 막혀 있으면 서버가"
        DoneBody4        = "  {0} 위쪽의 빈 포트를 알아서 잡고, 확장이 따라 붙습니다."
    }
}

$T = $Strings.en

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

$wantsCodex = [bool](Get-Command codex -ErrorAction SilentlyContinue)
$codexRegistered = $false

if ($wantsCodex) {
    $codexRegistered = (Invoke-Native "codex" @("mcp", "get", "browser-control") -Quiet) -eq 0
}
else {
    Write-Host $T.CodexMissing -ForegroundColor Yellow
}

$codeRunning = Get-ClaudeCodeProcesses

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

if ($wantsCodex) {
    if ($codexRegistered) {
        Write-Host $T.CodexRegistered -ForegroundColor Green
    }
    else {
        Write-Host $T.CodexPending -ForegroundColor Green
    }
}
else {
    Write-Host $T.StatusCodexNone -ForegroundColor DarkGray
}

if (-not $wantsCode -and -not $wantsCodex) {
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

if ($wantsCode) {
    Write-Host $T.NoticeCodeOpen
    Write-Host $T.NoticeCodeOpen2
}

if ($wantsCodex) {
    Write-Host $T.NoticeCodexOpen
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

if ($wantsCodex) {
    Write-Host ""
    Write-Rule
    Write-Host $T.CodexHeading -ForegroundColor Cyan
    Write-Rule

    if ($codexRegistered) {
        Write-Host $T.CodeRemoving
        Invoke-Native "codex" @("mcp", "remove", "browser-control") -Quiet | Out-Null
    }

    Write-Host $T.CodeAdding

    $added = Invoke-Native "codex" @(
        "mcp", "add", "browser-control",
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
    Invoke-Native "codex" @("mcp", "get", "browser-control") -Redact $secret | Out-Null
}

Write-Host ""
Write-Rule
Write-Host $T.DoneHeading -ForegroundColor Green
Write-Host ""
if ($wantsCode -or $wantsCodex) {
    Write-Host $T.DoneBody1
    Write-Host $T.DoneBody2
    Write-Host ""
}
Write-Host $T.DoneBody3
Write-Host ($T.DoneBody4 -f $port)
Write-Rule
Exit-With 0
