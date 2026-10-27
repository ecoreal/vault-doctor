import { describe, expect, it } from 'vitest';
import { analyzeFrontmatter, bodyLengthOf, frontmatterOf } from '../src/frontmatter';

describe('frontmatterOf / bodyLengthOf', () => {
	it('extracts the frontmatter block', () => {
		const raw = '---\ntitle: x\n---\nbody here';
		expect(frontmatterOf(raw)).toBe('title: x');
		expect(bodyLengthOf(raw)).toBe('body here'.length);
	});

	it('handles CRLF and missing trailing newline', () => {
		expect(frontmatterOf('---\r\ntitle: x\r\n---\r\nbody')).toBe('title: x');
		expect(frontmatterOf('---\ntitle: x\n---')).toBe('title: x');
		expect(bodyLengthOf('---\ntitle: x\n---')).toBe(0);
	});

	it('returns null for notes without frontmatter', () => {
		expect(frontmatterOf('just text\n---\nmore')).toBeNull();
		expect(frontmatterOf('')).toBeNull();
	});

	it('does not treat --- inside body as frontmatter end', () => {
		const raw = '---\na: 1\n---\ntext\n---\nmore';
		expect(frontmatterOf(raw)).toBe('a: 1');
	});
});

describe('analyzeFrontmatter', () => {
	it('detects top-level keys and duplicates', () => {
		const info = analyzeFrontmatter('---\ntitle: x\ntags: [a]\ntitle: y\n---\n');
		expect(info.present).toBe(true);
		expect(info.keys).toEqual(['title', 'tags']);
		expect(info.duplicateKeys).toEqual(['title']);
	});

	it('ignores indented lines when collecting keys', () => {
		const info = analyzeFrontmatter('---\nmeta:\n  title: nested\nother: 1\n---\n');
		expect(info.keys).toEqual(['meta', 'other']);
	});

	it('reports parser errors via the injected parser', () => {
		const bad = (_s: string) => {
			throw new Error('boom');
		};
		const info = analyzeFrontmatter('---\n: :\n---\n', bad);
		expect(info.valid).toBe(false);
		expect(info.error).toBe('boom');
	});

	it('stays valid without a parser', () => {
		const info = analyzeFrontmatter('---\ntitle: x\n---\n');
		expect(info.valid).toBe(true);
	});

	it('handles notes without frontmatter', () => {
		const info = analyzeFrontmatter('plain');
		expect(info).toEqual({ present: false, valid: true, keys: [], duplicateKeys: [] });
	});
});
