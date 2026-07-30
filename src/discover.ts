import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { stringify as stringifyYaml } from 'yaml';
import { z } from 'zod/v4';
import { requireAnthropicKey } from './config.js';
import { installFailureHandler } from './fail.js';
import { loadLibrary } from './library.js';
import { DRAFTS_DIR } from './paths.js';
import { CATEGORIES, LEVELS, draftTipSchema, type DraftTip } from './tip.js';

installFailureHandler();

const MODEL = 'claude-opus-5';
/** 서버 툴 반복 상한(pause_turn)에서 재개할 최대 횟수. */
const MAX_CONTINUATIONS = 5;

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    count: { type: 'string', default: '3' },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log(`사용법: tsx src/discover.ts [옵션]

  --dry-run       파일을 쓰지 않고 후보만 stdout에 출력한다.
  --count <n>     찾을 후보 개수 (기본 3).
  --help          이 도움말.

이 스크립트는 드래프트만 만든다. 사람이 tips/ 로 옮기기 전까지 발행되지 않는다.
`);
  process.exit(0);
}

const wanted = Number.parseInt(values.count ?? '3', 10);
if (!Number.isFinite(wanted) || wanted < 1 || wanted > 10) {
  console.error('--count는 1~10 사이여야 합니다.');
  process.exit(1);
}

requireAnthropicKey();
const client = new Anthropic();

// 기존 팁 목록을 프롬프트에 넣어 중복을 피하게 한다. 스키마 오류가 있는
// 파일이 있어도 탐색은 계속한다 — 중복 회피 목록은 최선을 다하면 충분하다.
const { tips, issues } = loadLibrary();
if (issues.length > 0) {
  console.warn(
    `경고: 라이브러리에 문제 ${issues.length}건이 있지만 탐색은 계속합니다.`,
  );
}
const existing = tips
  .map((t) => `- [${t.category}] ${t.id}: ${t.title}`)
  .join('\n');

const today = new Date().toISOString().slice(0, 10);

// ── 1단계: 웹검색으로 리서치 ───────────────────────────────────────────────
//
// 웹검색과 구조화 출력을 한 호출에 섞지 않는다. 검색은 자유 형식으로 충분히
// 조사하게 두고, 스키마 강제는 2단계에서 별도로 한다. 한 호출에 몰면 모델이
// 스키마를 맞추느라 조사를 일찍 끊는 경향이 있다.

const researchPrompt = `너는 사내 Claude Code 스터디 채널의 콘텐츠 큐레이터다.

우리는 매일 Claude Code 활용 팁을 하나씩 소개한다. 이미 다루고 있는 주제는 아래와 같다:

${existing || '(아직 없음)'}

웹을 검색해서 **위 목록에 없는** 새롭고 실질적으로 유용한 Claude Code 활용법을 ${wanted}개 찾아라.

우선순위:
1. 최근에 추가된 기능이나 새로 알려진 활용 패턴
2. 실제로 생산성 차이를 만드는 것 — "이런 것도 있다" 수준의 소개는 제외
3. 로컬 설정으로 적용할 수 있는 것 (스킬, 훅, 서브에이전트, 슬래시 커맨드, 설정 파일)

검색 대상으로 좋은 곳:
- code.claude.com/docs (특히 whats-new 페이지)
- Anthropic 엔지니어링 블로그
- 실제 사용 후기가 있는 기술 블로그·커뮤니티 글

각 후보에 대해 다음을 조사해 서술하라:
- 무엇인지, 어떤 문제를 해결하는지
- 어떻게 적용하는지 (구체적인 단계)
- 적용됐는지 확인하는 방법
- 왜 지금 소개할 만한지 (새로운 점)
- 근거가 되는 URL (반드시 실제로 검색해서 찾은 URL만. 지어내지 마라)

**존재를 확인하지 못한 기능은 후보에 넣지 마라.** 검색으로 뒷받침되지 않으면 그냥 제외하고 개수를 줄여라.
오늘 날짜는 ${today}다.`;

console.log(`1단계: 웹검색으로 신규 기법 조사 중 (목표 ${wanted}개)…`);

const messages: Anthropic.MessageParam[] = [
  { role: 'user', content: researchPrompt },
];

let research: Anthropic.Message | undefined;
for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt += 1) {
  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    output_config: { effort: 'high' },
    // dynamic filtering이 내장된 변형. code_execution을 따로 선언하지 않는다 —
    // 실행 환경이 둘이 되면 모델이 혼란스러워한다.
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 12 }],
    messages,
  });
  research = await stream.finalMessage();

  if (research.stop_reason !== 'pause_turn') break;

  // 서버 툴이 반복 상한에 걸렸다. assistant 턴을 붙여 되돌려주면 이어서 진행한다.
  if (attempt === MAX_CONTINUATIONS) {
    console.warn(
      `경고: pause_turn이 ${MAX_CONTINUATIONS}회 반복돼 조사를 중단합니다. 부분 결과로 진행합니다.`,
    );
    break;
  }
  console.log(`  … 서버 툴 반복 상한 도달, 재개 (${attempt + 1}/${MAX_CONTINUATIONS})`);
  messages.push({ role: 'assistant', content: research.content });
}

if (!research) {
  console.error('리서치 호출이 결과를 반환하지 않았습니다.');
  process.exit(1);
}

if (research.stop_reason === 'refusal') {
  console.error('리서치 요청이 거부되었습니다. 프롬프트를 확인하세요.');
  process.exit(1);
}

const researchText = research.content
  .filter((block): block is Anthropic.TextBlock => block.type === 'text')
  .map((block) => block.text)
  .join('\n')
  .trim();

if (!researchText) {
  console.error('리서치 결과가 비어 있습니다.');
  process.exit(1);
}

