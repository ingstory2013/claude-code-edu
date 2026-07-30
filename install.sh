#!/usr/bin/env bash
#
# claude-code-edu 레시피 설치기
#
# 슬랙 메시지의 팁을 로컬 Claude Code 설정에 적용한다.
#
#   curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/REF/install.sh | bash -s -- <recipe-id>
#
# 안전 원칙 (curl | bash로 실행되므로 명시한다):
#   - ~/.claude (또는 --project 시 ./.claude) 밖으로는 절대 쓰지 않는다
#   - sudo를 쓰지 않는다
#   - 쓰기 전에 무엇을 어디에 쓸지 전부 출력한다
#   - 기존 파일은 <파일>.bak.<타임스탬프>로 백업한다
#   - --dry-run으로 쓰기 없이 전체 계획을 확인할 수 있다
#
# 스크립트를 신뢰하지 않는다면 리포를 클론해 ./install.sh <recipe-id> 로
# 똑같은 결과를 얻을 수 있다.

set -euo pipefail

REPO_SLUG="${CLAUDE_EDU_REPO:-ingstory2013/claude-code-edu}"
# curl로 받아 실행될 때는 이 값이 배포 시점 ref로 치환된다.
# 로컬 클론에서는 리포 파일을 직접 쓰므로 이 값이 쓰이지 않는다.
REF="${CLAUDE_EDU_REF:-main}"
RAW_BASE="https://raw.githubusercontent.com/${REPO_SLUG}/${REF}"

DRY_RUN=0
SCOPE="user"     # user | project
RECIPE_ID=""
DO_LIST=0

# ── 출력 ─────────────────────────────────────────────────────────────────

if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_RED=$'\033[31m'; C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_RED=""; C_GREEN=""; C_YELLOW=""
fi

info()  { printf '%s\n' "$*"; }
ok()    { printf '%s✓%s %s\n' "$C_GREEN" "$C_RESET" "$*"; }
warn()  { printf '%s!%s %s\n' "$C_YELLOW" "$C_RESET" "$*" >&2; }
die()   { printf '%s✗%s %s\n' "$C_RED" "$C_RESET" "$*" >&2; exit 1; }

usage() {
  cat <<'USAGE'
사용법:
  install.sh <recipe-id> [옵션]
  install.sh --list

옵션:
  --dry-run     아무것도 쓰지 않고 설치 계획만 출력한다.
  --project     ~/.claude 대신 현재 디렉터리의 ./.claude 에 설치한다.
                (해당 프로젝트에서만 적용하고 싶을 때)
  --list        설치할 수 있는 레시피 목록을 출력한다.
  --help        이 도움말.

환경변수:
  CLAUDE_EDU_REPO   기본값 ingstory2013/claude-code-edu
  CLAUDE_EDU_REF    받아올 브랜치/태그/커밋. 기본값 main
USAGE
}

# ── 인자 파싱 ────────────────────────────────────────────────────────────

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --project) SCOPE="project" ;;
    --list)    DO_LIST=1 ;;
    --help|-h) usage; exit 0 ;;
    -*)        die "알 수 없는 옵션: $1 (--help 참고)" ;;
    *)
      if [ -n "$RECIPE_ID" ]; then
        die "레시피는 한 번에 하나만 설치할 수 있습니다: '$RECIPE_ID', '$1'"
      fi
      RECIPE_ID="$1"
      ;;
  esac
  shift
done

# ── 소스 판별: 로컬 클론이냐 원격이냐 ────────────────────────────────────

