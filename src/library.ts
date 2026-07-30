import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { CATEGORIES, tipSchema, type Category, type Tip } from './tip.js';
import { RECIPES_DIR, REPO_ROOT, TIPS_DIR } from './paths.js';

export interface LibraryIssue {
  file: string;
  message: string;
}

export interface Library {
  tips: Tip[];
  issues: LibraryIssue[];
}

function listYamlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .map((name) => join(dir, name))
    .sort();
}

/**
 * tips/<category>/*.yml 을 전부 읽어 검증한다.
 *
 * drafts/ 는 의도적으로 읽지 않는다 — AI가 만든 후보는 사람이 tips/ 로
 * 옮기기 전까지 절대 발행되지 않아야 한다.
 *
 * 개별 파일 오류는 issues에 모아 반환하고 나머지는 계속 로드한다. 그래야
 * lint가 첫 오류에서 멈추지 않고 전체 문제를 한 번에 보여줄 수 있다.
 */
export function loadLibrary(): Library {
  const tips: Tip[] = [];
  const issues: LibraryIssue[] = [];
  const seenIds = new Map<string, string>();

  if (!existsSync(TIPS_DIR)) {
    return { tips, issues: [{ file: 'tips/', message: 'tips 디렉터리가 없습니다' }] };
  }

  // 카테고리 목록에 없는 디렉터리는 조용히 무시하지 말고 문제로 알린다.
  for (const entry of readdirSync(TIPS_DIR)) {
    const full = join(TIPS_DIR, entry);
    if (!statSync(full).isDirectory()) continue;
    if (!(CATEGORIES as readonly string[]).includes(entry)) {
      issues.push({
        file: relative(REPO_ROOT, full),
        message: `알 수 없는 카테고리 디렉터리입니다. 허용: ${CATEGORIES.join(', ')}`,
      });
    }
  }

  for (const category of CATEGORIES) {
    for (const file of listYamlFiles(join(TIPS_DIR, category))) {
      const rel = relative(REPO_ROOT, file);
      const expectedId = basename(file).replace(/\.ya?ml$/, '');

      let raw: unknown;
      try {
        raw = parseYaml(readFileSync(file, 'utf8'));
      } catch (error) {
        issues.push({
          file: rel,
          message: `YAML 파싱 실패: ${(error as Error).message}`,
        });
        continue;
      }

      const parsed = tipSchema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
          issues.push({ file: rel, message: `${path}: ${issue.message}` });
        }
        continue;
      }

      const tip = parsed.data;

      if (tip.id !== expectedId) {
        issues.push({
          file: rel,
          message: `id("${tip.id}")가 파일명("${expectedId}")과 다릅니다`,
        });
        continue;
      }

      if (tip.category !== (category as Category)) {
        issues.push({
          file: rel,
          message: `category("${tip.category}")가 디렉터리("${category}")와 다릅니다`,
        });
        continue;
      }

      const duplicate = seenIds.get(tip.id);
      if (duplicate) {
        issues.push({
          file: rel,
          message: `id "${tip.id}"가 ${duplicate}와 중복됩니다`,
        });
        continue;
      }

      if (tip.recipe) {
        const manifest = join(RECIPES_DIR, tip.recipe, 'manifest.yml');
        if (!existsSync(manifest)) {
          issues.push({
            file: rel,
            message: `recipe "${tip.recipe}"를 참조하지만 recipes/${tip.recipe}/manifest.yml이 없습니다`,
          });
          continue;
        }
      }

      seenIds.set(tip.id, rel);
      tips.push(tip);
    }
  }

  return { tips, issues };
}

/** 검증을 통과한 라이브러리만 반환한다. 문제가 있으면 예외를 던진다. */
export function loadLibraryOrThrow(): Tip[] {
  const { tips, issues } = loadLibrary();
  if (issues.length > 0) {
    const detail = issues.map((i) => `  ${i.file}: ${i.message}`).join('\n');
    throw new Error(`팁 라이브러리에 문제가 ${issues.length}건 있습니다:\n${detail}`);
  }
  if (tips.length === 0) {
    throw new Error('발행할 팁이 없습니다. tips/ 를 확인하세요.');
  }
  return tips;
}
