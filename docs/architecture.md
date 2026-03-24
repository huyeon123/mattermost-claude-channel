# 아키텍처 및 동작 원리

## 개요

이 프로젝트는 MCP(Model Context Protocol) 채널 서버로, Mattermost와 Claude Code 세션 사이의 브릿지 역할을 합니다.

## 시스템 구성도

```
┌─────────────────┐         WebSocket / REST API         ┌──────────────────────┐
│   Mattermost    │ ◄──────────────────────────────────► │  MCP Channel Server  │
│   Server        │    events (posted, typing, ...)      │  (Node.js)           │
└─────────────────┘    API calls (createPost, ...)       └──────────┬───────────┘
                                                                    │ stdio
                                                                    │ (MCP protocol)
                                                                    ▼
                                                         ┌──────────────────────┐
                                                         │  Claude Code 세션     │
                                                         │  (Tools, Notifications│
                                                         └──────────────────────┘
```

## 모듈 구조

```
src/
├── index.ts              # 진입점: MCP 서버 생성, 메시지 핸들러, 라이프사이클 관리
├── config.ts             # 환경변수 로딩 및 Zod 스키마 검증
├── mattermost-client.ts  # Mattermost WebSocket + REST API 클라이언트
└── tools/
    ├── reply.ts          # reply MCP 도구: Claude → Mattermost 메시지 전송
    └── permission.ts     # 권한 릴레이: 도구 승인 요청 ↔ 관리자 DM
```

### 모듈 의존 관계

```
index.ts
  ├── config.ts           (loadConfig)
  ├── mattermost-client.ts (MattermostClient)
  ├── tools/reply.ts       (registerReplyTool)
  └── tools/permission.ts  (registerPermissionRelay, parsePermissionVerdict, emitPermissionVerdict)
```

## 메시지 흐름

### 1. 인바운드 (Mattermost → Claude)

```
Mattermost 사용자가 메시지 전송
        │
        ▼
WebSocket "posted" 이벤트 수신 (mattermost-client.ts)
        │
        ▼
index.ts 메시지 핸들러
        │
        ├── 자신의 메시지인가? → SKIP
        ├── LISTEN_CHANNELS에 포함되는가? → 아니면 SKIP
        ├── ALLOWED_USERS에 포함되는가? → 아니면 SKIP
        ├── 관리자의 권한 응답인가? → emitPermissionVerdict() 처리
        │
        ▼
MCP notification 전송 (notifications/claude/channel)
        │
        ▼
Claude Code 세션에서 XML 형식으로 수신:
<channel source="mattermost-channel" user_id="..." username="..." channel_id="...">
  메시지 내용
</channel>
```

### 2. 아웃바운드 (Claude → Mattermost)

```
Claude가 reply 도구 호출
        │
        ▼
tools/reply.ts 핸들러
        │
        ├── channel_id 있음 → createPost(channel_id, text)
        └── user_id만 있음 → createDirectChannel(user_id) → createPost(dm.id, text)
        │
        ▼
Mattermost REST API POST /api/v4/posts
        │
        ▼
Mattermost 채널/DM에 메시지 표시
```

### 3. 권한 릴레이

```
Claude Code에서 도구 승인 필요
        │
        ▼
MCP notification: notifications/claude/channel/permission_request
        │
        ▼
tools/permission.ts → 각 ADMIN_USERS에게 DM 전송
        │
        ▼
관리자가 "yes <id>" 또는 "no <id>"로 응답
        │
        ▼
WebSocket으로 수신 → parsePermissionVerdict()
        │
        ▼
MCP notification: notifications/claude/channel/permission
        │
        ▼
Claude Code가 승인/거부 결과 수신
```

## WebSocket 연결 관리

`MattermostClient`는 WebSocket 연결의 전체 라이프사이클을 관리합니다:

1. **연결**: `ws://{url}/api/v4/websocket`으로 WebSocket 연결
2. **인증**: `authentication_challenge` 메시지로 토큰 인증
3. **이벤트 수신**: `posted` 등의 이벤트를 파싱하여 핸들러에 전달
4. **자동 재연결**: 연결 끊김 시 지수 백오프(1초 → 최대 30초)로 재연결 시도
5. **정상 종료**: SIGINT/SIGTERM 시 WebSocket을 정상적으로 닫음

## MCP 프로토콜 활용

### Capabilities

서버가 선언하는 MCP 기능:

```typescript
capabilities: {
  experimental: {
    'claude/channel': {},           // 채널 메시지 수신/발신
    'claude/channel/permission': {}, // 권한 릴레이
  },
  tools: {},  // reply 도구
}
```

### Notifications

| 방향 | Method | 용도 |
|------|--------|------|
| Server → Claude | `notifications/claude/channel` | Mattermost 메시지 전달 |
| Claude → Server | `notifications/claude/channel/permission_request` | 도구 승인 요청 |
| Server → Claude | `notifications/claude/channel/permission` | 승인/거부 결과 |

### Tools

| 이름 | 입력 | 용도 |
|------|------|------|
| `reply` | `channel_id?`, `user_id?`, `text` | Mattermost에 메시지 전송 |

## 보안 모델

1. **발신자 게이팅**: `ALLOWED_USERS`로 허용된 사용자만 Claude에게 메시지 전달
2. **관리자 권한**: `ADMIN_USERS`만 도구 승인/거부 가능
3. **토큰 관리**: `MATTERMOST_TOKEN`은 환경변수로만 전달, 코드에 하드코딩하지 않음
4. **자기 메시지 필터**: 봇 자신의 메시지는 무시하여 무한 루프 방지

## 제약사항

- **Research Preview**: Claude Code Channel API는 변경될 수 있음
- **로그인 필수**: claude.ai 로그인 필요 (API key 불가)
- **플래그 필수**: `--dangerously-load-development-channels` 플래그 필요
- **로컬 실행**: 각 사용자가 자신의 로컬 머신에서 실행
