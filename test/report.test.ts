import { describe, expect, it } from 'vitest';
import { generateReport } from '../src/report';
import { attachSuggestions } from '../src/fixes';
import { DEFAULT_OPTIONS, VaultSnapshot } from '../src/types';
import { analyze } from '../src/engine';
import { link, rec, snap } from './helpers';

const scan = (files: VaultSnapshot['files']) => {
	const s = snap(files);
	const r = analyze(s, { ...DEFAULT_OPTIONS });
	attachSuggestions(r, s, { ...DEFAULT_OPTIONS });
	return r;
};

describe('generateReport', () => {
	it('produces a clean report for a healthy vault', () => {
		const r = scan([rec({ path: 'a.md', links: [link({ target: 'b' })] }), rec({ path: 'b.md' })]);
		const md = generateReport(r, { vaultName: 'X', maxRowsPerSection: 50 });
		expect(md).toContain('# Vault Doctor Report');
		expect(md).toContain('**X**');
		expect(md).toContain('All checks passed');
		expect(md).not.toContain('## Broken');
	});

	it('lists findings grouped by category with suggestions', () => {
		const r = scan([
			rec({ path: 'a.md', links: [link({ target: 'Obsidian Gude' })] }),
			rec({ path: 'Notes/Obsidian Guide.md' }),
			rec({ path: 'empty.md', bodyLength: 0 }),
		]);
		const md = generateReport(r, { vaultName: 'X', maxRowsPerSection: 50 });
		expect(md).toContain('## Broken links & embeds (1)');
		expect(md).toContain('Suggestion');
		expect(md).toContain('`[[Obsidian Guide]]`');
		expect(md).toContain('## Stub / empty notes (1)');
	});

	it('truncates long sections and includes the attachment inventory', () => {
		const files = Array.from({ length: 8 }, (_, i) =>
			rec({ path: `f${i}.md`, links: [link({ target: 'gone' })] }),
		);
		files.push(rec({ path: 'vid.mp4', ext: 'mp4', size: 30 * 1024 * 1024 }));
		const r = scan(files);
		const md = generateReport(r, { vaultName: 'X', maxRowsPerSection: 5 });
		expect(md).toContain('…and 3 more');
		expect(md).toContain('| .mp4 |');
		expect(md).toContain('## Largest files');
	});

	it('renders duplicate-name details as a sub-list', () => {
		const r = scan([rec({ path: 'A/n.md' }), rec({ path: 'B/n.md' })]);
		const md = generateReport(r, { vaultName: 'X', maxRowsPerSection: 50 });
		expect(md).toContain('Ambiguous duplicate names (1)');
		expect(md).toContain('A/n.md');
	});
});
