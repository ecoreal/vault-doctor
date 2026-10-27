// Fix planning + content rewriting. Pure — the adapter applies the results
// via vault.process().

import { EngineOptions, Finding, ScanResult, VaultSnapshot } from './types';
import { buildIndex, PathIndex, resolveLinkpath } from './resolver';
import { preferredLinkpath, suggestTargets } from './suggest';

/**
 * Attach "did you mean" suggestions and relink fix ops to broken-link
 * findings, mutating them in place.
 */
export function attachSuggestions(result: ScanResult, snapshot: VaultSnapshot, opts: EngineOptions): void {
	const index = buildIndex(snapshot);
	for (const finding of result.findings) {
		if (finding.category !== 'broken-link' || !finding.link) continue;
		const kind = finding.link.kind;
		// Heading-only breakage: the target file exists, so relinking it to a
		// different file would be wrong. Suggestions are for dead targets only.
		if (resolveLinkpath(finding.link.target, kind, finding.file, index)) continue;
		const cands = suggestTargets(finding.link.target, {
			index,
			sourcePath: finding.file,
			maxDistance: opts.maxSuggestDistance,
		});
		if (cands.length === 0 || cands[0].distance > opts.maxSuggestDistance) continue;
		const best = index.all.find((f) => f.path === cands[0].target);
		if (!best) continue;
		const to = preferredLinkpath(best, kind, finding.file, index);
		finding.suggestion = {
			target: to,
			distance: Math.max(0, Math.round(cands[0].distance * 10) / 10),
			alternatives: cands.slice(1).map((c) => c.target),
		};
		// Only offer a relink when the suggested target actually resolves.
		if (resolveLinkpath(to, kind, finding.file, index)) {
			finding.fix = { kind: 'relink', file: finding.file, from: finding.link.target, to };
		}
	}
}

export interface RelinkResult {
	content: string;
	replacements: number;
}

/**
 * Rewrite every link in `content` whose linkpath equals `from` so that it
 * points at `to`. Handles wiki links and markdown links, preserves display
 * text and #subpaths, matches case-insensitively, and never touches plain
 * text outside link syntax.
 */
export function relinkContent(content: string, from: string, to: string, kind: 'wiki' | 'md'): RelinkResult {
	if (kind === 'wiki') return relinkWiki(content, from, to);
	return relinkMd(content, from, to);
}

function relinkWiki(content: string, from: string, to: string): RelinkResult {
	let replacements = 0;
	const out = content.replace(/\[\[([^\[\]\n]+?)\]\]/g, (whole, inner: string) => {
		const bar = inner.indexOf('|');
		const pathPart = bar === -1 ? inner : inner.slice(0, bar);
		const rest = bar === -1 ? '' : inner.slice(bar);
		const hash = pathPart.indexOf('#');
		const linkpath = hash === -1 ? pathPart : pathPart.slice(0, hash);
		const subpath = hash === -1 ? '' : pathPart.slice(hash);
		if (linkpath.trim().toLowerCase() !== from.trim().toLowerCase()) return whole;
		if (!linkpath) return whole; // pure [[#section]] references stay as-is
		replacements++;
		return `[[${to}${subpath}${rest}]]`;
	});
	return { content: out, replacements };
}

function relinkMd(content: string, from: string, to: string): RelinkResult {
	let replacements = 0;
	const out = content.replace(/(\]\()([^)\n]+)(\))/g, (whole, open: string, pathPart: string, close: string) => {
		// split off an optional "title" / 'title' suffix
		let inner = pathPart;
		let title = '';
		const tm = inner.match(/\s+("[^"]*"|'[^']*')\s*$/);
		if (tm && tm.index !== undefined) {
			title = tm[0];
			inner = inner.slice(0, tm.index);
		}
		const bare = inner.startsWith('<') && inner.endsWith('>')
			? inner.slice(1, -1)
			: inner.trim();
		const hash = findMdSubpathIndex(bare);
		const linkpath = hash === -1 ? bare : bare.slice(0, hash);
		const subpath = hash === -1 ? '' : bare.slice(hash);
		const decoded = safeDecode(linkpath);
		if (decoded.trim().toLowerCase() !== from.trim().toLowerCase()) return whole;
		replacements++;
		return `${open}${to}${subpath}${title}${close}`;
	});
	return { content: out, replacements };
}

/** Index of the # that starts a subpath (ignoring %23 escapes). */
function findMdSubpathIndex(p: string): number {
	const idx = p.search(/(?<!%)#/);
	return idx;
}

function safeDecode(s: string): string {
	try {
		return decodeURIComponent(s);
	} catch {
		return s;
	}
}

/**
 * Batch-apply several relink ops to one file's content.
 */
export function applyRelinks(content: string, ops: { from: string; to: string; kind: 'wiki' | 'md' }[]): RelinkResult {
	let acc = content;
	let total = 0;
	for (const op of ops) {
		const r = relinkContent(acc, op.from, op.to, op.kind);
		acc = r.content;
		total += r.replacements;
	}
	return { content: acc, replacements: total };
}

export interface FixSummary {
	relinkFiles: number;
	trashFiles: number;
}

/** Group actionable findings into per-file work lists (used by the UI). */
export function collectFixOps(findings: Finding[]): { relinks: Finding[]; trash: Finding[] } {
	const relinks: Finding[] = [];
	const trash: Finding[] = [];
	for (const f of findings) {
		if (!f.fix) continue;
		if (f.fix.kind === 'relink' && f.suggestion) relinks.push(f);
		if (f.fix.kind === 'trash') trash.push(f);
	}
	return { relinks, trash };
}

export type { PathIndex };
