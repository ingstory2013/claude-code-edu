import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ESM에는 __dirname이 없다. import.meta.url에서 유도한다.
 * 이 파일은 src/ 안에 있으므로 리포 루트는 한 단계 위.
 */
const here = dirname(fileURLToPath(import.meta.url));

export const REPO_ROOT = resolve(here, '..');
export const TIPS_DIR = resolve(REPO_ROOT, 'tips');
export const RECIPES_DIR = resolve(REPO_ROOT, 'recipes');
export const DRAFTS_DIR = resolve(REPO_ROOT, 'drafts');
export const STATE_FILE = resolve(REPO_ROOT, 'state', 'posted.json');