SCRIPT_DIR=""
if [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
fi

LOCAL_RECIPES=""
if [ -n "$SCRIPT_DIR" ] && [ -d "$SCRIPT_DIR/recipes" ]; then
  LOCAL_RECIPES="$SCRIPT_DIR/recipes"
fi

have() { command -v "$1" >/dev/null 2>&1; }

if [ -z "$LOCAL_RECIPES" ] && ! have curl; then
  die "curl이 필요합니다 (원격에서 레시피를 받아야 함)."
fi

# 레시피 파일 하나를 stdout으로 가져온다. 없으면 실패한다.
fetch() {
  local relpath="$1"
  if [ -n "$LOCAL_RECIPES" ]; then
    local full="$LOCAL_RECIPES/$relpath"
    [ -f "$full" ] || return 1
    cat "$full"
  else
    curl -fsSL "$RAW_BASE/recipes/$relpath"
  fi
}

# ── 레시피 목록 ──────────────────────────────────────────────────────────

# 원격에서는 디렉터리 목록을 얻을 수 없으므로 리포에 인덱스를 둔다.
list_recipes() {
  if [ -n "$LOCAL_RECIPES" ]; then
    find "$LOCAL_RECIPES" -mindepth 2 -maxdepth 2 -name manifest.yml \
      | sed "s|^$LOCAL_RECIPES/||; s|/manifest.yml$||" | sort
  else
    curl -fsSL "$RAW_BASE/recipes/index.txt" | grep -v '^[[:space:]]*$' | sort
  fi
}

if [ "$DO_LIST" -eq 1 ]; then
  info "${C_BOLD}설치 가능한 레시피${C_RESET}"
  while IFS= read -r id; do
    [ -n "$id" ] || continue
    name="$(fetch "$id/manifest.yml" 2>/dev/null | sed -n 's/^name:[[:space:]]*//p' | head -1)"
    printf '  %-28s %s\n' "$id" "${name:-}"
  done < <(list_recipes)
  info ""
  info "설치: install.sh <recipe-id>   (미리보기: --dry-run)"
  exit 0
fi

[ -n "$RECIPE_ID" ] || { usage; exit 1; }

case "$RECIPE_ID" in
  *[!a-z0-9-]*|-*|*-) die "레시피 id 형식이 올바르지 않습니다: '$RECIPE_ID'" ;;
esac

# ── 설치 루트 결정 ───────────────────────────────────────────────────────

if [ "$SCOPE" = "project" ]; then
  DEST_ROOT="$(pwd)/.claude"
  SCOPE_LABEL="이 프로젝트 ($DEST_ROOT)"
else
  [ -n "${HOME:-}" ] || die "HOME이 설정되지 않았습니다."
  DEST_ROOT="$HOME/.claude"
  SCOPE_LABEL="사용자 전역 ($DEST_ROOT)"
fi

