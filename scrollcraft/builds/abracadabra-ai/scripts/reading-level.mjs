import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';

const here = path.dirname(fileURLToPath(import.meta.url));
const BLOG_DIR = path.join(here, '..', 'content', 'blog');

export const JARGON = [
  'agentic',
  'orchestrat',
  'paradigm',
  'synergy',
  'holistic',
  'scalable',
  'ecosystem',
  'stakeholder',
  'actionable',
  'operationalize',
  'human-in-the-loop',
  'source of truth',
  'proof of concept',
  'north star',
  'low-hanging fruit',
  'deep dive',
  'best-in-class',
  'end-to-end',
  'robust',
  'seamless',
  'game-changer',
  'unlock',
  'empower',
  'touchpoint',
  'workflow automation',
  'throughput',
  'bandwidth',
];

export function stripMarkdown(markdown) {
  return markdown
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^\[\^[^\]]+\]:.*$/gm, ' ')
    .replace(/\[\^[^\]]+\]/g, '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/^#{1,6}\s.*$/gm, ' ')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_`>|]/g, '');
}

export function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z"“‘'(])|\n{2,}/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => /[A-Za-z]/.test(s));
}

export function countSyllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const stripped = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '');
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function words(text) {
  return text.match(/[A-Za-z][A-Za-z'’-]*/g) ?? [];
}

export function readingStats(markdown) {
  const text = stripMarkdown(markdown);
  const sentences = splitSentences(text);
  const allWords = words(text);
  const syllables = allWords.reduce((sum, w) => sum + countSyllables(w), 0);
  const wordCount = allWords.length;
  const sentenceCount = Math.max(1, sentences.length);
  const grade =
    0.39 * (wordCount / sentenceCount) +
    11.8 * (syllables / Math.max(1, wordCount)) -
    15.59;
  const lengths = sentences.map((s) => words(s).length);
  const short = lengths.filter((n) => n <= 5).length;
  const lower = text.toLowerCase();
  const jargon = JARGON.filter((term) => lower.includes(term));
  return {
    grade: Math.round(grade * 10) / 10,
    wordCount,
    sentenceCount,
    avgSentenceLength: Math.round((wordCount / sentenceCount) * 10) / 10,
    shortSentenceShare: short / sentenceCount,
    jargon,
  };
}

export function postStats(file) {
  const { data, content } = matter(fs.readFileSync(file, 'utf8'));
  const faq = (data.faqs ?? []).map((f) => `${f.q ?? f.question ?? ''}. ${f.a ?? f.answer ?? ''}`).join('\n\n');
  return readingStats(`${content}\n\n${faq}`);
}

export function allPostStats(dir = BLOG_DIR) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => ({ slug: f.replace(/\.md$/, ''), ...postStats(path.join(dir, f)) }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const s of allPostStats()) {
    console.log(
      `${s.slug.padEnd(48)} grade ${String(s.grade).padStart(5)}  words ${String(s.wordCount).padStart(5)}  avg ${String(s.avgSentenceLength).padStart(5)}  short ${(s.shortSentenceShare * 100).toFixed(0).padStart(3)}%  jargon: ${s.jargon.join(', ') || '-'}`,
    );
  }
}
