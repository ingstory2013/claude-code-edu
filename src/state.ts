import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { STATE_FILE } from './paths.js';

const stateSchema = z.object({
  /** 발행 순서대로 append. 마지막이 가장 최근. */
  posted: z
    .array(
      z.object({
        id: z.string(),
        at: z.string(),
      }),
    )
    .default([]),
});

export type PostedState = z.infer<typeof stateSchema>;

export function loadState(): PostedState {
  if (!existsSync(STATE_FILE)) return { posted: [] };
  const parsed = stateSchema.safeParse(
    JSON.parse(readFileSync(STATE_FILE, 'utf8')),
  );
  if (!parsed.success) {
    throw new Error(
      `state/posted.json이 손상됐습니다: ${parsed.error.issues
        .map((i) => `${i.path.join('.')}: ${i.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

export function recordPosted(state: PostedState, tipId: string): PostedState {
  return {
    posted: [...state.posted, { id: tipId, at: new Date().toISOString() }],
  };
}

export function saveState(state: PostedState): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}
