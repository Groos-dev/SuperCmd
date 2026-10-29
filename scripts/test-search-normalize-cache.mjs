#!/usr/bin/env node

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const modulePath = path.resolve('src/renderer/src/utils/root-search-ranking.ts');

function loadRankingModule() {
  const source = fs.readFileSync(modulePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: modulePath,
  }).outputText;

  const module = { exports: {} };
  new Function('exports', 'require', 'module', '__filename', '__dirname', transpiled)(
    module.exports,
    () => ({}),
    module,
    modulePath,
    path.dirname(modulePath)
  );
  return module.exports;
}

const { normalizeRootSearchText, scoreRootSearchFields } = loadRankingModule();

function appFields({ title, aliases = [], keywords = [] }) {
  return [
    { value: title, kind: 'label', weight: 1 },
    ...aliases.map((name) => ({ value: name, kind: 'alias', weight: 0.9 })),
    ...keywords.map((keyword) => ({ value: keyword, kind: 'description', weight: 0.68 })),
  ];
}

test('归一化结果只取决于输入字符串本身', () => {
  assert.equal(normalizeRootSearchText('Lark'), 'lark');
  assert.equal(normalizeRootSearchText('Lark'), normalizeRootSearchText('Lark'));
  assert.notEqual(normalizeRootSearchText('lark'), normalizeRootSearchText('feishu'));
});

test('关键词在两次击键之间变化时按新值命中', () => {
  const before = scoreRootSearchFields('feishu', appFields({ title: 'Lark', keywords: ['lark'] }));
  assert.equal(before.matched, false);

  const after = scoreRootSearchFields('feishu', appFields({ title: 'Lark', keywords: ['feishu'] }));
  assert.equal(after.matched, true);
  assert.equal(after.matchKind, 'exact');
  assert.ok(after.matchScore > 0);
});

test('关键词改回旧值后不会残留上一次命中的结果', () => {
  const matched = scoreRootSearchFields('feishu', appFields({ title: 'Lark', keywords: ['feishu'] }));
  assert.equal(matched.matched, true);

  const unmatched = scoreRootSearchFields('feishu', appFields({ title: 'Lark', keywords: ['lark'] }));
  assert.equal(unmatched.matched, false);
});

test('别名以 alias 通道命中，分数高于关键词通道', () => {
  const viaAlias = scoreRootSearchFields('feishu', appFields({ title: 'Lark', aliases: ['Feishu'] }));
  const viaKeyword = scoreRootSearchFields(
    'feishu',
    appFields({ title: 'Lark', keywords: ['feishu'] })
  );

  assert.equal(viaAlias.matchKind, 'alias-exact');
  assert.ok(viaAlias.matchScore > viaKeyword.matchScore);
});
