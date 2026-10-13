import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assignmentHandoff, checkSpecialist, extractJson, outputSchemaKeys, stripJsonFence } from './check';

const golden = (name: string) => readFileSync(path.join(__dirname, 'golden', name), 'utf8');

describe('checkSpecialist', () => {
  it('keeps sourced research rows and drops an empty source', () => {
    const raw = JSON.stringify([
      { name: 'A', fact: 'one', source: 'https://a.example', unknown: '' },
      { name: 'B', fact: 'two', source: 'https://b.example', unknown: '' },
      { name: 'C', fact: 'three', source: '', unknown: '' },
    ]);
    const result = checkSpecialist('research', raw);
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.page)).toHaveLength(2);
  });

  it('accepts one research object when the skill schema is a single object', () => {
    const raw = [
      '```json',
      JSON.stringify({
        name: 'Dental Implant Patients',
        fact: '76.3% of patients are discouraged by cost.',
        source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11355290',
        unknown: null,
      }),
      '```',
    ].join('\n');
    const shape = '## Output schema\n```json\n{"type":"object","required":["name","fact","source"]}\n```\n';
    const result = checkSpecialist('research', raw, '', shape);
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.page)).toEqual([
      {
        name: 'Dental Implant Patients',
        fact: '76.3% of patients are discouraged by cost.',
        source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC11355290',
        unknown: null,
      },
    ]);
  });

  it('reads research rows wrapped in a results object', () => {
    const result = checkSpecialist(
      'research',
      JSON.stringify({
        results: [{ name: 'A', fact: 'one', source: 'https://a.example' }],
      }),
    );
    expect(result.ok).toBe(true);
    expect(JSON.parse(result.page)).toHaveLength(1);
  });

  it('fails research when every source is empty', () => {
    const result = checkSpecialist('research', JSON.stringify([{ name: 'A', fact: 'one', source: '', unknown: '' }]));
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/no sourced row/i);
  });

  it('fails when the page is not JSON', () => {
    expect(checkSpecialist('research', 'just words').ok).toBe(false);
  });

  it('finds JSON after prose, inside a string, and as the first of two objects', () => {
    const row = '[{"name":"A","fact":"one","source":"https://a.example"}]';
    const fenced = checkSpecialist('research', `Here is the page:\n\`\`\`json\n${row}\n\`\`\``);
    expect(fenced.ok).toBe(true);
    expect(fenced.notes).toEqual(['extra text ignored']);
    const bare = checkSpecialist('research', `Here is the page: ${row}`);
    expect(bare.ok).toBe(true);
    expect(bare.notes).toEqual(['extra text ignored']);
    const braced = extractJson('Note {"fact":"a } brace","name":"A","source":"https://a.example"} tail');
    expect(JSON.parse(braced?.json ?? '{}')).toMatchObject({ fact: 'a } brace' });
    expect(braced?.extra).toBe(true);
    const two = extractJson('{"a":1} {"b":2}');
    expect(two).toEqual({ json: '{"a":1}', extra: true });
    expect(checkSpecialist('research', 'no json here').errors).toContain('not json');
  });

  it('parses one json fence', () => {
    expect(stripJsonFence('```json\n[{"name":"A"}]\n```')).toContain('name');
    const result = checkSpecialist('research', '```json\n[{"name":"A","fact":"one","source":"https://a.example","unknown":""}]\n```');
    expect(result.ok).toBe(true);
  });

  it('accepts hashtags written as a list', () => {
    const rows = JSON.parse(golden('copy.json'));
    rows[0].hashtags = ['#north', '#hours'];
    expect(checkSpecialist('copy', JSON.stringify(rows)).ok).toBe(true);
  });

  it('reads the accepted page out of an assignment', () => {
    const page = '[{"name":"North"}]';
    const input = `Job: Write\n\nAccepted page:\n${page}\n\nReturn JSON only.`;
    expect(assignmentHandoff(input)).toBe(page);
    expect(assignmentHandoff('Job: Write\n\nReturn JSON only.')).toBe('');
  });

  it('checks copy rows', () => {
    expect(checkSpecialist('copy', golden('copy.json')).ok).toBe(true);
    const short = JSON.parse(golden('copy.json')).slice(0, 6);
    expect(checkSpecialist('copy', JSON.stringify(short)).ok).toBe(false);
    const banned = JSON.parse(golden('copy.json'));
    banned[0].hook = 'Unlock the secret';
    expect(checkSpecialist('copy', JSON.stringify(banned)).errors.join(' ')).toMatch(/banned/i);
  });

  it('checks language row count', () => {
    expect(checkSpecialist('language', golden('language.json'), golden('copy.json')).ok).toBe(true);
    const extra = JSON.parse(golden('language.json'));
    extra.push(extra[0]);
    expect(checkSpecialist('language', JSON.stringify(extra), golden('copy.json')).ok).toBe(false);
  });

  it('checks visual prompts', () => {
    const handoff = JSON.stringify([{ platform: 'instagram', hook: 'Sunday' }]);
    expect(checkSpecialist('visual', golden('visual.json'), handoff).ok).toBe(true);
    const asked = checkSpecialist('visual', JSON.stringify({ questions: ['Which aspect ratio?', ''] }));
    expect(asked.questions).toEqual(['Which aspect ratio?']);
    expect(asked.ok).toBe(false);
    expect(checkSpecialist('visual', JSON.stringify([{ imagePrompt: 'A room' }]), handoff).ok).toBe(false);
    expect(checkSpecialist('visual', JSON.stringify([{ imagePrompt: 'placeholder model', videoPrompt: 'pan' }]), handoff).ok).toBe(false);
  });

  it('checks a skill page against its shape', () => {
    expect(checkSpecialist('skill', '').ok).toBe(false);
    expect(checkSpecialist('skill', golden('skill.json'), '', 'agenda questions').ok).toBe(true);
    expect(checkSpecialist('skill', golden('copy.json')).ok).toBe(false);
    expect(checkSpecialist('skill', JSON.stringify({ title: 'A 90-day calendar' })).ok).toBe(false);
  });

  it('accepts each golden page and rejects a broken copy', () => {
    expect(checkSpecialist('research', golden('research.json')).ok).toBe(true);
    expect(checkSpecialist('copy', golden('copy.json')).ok).toBe(true);
    expect(checkSpecialist('language', golden('language.json'), golden('copy.json')).ok).toBe(true);
    expect(checkSpecialist('visual', golden('visual.json'), JSON.stringify([{}])).ok).toBe(true);
    expect(checkSpecialist('skill', golden('skill.json'), '', 'agenda questions').ok).toBe(true);
    const broken = JSON.parse(golden('research.json'));
    delete broken[0].source;
    expect(checkSpecialist('research', JSON.stringify(broken)).ok).toBe(false);
  });
});

