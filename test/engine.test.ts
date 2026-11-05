import { describe, expect, it } from 'vitest';
import { analyze } from '../src/engine';
import { DEFAULT_OPTIONS, EngineOptions } from '../src/types';
import { fm, link, rec, snap } from './helpers';

const opts = (over: Partial<EngineOptions> = {}): EngineOptions => ({ ...DEFAULT_OPTIONS, ...over });

describe('broken links', () => {
	it('flags a wiki link to a missing note', () => {
		const r = analyze(
			snap([rec({ path: 'a.md', links: [link({ target: 'Missing' })] })]),
			opts(),
		);
		const broken = r.findings.filter((f) => f.category === 'broken-link');
		expect(broken).toHaveLength(1);
		expect(broken[0].severity).toBe('error');
		expect(broken[0].file).toBe('a.md');
		expect(broken[0].message).toContain('Missing');
	});

	it('does not flag links that resolve', () => {
		const r = analyze(
			snap([
				rec({ path: 'a.md', links: [link({ target: 'b' })] }),
				rec({ path: 'Notes/b.md' }),
			]),
			opts(),
		);
		expect(r.findings.filter((f) => f.category === 'broken-link')).toHaveLength(0);
		expect(r.stats.resolvedLinks).toBe(1);
	});

	it('separates embeds in the message', () => {
		const r = analyze(
			snap([rec({ path: 'a.md', links: [link({ target: 'pic', embed: true })] })]),
			opts(),
		);
		expect(r.findings[0].message).toContain('embed');
	});

	it('dedupes identical broken links within one file but counts them once each', () => {
		const r = analyze(
			snap([
				rec({
					path: 'a.md',
					links: [link({ target: 'Missing', line: 1 }), link({ target: 'Missing', line: 5 })],
				}),
			]),
			opts(),
		);
		expect(r.findings.filter((f) => f.category === 'broken-link')).toHaveLength(1);
	});

	it('separately reports identical broken links from different files', () => {
		const r = analyze(
			snap([
				rec({ path: 'a.md', links: [link({ target: 'Missing' })] }),
				rec({ path: 'b.md', links: [link({ target: 'Missing' })] }),
			]),
			opts(),
		);
		expect(r.findings.filter((f) => f.category === 'broken-link')).toHaveLength(2);
	});

	it('detects missing headings in resolved links', () => {
		const r = analyze(
			snap([
				rec({ path: 'a.md', links: [link({ target: 'b', subpath: '#Nope' })] }),
				rec({ path: 'b.md', headings: ['Real'] }),
			]),
			opts(),
		);
		const broken = r.findings.filter((f) => f.category === 'broken-link');
		expect(broken).toHaveLength(1);
		expect(broken[0].severity).toBe('warning');
		expect(broken[0].message).toContain('Nope');
	});

	it('accepts case-insensitive heading matches', () => {
		const r = analyze(
			snap([
				rec({ path: 'a.md', links: [link({ target: 'b', subpath: '#REAL' })] }),
				rec({ path: 'b.md', headings: ['Real'] }),
			]),
			opts(),
		);
		expect(r.findings.filter((f) => f.category === 'broken-link')).toHaveLength(0);
	});

	it('does not check block references (#^...)', () => {
		const r = analyze(
			snap([
				rec({ path: 'a.md', links: [link({ target: 'b', subpath: '#^abc123' })] }),
				rec({ path: 'b.md' }),
			]),
			opts(),
		);
		expect(r.findings).toHaveLength(0);
	});

	it('treats [[#Section]] as a self-reference', () => {
		const r = analyze(
			snap([rec({ path: 'a.md', links: [link({ target: '', subpath: '#Intro' })], headings: ['Intro'] })]),
			opts(),
		);
		expect(r.findings).toHaveLength(0);
		expect(r.stats.resolvedLinks).toBe(1);
	});

	it('can disable heading checks', () => {
		const r = analyze(
			snap([
				rec({ path: 'a.md', links: [link({ target: 'b', subpath: '#Nope' })] }),
				rec({ path: 'b.md' }),
			]),
			opts({ checkHeadingLinks: false }),
		);
		expect(r.findings).toHaveLength(0);
	});
});