# 대상 경로가 DEST_ROOT 안에 있는지 확인한다. 레시피 매니페스트는 리포에서
# 오지만, 그래도 경로 탈출을 여기서 막는다.
assert_inside_root() {
  local candidate="$1"
  case "$candidate" in
    */../*|*/..|../*|..) die "경로에 '..'가 있습니다: $candidate" ;;
    /*) die "매니페스트의 dest는 상대 경로여야 합니다: $candidate" ;;
  esac
  case "$candidate" in
    .claude/*) : ;;
    *) die "dest는 .claude/ 아래여야 합니다: $candidate" ;;
  esac
}

# ── 매니페스트 읽기 ──────────────────────────────────────────────────────
#
# yq 없이 돌아야 하므로 매니페스트의 files 블록만 좁게 파싱한다.
# 형식은 고정이며 lint가 검증한다:
#
#   files:
#     - src: agents/explore.md
#       dest: .claude/agents/explore.md
#       merge: json          # 선택
#
# 파서는 "- src:" / "dest:" / "merge:" 세 키만 본다.

MANIFEST="$(fetch "$RECIPE_ID/manifest.yml")" \
  || die "레시피 '$RECIPE_ID'를 찾을 수 없습니다. --list로 목록을 확인하세요."

RECIPE_NAME="$(printf '%s\n' "$MANIFEST" | sed -n 's/^name:[[:space:]]*//p' | head -1)"

# files 항목을 "src<TAB>dest<TAB>merge" 줄로 평탄화한다.
PLAN="$(printf '%s\n' "$MANIFEST" | awk '
  /^files:/ { in_files = 1; next }
  # 최상위 키가 나오면 files 블록 종료
  /^[a-zA-Z_]+:/ { if (in_files) { flush(); in_files = 0 } }
  !in_files { next }
  /^[[:space:]]*-[[:space:]]*src:[[:space:]]*/ {
    flush()
    line = $0
    sub(/^[[:space:]]*-[[:space:]]*src:[[:space:]]*/, "", line)
    src = line
    next
  }
  /^[[:space:]]*dest:[[:space:]]*/ {
    line = $0; sub(/^[[:space:]]*dest:[[:space:]]*/, "", line); dest = line; next
  }
  /^[[:space:]]*merge:[[:space:]]*/ {
    line = $0; sub(/^[[:space:]]*merge:[[:space:]]*/, "", line); merge = line; next
  }
  END { flush() }
  function flush() {
    if (src != "") printf "%s\t%s\t%s\n", src, dest, merge
    src = ""; dest = ""; merge = ""
  }
')"

[ -n "$PLAN" ] || die "매니페스트에 files 항목이 없습니다: recipes/$RECIPE_ID/manifest.yml"

# ── 계획 출력 ────────────────────────────────────────────────────────────

info ""
info "${C_BOLD}레시피${C_RESET}  $RECIPE_ID${RECIPE_NAME:+ — $RECIPE_NAME}"
info "${C_BOLD}대상${C_RESET}    $SCOPE_LABEL"
info "${C_BOLD}출처${C_RESET}    ${LOCAL_RECIPES:-$RAW_BASE/recipes}"
info ""
info "${C_BOLD}다음 파일을 씁니다:${C_RESET}"

while IFS=$'\t' read -r src dest merge; do
  [ -n "$src" ] || continue
  assert_inside_root "$dest"
  target="$DEST_ROOT/${dest#.claude/}"
  if [ "$merge" = "json" ]; then
    action="병합(JSON)"
  elif [ -e "$target" ]; then
    action="덮어씀 + 백업"
  else
    action="새로 생성"
  fi
  printf '  %-14s %s\n' "$action" "$target"
done <<< "$PLAN"

NOTES="$(printf '%s\n' "$MANIFEST" | awk '
  /^notes:[[:space:]]*\|/ { in_notes = 1; next }
  in_notes && /^[a-zA-Z_]+:/ { in_notes = 0 }
  in_notes { sub(/^[[:space:]][[:space:]]/, ""); print }
')"

if [ -n "$NOTES" ]; then
  info ""
  info "${C_BOLD}참고${C_RESET}"
  printf '%s\n' "$NOTES" | sed 's/^/  /'
fi

if [ "$DRY_RUN" -eq 1 ]; then
  info ""
  ok "dry-run — 아무것도 쓰지 않았습니다."
  exit 0
fi

# ── 설치 ─────────────────────────────────────────────────────────────────

STAMP="$(date +%Y%m%d%H%M%S)"
WROTE=0
SKIPPED=0

backup_if_exists() {
  local target="$1"
  if [ -e "$target" ]; then
    cp -p "$target" "$target.bak.$STAMP"
    info "    백업: $(basename "$target").bak.$STAMP"
  fi
}

info ""
while IFS=$'\t' read -r src dest merge; do
  [ -n "$src" ] || continue
  assert_inside_root "$dest"
  target="$DEST_ROOT/${dest#.claude/}"

  content="$(fetch "$RECIPE_ID/$src")" \
    || die "레시피 파일을 가져오지 못했습니다: $RECIPE_ID/$src"

  mkdir -p "$(dirname "$target")"

  if [ "$merge" = "json" ]; then
    if ! have jq; then
      warn "jq가 없어 $target 을 자동 병합할 수 없습니다."
      warn "아래 내용을 직접 병합해 주세요:"
      printf '%s\n' "$content" | sed 's/^/    /' >&2
      SKIPPED=$((SKIPPED + 1))
      continue
    fi
    existing='{}'
    if [ -s "$target" ]; then
      if ! jq empty "$target" 2>/dev/null; then
        die "$target 이 올바른 JSON이 아닙니다. 수동으로 확인해 주세요."
      fi
      existing="$(cat "$target")"
    fi
    backup_if_exists "$target"
    # 깊은 병합. 배열은 이어붙이고 중복은 제거한다 — permissions.allow 같은
    # 목록을 덮어쓰지 않고 추가하기 위해서다.
    printf '%s\n' "$existing" \
      | jq --argjson add "$content" '
          def deepmerge(a; b):
            if (a | type) == "object" and (b | type) == "object" then
              reduce (b | keys_unsorted[]) as $k (a;
                .[$k] = (if has($k) then deepmerge(.[$k]; b[$k]) else b[$k] end))
            elif (a | type) == "array" and (b | type) == "array" then
              (a + b) | unique
            else b
            end;
          deepmerge(.; $add)
        ' > "$target.tmp.$STAMP"
    mv "$target.tmp.$STAMP" "$target"
    ok "병합: $target"
  else
    backup_if_exists "$target"
    printf '%s\n' "$content" > "$target"
    ok "설치: $target"
  fi
  WROTE=$((WROTE + 1))
done <<< "$PLAN"

info ""
if [ "$SKIPPED" -gt 0 ]; then
  ok "완료 — $WROTE개 파일 적용, $SKIPPED개는 수동 처리가 필요합니다"
  warn "위의 수동 병합 안내를 확인해 주세요."
else
  ok "완료 — $WROTE개 파일 적용"
fi
info "${C_DIM}Claude Code를 재시작하거나 새 세션을 열면 적용됩니다.${C_RESET}"
