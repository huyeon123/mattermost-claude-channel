#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Mattermost Claude Channel - 자동 설치 스크립트
# =============================================================================

# --- 색상 정의 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# --- 유틸리티 함수 ---
info()    { echo -e "${BLUE}ℹ${RESET}  $*"; }
success() { echo -e "${GREEN}✓${RESET}  $*"; }
warn()    { echo -e "${YELLOW}⚠${RESET}  $*"; }
error()   { echo -e "${RED}✗${RESET}  $*" >&2; }
bold()    { echo -e "${BOLD}$*${RESET}"; }
section() { echo -e "\n${CYAN}${BOLD}=== $* ===${RESET}\n"; }

prompt_required() {
  local var_name="$1"
  local prompt_msg="$2"
  local value=""
  while [[ -z "$value" ]]; do
    echo -ne "${BOLD}${prompt_msg}${RESET} "
    read -r value
    if [[ -z "$value" ]]; then
      warn "이 항목은 필수입니다. 다시 입력해주세요."
    fi
  done
  printf -v "$var_name" '%s' "$value"
}

prompt_optional() {
  local var_name="$1"
  local prompt_msg="$2"
  local default_val="${3:-}"
  local value=""
  if [[ -n "$default_val" ]]; then
    echo -ne "${BOLD}${prompt_msg}${RESET} ${YELLOW}[기본값: ${default_val}]${RESET} "
  else
    echo -ne "${BOLD}${prompt_msg}${RESET} ${YELLOW}[Enter로 건너뛰기]${RESET} "
  fi
  read -r value
  if [[ -z "$value" && -n "$default_val" ]]; then
    value="$default_val"
  fi
  printf -v "$var_name" '%s' "$value"
}

# =============================================================================
# 시작 배너
# =============================================================================
echo ""
echo -e "${CYAN}${BOLD}"
echo "  ╔══════════════════════════════════════════════════════╗"
echo "  ║     Mattermost Claude Channel 설치 스크립트          ║"
echo "  ╚══════════════════════════════════════════════════════╝"
echo -e "${RESET}"
echo ""
info "이 스크립트는 Mattermost Claude Channel MCP 서버를 설정합니다."
echo ""

# 스크립트가 있는 디렉토리의 상위(프로젝트 루트)로 이동
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"
info "프로젝트 경로: ${BOLD}$PROJECT_ROOT${RESET}"

# =============================================================================
# Step 1: Node.js 버전 확인
# =============================================================================
section "Step 1: 사전 요구사항 확인"

if ! command -v node &>/dev/null; then
  error "Node.js가 설치되어 있지 않습니다."
  echo ""
  echo "  Node.js 22 이상을 설치해주세요:"
  echo "  - 공식 사이트: https://nodejs.org"
  echo "  - nvm 사용: nvm install 22 && nvm use 22"
  echo ""
  exit 1
fi

NODE_VERSION=$(node --version | sed 's/v//')
NODE_MAJOR=$(echo "$NODE_VERSION" | cut -d. -f1)

if [[ "$NODE_MAJOR" -lt 22 ]]; then
  error "Node.js 버전이 너무 낮습니다: v${NODE_VERSION} (필요: v22 이상)"
  echo ""
  echo "  업그레이드 방법:"
  echo "  - 공식 사이트: https://nodejs.org"
  echo "  - nvm 사용: nvm install 22 && nvm use 22"
  echo ""
  exit 1
fi

success "Node.js v${NODE_VERSION} 확인 완료"

if ! command -v npm &>/dev/null; then
  error "npm이 설치되어 있지 않습니다."
  exit 1
fi

NPM_VERSION=$(npm --version)
success "npm v${NPM_VERSION} 확인 완료"

# =============================================================================
# Step 2: npm install
# =============================================================================
section "Step 2: 의존성 설치"

if [[ -d "$PROJECT_ROOT/node_modules" ]]; then
  info "node_modules가 이미 존재합니다."
  prompt_optional REINSTALL "다시 설치할까요? (y/N)" "N"
  if [[ "${REINSTALL,,}" == "y" ]]; then
    info "npm install 실행 중..."
    npm install
    success "의존성 설치 완료"
  else
    success "기존 의존성을 사용합니다."
  fi
else
  info "npm install 실행 중..."
  if npm install; then
    success "의존성 설치 완료"
  else
    error "npm install 실패. --legacy-peer-deps 옵션으로 재시도합니다..."
    npm install --legacy-peer-deps
    success "의존성 설치 완료 (legacy-peer-deps)"
  fi
