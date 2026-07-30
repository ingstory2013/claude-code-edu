# claude-code-edu

`#claude-code` 슬랙 채널에 **평일 매일 오전 9시** Claude Code 활용법을 하나씩 소개하는 봇.

각 메시지는 두 가지를 함께 준다:

1. **이해하기 쉬운 요약** — 무엇이고, 어떤 문제를 해결하는지
2. **로컬에 바로 적용하는 한 줄** — 복사해 붙여넣으면 `~/.claude`에 설정이 들어간다

소재는 리포에 큐레이션된 45개 팁에서 나온다. 별도 주간 잡이 Claude API + 웹검색으로
신규 기법을 찾아 `drafts/`에 PR로 올리고, 사람이 승인한 것만 라이브러리에 편입된다.

---

## 1. 설치 — 처음 세팅하기

### 1-1. 슬랙 앱 만들기

봇이 채널에 글을 쓰려면 슬랙 앱이 필요하다. 워크스페이스 관리자 권한이 있어야 한다.

1. <https://api.slack.com/apps> → **Create New App** → **From scratch**
2. 이름(예: `Claude Code 팁`)과 워크스페이스를 고른다
3. 왼쪽 메뉴 **OAuth & Permissions** → *Scopes* → *Bot Token Scopes* → **Add an OAuth Scope**
   - **`chat:write`** 하나만 추가한다. 다른 권한은 필요 없다.
4. 같은 페이지 위쪽 **Install to Workspace** → 승인
5. **Bot User OAuth Token**(`xoxb-`로 시작)을 복사한다 → 이게 `SLACK_BOT_TOKEN`
6. 슬랙에서 `#claude-code` 채널에 들어가 `/invite @앱이름` 으로 봇을 초대한다
   — 초대하지 않으면 `not_in_channel` 오류가 난다
7. 채널 이름 우클릭 → **채널 세부정보 보기** → 맨 아래 **채널 ID**(`C`로 시작) 복사
   → 이게 `SLACK_CHANNEL_ID`

> 채널 이름 대신 ID를 쓰는 이유: 채널 이름이 바뀌어도 봇이 계속 동작한다.

### 1-2. 리포 시크릿 등록

GitHub 리포 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| 이름 | 값 | 필요한 곳 |
|---|---|---|
| `SLACK_BOT_TOKEN` | 위에서 복사한 `xoxb-...` | 일일 포스팅 |
| `SLACK_CHANNEL_ID` | 위에서 복사한 `C...` | 일일 포스팅 |
| `ANTHROPIC_API_KEY` | <https://console.anthropic.com> 에서 발급 | 주간 탐색만 |

`ANTHROPIC_API_KEY`가 없어도 일일 포스팅은 정상 동작한다. 주간 탐색만 실패한다.

### 1-3. 동작 확인

리포 → **Actions** → **일일 팁 포스팅** → **Run workflow**

- `dry_run`을 **체크**하고 한 번 돌린다 → 슬랙에 보내지 않고 어떤 팁이 나갈지 로그로 확인
- 문제가 없으면 체크를 풀고 다시 돌린다 → 실제로 채널에 올라간다

이후로는 평일 오전 9시에 자동으로 돈다.

---

## 2. 로컬에서 쓰기

```bash
npm install

npm run lint:tips                        # 팁 45개 전부 검증
npx tsx src/post-daily.ts --dry-run      # 시크릿 없이 오늘 나갈 팁 확인
npx tsx src/post-daily.ts --tip <id>     # 특정 팁 지정 발행
npx tsx src/discover.ts --dry-run        # 신규 탐색 (ANTHROPIC_API_KEY 필요)
npm run typecheck
```

`--dry-run`은 시크릿 없이 돈다. Block Kit JSON을 그대로 출력하므로
<https://app.slack.com/block-kit-builder> 에 붙여넣어 실제 렌더링을 미리 볼 수 있다.

---

## 3. 레시피 — 팁을 로컬에 적용하기

슬랙 메시지의 설치 명령은 이 리포의 `install.sh`를 실행한다.

```bash
# 슬랙 메시지에 나오는 형태 (ref가 발행 시점 커밋으로 고정돼 있다)
curl -fsSL https://raw.githubusercontent.com/ingstory2013/claude-code-edu/<ref>/install.sh \
  | bash -s -- explore-agent --ref <ref>

# 뭘 하는지 먼저 보고 싶다면
curl -fsSL .../install.sh | bash -s -- explore-agent --dry-run

# 전체 목록
curl -fsSL .../install.sh | bash -s -- --list
```