const searchCount = research.content.filter(
  (block) => block.type === 'server_tool_use',
).length;
console.log(`  조사 완료 (웹검색 ${searchCount}회, ${researchText.length}자)`);

// ── 2단계: 스키마에 맞춰 추출 ─────────────────────────────────────────────

const candidateSchema = z.object({
  candidates: z
    .array(
      z.object({
        id: z
          .string()
          .describe('kebab-case 식별자. 소문자, 숫자, 하이픈만.'),
        title: z.string().describe('한국어 제목. 한 줄로 무엇인지 드러날 것.'),
        category: z.enum(CATEGORIES),
        level: z.enum(LEVELS),
        summary: z.string().describe('한국어 2~3문장 요약.'),
        why: z.string().describe('어떤 문제를 해결하는지 1~2문장.'),
        how: z
          .array(z.string())
          .describe('적용 단계. 2~6개, 각 항목 한 줄.'),
        verify: z.string().describe('적용됐는지 확인하는 방법.'),
        novelty: z
          .string()
          .describe('왜 지금 소개할 만한지 — 리뷰어가 판단할 근거.'),
        sources: z
          .array(z.string())
          .describe('실제로 검색해 확인한 URL만. 지어내지 말 것.'),
        tags: z.array(z.string()),
      }),
    )
    .describe('스키마를 채울 수 없는 후보는 아예 빼라. 개수가 줄어도 된다.'),
});

console.log('2단계: 팁 스키마로 정리 중…');

const extraction = await client.messages.parse({
  model: MODEL,
  max_tokens: 16000,
  output_config: { format: zodOutputFormat(candidateSchema) },
  messages: [
    {
      role: 'user',
      content: `아래는 새 Claude Code 활용법에 대한 조사 결과다. 이걸 팁 스키마에 맞춰 정리하라.

한국어로 쓴다. 다음 팀의 문체를 따른다: 담백하게, 과장 없이, 실제로 무엇이 달라지는지 중심으로.
"혁신적인", "강력한" 같은 수식어를 쓰지 않는다.

sources에는 조사 결과에 실제로 등장한 URL만 넣는다. 없으면 그 후보를 통째로 제외한다.

<조사결과>
${researchText}
</조사결과>`,
    },
  ],
});

const parsed = extraction.parsed_output;
if (!parsed) {
  console.error('구조화 추출에 실패했습니다.');
  process.exit(1);
}

// 최종 검증은 실제 발행 스키마로 한다. 모델이 만든 값이라도 여기를 통과해야
// 드래프트로 남긴다 — 통과 못 한 항목은 버리고 이유를 로그로 남긴다.
const accepted: DraftTip[] = [];
for (const candidate of parsed.candidates) {
  const draft = draftTipSchema.safeParse({
    ...candidate,
    status: 'draft' as const,
    added: today,
  });
  if (!draft.success) {
    console.warn(
      `  건너뜀 "${candidate.id}": ${draft.error.issues
        .map((i) => `${i.path.join('.')} ${i.message}`)
        .join('; ')}`,
    );
    continue;
  }
  if (tips.some((t) => t.id === draft.data.id)) {
    console.warn(`  건너뜀 "${draft.data.id}": 이미 라이브러리에 있는 id`);
    continue;
  }
  accepted.push(draft.data);
}

if (accepted.length === 0) {
  console.log('\n사용할 만한 후보가 없습니다. 드래프트를 만들지 않습니다.');
  process.exit(0);
}

console.log(`\n후보 ${accepted.length}개:`);
for (const draft of accepted) {
  console.log(`  • [${draft.category}] ${draft.title}`);
  console.log(`    ${draft.novelty.trim().split('\n')[0]}`);
  console.log(`    출처: ${draft.sources.join(', ')}`);
}

if (values['dry-run']) {
  console.log('\n(dry-run: 파일을 쓰지 않았습니다)');
  process.exit(0);
}

mkdirSync(DRAFTS_DIR, { recursive: true });
const written: string[] = [];
for (const draft of accepted) {
  const file = join(DRAFTS_DIR, `${today}-${draft.id}.yml`);
  writeFileSync(file, stringifyYaml(draft, { lineWidth: 0 }), 'utf8');
  written.push(file);
}

console.log(`\n✓ 드래프트 ${written.length}건 작성:`);
for (const file of written) console.log(`  ${file}`);

// 워크플로가 PR 본문을 만들 때 쓴다.
const summaryPath = join(DRAFTS_DIR, '.pr-body.md');
const body = [
  `Claude API + 웹검색이 찾은 신규 팁 후보 ${accepted.length}건입니다.`,
  '',
  '**이 후보들은 아직 발행되지 않습니다.** 검토 후 쓸 만한 것만',
  '`tips/<카테고리>/<id>.yml` 로 옮기고 `status`/`novelty` 필드를 지운 뒤 머지하세요.',
  '나머지는 파일을 지우면 됩니다.',
  '',
  '---',
  '',
  ...accepted.flatMap((draft) => [
    `### ${draft.title}`,
    '',
    `- **카테고리**: ${draft.category} / 난이도 ${draft.level}`,
    `- **요약**: ${draft.summary.trim().replace(/\n/g, ' ')}`,
    `- **왜 지금**: ${draft.novelty.trim().replace(/\n/g, ' ')}`,
    `- **출처**: ${draft.sources.map((s) => `<${s}>`).join(' ')}`,
    '',
  ]),
  '검토 시 확인할 것: 출처가 실제로 존재하는지, 설명이 현재 동작과 맞는지,',
  '이미 있는 팁과 겹치지 않는지.',
].join('\n');
writeFileSync(summaryPath, body, 'utf8');
console.log(`  ${summaryPath} (PR 본문)`);