fi

# =============================================================================
# Step 3: 환경변수 수집
# =============================================================================
section "Step 3: Mattermost 연결 설정"

echo "필수 항목(*) 과 선택 항목을 입력해주세요."
echo ""

# --- MATTERMOST_URL (필수) ---
bold "* Mattermost 서버 URL"
info "예: https://mattermost.example.com"
prompt_required MATTERMOST_URL "  URL:"

# URL 끝 슬래시 제거
MATTERMOST_URL="${MATTERMOST_URL%/}"

# http(s):// 접두사 확인
if [[ ! "$MATTERMOST_URL" =~ ^https?:// ]]; then
  warn "URL이 http:// 또는 https://로 시작하지 않습니다. https://를 자동으로 추가합니다."
  MATTERMOST_URL="https://${MATTERMOST_URL}"
fi
info "설정된 URL: ${BOLD}${MATTERMOST_URL}${RESET}"
echo ""

# --- MATTERMOST_TOKEN (필수) ---
bold "* Mattermost Bot 토큰 또는 Personal Access Token"
echo ""
echo "  토큰 발급 방법:"
echo "  1. Mattermost 관리자 로그인"
echo "  2. Main Menu → Integrations → Bot Accounts"
echo "  3. Add Bot Account → 생성 후 토큰 복사"
echo "  (또는 Profile → Security → Personal Access Tokens)"
echo ""
prompt_required MATTERMOST_TOKEN "  Token:"
info "토큰이 설정되었습니다."
echo ""

# --- ALLOWED_USERS (선택) ---
bold "허용된 사용자 ID 목록 (선택)"
info "비어있으면 모든 사용자의 메시지를 수신합니다."
info "사용자 ID는 Mattermost API /api/v4/users/me 에서 확인할 수 있습니다."
prompt_optional ALLOWED_USERS "  ALLOWED_USERS (쉼표로 구분):" ""
echo ""

# --- ADMIN_USERS (선택) ---
bold "관리자 사용자 ID (선택)"
info "도구 승인 요청을 받을 관리자의 사용자 ID를 입력합니다."
prompt_optional ADMIN_USERS "  ADMIN_USERS (쉼표로 구분):" ""
echo ""

# --- LISTEN_CHANNELS (선택) ---
bold "수신할 채널 ID 목록 (선택)"
info "비어있으면 DM(다이렉트 메시지)만 수신합니다."
info "채널 ID는 채널 URL 또는 API /api/v4/channels 에서 확인할 수 있습니다."
prompt_optional LISTEN_CHANNELS "  LISTEN_CHANNELS (쉼표로 구분):" ""
echo ""

# --- LOG_LEVEL (선택) ---
bold "로그 레벨 (선택)"
info "선택지: debug / info / warn / error"
prompt_optional LOG_LEVEL "  LOG_LEVEL:" "info"

# 유효성 검사
if [[ ! "$LOG_LEVEL" =~ ^(debug|info|warn|error)$ ]]; then
  warn "유효하지 않은 로그 레벨입니다. 기본값 'info'를 사용합니다."
  LOG_LEVEL="info"
fi
echo ""

# --- LOG_FILE (선택) ---
bold "로그 파일 경로 (선택)"
info "예: /tmp/mattermost-mcp.log (비어있으면 파일 로깅 비활성화)"
prompt_optional LOG_FILE "  LOG_FILE:" ""
echo ""

# =============================================================================
# Step 4: .mcp.json 생성
# =============================================================================
section "Step 4: .mcp.json 설정 파일 생성"

MCP_JSON_PATH="$PROJECT_ROOT/.mcp.json"

# 기존 파일 백업
if [[ -f "$MCP_JSON_PATH" ]]; then
  BACKUP_PATH="${MCP_JSON_PATH}.backup.$(date +%Y%m%d_%H%M%S)"
  warn "기존 .mcp.json 파일이 있습니다. 백업합니다: ${BACKUP_PATH}"
  cp "$MCP_JSON_PATH" "$BACKUP_PATH"
fi

# LOG_FILE env 항목 (비어있으면 생략)
if [[ -n "$LOG_FILE" ]]; then
  LOG_FILE_ENTRY=",
        \"LOG_FILE\": \"${LOG_FILE}\""
else
  LOG_FILE_ENTRY=""
fi

cat > "$MCP_JSON_PATH" <<EOF
{
  "mcpServers": {
    "mattermost-channel": {
      "command": "node",
      "args": ["--import", "tsx", "${PROJECT_ROOT}/src/index.ts"],
      "env": {
        "MATTERMOST_URL": "${MATTERMOST_URL}",
        "MATTERMOST_TOKEN": "${MATTERMOST_TOKEN}",
        "ALLOWED_USERS": "${ALLOWED_USERS}",
        "ADMIN_USERS": "${ADMIN_USERS}",
        "LOG_LEVEL": "${LOG_LEVEL}",
        "LISTEN_CHANNELS": "${LISTEN_CHANNELS}"${LOG_FILE_ENTRY}
      }
    }
  }
}
EOF

success ".mcp.json 생성 완료: ${MCP_JSON_PATH}"

# 민감 정보를 제외한 내용 출력
echo ""
info "생성된 설정 내용 (토큰은 마스킹됨):"
echo ""
TOKEN_MASKED="${MATTERMOST_TOKEN:0:4}****${MATTERMOST_TOKEN: -4}"
cat <<EOF
  {
    "mcpServers": {
      "mattermost-channel": {
        "command": "node",
        "args": ["--import", "tsx", "${PROJECT_ROOT}/src/index.ts"],
        "env": {
          "MATTERMOST_URL": "${MATTERMOST_URL}",
          "MATTERMOST_TOKEN": "${TOKEN_MASKED}",
          "ALLOWED_USERS": "${ALLOWED_USERS}",
          "ADMIN_USERS": "${ADMIN_USERS}",
          "LOG_LEVEL": "${LOG_LEVEL}",
          "LISTEN_CHANNELS": "${LISTEN_CHANNELS}"
        }
      }
    }
  }
EOF
echo ""

# =============================================================================
# Step 5: 연결 유효성 확인 (선택)
# =============================================================================
section "Step 5: Mattermost 연결 테스트 (선택)"

prompt_optional RUN_TEST "연결 테스트를 실행할까요? Mattermost API를 호출하여 토큰을 검증합니다. (y/N)" "N"

if [[ "${RUN_TEST,,}" == "y" ]]; then
  info "Mattermost API 연결 테스트 중..."

  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -H "Authorization: Bearer ${MATTERMOST_TOKEN}" \
    "${MATTERMOST_URL}/api/v4/users/me" 2>/dev/null || echo "000")

  case "$HTTP_STATUS" in
    200)
      success "연결 테스트 성공! 토큰이 유효합니다."
      ;;
    401)
      error "인증 실패 (401 Unauthorized). 토큰이 유효하지 않습니다."
      warn ".mcp.json의 MATTERMOST_TOKEN 값을 다시 확인해주세요."
      ;;
    000)
      error "서버에 연결할 수 없습니다. MATTERMOST_URL을 확인해주세요."
      warn "curl 명령어가 없거나 서버가 응답하지 않습니다."
      ;;
    *)
      warn "예상치 못한 응답 코드: ${HTTP_STATUS}"
      warn "서버 설정을 확인해주세요."
      ;;
  esac
else
  info "연결 테스트를 건너뜁니다."
fi

# =============================================================================
# 완료 안내
# =============================================================================
section "설치 완료"

success "Mattermost Claude Channel 설정이 완료되었습니다!"
echo ""
bold "다음 단계:"
echo ""
echo "  1. Claude Code에서 MCP 서버를 시작하려면:"
echo ""
echo -e "     ${CYAN}claude --dangerously-load-development-channels server:mattermost-channel${RESET}"
echo ""
echo "  2. 다른 프로젝트에서도 사용하려면 .mcp.json을 해당 프로젝트 루트에 복사하세요:"
echo ""
echo -e "     ${CYAN}cp ${MCP_JSON_PATH} /path/to/your/project/.mcp.json${RESET}"
echo ""
echo "  3. 전역 설정을 원하면 ~/.claude.json에 mcpServers 항목을 추가하세요."
echo ""
bold "트러블슈팅:"
echo "  - 메시지가 수신되지 않으면 LOG_LEVEL=debug 로 변경하여 디버그 로그를 확인하세요."
echo "  - 자세한 내용은 README.md 또는 SETUP.md 를 참고하세요."
echo ""
info "설정 파일 위치: ${BOLD}${MCP_JSON_PATH}${RESET}"
echo ""