describe('orphan notes', () => {
	it('flags notes with no inbound and no outbound links', () => {
		const r = analyze(snap([rec({ path: 'lonely.md' })]), opts());
		expect(r.findings.filter((f) => f.category === 'orphan').map((f) => f.file)).toEqual(['lonely.md']);
	});

	it('broken outbound links do not create graph edges', () => {
		// hub only links to a missing note — by graph rules it is still an orphan
		const r = analyze(snap([rec({ path: 'hub.md', links: [link({ target: 'x' })] })]), opts());
		expect(r.findings.filter((f) => f.category === 'orphan').map((f) => f.file)).toEqual(['hub.md']);
	});

	it('a resolved outbound link prevents orphan', () => {
		const r = analyze(
			snap([rec({ path: 'hub.md', links: [link({ target: 'target' })] }), rec({ path: 'target.md' })]),
			opts(),
		);
		expect(r.findings.filter((f) => f.category === 'orphan')).toHaveLength(0);
	});

	it('an inbound resolved link prevents orphan', () => {
		const r = analyze(
			snap([rec({ path: 'hub.md', links: [link({ target: 'target' })] }), rec({ path: 'target.md' })]),
			opts(),
		);
		expect(r.stats.orphans).toBe(0);
	});

	it('tagged notes are not orphans by default', () => {
		const r = analyze(snap([rec({ path: 'tagged.md', tags: ['project'] })]), opts());
		expect(r.findings.filter((f) => f.category === 'orphan')).toHaveLength(0);
	});

	it('tagged notes become orphans when treatTaggedAsLinked is false', () => {
		const r = analyze(snap([rec({ path: 'tagged.md', tags: ['project'] })]), opts({ treatTaggedAsLinked: false }));
		expect(r.findings.filter((f) => f.category === 'orphan')).toHaveLength(1);
	});

	it('embeds count as links', () => {
		const r = analyze(
			snap([
				rec({ path: 'page.md', links: [link({ target: 'img', embed: true })] }),
				rec({ path: 'img.png', ext: 'png' }),
			]),
			opts(),
		);
		expect(r.findings.filter((f) => f.category === 'orphan')).toHaveLength(0);
	});
});

describe('stub notes', () => {
	it('flags notes below the body threshold', () => {
		const r = analyze(snap([rec({ path: 'tiny.md', bodyLength: 5 })]), opts({ stubThresholdChars: 80 }));
		const stubs = r.findings.filter((f) => f.category === 'stub');
		expect(stubs).toHaveLength(1);
		expect(stubs[0].severity).toBe('info');
	});

	it('offers a trash fix only for completely empty bodies', () => {
		const empty = analyze(snap([rec({ path: 'e.md', bodyLength: 0 })]), opts());
		const partly = analyze(snap([rec({ path: 'p.md', bodyLength: 10 })]), opts());
		expect(empty.findings.find((f) => f.category === 'stub')?.fix).toEqual({ kind: 'trash', file: 'e.md' });
		expect(partly.findings.find((f) => f.category === 'stub')?.fix).toBeUndefined();
	});

	it('can be disabled and then reports no stubs at all', () => {
		const r = analyze(snap([rec({ path: 'tiny.md', bodyLength: 0 })]), opts({ checkStubs: false, checkOrphans: false }));
		expect(r.findings).toHaveLength(0);
		expect(r.stats.stubs).toBe(0);
	});
});

describe('oversized attachments', () => {
	it('flags attachments above the threshold with human sizes', () => {
		const r = analyze(
			snap([rec({ path: 'movie.mp4', ext: 'mp4', size: 15 * 1024 * 1024 })]),
			opts({ oversizeThresholdMB: 10 }),
		);
		const big = r.findings.filter((f) => f.category === 'oversize');
		expect(big).toHaveLength(1);
		expect(big[0].message).toMatch(/15\.0 MB|14\.3 MB/);
	});

	it('ignores attachments below the threshold and counts inventory', () => {
		const r = analyze(
			snap([
				rec({ path: 'a.png', ext: 'png', size: 100 }),
				rec({ path: 'b.png', ext: 'png', size: 200 }),
			]),
			opts(),
		);
		expect(r.findings).toHaveLength(0);
		expect(r.stats.attachmentExt['png']).toEqual({ count: 2, bytes: 300 });
		expect(r.stats.attachments).toBe(2);
	});

	it('can be disabled while keeping the attachment inventory', () => {
		const r = analyze(
			snap([rec({ path: 'movie.mp4', ext: 'mp4', size: 15 * 1024 * 1024 })]),
			opts({ checkOversize: false }),
		);
		expect(r.findings).toHaveLength(0);
		expect(r.stats.attachments).toBe(1);
		expect(r.stats.attachmentExt['mp4']).toEqual({ count: 1, bytes: 15 * 1024 * 1024 });
	});
});

