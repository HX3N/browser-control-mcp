<div align="center">

[English](./README.md) | **한국어**

</div>

> [!IMPORTANT]
> 이 저장소는 [eyalzh/browser-control-mcp](https://github.com/eyalzh/browser-control-mcp)의 포크입니다

# Browser Control MCP

브라우저 확장과 짝을 이루는 MCP 서버입니다. AI 어시스턴트가 탭을 관리하고, 방문 기록을 검색하고,
페이지를 읽고, 클릭·입력·끌어 놓기·스크립트 실행을 합니다. [Zen Browser](https://zen-browser.app/)
기준으로 만들었고, API는 Firefox의 것입니다.

## 원본과 달라진 점

원본은 읽기만 합니다. 이 포크는 페이지 조작, 권한 모델, 모델이 무엇을 하는지 보여 주는 화면
오버레이를 더했습니다. 요소는 페이지 읽기에서 얻은 `ref`나 CSS 셀렉터로 지정합니다.

## 도구

**탐색과 읽기**

- `open-browser-tab`, `close-browser-tabs`, `list-open-tabs`
- `navigate-browser-tab` — 주소 또는 방문 기록. 같은 출처의 주소는 페이지 자신이 라우팅
- `resize-browser-window`
- `read-network-requests`
- `get-recent-browser-history`
- `read-page` — 본문과 상호작용 요소를 ref와 함께. 큰 페이지는 ref로 읽을 구역 개요로
- `find-text-in-page`
- `capture-tab-screenshot` — 화면 또는 한 요소
- `list-page-media`
- `read-page-image` — 페이지의 쿠키로 원본 파일 (기본 꺼짐)

**조작**

- `click-page-element` — 버튼·보조키·호버
- `drag-page-element`
- `type-into-page-element` — 제출 또는 뒤이은 클릭 포함
- `press-key-in-tab`
- `scroll-browser-tab` — 방향, 맨 위, 맨 아래, 요소까지
- `select-page-option`
- `download-file-from-page` (기본 꺼짐)
- `upload-files-to-page-element` (기본 꺼짐)
- `run-browser-actions` — 여러 개를 한 호출로
- `wait-for-page` — 요소, 또는 지난 호출 이후 새로 온 텍스트
- `execute-javascript-in-tab` (기본 꺼짐)

## 팝업

`Alt+Shift+B` 또는 툴바 아이콘.

- **연결** — 포트별 서버, 각각 켜고 끔
- **권한** — 권한 범위와 사이트 목록. `+ 현재 탭`은 앞에 있는 탭을 추가
- **새 탭** — 이 세션이 여는 탭이 어느 컨테이너로 갈지
- **상호작용 권한** — 기능별 스위치, 숨은 내용 읽기, 백그라운드 작업
- **표시** — 탭 아이콘, 오로라, 동작 강조, 배지, 구역 상자 크기, 탭 유지 시간

| 범위                       | 동작                                                         |
| -------------------------- | ------------------------------------------------------------ |
| **화이트리스트** (기본값) | 목록의 사이트와 하나씩 허용한 탭만. 탭 허용은 페이지 이동 시 끝남 |
| **블랙리스트**             | 목록의 사이트를 제외한 모든 곳                                |

**접근 허용 주소** — `HTTPS`(기본), `DEV`(루프백의 `http://` 추가), `HTTP`. 특권 URL은 Firefox가
어차피 거부합니다. 이 설정은 열기·이동을 막고 `list-page-media`·`read-network-requests`가 돌려주는
URL도 거릅니다.

## 화면 효과

Shadow DOM에 그리며 페이지의 DOM과 포인터 이벤트를 건드리지 않습니다. 부분마다 팝업 스위치가
있습니다.

- **탭 아이콘** — 세션이 탭을 잡고 있는 동안 파비콘을 바꿈
- **탭 오로라** — 화면 가장자리의 빛
- **동작 강조** — 동작 대상 요소의 테두리. 끌어 놓기는 놓을 자리도 상자로 표시하고 시작에서
  대상까지 링을 보냄. 스크롤은 화면 가운데로 링을 보내고 페이지는 같은 시간 동안 부드럽게 이동
- **상태 배지** — 위쪽 가운데의 현재 동작. 읽기와 스크립트 실행은 다음 명령까지 남고, 스크립트는
  패널에 전문이 표시됨

명령이 떠난 탭은 명령이 돌아올 때까지 회색으로 흐려집니다. 탭 유지는 명령 사이의 공백에도
이어지며 탭 닫힘·소켓 종료·팝업의 유지 시간으로 끝납니다. 네이티브 대화상자는 뜨기 전에 답하고
결과에 실어 보고합니다.

색과 시간은 설정 페이지에 있고, 그곳의 **오버레이 미리보기** 버튼은 서버 없이 효과 하나하나를
재생합니다.

## 보안

의도적으로 원본보다 덜 안전합니다.

- 페이지 조작과 스크립트 실행은 켜져 있는 동안 로그인한 사용자 그대로 동작합니다.
- `<all_urls>`가 필수 권한입니다. 브라우저의 도메인별 확인은 없고, 권한 범위와 도구 스위치가
  유일한 방어선입니다.
- `execute-javascript-in-tab`은 content script 샌드박스에서 실행되며 페이지 전역은
  `window.wrappedJSObject`로 접근합니다.

**화이트리스트**를 유지하고, 탭을 하나씩 허용하고, 의심스러우면 조작 도구를 끄십시오. 실험적이며
책임은 사용자에게 있습니다.

## Zen Browser

- 컴팩트 모드는 툴바를 숨깁니다. `Alt+Shift+B`를 쓰십시오.
- 분할 화면에서는 스크린샷에 두 탭이 담깁니다.
- 컨테이너: 기본 컨테이너의 탭은 로그아웃 상태로 보이므로 새 탭은 기본적으로 앞 탭을 따릅니다.
  그것을 기본 컨테이너나 지정한 컨테이너로 바꾸는 것은 팝업이며, 도구 파라미터는 이를 덮어쓰지 못합니다.

## 설치

원본의 릴리스에는 이 포크의 도구가 없습니다. 소스에서 빌드하십시오.

```
npm install
npm run build
```

`about:debugging` → "Load Temporary Add-on..."에서 `firefox-extension/manifest.json`을 고르거나,
패키징해서 `about:addons`에서 설치합니다.

```
npm run package     # firefox-extension/web-ext-artifacts/browser_control_mcp-<version>.zip
```

설정 페이지에 서버가 쓸 비밀 키가 표시됩니다.

### 서버 연결

하는 일마다 스크립트가 하나씩 있습니다. `setup.ps1`은 빠진 것을 설치하고 빌드한 뒤 zip까지
만들고 끝납니다. 확장을 설치하기 전에는 비밀 키가 존재하지 않기 때문입니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\setup.ps1
```

그 zip을 `about:addons`에서 설치하고 설정에서 비밀 키를 복사한 뒤 클라이언트에 넘깁니다.
`sync-secret.ps1`이 Claude Code와 Claude Desktop에 등록하며, Desktop 설정을 쓰기 전에 앱을
닫습니다. 키가 바뀔 때마다 이것만 다시 실행하면 됩니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\sync-secret.ps1
```

직접 등록, Claude Code:

```
claude mcp add browser-control \
  --env EXTENSION_SECRET=<SECRET KEY> \
  -- node /path/to/repo/mcp-server/dist/server.js
```

Claude Desktop은 `claude_desktop_config.json`에 같은 항목:

```json
{
  "mcpServers": {
    "browser-control": {
      "command": "node",
      "args": ["/path/to/repo/mcp-server/dist/server.js"],
      "env": { "EXTENSION_SECRET": "<SECRET KEY>" }
    }
  }
}
```

세션은 여러 개 열어도 됩니다. 서버마다 다음 빈 포트를 잡고 확장은 예비 슬롯을 둡니다.
`cd mcp-server && npm run pack-dxt`가 Claude Desktop용 DXT 패키지를 만듭니다.

## 개발

```
npm run build                        # nx
cd firefox-extension; npm test       # jest
npm run package                      # zip
```

UI 문자열은 `firefox-extension/_locales/{en,ko}/messages.json`에 있습니다. 구조:
[CLAUDE.md](./CLAUDE.md).
