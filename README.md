# Mattermost Claude Code Channel

Mattermost를 Claude Code와 연결하는 MCP 채널 서버입니다.
Mattermost DM/채널 메시지를 Claude Code 세션에서 수신하고 응답할 수 있습니다.

## 기능

- **실시간 메시지 수신**: Mattermost DM/채널 메시지를 Claude Code 세션으로 전달
- **양방향 채팅**: Claude가 `reply` 도구로 Mattermost에 응답
- **권한 릴레이**: 도구 승인 요청을 관리자 DM으로 전달, 승인/거부 처리
- **발신자 제어**: allowlist 기반 사용자 필터링

## 요구사항

- Claude Code v2.1.80+
- Node.js 22+
- Mattermost 5.0+ (자체 호스팅)
- Mattermost Bot 토큰 또는 Personal Access Token

## 설치

```bash
git clone https://github.com/your-org/mattermost-claude-channel.git
cd mattermost-claude-channel
npm install
```

## 설정

### 1. Mattermost Bot 생성

Mattermost 관리 패널에서:
1. **Integrations → Bot Accounts** 이동
2. 새로운 봇 생성 (이름: `claude-code` 권장)
3. **Personal Access Token** 생성 및 저장

### 2. MCP 서버 등록

`.mcp.json.example`을 복사하여 `.mcp.json`을 생성합니다:

```bash
cp .mcp.json.example .mcp.json
```

`.mcp.json`을 편집하여 실제 값을 입력합니다:

```json
{
  "mcpServers": {
    "mattermost-channel": {
      "command": "node",
      "args": ["--import", "tsx", "/absolute/path/to/src/index.ts"],
      "env": {
        "MATTERMOST_URL": "https://your-mattermost-server.com",
        "MATTERMOST_TOKEN": "your-bot-token-here",
        "ALLOWED_USERS": "user-id-1,user-id-2",
        "ADMIN_USERS": "admin-user-id",
        "LOG_LEVEL": "info",
        "LISTEN_CHANNELS": "channel-id-1,channel-id-2"
      }
    }
  }
}
```

### 3. 환경변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `MATTERMOST_URL` | ✅ | Mattermost 서버 URL (예: `https://mattermost.example.com`) |
| `MATTERMOST_TOKEN` | ✅ | Bot 또는 Personal Access Token |
| `ALLOWED_USERS` | | 허용된 사용자 ID (쉼표 구분, 비어있으면 모두 허용) |
| `ADMIN_USERS` | | 권한 릴레이를 수신할 관리자 사용자 ID (쉼표 구분) |
| `LOG_LEVEL` | | `debug` \| `info` \| `warn` \| `error` (기본값: `info`) |
| `LISTEN_CHANNELS` | | 수신할 채널 ID (쉼표 구분, 비어있으면 DM만 수신) |
| `LOG_FILE` | | 로그 파일 경로 (예: `/tmp/mattermost-mcp.log`, 미설정 시 파일 로깅 비활성화) |

## 사용법

### Claude Code와 연결

```bash
claude --dangerously-load-development-channels server:mattermost-channel
```

### 메시지 수신

Mattermost에서 봇에게 DM을 보내거나 `LISTEN_CHANNELS`에 등록된 채널에 메시지를 보내면, Claude 세션에 다음 형식으로 도착합니다:

```xml
<channel source="mattermost-channel" user_id="..." username="..." channel_id="...">메시지 내용</channel>
```

### 메시지 응답

Claude가 `reply` 도구를 사용하여 응답합니다:
- **채널 회신**: `reply(channel_id="...", text="응답")`
- **DM 회신**: `reply(user_id="...", text="응답")`

### 권한 관리

`ADMIN_USERS`가 설정되어 있으면, 도구 승인 요청이 관리자에게 DM으로 전달됩니다.
관리자가 `yes <request-id>` 또는 `no <request-id>`로 응답하면 Claude에 결과가 전달됩니다.

## 트러블슈팅

| 증상 | 해결 |
|------|------|
| `Configuration validation failed` | `MATTERMOST_URL`, `MATTERMOST_TOKEN` 환경변수 확인 |
| `401 Unauthorized` | Bot 토큰 유효성 및 권한 확인 |
| 메시지 미수신 | `ALLOWED_USERS`, `LISTEN_CHANNELS` 설정 확인. `LOG_LEVEL=debug`로 디버깅 |

## 문서

- [아키텍처 및 동작 원리](docs/architecture.md)
- [개발 가이드](docs/development.md)

## 라이선스

MIT