describe('frontmatter findings', () => {
	it('reports invalid YAML as an error', () => {
		const r = analyze(
			snap([rec({ path: 'a.md', frontmatter: fm({ valid: false, error: 'bad indent' }) })]),
			opts(),
		);
		const f = r.findings.find((x) => x.category === 'frontmatter')!;
		expect(f.severity).toBe('error');
		expect(f.detail).toBe('bad indent');
	});

	it('reports duplicate frontmatter keys', () => {
		const r = analyze(
			snap([rec({ path: 'a.md', frontmatter: fm({ duplicateKeys: ['tags'] }) })]),
			opts(),
		);
		expect(r.findings[0].message).toContain('tags');
	});

	it('reports missing required keys only when frontmatter is present', () => {
		const withFm = analyze(
			snap([rec({ path: 'a.md', frontmatter: fm({ keys: ['title'] }) })]),
			opts({ requireFrontmatterKeys: ['title', 'created'] }),
		);
		expect(withFm.findings[0].message).toContain('created');

		const noFm = analyze(snap([rec({ path: 'b.md' })]), opts({ requireFrontmatterKeys: ['title'] }));
		expect(noFm.findings.filter((f) => f.category === 'frontmatter')).toHaveLength(0);
	});
});

describe('duplicate basenames', () => {
	it('groups notes sharing a name across folders', () => {
		const r = analyze(
			snap([rec({ path: 'A/note.md' }), rec({ path: 'B/note.md' }), rec({ path: 'c.md' })]),
			opts(),
		);
		const dups = r.findings.filter((f) => f.category === 'duplicate');
		expect(dups).toHaveLength(1);
		expect(dups[0].message).toContain('2 notes');
		expect(dups[0].detail).toContain('A/note.md');
		expect(dups[0].detail).toContain('B/note.md');
	});

	it('is case-insensitive and can be disabled', () => {
		const files = [rec({ path: 'A/note.md' }), rec({ path: 'B/NOTE.md' })];
		expect(analyze(snap(files), opts()).findings.filter((f) => f.category === 'duplicate')).toHaveLength(1);
		expect(
			analyze(snap(files), opts({ checkDuplicates: false })).findings.filter((f) => f.category === 'duplicate'),
		).toHaveLength(0);
	});
});

describe('unsafe file names', () => {
	it('warns about characters that break wiki links', () => {
		const r = analyze(snap([rec({ path: 'What? [draft].md' })]), opts());
		const f = r.findings.find((x) => x.category === 'unsafe-name')!;
		expect(f.severity).toBe('warning');
	});

	it('flags windows-invalid names as info', () => {
		const r = analyze(snap([rec({ path: 'a<b>.md' })]), opts());
		const f = r.findings.find((x) => x.category === 'unsafe-name')!;
		expect(f.severity).toBe('info');
	});

	it('flags trailing spaces', () => {
		const r = analyze(snap([rec({ path: 'note .md' })]), opts());
		expect(r.findings.find((x) => x.category === 'unsafe-name')).toBeDefined();
	});
});

describe('ignore patterns', () => {
	const files = [
		rec({ path: 'Templates/daily.md', links: [link({ target: 'Nowhere' })] }),
		rec({ path: 'real.md', links: [link({ target: 'Nowhere' })] }),
	];

	it('suppresses findings for ignored files', () => {
		const r = analyze(snap(files), opts({ ignoreGlobs: ['Templates/**'] }));
		const broken = r.findings.filter((f) => f.category === 'broken-link');
		expect(broken).toHaveLength(1);
		expect(broken[0].file).toBe('real.md');
	});

	it('supports negation and regex patterns', () => {
		const r = analyze(snap(files), opts({ ignoreRegexes: ['^Templates/'] }));
		expect(r.findings.filter((f) => f.category === 'broken-link')).toHaveLength(1);
	});
});

describe('stats', () => {
	it('computes vault statistics', () => {
		const r = analyze(
			snap([
				rec({ path: 'a.md', links: [link({ target: 'b' }), link({ target: 'gone' })] }),
				rec({ path: 'b.md' }),
				rec({ path: 'img.png', ext: 'png', size: 2048 }),
				rec({ path: 'vid.mp4', ext: 'mp4', size: 4096 }),
			]),
			opts(),
		);
		expect(r.stats.notes).toBe(2);
		expect(r.stats.attachments).toBe(2);
		expect(r.stats.links).toBe(2);
		expect(r.stats.resolvedLinks).toBe(1);
		expect(r.stats.brokenLinks).toBe(1);
		expect(r.stats.totalSize).toBe(500 + 500 + 2048 + 4096);
		expect(r.stats.biggest[0].path).toBe('vid.mp4');
	});

	it('assigns deterministic finding ids', () => {
		const r = analyze(
			snap([rec({ path: 'a.md', links: [link({ target: 'x' })] }), rec({ path: 'b.md', bodyLength: 0 })]),
			opts(),
		);
		for (const f of r.findings) expect(f.id).toMatch(/^[a-z-]+:.+:\d+$/);
		const r2 = analyze(
			snap([rec({ path: 'a.md', links: [link({ target: 'x' })] }), rec({ path: 'b.md', bodyLength: 0 })]),
			opts(),
		);
		expect(r2.findings.map((f) => f.id)).toEqual(r.findings.map((f) => f.id));
	});
});
