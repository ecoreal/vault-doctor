// Levenshtein-based "did you mean" for broken links, plus linkpath form
// selection for fixes. Pure.

import { FileRec } from './types';
import { PathIndex } from './resolver';
import { basename, dirname, extname, relativePath, stripExt } from './pathutil';

/** Classic DP Levenshtein distance with a bail-out threshold. */
export function levenshtein(a: string, b: string, max = Infinity): number {
	if (a === b) return 0;
	const la = a.length;
	const lb = b.length;
	if (Math.abs(la - lb) > max) return max + 1;
	let prev = new Array<number>(lb + 1);
	let curr = new Array<number>(lb + 1);
	for (let j = 0; j <= lb; j++) prev[j] = j;
	for (let i = 1; i <= la; i++) {
		curr[0] = i;
		let rowMin = curr[0];
		const ca = a.charCodeAt(i - 1);
		for (let j = 1; j <= lb; j++) {
			const cost = ca === b.charCodeAt(j - 1) ? 0 : 1;
			curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
			if (curr[j] < rowMin) rowMin = curr[j];
		}
		if (rowMin > max) return max + 1;
		[prev, curr] = [curr, prev];
	}
	return prev[lb];
}

export interface SuggestContext {
	index: PathIndex;
	/** Source file of the broken link — used to prefer same-folder candidates */
	sourcePath: string;
	maxDistance: number;
}

/**
 * Rank vault files as replacements for a broken link target.
 * Returns up to 3 candidates, best first, within maxDistance.
 */
export function suggestTargets(
	brokenTarget: string,
	ctx: SuggestContext,
): { target: string; distance: number }[] {
	const t = brokenTarget.trim().toLowerCase();
	if (!t) return [];
	const tBase = stripExt(basename(t));
	const tExt = extname(t);
	const scored: { target: string; distance: number }[] = [];
	for (const f of ctx.index.all) {
		const p = f.path;
		const fBase = stripExt(basename(p)).toLowerCase();
		const fExt = extname(p);
		let d = Math.min(
			levenshtein(tBase, fBase, ctx.maxDistance + 2),
			levenshtein(t, stripExt(p).toLowerCase(), ctx.maxDistance + 2),
		);
		if (d > ctx.maxDistance) continue;
		// prefer the same extension, same folder, then shorter paths
		if (tExt && fExt && tExt !== fExt) d += 0.5;
		if (dirname(p) && dirname(p) === dirname(ctx.sourcePath)) d -= 1.5;
		d += p.length / 1000;
		scored.push({ target: p, distance: d });
	}
	scored.sort((a, b) => a.distance - b.distance || (a.target < b.target ? -1 : 1));
	const out: { target: string; distance: number }[] = [];
	const seen = new Set<string>();
	for (const s of scored) {
		if (seen.has(s.target)) continue;
		seen.add(s.target);
		out.push(s);
		if (out.length >= 3) break;
	}
	return out;
}

/**
 * Pick the linkpath form to write into a note:
 * - wiki links use the bare basename when it is unique in the vault,
 *   otherwise the full path (extension stripped for .md/.canvas)
 * - md-style links get a relative path with percent-encoded spaces
 */
export function preferredLinkpath(
	dest: FileRec,
	kind: 'wiki' | 'md',
	sourcePath: string,
	index: PathIndex,
): string {
	if (kind === 'wiki') {
		const base = basename(dest.path);
		const stem = stripExt(base);
		const noteExt = dest.ext === 'md' || dest.ext === 'canvas';
		const ambiguous =
			(index.byBasenameNoExt.get(stem.toLowerCase())?.length ?? 0) > 1 ||
			(index.byBasename.get(base.toLowerCase())?.length ?? 0) > 1;
		if (noteExt) return ambiguous ? stripExt(dest.path) : stem;
		return ambiguous ? dest.path : base;
	}
	return relativePath(dirname(sourcePath), dest.path).replace(/ /g, '%20');
}
