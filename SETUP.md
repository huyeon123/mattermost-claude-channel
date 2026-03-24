# Mattermost Claude Channel - AI 설치 가이드

이 문서는 AI 어시스턴트(Claude Code 등)가 사용자를 대신해 단계별로 따라 실행할 수 있도록 작성된 설치 가이드입니다.
사용자가 이 파일을 AI에게 붙여넣으면, AI가 각 단계를 인터랙티브하게 진행합니다.

---

## AI에게: 이 가이드 사용법

각 Step을 순서대로 진행하세요. 사용자에게 질문이 필요한 경우 **질문 포인트**에 명시된 내용을 물어보세요.
명령어를 실행하기 전에 항상 사용자에게 알리고, 결과를 확인한 후 다음 단계로 진행하세요.

---

## Step 1: 사전 요구사항 확인

**AI가 할 일:** 아래 명령어를 실행하여 Node.js 버전을 확인합니다.

```bash
node --version
npm --version
```

**예상 출력:**
- Node.js: `v22.x.x` 이상
- npm: `10.x.x` 이상

**검증:**
- Node.js 버전이 22 미만이면 사용자에게 업그레이드를 안내합니다.
- [https://nodejs.org](https://nodejs.org) 에서 LTS 버전(22+)을 설치하거나, `nvm`을 사용하는 경우 `nvm install 22 && nvm use 22`를 실행합니다.
- Node.js 22 이상이 확인되면 Step 2로 진행합니다.

---

## Step 2: 저장소 클론

**AI가 할 일:** 사용자에게 설치 위치를 확인한 후 저장소를 클론합니다.

**질문 포인트:**
> "어느 디렉토리에 설치할까요? (예: `~/workspace`, `~/projects`) 기본값은 현재 디렉토리입니다."

**명령어:**
```bash
# 사용자가 지정한 디렉토리로 이동 후 실행
git clone https://gitlab.gabia.com/productteam/ai/mcp/mattermost-claude-channel.git
cd mattermost-claude-channel
```

**예상 출력:** `Cloning into 'mattermost-claude-channel'...` 메시지와 함께 클론 완료

**검증:** `ls src/` 명령어로 `index.ts` 파일이 존재하는지 확인합니다.

---

## Step 3: 의존성 설치

**AI가 할 일:** npm 패키지를 설치합니다.

```bash
npm install
```

**예상 출력:** `added XXX packages` 메시지

**검증:** 오류 없이 완료되면 Step 4로 진행합니다. `ERESOLVE` 또는 `peer dependency` 오류가 발생하면 `npm install --legacy-peer-deps`를 시도합니다.

---

## Step 4: Mattermost Bot 토큰 준비

**AI가 할 일:** 사용자에게 Bot 토큰이 있는지 확인합니다.

**질문 포인트:**
> "Mattermost Bot 토큰 또는 Personal Access Token이 있으신가요? (있음/없음)"

### 토큰이 없는 경우 - Bot 생성 안내

사용자에게 다음 절차를 안내합니다:

1. Mattermost 서버에 관리자 계정으로 로그인합니다.
2. 상단 메뉴에서 **Main Menu → Integrations → Bot Accounts** 로 이동합니다.
   - Integrations 메뉴가 없다면 관리자에게 `Enable Bot Account Creation` 설정 활성화를 요청합니다.
3. **Add Bot Account** 클릭합니다.
4. 다음 정보를 입력합니다:
   - **Username:** `claude-code` (권장)
   - **Display Name:** `Claude Code Bot`
   - **Description:** MCP Channel Bot
   - **Role:** Member
5. **Create Bot Account** 클릭 후 생성된 **Token**을 복사하여 안전한 곳에 저장합니다.
   - 이 토큰은 한 번만 표시되므로 반드시 저장하세요.

### Personal Access Token 사용하는 경우

1. Mattermost → **Profile → Security → Personal Access Tokens** 이동
2. **Create Token** 클릭 후 토큰 저장

**검증:** 토큰이 준비되면 Step 5로 진행합니다.

---

## Step 5: 환경변수 수집 (인터랙티브)

**AI가 할 일:** 아래 각 항목에 대해 사용자에게 순서대로 질문합니다. 답변을 수집한 후 Step 6에서 설정 파일을 생성합니다.

---

### 5-1. MATTERMOST_URL (필수)

**질문:**
> "Mattermost 서버의 URL을 입력해주세요. (예: `https://mattermost.example.com`)"

**검증:**
- `http://` 또는 `https://`로 시작해야 합니다.
- 끝에 `/`가 있으면 제거합니다.
- 로컬 서버라면 `http://localhost:8065` 형태도 가능합니다.

---

### 5-2. MATTERMOST_TOKEN (필수)

**질문:**
> "Step 4에서 복사한 Bot 토큰 또는 Personal Access Token을 입력해주세요."

**검증:**
- 토큰은 일반적으로 26자리 영숫자 문자열입니다.
- 비어있으면 진행할 수 없습니다.

---

### 5-3. ALLOWED_USERS (선택)

**질문:**
> "이 봇에 메시지를 보낼 수 있는 허용된 사용자 ID 목록을 입력해주세요. (쉼표로 구분, 비어있으면 모든 사용자 허용)"
>
> 사용자 ID를 확인하는 방법: Mattermost API `GET /api/v4/users/me` 를 호출하거나, 관리 콘솔 → 사용자 프로필에서 확인할 수 있습니다.
>
> "건너뛰려면 Enter를 누르세요."

**기본값:** 비어있음 (모든 사용자 허용)

---

### 5-4. ADMIN_USERS (선택)

**질문:**
> "도구 승인 요청을 DM으로 받을 관리자 사용자 ID를 입력해주세요. (쉼표로 구분)"
>
> 이 기능은 Claude가 위험한 도구 사용 전에 관리자에게 승인을 요청할 때 사용됩니다.
>
> "건너뛰려면 Enter를 누르세요."

**기본값:** 비어있음

---

### 5-5. LISTEN_CHANNELS (선택)

**질문:**
> "메시지를 수신할 채널 ID 목록을 입력해주세요. (쉼표로 구분)"
>
> 채널 ID 확인 방법: 채널 URL의 마지막 부분 또는 API `GET /api/v4/channels` 에서 확인 가능합니다.
>
> "비어있으면 DM(다이렉트 메시지)만 수신합니다. 건너뛰려면 Enter를 누르세요."

**기본값:** 비어있음 (DM만 수신)

---

### 5-6. LOG_LEVEL (선택)

**질문:**
> "로그 레벨을 선택해주세요: `debug` / `info` / `warn` / `error` (기본값: `info`)"
>
> "건너뛰면 `info`가 사용됩니다."

**기본값:** `info`

---

### 5-7. LOG_FILE (선택)

**질문:**
> "로그를 파일에 저장하려면 파일 경로를 입력해주세요. (예: `/tmp/mattermost-mcp.log`)"
>
> "건너뛰면 파일 로깅이 비활성화됩니다."

**기본값:** 비어있음

---

## Step 6: .mcp.json 생성

**AI가 할 일:** 수집한 값들로 `.mcp.json` 파일을 생성합니다.

현재 디렉토리의 절대 경로를 확인합니다:
```bash
pwd
```

수집한 값을 사용하여 `.mcp.json`을 생성합니다. `REPO_PATH`는 위에서 확인한 절대 경로로 대체합니다:

```json
{
  "mcpServers": {
    "mattermost-channel": {
      "command": "node",
      "args": ["--import", "tsx", "REPO_PATH/src/index.ts"],
      "env": {
        "MATTERMOST_URL": "사용자가 입력한 URL",
        "MATTERMOST_TOKEN": "사용자가 입력한 토큰",
        "ALLOWED_USERS": "사용자가 입력한 값 (없으면 빈 문자열)",
        "ADMIN_USERS": "사용자가 입력한 값 (없으면 빈 문자열)",
        "LOG_LEVEL": "사용자가 입력한 값 또는 info",
        "LISTEN_CHANNELS": "사용자가 입력한 값 (없으면 빈 문자열)",
        "LOG_FILE": "사용자가 입력한 값 (없으면 생략 또는 빈 문자열)"
      }
    }
  }
}
```

**검증:** `.mcp.json` 파일이 생성되었는지 확인합니다:
```bash
cat .mcp.json
```

---

## Step 7: Claude Code에 MCP 서버 등록

**AI가 할 일:** 사용자에게 등록 방법을 안내합니다.

**질문 포인트:**
> "MCP 서버를 어디에 등록할까요? 1) 현재 프로젝트에만 (`.mcp.json` 사용) 2) 전역 설정에 등록 (`~/.claude.json`)"

### 방법 1: 프로젝트별 등록 (권장)

프로젝트 루트에 `.mcp.json`이 이미 생성되어 있으므로, Claude Code가 해당 디렉토리에서 실행될 때 자동으로 감지합니다.

Claude Code 프로젝트에서 이 MCP 서버를 사용하려면:
1. Claude Code를 실행하는 프로젝트의 루트 디렉토리에 `.mcp.json`을 복사하거나 심볼릭 링크를 생성합니다.
2. 또는 현재 mattermost-claude-channel 디렉토리에서 Claude Code를 실행합니다.

### 방법 2: 전역 등록

Claude Code의 전역 설정 파일(`~/.claude.json`)에 다음 내용을 추가합니다:

```json
{
  "mcpServers": {
    "mattermost-channel": {
      "command": "node",
      "args": ["--import", "tsx", "REPO_PATH/src/index.ts"],
      "env": {
        "MATTERMOST_URL": "...",
        "MATTERMOST_TOKEN": "..."
      }
    }
  }
}
```

기존 `mcpServers` 항목이 있다면 `mattermost-channel` 항목만 추가합니다.

---

## Step 8: 연결 테스트

**AI가 할 일:** 서버가 정상적으로 실행되는지 확인합니다.

```bash
claude --dangerously-load-development-channels server:mattermost-channel
```

**예상 동작:**
- 오류 없이 서버가 시작되면 정상입니다.
- Mattermost 서버에 연결되고 메시지 대기 상태가 됩니다.

**트러블슈팅:**

| 오류 메시지 | 해결 방법 |
|------------|----------|
| `Configuration validation failed` | `.mcp.json`에서 `MATTERMOST_URL`, `MATTERMOST_TOKEN` 값 확인 |
| `401 Unauthorized` | Bot 토큰이 유효한지, 만료되지 않았는지 확인 |
| `ECONNREFUSED` | Mattermost 서버 URL이 올바른지, 서버가 실행 중인지 확인 |
| 메시지 미수신 | `LOG_LEVEL=debug`로 변경 후 재시작하여 디버그 로그 확인 |
| `tsx` not found | `npm install` 이 정상적으로 완료되었는지 확인 |

---

## Step 9: 동작 확인

**AI가 할 일:** 사용자에게 최종 동작 확인을 안내합니다.

1. Mattermost에서 Bot 계정으로 DM을 보내거나 `LISTEN_CHANNELS`에 등록된 채널에 메시지를 전송합니다.
2. Claude Code 세션에서 다음 형식으로 메시지가 수신됩니다:
   ```xml
   <channel source="mattermost-channel" user_id="..." username="..." channel_id="...">
     메시지 내용
   </channel>
   ```
3. Claude가 `reply` 도구로 응답하면 Mattermost에서 Bot의 답장을 확인할 수 있습니다.

---

## 설치 완료

설치가 완료되었습니다. 추가 설정이나 문제가 발생하면 다음 문서를 참고하세요:

- [README.md](./README.md) - 전체 설명
- [docs/architecture.md](./docs/architecture.md) - 아키텍처 설명
- [docs/development.md](./docs/development.md) - 개발 가이드
- GitHub Issues: https://github.com/huyeon123/mattermost-claude-channel/issues