describe('outputSchemaKeys', () => {
  it('reads the social preset output schemas', () => {
    const root = path.join(__dirname, '../../../.cursor/skills');
    const read = (file: string) => readFileSync(path.join(root, file), 'utf8');
    expect(outputSchemaKeys(read('plugins/parallel/parallel-web-search/SKILL.md'))).toEqual(['name', 'fact', 'source']);
    expect(outputSchemaKeys(read('community/marketingskills/copywriting/SKILL.md'))).toEqual([
      'platform',
      'type',
      'hook',
      'body',
      'hashtags',
      'cta',
    ]);
    expect(outputSchemaKeys(read('community/advertising-skills/skills/qa/generic-language-killer/SKILL.md'))).toEqual([
      'platform',
      'type',
      'hook',
      'body',
      'hashtags',
      'cta',
    ]);
    expect(outputSchemaKeys(read('community/visual-skills/image/SKILL.md'))).toEqual(['imagePrompt', 'videoPrompt']);
    expect(checkSpecialist('copy', golden('copy.json'), '', read('community/marketingskills/copywriting/SKILL.md')).ok).toBe(true);
  });

  it('reads required keys from an Output schema fence', () => {
    const body = '## Output schema\n```json\n{"type":"object","required":["agenda","questions"]}\n```\n';
    expect(outputSchemaKeys(body)).toEqual(['agenda', 'questions']);
    expect(outputSchemaKeys('no schema here')).toEqual([]);
  });
});
