import { z } from 'zod/v4';

const envSchema = z.object({
  SLACK_BOT_TOKEN: z.string().trim().min(1).optional(),
  SLACK_CHANNEL_ID: z.string().trim().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().trim().min(1).optional(),
  /** GitHub Actions가 자동으로 넣어준다. 로컬에서는 아래 기본값을 쓴다. */
  GITHUB_REPOSITORY: z.string().trim().min(1).optional(),
  GITHUB_SHA: z.string().trim().min(1).optional(),
  /** 설치 URL에 박을 ref를 직접 지정하고 싶을 때. */
  INSTALL_REF: z.string().trim().min(1).optional(),
});

const env = envSchema.parse(process.env);

export const DEFAULT_REPO_SLUG = 'ingstory2013/claude-code-edu';

export const repoSlug = env.GITHUB_REPOSITORY ?? DEFAULT_REPO_SLUG;

/**
 * 설치 명령에 들어가는 ref.
 *
 * Actions에서는 실행 시점의 커밋 SHA로 고정한다 — 슬랙에 남은 오래된 메시지의
 * 설치 명령이 나중에 install.sh나 레시피가 바뀌어도 그 시점 내용을 그대로
 * 재현하도록. 로컬에서는 main으로 떨어진다.
 */
export const installRef = env.INSTALL_REF ?? env.GITHUB_SHA ?? 'main';

export function installCommand(recipeId: string): string {
  return `curl -fsSL https://raw.githubusercontent.com/${repoSlug}/${installRef}/install.sh | bash -s -- ${recipeId}`;
}

export function repoFileUrl(path: string): string {
  return `https://github.com/${repoSlug}/blob/${installRef}/${path}`;
}

/** 실제로 슬랙에 쓸 때만 호출한다. --dry-run은 시크릿 없이 돌아야 한다. */
export function requireSlackConfig(): { token: string; channel: string } {
  const missing: string[] = [];
  if (!env.SLACK_BOT_TOKEN) missing.push('SLACK_BOT_TOKEN');
  if (!env.SLACK_CHANNEL_ID) missing.push('SLACK_CHANNEL_ID');
  if (missing.length > 0) {
    throw new Error(
      `환경변수가 없습니다: ${missing.join(', ')}\n` +
        '로컬 확인은 --dry-run으로 시크릿 없이 돌릴 수 있습니다.',
    );
  }
  return { token: env.SLACK_BOT_TOKEN!, channel: env.SLACK_CHANNEL_ID! };
}

/** discover 잡에서만 필요하다. SDK가 env를 직접 읽지만 조기 실패를 위해 확인한다. */
export function requireAnthropicKey(): string {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('환경변수 ANTHROPIC_API_KEY가 없습니다.');
  }
  return env.ANTHROPIC_API_KEY;
}
