# 개발 가이드

## 개발 환경 설정

### 사전 요구사항

- Node.js 22+ (네이티브 `WebSocket`, `fetch` 사용)
- npm

### 설치

```bash
npm install
```

### 개발 모드 실행

```bash
npm run dev
```

파일 변경 시 자동으로 재시작됩니다 (`--watch` 모드).

### 타입 체크

```bash
npm run typecheck
```

### 빌드

```bash
npm run build
```

`dist/` 디렉토리에 컴파일된 JavaScript가 생성됩니다.

## 프로젝트 구조

```
mattermost-claude-channel/
├── src/
│   ├── index.ts              # 진입점
│   ├── config.ts             # 환경변수 설정
│   ├── mattermost-client.ts  # Mattermost 클라이언트
│   └── tools/
│       ├── reply.ts          # reply 도구
│       └── permission.ts     # 권한 릴레이
├── docs/                     # 문서
├── .mcp.json.example         # MCP 설정 템플릿
├── package.json
└── tsconfig.json
```

## 설정 스키마

`config.ts`에서 Zod로 환경변수를 검증합니다:

| 필드 | 타입 | 기본값 | 환경변수 |
|------|------|--------|----------|
| `mattermostUrl` | `string` (URL) | 필수 | `MATTERMOST_URL` |
| `mattermostToken` | `string` | 필수 | `MATTERMOST_TOKEN` |
| `allowedUsers` | `string[]` | `[]` | `ALLOWED_USERS` |
| `adminUsers` | `string[]` | `[]` | `ADMIN_USERS` |
| `logLevel` | `"debug" \| "info" \| "warn" \| "error"` | `"info"` | `LOG_LEVEL` |
| `listenChannels` | `string[]` | `[]` | `LISTEN_CHANNELS` |
| `logFile` | `string?` | 없음 | `LOG_FILE` |

쉼표 구분 문자열은 자동으로 배열로 파싱됩니다 (`ALLOWED_USERS=a,b,c` → `["a", "b", "c"]`).

## 로깅

로그는 항상 `stderr`로 출력됩니다 (MCP는 `stdio`를 사용하므로 `stdout`은 프로토콜 전용).

`LOG_FILE` 환경변수를 설정하면 파일에도 동시에 기록됩니다:

```
LOG_FILE=/tmp/mattermost-mcp.log
```

로그 형식:
```
[2025-01-01T00:00:00.000Z] [mattermost] INFO Connected to wss://...
[2025-01-01T00:00:00.000Z] [handler] posted event: post=true, user_id=abc, ...
```

## 새로운 도구 추가하기

1. `src/tools/` 디렉토리에 새 파일 생성
2. `registerXxxTool(server, client)` 함수를 export
3. `index.ts`에서 import 후 등록

```typescript
// src/tools/my-tool.ts
import type { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import type { MattermostClient } from '../mattermost-client.js';

export function registerMyTool(server: Server, client: MattermostClient): void {
  // ListToolsRequestSchema 핸들러에 도구 정의 추가
  // CallToolRequestSchema 핸들러에 실행 로직 추가
}
```

> **참고**: 현재 MCP SDK는 하나의 `ListToolsRequestSchema` 핸들러만 지원합니다.
> 여러 도구를 등록하려면 기존 `reply.ts`의 핸들러를 확장하거나,
> 도구 등록을 중앙에서 관리하는 구조로 리팩토링이 필요합니다.

## Mattermost API 참고

### 사용하는 API 엔드포인트

| Method | Endpoint | 용도 |
|--------|----------|------|
| GET | `/api/v4/users/me` | 봇 자신의 정보 조회 |
| GET | `/api/v4/users/{id}` | 사용자 정보 조회 |
| POST | `/api/v4/posts` | 메시지 전송 |
| POST | `/api/v4/channels/direct` | DM 채널 생성 |
| WS | `/api/v4/websocket` | 실시간 이벤트 수신 |

### Bot 권한 요구사항

봇 계정에 다음 권한이 필요합니다:
- 채널 메시지 읽기/쓰기
- DM 생성 및 전송
- 사용자 정보 조회

## 디버깅 팁

1. **로그 레벨을 `debug`로 설정**: 모든 WebSocket 이벤트와 메시지 처리 과정을 확인
2. **파일 로깅 활성화**: `LOG_FILE=/tmp/mattermost-mcp.log` 설정 후 `tail -f`로 실시간 확인
3. **Mattermost 사용자 ID 확인**: Mattermost 관리 패널 또는 API에서 확인 가능
4. **채널 ID 확인**: 채널 URL의 마지막 경로 또는 Mattermost API로 확인
