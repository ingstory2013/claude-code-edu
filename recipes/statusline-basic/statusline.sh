#!/usr/bin/env bash
# 상태줄: 현재 디렉터리 · git 브랜치 · 모델
#
# Claude Code가 세션 정보를 JSON으로 stdin에 넘겨준다.
# 매 프롬프트마다 실행되므로 느린 명령을 추가하지 말 것.

set -uo pipefail

payload="$(cat)"

field() {
  if command -v jq >/dev/null 2>&1; then
    printf '%s' "$payload" | jq -r "$1 // empty" 2>/dev/null
  fi
}

dir="$(field '.workspace.current_dir')"
[ -n "$dir" ] || dir="$PWD"

model="$(field '.model.display_name')"

branch=""
if git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  branch="$(git -C "$dir" branch --show-current 2>/dev/null)"
  # 변경사항이 있으면 표시
  if [ -n "$(git -C "$dir" status --porcelain 2>/dev/null)" ]; then
    branch="${branch}*"
  fi
fi

out="📁 $(basename "$dir")"
[ -n "$branch" ] && out="$out  🌿 $branch"
[ -n "$model" ] && out="$out  🤖 $model"

printf '%s' "$out"
