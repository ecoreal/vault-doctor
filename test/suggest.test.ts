import { describe, expect, it } from 'vitest';
import { buildIndex } from '../src/resolver';
import { levenshtein, preferredLinkpath, suggestTargets } from '../src/suggest';
import { rec, snap } from './helpers';

describe('levenshtein', () => {
	it('handles basic distances', () => {
		expect(levenshtein('', '')).toBe(0);
		expect(levenshtein('abc', 'abc')).toBe(0);
		expect(levenshtein('kitten', 'sitting')).toBe(3);
		expect(levenshtein('flaw', 'lawn')).toBe(2);
	});

	it('bails out beyond max', () => {
		expect(levenshtein('aaaa', 'bbbb', 2)).toBe(3); // max + 1
		expect(levenshtein('abc', 'abd', 2)).toBe(1);
	});
});

const ctx = (paths: string[], sourcePath: string, maxDistance = 3) => ({
	index: buildIndex(snap(paths.map((p) => rec({ path: p })))),
	sourcePath,
	maxDistance,
});

describe('suggestTargets', () => {
	it('finds a close basename', () => {
		const c = ctx(['Notes/Obsidan Guide.md'], 'a.md');
		const s = suggestTargets('Obsidian Guide', c);
		expect(s[0].target).toBe('Notes/Obsidan Guide.md');
	});

	it('prefers candidates in the same folder', () => {
		const c = ctx(['Elsewhere/nots.md', 'Here/notes.md'], 'Here/main.md');
		const s = suggestTargets('nots', c);
		expect(s[0].target).toBe('Here/notes.md');
	});

	it('returns nothing beyond maxDistance', () => {
		const c = ctx(['completely-different.md'], 'a.md', 2);
		expect(suggestTargets('zzzzzzzz', c)).toHaveLength(0);
	});

	it('returns at most 3 candidates', () => {
		const c = ctx(['t1.md', 't2.md', 't3.md', 't4.md', 't5.md'], 'a.md', 3);
		const s = suggestTargets('tx', c);
		expect(s.length).toBeLessThanOrEqual(3);
		expect(s.length).toBeGreaterThan(0);
	});

	it('handles percent-encoded and folder-qualified targets', () => {
		const c = ctx(['docs/My Note.md'], 'a.md');
		const s = suggestTargets('docs/My%20Note', c);
		expect(s[0]?.target).toBe('docs/My Note.md');
	});
});

describe('preferredLinkpath', () => {
	const files = ['Notes/A.md', 'B/A.md', 'Notes/img.png'];
	const index = buildIndex(snap(files.map((p) => rec({ path: p }))));

	it('uses the bare basename when unique, full path when ambiguous', () => {
		const dest = index.all.find((f) => f.path === 'Notes/img.png')!;
		expect(preferredLinkpath(dest, 'wiki', 'x.md', index)).toBe('img.png');
	});

	it('uses the full path (no ext) when the basename is ambiguous', () => {
		const dest = index.all.find((f) => f.path === 'Notes/A.md')!;
		expect(preferredLinkpath(dest, 'wiki', 'x.md', index)).toBe('Notes/A');
	});

	it('produces a relative percent-encoded path for md-style links', () => {
		const dest = index.all.find((f) => f.path === 'Notes/img.png')!;
		const out = preferredLinkpath(dest, 'md', 'Notes/source.md', index);
		expect(out).toBe('img.png');
		const dest2 = index.all.find((f) => f.path === 'Notes/A.md')!;
		const out2 = preferredLinkpath(dest2, 'md', 'x.md', index);
		expect(out2).toBe('Notes/A.md');
	});

	it('percent-encodes parentheses in md-style links', () => {
		// an unencoded ')' would terminate the markdown link destination
		const idx2 = buildIndex(snap([rec({ path: 'Notes/My (1) Note.md' })]));
		const dest = idx2.all[0];
		const out = preferredLinkpath(dest, 'md', 'Notes/source.md', idx2);
		expect(out).toBe('My%20%281%29%20Note.md');
	});
});