> `--ref`가 왜 또 붙는가: 파이프로 실행된 스크립트는 자기가 어느 커밋에서 왔는지
> 알 수 없다. 이걸 빼면 스크립트만 고정되고 **레시피는 `main`에서** 받아와서,
> 몇 달 전 슬랙 메시지가 그 시점이 아닌 현재 레시피를 설치하게 된다.

**옵션**

| 옵션 | 동작 |
|---|---|
| `--dry-run` | 아무것도 쓰지 않고 설치 계획만 출력 |
| `--project` | `~/.claude` 대신 현재 디렉터리의 `./.claude`에 설치 |
| `--ref <ref>` | 레시피를 받아올 브랜치/태그/커밋 (기본 `main`) |
| `--list` | 설치 가능한 레시피 목록 |

### `curl \| bash`가 꺼려진다면

당연한 우려다. 스크립트는 이렇게 제한돼 있다:

- `~/.claude`(또는 `--project` 시 `./.claude`) **밖으로는 절대 쓰지 않는다** — 경로 검사로 강제
- `sudo`를 쓰지 않는다
- 쓰기 전에 **무엇을 어디에 쓸지 전부 출력한다**
- 기존 파일은 `<파일>.bak.<타임스탬프>`로 백업한다
- `settings.json`은 덮어쓰지 않고 **병합**한다 (배열은 이어붙이고 중복 제거 → 여러 번 실행해도 안전)
- `jq`가 없으면 병합을 건너뛰고 내용을 출력해 수동 처리하게 한다 — 잘못된 걸 쓰지 않는다

그래도 파이프가 싫으면 클론해서 직접 실행하면 결과가 같다:

```bash
git clone https://github.com/ingstory2013/claude-code-edu
cd claude-code-edu
./install.sh explore-agent --dry-run
```

### 현재 레시피

| id | 내용 |
|---|---|
| `explore-agent` | 읽기 전용 탐색 서브에이전트 |
| `review-subagent` | 코드 리뷰 전담 서브에이전트 |
| `map-command` | `/map` — 아키텍처 요약 생성 |
| `repeat-prompt-command` | `/explain` — 슬래시 커맨드 템플릿 |
| `team-convention-skill` | 팀 관례 스킬 템플릿 |
| `format-on-edit-hook` | 편집 후 자동 포맷 |
| `test-on-stop-hook` | 작업 종료 전 테스트 실행 |
| `notify-on-stop-hook` | 작업 완료 알림 |
| `session-start-hook` | 세션 시작 시 git 상태 주입 |
| `permission-allowlist` | 안전한 명령 사전 허용 |
| `statusline-basic` | 상태줄에 디렉터리·브랜치·모델 표시 |

---

## 4. 팁 추가하기

`tips/<카테고리>/<id>.yml` 파일 하나를 만들면 끝이다. 파일명(확장자 제외)과 `id`가
같아야 하고, `category`가 디렉터리와 같아야 한다.

```yaml
id: my-new-tip                    # kebab-case, 파일명과 동일
title: 한 줄로 무엇인지 드러나는 제목
category: orchestration           # 디렉터리와 일치
level: beginner                   # beginner | intermediate | advanced
summary: |                        # 2~3문장. 슬랙 본문에 그대로 나간다
why: |                            # 어떤 문제를 해결하는지 1~2문장
how:                              # 2~6단계, 각 항목 한 줄
  - 첫 단계
  - 둘째 단계
recipe: my-recipe                 # (선택) recipes/<id> 참조
verify: |                         # 적용됐는지 확인하는 방법
sources:                          # 최소 1개, 실제 URL
  - https://code.claude.com/docs/en/...
tags: [tag1, tag2]
added: '2026-07-30'
```

**카테고리**: `orchestration` · `token-efficiency` · `code-mapping` · `automation` · `workflow`

만든 뒤 반드시:

```bash
npm run lint:tips
npx tsx src/post-daily.ts --tip my-new-tip --dry-run   # 렌더링 확인
```

> **YAML 주의**: `summary`/`why`/`verify` 같은 블록 스칼라(`|`) 안에서는 따옴표가
> 그대로 출력된다. 그리고 `how` 항목이 `"`로 시작하면 YAML이 인용 스칼라로 해석해
> 파싱이 깨지므로 `- '"이렇게" 전체를 홑따옴표로 감싼다'` 형태로 써야 한다.
> `lint:tips`가 둘 다 잡아준다.

