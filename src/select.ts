import type { PostedState } from './state.js';
import type { Category, Tip } from './tip.js';

/** 직전 몇 회의 카테고리를 피할지. 5개 카테고리 중 3개를 피하면 충분히 분산된다. */
const CATEGORY_COOLDOWN = 3;

export interface Selection {
  tip: Tip;
  /** 슬랙 메시지에 표시하는 누적 발행 번호 (1부터). */
  sequence: number;
  reason: string;
}

/**
 * 다음에 발행할 팁을 고른다. 난수를 쓰지 않으므로 같은 상태에서는 항상 같은
 * 결과가 나온다 — 덕분에 --dry-run으로 실제 발행될 팁을 미리 확인할 수 있다.
 *
 * 1. 아직 안 나간 팁을 우선한다.
 * 2. 그 안에서 직전 3회에 나온 카테고리는 피해 주제가 뭉치지 않게 한다.
 * 3. 전부 소진되면 가장 오래전에 나간 것부터 다시 순환한다.
 */
export function selectTip(tips: Tip[], state: PostedState): Selection {
  if (tips.length === 0) {
    throw new Error('선택할 팁이 없습니다.');
  }

  const sequence = state.posted.length + 1;

  const lastPostedAt = new Map<string, string>();
  for (const entry of state.posted) {
    // 같은 id가 여러 번 있으면 마지막 값이 남는다 = 최근 발행 시각.
    lastPostedAt.set(entry.id, entry.at);
  }

  const recentCategories = new Set<Category>(
    state.posted
      .slice(-CATEGORY_COOLDOWN)
      .map((entry) => tips.find((t) => t.id === entry.id)?.category)
      .filter((c): c is Category => c !== undefined),
  );

  const unposted = tips.filter((tip) => !lastPostedAt.has(tip.id));

  if (unposted.length > 0) {
    const fresh = unposted.filter((tip) => !recentCategories.has(tip.category));
    const pool = fresh.length > 0 ? fresh : unposted;
    // id 순으로 안정 정렬해 결과를 결정적으로 만든다.
    const tip = [...pool].sort((a, b) => a.id.localeCompare(b.id))[0]!;
    return {
      tip,
      sequence,
      reason:
        fresh.length > 0
          ? `미발행 ${unposted.length}개 중 최근 카테고리를 피해 선택`
          : `미발행 ${unposted.length}개 — 모두 최근 카테고리라 카테고리 조건 없이 선택`,
    };
  }

  // 한 바퀴 다 돌았다. 가장 오래전에 나간 것부터 재순환한다.
  const byAge = [...tips].sort((a, b) => {
    const aAt = lastPostedAt.get(a.id) ?? '';
    const bAt = lastPostedAt.get(b.id) ?? '';
    return aAt === bAt ? a.id.localeCompare(b.id) : aAt.localeCompare(bAt);
  });

  const rotated =
    byAge.find((tip) => !recentCategories.has(tip.category)) ?? byAge[0]!;

  return {
    tip: rotated,
    sequence,
    reason: '전체 1회 순회 완료 — 가장 오래전에 발행된 팁부터 재순환',
  };
}
