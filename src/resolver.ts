// Obsidian-like linkpath resolution over a VaultSnapshot. Pure.
//
// Resolution order mirrors getFirstLinkpathDest():
//   1. exact path from vault root (with/without extension)
//   2. path relative to the linking file's folder
//   3. shortest-path basename match anywhere in the vault
// All comparisons are case-insensitive.

import { FileRec, LinkRef, VaultSnapshot } from './types';
import { basename, dirname, joinPath, normPath, stripExt } from './pathutil';

export interface PathIndex {
	/** lowercase full path (with ext) → record */
	byPath: Map<string, FileRec>;
	/** lowercase path without ext → record */
	byPathNoExt: Map<string, FileRec>;
	/** lowercase basename with ext → records, sorted shortest-path-first */
	byBasename: Map<string, FileRec[]>;
	/** lowercase basename without ext → records, sorted shortest-path-first */
	byBasenameNoExt: Map<string, FileRec[]>;
	all: FileRec[];
}

export function buildIndex(snapshot: VaultSnapshot): PathIndex {
	const idx: PathIndex = {
		byPath: new Map(),
		byPathNoExt: new Map(),
		byBasename: new Map(),
		byBasenameNoExt: new Map(),
		all: snapshot.files,
	};
	for (const f of snapshot.files) {
		const p = normPath(f.path).toLowerCase();
		if (!idx.byPath.has(p)) idx.byPath.set(p, f);
		if (!idx.byPathNoExt.has(stripExt(p).toLowerCase())) idx.byPathNoExt.set(stripExt(p).toLowerCase(), f);
	}
	const pushAll = (m: Map<string, FileRec[]>, key: string, f: FileRec) => {
		const arr = m.get(key);
		if (arr) arr.push(f);
		else m.set(key, [f]);
	};
	for (const f of snapshot.files) {
		const p = normPath(f.path);
		pushAll(idx.byBasename, basename(p).toLowerCase(), f);
		pushAll(idx.byBasenameNoExt, stripExt(basename(p)).toLowerCase(), f);
	}
	const byShortest = (a: FileRec, b: FileRec) =>
		a.path.length - b.path.length || (a.path < b.path ? -1 : 1);
	for (const m of [idx.byBasename, idx.byBasenameNoExt]) {
		for (const arr of m.values()) arr.sort(byShortest);
	}
	return idx;
}

function looksLikeExt(p: string): boolean {
	const b = basename(p);
	const i = b.lastIndexOf('.');
	return i > 0 && i < b.length - 1;
}

function decodeTarget(t: string, kind: LinkRef['kind']): string {
	if (kind !== 'md' || !/%[0-9a-fA-F]{2}/.test(t)) return t;
	try {
		return decodeURIComponent(t);
	} catch {
		return t;
	}
}

/**
 * Resolve a link target the way Obsidian does. Returns the matching file
 * record, or null when the link is broken.
 */
export function resolveLinkpath(
	rawTarget: string,
	kind: LinkRef['kind'],
	sourcePath: string,
	idx: PathIndex,
): FileRec | null {
	const t = normPath(decodeTarget(rawTarget, kind));
	if (!t) return null;
	const lower = t.toLowerCase();

	if (looksLikeExt(t)) {
		// Note: targets like [[2024.10.01]] look like they carry an extension,
		// but Obsidian still resolves them to "2024.10.01.md" — so after the
		// exact-path attempts we fall back to appending ".md" before giving up.
		return (
			idx.byPath.get(lower) ??
			idx.byPath.get(joinPath(dirname(sourcePath), t).toLowerCase()) ??
			idx.byPath.get(lower + '.md') ??
			idx.byPath.get(joinPath(dirname(sourcePath), t).toLowerCase() + '.md') ??
			first(idx.byBasename.get(lower)) ??
			first(idx.byBasename.get(lower + '.md')) ??
			null
		);
	}
	return (
		idx.byPathNoExt.get(lower) ??
		idx.byPathNoExt.get(joinPath(dirname(sourcePath), t).toLowerCase()) ??
		first(idx.byBasenameNoExt.get(basename(t).toLowerCase())) ??
		idx.byPath.get(lower + '.md') ??
		null
	);
}

function first(arr?: FileRec[]): FileRec | null {
	return arr && arr.length > 0 ? arr[0] : null;
}

/** True when the link is a pure in-page reference like [[#Heading]]. */
export function isSelfReference(link: Pick<LinkRef, 'target' | 'subpath'>): boolean {
	return !link.target && !!link.subpath;
}