### 레시피도 함께 추가하려면

`recipes/<id>/manifest.yml`:

```yaml
id: my-recipe
name: 사람이 읽을 이름
files:
  - src: agents/foo.md            # recipes/<id>/ 기준 상대 경로
    dest: .claude/agents/foo.md   # 반드시 .claude/ 아래
  - src: settings.fragment.json
    dest: .claude/settings.json
    merge: json                   # 덮어쓰지 않고 병합
notes: |
  설치 후 알아야 할 것
```

그리고 `recipes/index.txt`에 id를 추가한다 — 원격 `--list`가 이 파일을 읽는다.
빠뜨리면 `lint:tips`가 잡아낸다.

---

## 5. 주간 신규 탐색

매주 월요일 오전 10시, Claude가 웹을 검색해 새 활용법을 찾아 PR을 올린다.

**중요: AI가 만든 후보는 자동으로 발행되지 않는다.** `src/library.ts`는 `tips/`만
읽고 `drafts/`는 무시한다. 사람이 옮겨야 나간다.

리뷰 절차:

1. PR 본문에서 각 후보의 요약·근거·출처를 읽는다
2. **출처 URL을 실제로 열어본다** — 존재하지 않는 기능을 그럴듯하게 쓸 수 있다
3. 쓸 만하면 `drafts/<날짜>-<id>.yml` → `tips/<카테고리>/<id>.yml`로 옮기고
   **`status`와 `novelty` 필드를 지운다** (발행 스키마에는 없는 필드다)
4. 나머지 드래프트 파일은 삭제한다
5. `npm run lint:tips`로 확인하고 머지한다

---

## 6. 구조

```
src/
  tip.ts          팁 스키마 (zod). 발행용 + 드래프트용
  library.ts      tips/**/*.yml 로드·검증. drafts/는 읽지 않는다
  lint-tips.ts    npm run lint:tips
  select.ts       로테이션 — 미발행 우선, 최근 3개 카테고리 회피, 소진 시 오래된 순
  state.ts        state/posted.json 읽기/쓰기
  render.ts       Block Kit 조립 (본문 + 스레드)
  slack.ts        chat.postMessage
  post-daily.ts   일일 발행 엔트리포인트
  discover.ts     주간 탐색 엔트리포인트
  config.ts       환경변수. 시크릿은 실제로 쓸 때만 검증
tips/<카테고리>/  팁 45개
recipes/<id>/     설치되는 파일 + manifest.yml
drafts/           AI 후보 (발행되지 않음)
state/posted.json 발행 기록. 워크플로가 커밋해 되돌린다
install.sh        원커맨드 설치기
```

### 설계 메모

- **설치 URL은 발행 시점 커밋 SHA로 고정된다.** 슬랙에 몇 달 남은 메시지의 설치
  명령이 그때 내용을 그대로 재현한다. `main`을 가리키면 나중에 다른 게 설치된다.
- **로테이션에 난수를 쓰지 않는다.** 같은 상태면 항상 같은 팁을 고르므로
  `--dry-run`으로 본 결과가 실제 발행될 것과 일치한다.
- **스레드 답글 실패는 전체를 실패시키지 않는다.** 본문은 이미 나갔으므로
  되돌릴 수 없다. state를 커밋하지 않으면 같은 팁이 다음 날 또 나간다.
- **탐색은 2단계로 나뉜다.** 웹검색과 구조화 출력을 한 호출에 섞으면 모델이
  스키마를 맞추느라 조사를 일찍 끊는다.

---

## 7. 문제가 생기면

| 증상 | 원인 |
|---|---|
| `not_in_channel` | 봇을 채널에 초대하지 않았다 → `/invite @앱이름` |
| `channel_not_found` | `SLACK_CHANNEL_ID`가 틀렸다. 채널 이름이 아니라 `C`로 시작하는 ID여야 한다 |
| `invalid_auth` | `SLACK_BOT_TOKEN`이 틀렸거나 만료됐다. `xoxb-`로 시작하는지 확인 |
| `missing_scope` | `chat:write` 스코프 추가 후 **재설치**해야 한다 |
| 같은 팁이 반복해서 나옴 | state 커밋이 실패하고 있다. Actions 로그의 "로테이션 상태 커밋" 단계 확인 |
| 탐색 PR이 안 올라옴 | 후보가 0건이면 PR을 만들지 않는다(정상). 로그에서 후보 수 확인 |

`DEBUG=1`을 붙이면 스택 트레이스가 나온다.
