import { z } from 'zod/v4';

export const CATEGORIES = [
  'orchestration',
  'token-efficiency',
  'code-mapping',
  'automation',
  'workflow',
] as const;

export type Category = (typeof CATEGORIES)[number];

/** 슬랙 메시지에 노출되는 카테고리 한글 라벨. */
export const CATEGORY_LABELS: Record<Category, string> = {
  orchestration: '오케스트레이션',
  'token-efficiency': '토큰 효율화',
  'code-mapping': '코드 맵핑',
  automation: '자동화',
  workflow: '워크플로',
};

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

export type Level = (typeof LEVELS)[number];

export const LEVEL_LABELS: Record<Level, string> = {
  beginner: '입문',
  intermediate: '중급',
  advanced: '고급',
};

const nonEmpty = (label: string) =>
  z
    .string()
    .trim()
    .min(1, `${label}는 비어 있을 수 없습니다`);

export const tipSchema = z.object({
  /** 파일명(확장자 제외)과 반드시 일치해야 한다. kebab-case. */
  id: z
    .string()
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'id는 kebab-case여야 합니다 (소문자, 숫자, 하이픈)',
    ),
  title: nonEmpty('title').max(140, 'title은 140자 이내여야 합니다'),
  category: z.enum(CATEGORIES),
  level: z.enum(LEVELS),
  /** 슬랙 본문에 그대로 들어가는 2~3문장 요약. */
  summary: nonEmpty('summary').max(
    1200,
    'summary는 1200자 이내여야 합니다 (슬랙 섹션 3000자 제한 대비 여유)',
  ),
  /** 이 팁이 해결하는 문제. 1~2문장. */
  why: nonEmpty('why').max(800, 'why는 800자 이내여야 합니다'),
  /** 적용 단계. 각 항목 1줄. */
  how: z
    .array(nonEmpty('how 항목').max(400, 'how 항목은 400자 이내여야 합니다'))
    .min(2, 'how은 최소 2단계여야 합니다')
    .max(6, 'how은 최대 6단계까지만 허용합니다'),
  /** recipes/<id> 참조. 설치할 파일이 있는 팁만 갖는다. */
  recipe: z
    .string()
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'recipe는 kebab-case여야 합니다')
    .optional(),
  /** 적용됐는지 확인하는 방법. */
  verify: nonEmpty('verify').max(600, 'verify는 600자 이내여야 합니다'),
  sources: z
    .array(z.string().url('sources 항목은 URL이어야 합니다'))
    .min(1, 'sources는 최소 1개여야 합니다'),
  tags: z.array(nonEmpty('tag')).min(1, 'tags는 최소 1개여야 합니다'),
  added: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'added는 YYYY-MM-DD 형식이어야 합니다'),
});

export type Tip = z.infer<typeof tipSchema>;

/**
 * AI 탐색이 만드는 드래프트. 사람이 검토해 tips/ 로 옮길 때까지 발행되지 않는다.
 * 발행 스키마와 같은 필드를 쓰되 status와 근거를 추가로 요구한다.
 */
export const draftTipSchema = tipSchema.extend({
  status: z.literal('draft'),
  /** 왜 지금 소개할 만한지 — 리뷰어가 판단할 근거. */
  novelty: nonEmpty('novelty').max(600, 'novelty는 600자 이내여야 합니다'),
});

export type DraftTip = z.infer<typeof draftTipSchema>;
