import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import {
  JARGON,
  countSyllables,
  postStats,
  readingStats,
  splitSentences,
  stripMarkdown,
  words,
} from '../scripts/reading-level.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const blogDir = path.join(here, '..', 'content', 'blog');
const files = fs
  .readdirSync(blogDir)
  .filter((f) => f.endsWith('.md'))
  .sort();

const MAX_GRADE = 5.5;
const MAX_SHORT_SHARE = 0.1;
const SHORT_SENTENCE_WORDS = 5;
const MAX_SHORT_RUN = 2;

test('countSyllables handles common words', () => {
  assert.equal(countSyllables('cat'), 1);
  assert.equal(countSyllables('table'), 2);
  assert.equal(countSyllables('computer'), 3);
  assert.equal(countSyllables(''), 0);
});

test('stripMarkdown drops markers, footnotes, links and headings', () => {
  const out = stripMarkdown(
    '## Heading\n\nSee [the guide](https://example.com) now.[^note]\n\n<!--cta:inline-->\n\n[^note]: hidden',
  );
  assert.match(out, /See the guide now\./);
  assert.doesNotMatch(out, /Heading|example\.com|\^note|cta|hidden/);
});

test('readingStats flags jargon and short sentences', () => {
  const stats = readingStats('It is a robust ecosystem. We win. It works. Yes. Go on.');
  assert.ok(stats.jargon.includes('robust'));
  assert.ok(stats.jargon.includes('ecosystem'));
  assert.ok(stats.shortSentenceShare > 0.5);
});

test('JARGON entries are lowercase', () => {
  for (const term of JARGON) assert.equal(term, term.toLowerCase());
});

for (const file of files) {
  const slug = file.replace(/\.md$/, '');
  const full = path.join(blogDir, file);

  test(`${slug} reads at about a grade 5 level`, () => {
    const stats = postStats(full);
    assert.ok(stats.grade <= MAX_GRADE, `grade ${stats.grade} is above ${MAX_GRADE}`);
  });

  test(`${slug} avoids jargon`, () => {
    const stats = postStats(full);
    assert.deepEqual(stats.jargon, []);
  });

  test(`${slug} is not written in clipped fragments`, () => {
    const stats = postStats(full);
    assert.ok(
      stats.shortSentenceShare <= MAX_SHORT_SHARE,
      `${(stats.shortSentenceShare * 100).toFixed(0)}% of sentences are ${SHORT_SENTENCE_WORDS} words or fewer`,
    );
    const { content } = matter(fs.readFileSync(full, 'utf8'));
    for (const paragraph of stripMarkdown(content).split(/\n{2,}/)) {
      let run = 0;
      for (const sentence of splitSentences(paragraph)) {
        run = words(sentence).length <= SHORT_SENTENCE_WORDS ? run + 1 : 0;
        assert.ok(run <= MAX_SHORT_RUN, `a run of short sentences ends at: "${sentence}"`);
      }
    }
  });
}
