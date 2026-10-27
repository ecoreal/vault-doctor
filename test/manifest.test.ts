import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '..');

describe('plugin packaging', () => {
	it('has a valid manifest.json', () => {
		const m = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
		expect(m.id).toBe('vault-doctor');
		expect(m.id).toMatch(/^[a-z0-9-]+$/);
		expect(m.name).toBeTruthy();
		expect(m.version).toMatch(/^\d+\.\d+\.\d+$/);
		expect(m.minAppVersion).toMatch(/^\d+\.\d+\.\d+$/);
		expect(m.description.length).toBeGreaterThan(10);
		expect(m.author).toBeTruthy();
		expect(m.isDesktopOnly).toBe(false);
	});

	it('keeps versions.json in sync with the manifest', () => {
		const m = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));
		const v = JSON.parse(readFileSync(resolve(root, 'versions.json'), 'utf8'));
		expect(v[m.version]).toBe(m.minAppVersion);
	});

	it('documents every command id in the README', () => {
		const main = readFileSync(resolve(root, 'src/main.ts'), 'utf8');
		const readme = readFileSync(resolve(root, 'README.md'), 'utf8');
		const ids = [...main.matchAll(/addCommand\(\{[^}]*id:\s*'([^']+)'/g)].map((x) => x[1]);
		expect(ids.length).toBeGreaterThan(0);
		for (const id of ids) expect(readme).toContain(id);
	});
});
