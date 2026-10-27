// Test helpers for building vault snapshots.

import { FileRec, FmInfo, LinkRef, VaultSnapshot } from '../src/types';

export function fm(partial: Partial<FmInfo> = {}): FmInfo {
	return { present: true, valid: true, keys: [], duplicateKeys: [], ...partial };
}

export function rec(partial: Partial<FileRec> & { path: string }): FileRec {
	return {
		ext: partial.ext ?? (partial.path.match(/\.([^.]+)$/)?.[1] ?? '').toLowerCase(),
		size: 500,
		mtime: 0,
		ctime: 0,
		bodyLength: 1000,
		headings: [],
		links: [],
		frontmatter: { present: false, valid: true, keys: [], duplicateKeys: [] },
		tags: [],
		...partial,
	} as FileRec;
}

export function link(partial: Partial<LinkRef> & { target: string }): LinkRef {
	return {
		raw: partial.target,
		embed: false,
		kind: 'wiki',
		line: 0,
		...partial,
	} as LinkRef;
}

export function snap(files: FileRec[], vaultName = 'TestVault'): VaultSnapshot {
	return { files, generatedAt: 0, vaultName };
}
