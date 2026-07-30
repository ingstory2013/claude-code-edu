import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
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
const recipeDirs: string[] = [];
if (existsSync(RECIPES_DIR)) {
  for (const entry of readdirSync(RECIPES_DIR)) {
    if (!statSync(join(RECIPES_DIR, entry)).isDirectory()) continue;
    recipeDirs.push(entry);
    if (!existsSync(join(RECIPES_DIR, entry, 'manifest.yml'))) {
      console.error(`✗ recipes/${entry}: manifest.yml이 없습니다`);
      issues.push({ file: `recipes/${entry}`, message: 'manifest.yml 없음' });
      continue;
    }
    if (!referenced.has(entry)) orphanRecipes.push(entry);
  }
}

// install.sh --list는 원격에서 디렉터리를 나열할 수 없어 index.txt를 읽는다.
// 실제 디렉터리와 어긋나면 사용자에게 없는 레시피가 보이거나 있는 게 안 보인다.
const indexFile = join(RECIPES_DIR, 'index.txt');
if (recipeDirs.length > 0) {
  if (!existsSync(indexFile)) {
    console.error('✗ recipes/index.txt: 파일이 없습니다 (install.sh --list가 원격에서 쓰는 목록)');
    issues.push({ file: 'recipes/index.txt', message: '파일 없음' });
  } else {
    const indexed = readFileSync(indexFile, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const missing = recipeDirs.filter((d) => !indexed.includes(d));
    const stale = indexed.filter((d) => !recipeDirs.includes(d));
    for (const id of missing) {
      console.error(`✗ recipes/index.txt: "${id}"가 빠져 있습니다`);
      issues.push({ file: 'recipes/index.txt', message: `${id} 누락` });
    }
    for (const id of stale) {
      console.error(`✗ recipes/index.txt: "${id}" 디렉터리가 존재하지 않습니다`);
      issues.push({ file: 'recipes/index.txt', message: `${id} 사용되지 않음` });
    }
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
