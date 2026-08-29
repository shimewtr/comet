import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const markdownFiles = [
  'README.md',
  ...fs
    .readdirSync('docs', { recursive: true })
    .filter((file) => file.endsWith('.md'))
    .map((file) => path.join('docs', file)),
];

test('local links in documentation point to existing files', () => {
  const missing = [];

  for (const markdownFile of markdownFiles) {
    const markdown = fs.readFileSync(markdownFile, 'utf8');
    const links = markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g);
    for (const [, rawTarget] of links) {
      if (/^(?:https?:|mailto:|#)/.test(rawTarget)) continue;

      const target = decodeURIComponent(rawTarget.split('#')[0]);
      const resolved = path.resolve(path.dirname(markdownFile), target);
      if (!fs.existsSync(resolved)) {
        missing.push(`${markdownFile} -> ${rawTarget}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});
