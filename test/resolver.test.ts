import { describe, expect, it } from 'vitest';
import { buildIndex, resolveLinkpath } from '../src/resolver';
import { rec, snap } from './helpers';

const idxOf = (...paths: string[]) => buildIndex(snap(paths.map((p) => rec({ path: p }))));

describe('buildIndex', () => {
	it('indexes paths case-insensitively', () => {
		const idx = idxOf('Notes/Foo.md');
		expect(resolveLinkpath('notes/foo', 'wiki', 'a.md', idx)?.path).toBe('Notes/Foo.md');
	});
});

describe('resolveLinkpath', () => {
	it('resolves exact paths from the vault root', () => {
		const idx = idxOf('docs/guide.md');
		expect(resolveLinkpath('docs/guide', 'wiki', 'x.md', idx)?.path).toBe('docs/guide.md');
	});

	it('resolves paths relative to the source folder', () => {
		const idx = idxOf('projects/alpha/notes.md');
		expect(resolveLinkpath('notes', 'wiki', 'projects/alpha/main.md', idx)?.path).toBe(
			'projects/alpha/notes.md',
		);
	});

	it('falls back to a unique basename match anywhere', () => {
		const idx = idxOf('deep/nested/unique.md');
		expect(resolveLinkpath('unique', 'wiki', 'elsewhere.md', idx)?.path).toBe('deep/nested/unique.md');
	});

	it('prefers the vault-root path over a relative interpretation', () => {
		const idx = idxOf('root.md', 'folder/root.md');
		expect(resolveLinkpath('root', 'wiki', 'folder/src.md', idx)?.path).toBe('root.md');
	});

	it('prefers the relative interpretation when nothing exists at the root', () => {
		const idx = idxOf('folder/root.md');
		expect(resolveLinkpath('root', 'wiki', 'folder/src.md', idx)?.path).toBe('folder/root.md');
	});

	it('breaks ties between duplicate basenames by shortest path', () => {
		const idx = idxOf('aa/bb/name.md', 'x/name.md');
		expect(resolveLinkpath('name', 'wiki', 'z.md', idx)?.path).toBe('x/name.md');
	});

	it('resolves explicit extensions including non-md files', () => {
		const idx = idxOf('assets/pic.png', 'doc.pdf');
		expect(resolveLinkpath('assets/pic.png', 'wiki', 'a.md', idx)?.path).toBe('assets/pic.png');
		expect(resolveLinkpath('doc.pdf', 'wiki', 'a.md', idx)?.path).toBe('doc.pdf');
	});

	it('returns null for missing targets', () => {
		const idx = idxOf('a.md');
		expect(resolveLinkpath('zzz', 'wiki', 'a.md', idx)).toBeNull();
		expect(resolveLinkpath('', 'wiki', 'a.md', idx)).toBeNull();
	});

	it('decodes percent-encoded md link targets', () => {
		const idx = idxOf('My Note.md');
		expect(resolveLinkpath('My%20Note', 'md', 'a.md', idx)?.path).toBe('My Note.md');
	});

	it('handles targets with dots in folder names', () => {
		const idx = idxOf('My.Project/file.md');
		expect(resolveLinkpath('My.Project/file', 'wiki', 'a.md', idx)?.path).toBe('My.Project/file.md');
	});
});
