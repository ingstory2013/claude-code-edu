import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { loadLibrary } from './library.js';
import { RECIPES_DIR } from './paths.js';
import { CATEGORY_LABELS, type Category } from './tip.js';

const { tips, issues } = loadLibrary();

for (const issue of issues) {
  console.error(`✗ ${issue.file}: ${issue.message}`);
}

// 참조되지 않는 레시피는 오류가 아니지만(설치는 되므로) 알려줄 가치가 있다.
const referenced = new Set(tips.flatMap((t) => (t.recipe ? [t.recipe] : [])));
const orphanRecipes: string[] = [];
if (existsSync(RECIPES_DIR)) {
  for (const entry of readdirSync(RECIPES_DIR)) {
    if (!statSync(join(RECIPES_DIR, entry)).isDirectory()) continue;
    if (!existsSync(join(RECIPES_DIR, entry, 'manifest.yml'))) {
      console.error(`✗ recipes/${entry}: manifest.yml이 없습니다`);
      issues.push({ file: `recipes/${entry}`, message: 'manifest.yml 없음' });
      continue;
    }
    if (!referenced.has(entry)) orphanRecipes.push(entry);
  }
}

if (issues.length > 0) {
  console.error(`\n${issues.length}건의 문제가 있습니다.`);
  process.exit(1);
}

const byCategory = new Map<Category, number>();
for (const tip of tips) {
  byCategory.set(tip.category, (byCategory.get(tip.category) ?? 0) + 1);
}

console.log(`✓ 팁 ${tips.length}개 검증 통과`);
for (const [category, label] of Object.entries(CATEGORY_LABELS)) {
  const count = byCategory.get(category as Category) ?? 0;
  console.log(`  ${label} (${category}): ${count}개`);
}
console.log(`  레시피 연결: ${referenced.size}개`);

if (orphanRecipes.length > 0) {
  console.log(
    `\n참고: 어떤 팁도 참조하지 않는 레시피 — ${orphanRecipes.join(', ')}`,
  );
}
