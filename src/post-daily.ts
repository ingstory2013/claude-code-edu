import { parseArgs } from 'node:util';
import { loadLibraryOrThrow } from './library.js';
import { renderTip } from './render.js';
import { selectTip, type Selection } from './select.js';
import { postTip } from './slack.js';
import { loadState, recordPosted, saveState } from './state.js';
import { installRef, repoSlug } from './config.js';

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    tip: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

if (values.help) {
  console.log(`사용법: tsx src/post-daily.ts [옵션]

  --dry-run       슬랙에 보내지 않고 선택 결과와 Block Kit JSON만 출력한다.
                  시크릿 없이 동작한다.
  --tip <id>      로테이션을 무시하고 특정 팁을 발행한다.
  --help          이 도움말.
`);
  process.exit(0);
}

const tips = loadLibraryOrThrow();
const state = loadState();

let selection: Selection;
if (values.tip) {
  const tip = tips.find((t) => t.id === values.tip);
  if (!tip) {
    console.error(`팁 "${values.tip}"를 찾을 수 없습니다.`);
    console.error(`사용 가능한 id: ${tips.map((t) => t.id).join(', ')}`);
    process.exit(1);
  }
  selection = {
    tip,
    sequence: state.posted.length + 1,
    reason: '--tip으로 직접 지정',
  };
} else {
  selection = selectTip(tips, state);
}

const rendered = renderTip(selection.tip, selection.sequence);

console.log(`선택: ${selection.tip.id} (${selection.tip.category})`);
console.log(`이유: ${selection.reason}`);
console.log(`발행 번호: #${selection.sequence} / 라이브러리 ${tips.length}개`);
console.log(`설치 URL ref: ${repoSlug}@${installRef}`);

if (values['dry-run']) {
  console.log('\n--- 본문 메시지 ---');
  console.log(JSON.stringify(rendered.main, null, 2));
  console.log('\n--- 스레드 답글 ---');
  console.log(JSON.stringify(rendered.thread, null, 2));
  console.log('\n(dry-run: 슬랙에 아무것도 보내지 않았습니다)');
  process.exit(0);
}

const result = await postTip(rendered);
console.log(`\n✓ 포스팅 완료 — channel=${result.channel} ts=${result.ts}`);
if (!result.threadTs) {
  console.warn('  스레드 답글은 붙지 않았습니다 (위 경고 참고).');
}

// 포스팅이 성공한 뒤에만 상태를 갱신한다. 실패했다면 같은 팁이 다음 실행에서
// 다시 후보가 되어야 한다.
saveState(recordPosted(state, selection.tip.id));
console.log('✓ state/posted.json 갱신');
