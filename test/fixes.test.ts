import { describe, expect, it } from 'vitest';
import { applyRelinks, attachSuggestions, relinkContent } from '../src/fixes';
import { DEFAULT_OPTIONS, EngineOptions } from '../src/types';
import { analyze } from '../src/engine';
import { link, rec, snap } from './helpers';

const opts = (over: Partial<EngineOptions> = {}): EngineOptions => ({ ...DEFAULT_OPTIONS, ...over });

describe('relinkContent — wiki links', () => {
	it('rewrites a simple link', () => {
		const r = relinkContent('See [[Misspeld]] now.', 'Misspeld', 'Correct Note', 'wiki');
		expect(r.content).toBe('See [[Correct Note]] now.');
		expect(r.replacements).toBe(1);
	});

	it('preserves aliases and subpaths', () => {
		const r = relinkContent('[[Misspeld|alias]] and [[Misspeld#Head]]', 'Misspeld', 'Fixed', 'wiki');
		expect(r.content).toBe('[[Fixed|alias]] and [[Fixed#Head]]');
		expect(r.replacements).toBe(2);
	});

	it('matches case-insensitively', () => {
		const r = relinkContent('[[MISSPELD]]', 'Misspeld', 'Fixed', 'wiki');
		expect(r.content).toBe('[[Fixed]]');
	});

	it('does not touch other links or plain text', () => {
		const content = '[[Other]] Misspeld as text [[Misspeld Two]]';
		const r = relinkContent(content, 'Misspeld', 'Fixed', 'wiki');
		expect(r.content).toBe(content);
		expect(r.replacements).toBe(0);
	});

	it('does not rewrite [[#section]] self references', () => {
		const r = relinkContent('[[#Section]]', 'Section', 'Fixed', 'wiki');
		expect(r.content).toBe('[[#Section]]');
	});

	it('handles embedded links', () => {
		const r = relinkContent('![[Misspeld.png]]', 'Misspeld.png', 'img/right.png', 'wiki');
		expect(r.content).toBe('![[img/right.png]]');
	});
});

describe('relinkContent — markdown links', () => {
	it('rewrites plain and percent-encoded paths', () => {
		expect(relinkContent('[x](Misspeld.md)', 'Misspeld.md', 'fixed.md', 'md').content).toBe('[x](fixed.md)');
		expect(relinkContent('[x](My%20Note.md)', 'My Note.md', 'New%20Note.md', 'md').content).toBe(
			'[x](New%20Note.md)',
		);
	});

	it('preserves headings and keeps unrelated links', () => {
		const content = '[a](Misspeld.md#Head) [b](Other.md)';
		const r = relinkContent(content, 'Misspeld.md', 'fixed.md', 'md');
		expect(r.content).toBe('[a](fixed.md#Head) [b](Other.md)');
	});

	it('handles angle-bracket paths with spaces', () => {
		const r = relinkContent('[x](<Misspeld Note.md>)', 'Misspeld Note.md', 'fixed.md', 'md');
		expect(r.content).toBe('[x](fixed.md)');
	});

	it('preserves link titles', () => {
		const r = relinkContent('[x](Misspeld.md "Some title")', 'Misspeld.md', 'fixed.md', 'md');
		expect(r.content).toBe('[x](fixed.md "Some title")');
	});

	it('preserves titles on angle-bracket paths', () => {
		const r = relinkContent('[x](<Misspeld.md> \'note\')', 'Misspeld.md', 'fixed.md', 'md');
		expect(r.content).toBe('[x](fixed.md \'note\')');
	});
});

describe('applyRelinks', () => {
	it('applies multiple rewrites in one pass', () => {
		const r = applyRelinks('[[A]] [[B]]', [
			{ from: 'A', to: 'Alpha', kind: 'wiki' },
			{ from: 'B', to: 'Beta', kind: 'wiki' },
		]);
		expect(r.content).toBe('[[Alpha]] [[Beta]]');
		expect(r.replacements).toBe(2);
	});
});

describe('attachSuggestions (end-to-end)', () => {
	it('suggests the closest real note and builds a relink fix', () => {
		const s = snap([
			rec({ path: 'a.md', links: [link({ target: 'Obsidian Gude' })] }),
			rec({ path: 'Notes/Obsidian Guide.md' }),
		]);
		const result = analyze(s, opts());
		attachSuggestions(result, s, opts());
		const f = result.findings.find((x) => x.category === 'broken-link')!;
		expect(f.suggestion).toBeDefined();
		expect(f.suggestion!.target).toBe('Obsidian Guide');
		expect(f.fix).toEqual({ kind: 'relink', file: 'a.md', from: 'Obsidian Gude', to: 'Obsidian Guide' });
	});

	it('offers no suggestion when nothing is close enough', () => {
		const s = snap([
			rec({ path: 'a.md', links: [link({ target: 'zzzzzzzzzz' })] }),
			rec({ path: 'b.md' }),
		]);
		const result = analyze(s, opts());
		attachSuggestions(result, s, opts());
		const f = result.findings.find((x) => x.category === 'broken-link')!;
		expect(f.suggestion).toBeUndefined();
		expect(f.fix).toBeUndefined();
	});

	it('disambiguates via full path when basenames collide', () => {
		const s = snap([
			rec({ path: 'a.md', links: [link({ target: 'nots' })] }),
			rec({ path: 'X/notes.md' }),
			rec({ path: 'Y/notes.md' }),
		]);
		const result = analyze(s, opts());
		attachSuggestions(result, s, opts());
		const f = result.findings.find((x) => x.category === 'broken-link')!;
		// X/notes.md is the shortest-path candidate; basename is ambiguous → full path
		expect(f.suggestion!.target).toMatch(/^(X|Y)\/notes$/);
	});

	it('offers no relink when only the heading is missing (target exists)', () => {
		const s = snap([
			rec({ path: 'a.md', links: [link({ target: 'Obsidian Guide', subpath: '#Nope' })] }),
			rec({ path: 'Notes/Obsidian Guide.md' }),
		]);
		const result = analyze(s, opts());
		// the link itself resolves → a heading warning, not an error
		const heading = result.findings.find((x) => x.message.includes('Nope'))!;
		expect(heading).toBeDefined();
		expect(heading.severity).toBe('warning');
		attachSuggestions(result, s, opts());
		expect(heading.suggestion).toBeUndefined();
		expect(heading.fix).toBeUndefined();
	});
});
