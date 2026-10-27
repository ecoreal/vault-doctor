import { describe, expect, it } from 'vitest';
import {
	basename, buildMatcher, decodeLinkComponent, dirname, extname, relativePath, splitMdLink, stripExt,
} from '../src/pathutil';

describe('path helpers', () => {
	it('dirname/basename/extname/stripExt', () => {
		expect(dirname('a/b/c.md')).toBe('a/b');
		expect(dirname('c.md')).toBe('');
		expect(basename('a/b/c.md')).toBe('c.md');
		expect(extname('a/b/C.PNG')).toBe('png');
		expect(extname('noext')).toBe('');
		expect(extname('.hidden')).toBe('');
		expect(stripExt('a/b/c.md')).toBe('a/b/c');
		expect(stripExt('a/b/c')).toBe('a/b/c');
		expect(stripExt('a.b/c')).toBe('a.b/c');
	});

	it('relativePath walks up and down', () => {
		expect(relativePath('a/b', 'a/b/c.md')).toBe('c.md');
		expect(relativePath('a/b', 'a/x.md')).toBe('../x.md');
		expect(relativePath('', 'a/x.md')).toBe('a/x.md');
		expect(relativePath('a/b/c', 'a/b/c/d/e.md')).toBe('d/e.md');
	});
});

describe('buildMatcher', () => {
	const m = (globs: string[], regexes: string[] = []) => buildMatcher(globs, regexes);

	it('matches ** across segments and * within one', () => {
		const matcher = m(['Templates/**']);
		expect(matcher.matches('Templates/daily.md')).toBe(true);
		expect(matcher.matches('Templates/sub/deep.md')).toBe(true);
		expect(matcher.matches('My Templates/daily.md')).toBe(false);
		const single = m(['Templates/*']);
		expect(single.matches('Templates/daily.md')).toBe(true);
		expect(single.matches('Templates/sub/deep.md')).toBe(false);
	});

	it('supports negation', () => {
		const matcher = m(['Archive/**', '!Archive/keep.md']);
		expect(matcher.matches('Archive/old.md')).toBe(true);
		expect(matcher.matches('Archive/keep.md')).toBe(false);
	});

	it('supports ? and regexes', () => {
		expect(m(['note?.md']).matches('note.md')).toBe(false);
		expect(m(['note?.md']).matches('notes.md')).toBe(true);
		expect(m(['note?.md']).matches('notexy.md')).toBe(false);
		expect(m([], ['^private/']).matches('private/x.md')).toBe(true);
		expect(m([], ['^private/']).matches('public/x.md')).toBe(false);
	});

	it('ignores invalid regexes instead of throwing', () => {
		expect(() => m([], ['([invalid']).matches('x.md')).not.toThrow();
	});
});

describe('splitMdLink', () => {
	it('splits on the literal # before decoding', () => {
		// a filename containing '#' must be written %23 in md links; the
		// %23 must not be mistaken for the start of a subpath
		expect(splitMdLink('C%23%20Notes.md#Sec')).toEqual({
			target: 'C# Notes.md',
			subpath: '#Sec',
		});
	});

	it('decodes plain destinations and keeps unencoded input on bad escapes', () => {
		expect(splitMdLink('My%20Note.md')).toEqual({ target: 'My Note.md', subpath: '' });
		expect(splitMdLink('Note.md#Head%20Two')).toEqual({ target: 'Note.md', subpath: '#Head Two' });
		expect(splitMdLink('bad%ZZ.md')).toEqual({ target: 'bad%ZZ.md', subpath: '' });
	});

	it('decodes standalone components', () => {
		expect(decodeLinkComponent('a%20b')).toBe('a b');
		expect(decodeLinkComponent('plain')).toBe('plain');
		expect(decodeLinkComponent('%E0%A4%A')).toBe('%E0%A4%A');
	});
});
