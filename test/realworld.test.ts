// Real-world nastiness: odd file names, spaces, dots, unicode, links that
//Obsidian users actually create.

import { describe, expect, it } from 'vitest';
import { analyze } from '../src/engine';
import { attachSuggestions } from '../src/fixes';
import { DEFAULT_OPTIONS, EngineOptions } from '../src/types';
import { link, rec, snap } from './helpers';

const opts = (over: Partial<EngineOptions> = {}): EngineOptions => ({ ...DEFAULT_OPTIONS, ...over });

describe('realistic vault edge cases', () => {
	it('links with dots in the name resolve (a.b.md)', () => {
		const r = analyze(
			snap([
				rec({ path: 'a.b.md', links: [link({ target: 'a.b' })] }),
				rec({ path: 'Notes/a.b.md' }),
			]),
			opts(),
		);
		// both files share basename "a.b" → duplicate-name info, but the link resolves
		expect(r.findings.filter((f) => f.category === 'broken-link')).toHaveLength(0);
		expect(r.stats.resolvedLinks).toBe(1);
	});

	it('names with spaces resolve and suggest correctly', () => {
		const s = snap([
			rec({ path: 'a.md', links: [link({ target: 'Deep Work' })] }),
			rec({ path: 'Topics/Deep Work.md' }),
		]);
		const r = analyze(s, opts());
		expect(r.findings.filter((f) => f.category === 'broken-link')).toHaveLength(0);
	});

	it('markdown links with percent-encoded spaces resolve', () => {
		const r = analyze(
			snap([
				rec({ path: 'a.md', links: [link({ target: 'My Note', kind: 'md', raw: 'My%20Note.md' })] }),
				rec({ path: 'My Note.md' }),
			]),
			opts(),
		);
		expect(r.findings.filter((f) => f.category === 'broken-link')).toHaveLength(0);
	});

	it('unicode file names work end to end', () => {
		const s = snap([
			rec({ path: 'a.md', links: [link({ target: '角色设定' })] }),
			rec({ path: '世界观/角色设定.md' }),
		]);
		const r = analyze(s, opts());
		attachSuggestions(r, s, opts());
		expect(r.findings.filter((f) => f.category === 'broken-link')).toHaveLength(0);
	});

	it('self-referential folders do not break resolution', () => {
		const r = analyze(
			snap([
				rec({ path: 'notes/notes.md', links: [link({ target: 'notes' })] }),
			]),
			opts(),
		);
		// resolves to itself via relative or basename path — no broken link
		expect(r.findings.filter((f) => f.category === 'broken-link')).toHaveLength(0);
	});

	it('link to an attachment by name resolves when unique', () => {
		const r = analyze(
			snap([
				rec({ path: 'a.md', links: [link({ target: 'diagram.png' })] }),
				rec({ path: 'assets/diagram.png', ext: 'png' }),
			]),
			opts(),
		);
		expect(r.findings.filter((f) => f.category === 'broken-link')).toHaveLength(0);
	});

	it('empty vault produces stats but zero findings', () => {
		const r = analyze(snap([]), opts());
		expect(r.findings).toHaveLength(0);
		expect(r.stats.notes).toBe(0);
	});

	it('a realistic mixed vault summarizes sanely', () => {
		const files = [
			rec({ path: 'index.md', links: [link({ target: 'Setup' }), link({ target: 'Templates/Daily' })] }),
			rec({ path: 'Setup.md' }),
			rec({ path: 'Templates/Daily.md' }),
			rec({ path: 'orphan.md' }),
			rec({ path: 'untitled.md', bodyLength: 0 }),
			rec({ path: 'attachments/huge.mp4', ext: 'mp4', size: 100 * 1024 * 1024 }),
			rec({ path: 'a.png', ext: 'png', size: 10 }),
		];
		const r = analyze(snap(files), opts({ ignoreGlobs: ['Templates/**'] }));
		const cats = new Set(r.findings.map((f) => f.category));
		expect(cats).toContain('orphan');
		expect(cats).toContain('stub');
		expect(cats).toContain('oversize');
		// Templates/Daily is ignored: no orphan finding for it; index's link to it
		// resolves (the file exists), so no broken link either.
		expect(cats).not.toContain('broken-link');
		// orphan.md and untitled.md are both orphans; Templates/Daily is ignored
		expect(r.stats.orphans).toBe(2);
	});
});
