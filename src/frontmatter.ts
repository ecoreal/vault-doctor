// Frontmatter structural analysis. Pure.
// `parseYaml` is injected by the adapter (obsidian's parseYaml); tests may
// pass their own or omit it — structural checks still run.

import { FmInfo } from './types';

const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

export function frontmatterOf(raw: string): string | null {
	const m = raw.match(FM_RE);
	return m ? m[1] : null;
}

/** Body length in characters, frontmatter block excluded. */
export function bodyLengthOf(raw: string): number {
	const m = raw.match(FM_RE);
	return (m ? raw.slice(m[0].length) : raw).length;
}

export function analyzeFrontmatter(raw: string, parseYaml?: (s: string) => unknown): FmInfo {
	const yaml = frontmatterOf(raw);
	if (yaml === null) return { present: false, valid: true, keys: [], duplicateKeys: [] };
	const keys: string[] = [];
	const duplicateKeys: string[] = [];
	for (const line of yaml.split(/\r?\n/)) {
		const km = line.match(/^([A-Za-z_][\w -]*?)\s*:/);
		if (!km) continue;
		const k = km[1].trim();
		if (keys.includes(k)) {
			if (!duplicateKeys.includes(k)) duplicateKeys.push(k);
		} else {
			keys.push(k);
		}
	}
	let valid = true;
	let error: string | undefined;
	if (parseYaml) {
		try {
			parseYaml(yaml);
		} catch (e) {
			valid = false;
			error = e instanceof Error ? e.message : String(e);
		}
	}
	return { present: true, valid, error, keys, duplicateKeys };
}
