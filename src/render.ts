import type { KnownBlock } from '@slack/web-api';
import { installCommand } from './config.js';
import { CATEGORY_LABELS, LEVEL_LABELS, type Tip } from './tip.js';

/** Block Kit section.text의 하드 리밋. 넘기면 API가 거부한다. */
const SECTION_TEXT_LIMIT = 3000;
/** header.text는 훨씬 짧다. */
const HEADER_TEXT_LIMIT = 150;

function truncate(text: string, limit: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit - 1)}…`;
}

/**
 * YAML 블록 스칼라(`|`)로 쓴 본문은 작성자가 편집기 폭에 맞춰 줄바꿈한 결과라
 * 그대로 넣으면 슬랙에서 문장 중간이 끊긴다. 문단 안의 줄바꿈은 공백으로 접고
 * 빈 줄(문단 구분)만 살린다.
 */
function normalizeProse(text: string): string {
  return text
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.split('\n').join(' ').replace(/\s+/g, ' ').trim())
    .filter((paragraph) => paragraph.length > 0)
    .join('\n\n');
}

function mrkdwnSection(text: string): KnownBlock {
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: truncate(text, SECTION_TEXT_LIMIT) },
  };
}

export interface RenderedMessage {
  /** 알림·검색 결과에 뜨는 평문. */
  text: string;
  blocks: KnownBlock[];
}

export interface RenderedTip {
  main: RenderedMessage;
  /** 상세 단계와 출처. 본문 메시지의 스레드로 붙인다. */
  thread: RenderedMessage;
}

/**
 * 팁 하나를 슬랙 메시지 2개로 만든다.
 *
 * 채널을 깔끔하게 유지하려고 2단으로 나눈다. 본문은 "이게 뭐고 왜 좋은지 +
 * 설치 한 줄"까지만 담고, 단계별 적용법과 출처는 스레드에 넣어 관심 있는
 * 사람만 펼쳐 보게 한다.
 */
export function renderTip(tip: Tip, sequence: number): RenderedTip {
  const categoryLabel = CATEGORY_LABELS[tip.category];
  const levelLabel = LEVEL_LABELS[tip.level];

  const mainBlocks: KnownBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: truncate(`💡 ${tip.title}`, HEADER_TEXT_LIMIT),
        emoji: true,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `오늘의 Claude Code 팁 *#${sequence}*  ·  ${categoryLabel}  ·  난이도 ${levelLabel}`,
        },
      ],
    },
    mrkdwnSection(normalizeProse(tip.summary)),
    mrkdwnSection(`*이런 문제를 해결합니다*\n${normalizeProse(tip.why)}`),
  ];

  if (tip.recipe) {
    mainBlocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: truncate(
          '*로컬에 바로 적용하기* — 아래 한 줄을 터미널에 붙여넣으세요. ' +
            '`--dry-run`을 뒤에 붙이면 무엇을 어디에 쓸지 먼저 확인할 수 있습니다.\n' +
            `\`\`\`\n${installCommand(tip.recipe)}\n\`\`\``,
          SECTION_TEXT_LIMIT,
        ),
      },
    });
  }

  mainBlocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: '🧵 스레드에 단계별 적용법과 출처가 있습니다.',
      },
    ],
  });

  const steps = tip.how
    .map((step, index) => `${index + 1}. ${normalizeProse(step)}`)
    .join('\n');

  const threadBlocks: KnownBlock[] = [
    mrkdwnSection(`*적용 방법*\n${steps}`),
    mrkdwnSection(`*확인 방법*\n${normalizeProse(tip.verify)}`),
  ];

  const sourceLinks = tip.sources.map((url) => `• <${url}>`).join('\n');
  threadBlocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: truncate(
          `출처\n${sourceLinks}\n태그: ${tip.tags.join(', ')}`,
          SECTION_TEXT_LIMIT,
        ),
      },
    ],
  });

  return {
    main: {
      text: `오늘의 Claude Code 팁 #${sequence}: ${tip.title}`,
      blocks: mainBlocks,
    },
    thread: {
      text: `${tip.title} — 적용 방법`,
      blocks: threadBlocks,
    },
  };
}
