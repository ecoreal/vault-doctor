// The pure analysis engine: turns a VaultSnapshot into findings + stats.
// No obsidian imports — fully unit-testable.

import {
	EngineOptions, FileRec, Finding, ScanResult, Severity, VaultSnapshot, VaultStats,
} from './types';
import { buildMatcher, basename } from './pathutil';
import { buildIndex, isSelfReference, resolveLinkpath } from './resolver';

const NOTE_EXTS = new Set(['md', 'canvas']);

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function analyze(snapshot: VaultSnapshot, opts: EngineOptions): ScanResult {
	const idx = buildIndex(snapshot);
	const ignored = buildMatcher(opts.ignoreGlobs, opts.ignoreRegexes);

	const findings: Finding[] = [];
	const inbound = new Set<string>();
	const outbound = new Map<string, number>();
	const basenameGroups = new Map<string, FileRec[]>();
	const seenBroken = new Set<string>();
	let links = 0;
	let resolvedLinks = 0;

	for (const f of snapshot.files) {
		if (NOTE_EXTS.has(f.ext)) {
			const key = basename(f.path).toLowerCase();
			const arr = basenameGroups.get(key);
			if (arr) arr.push(f);
			else basenameGroups.set(key, [f]);
		}
		for (const link of f.links) {
			links++;
			const dest = isSelfReference(link)
				? f
				: resolveLinkpath(link.target, link.kind, f.path, idx);
			if (dest) {
				resolvedLinks++;
				inbound.add(dest.path);
				outbound.set(f.path, (outbound.get(f.path) ?? 0) + 1);
				if (opts.checkHeadingLinks && link.subpath && !link.subpath.startsWith('#^')) {
					const seg = lastHeadingSegment(link.subpath);
					if (seg && !dest.headings.some((h) => h.toLowerCase() === seg.toLowerCase())) {
						const hkey = `${f.path}|${link.raw}`;
						if (!ignored.matches(f.path) && !seenBroken.has(hkey)) {
							seenBroken.add(hkey);
							findings.push({
								id: '',
								category: 'broken-link',
								severity: 'warning',
								file: f.path,
								message: `Heading "${seg}" not found in [[${dest.path}]]`,
								link: { raw: link.raw, target: link.target, subpath: link.subpath, line: link.line, embed: link.embed, kind: link.kind },
							});
						}
					}
				}
			} else if (!ignored.matches(f.path)) {
				const key = `${f.path}|${link.raw}`;
				if (!seenBroken.has(key)) {
					seenBroken.add(key);
					addBrokenLinkFinding(findings, f, link);
				}
			}
		}
	}

	const stats: VaultStats = {
		notes: 0,
		attachments: 0,
		totalSize: 0,
		links,
		resolvedLinks,
		brokenLinks: 0,
		orphans: 0,
		stubs: 0,
		attachmentExt: {},
		biggest: [],
	};

	for (const f of snapshot.files) {
		stats.totalSize += f.size;
		if (NOTE_EXTS.has(f.ext)) {
			stats.notes++;
			const skip = ignored.matches(f.path);
			if (!skip) {
				if (opts.checkOrphans) {
					const linkedOut = (outbound.get(f.path) ?? 0) > 0;
					const linkedIn = inbound.has(f.path);
					const tagged = opts.treatTaggedAsLinked && f.tags.length > 0;
					if (!linkedIn && !linkedOut && !tagged) {
						stats.orphans++;
						findings.push({
							id: '',
							category: 'orphan',
							severity: 'warning',
							file: f.path,
							message: 'No notes link here and it links nowhere',
							detail: f.tags.length
								? undefined
								: 'Add a link from another note, or ignore this folder in settings.',
						});
					}
				}
				if (opts.checkStubs && f.bodyLength < opts.stubThresholdChars) {
					stats.stubs++;
					findings.push({
						id: '',
						category: 'stub',
						severity: 'info',
						file: f.path,
						message: `Nearly empty note (${f.bodyLength} chars of body)`,
						fix: f.bodyLength === 0 ? { kind: 'trash', file: f.path } : undefined,
					});
				}
				if (f.frontmatter.present && !f.frontmatter.valid) {
					findings.push({
						id: '',
						category: 'frontmatter',
						severity: 'error',
						file: f.path,
						message: 'Invalid frontmatter YAML',
						detail: f.frontmatter.error,
					});
				}
				if (f.frontmatter.duplicateKeys.length > 0) {
					findings.push({
						id: '',
						category: 'frontmatter',
						severity: 'warning',
						file: f.path,
						message: `Duplicate frontmatter key(s): ${f.frontmatter.duplicateKeys.join(', ')}`,
						detail: 'YAML takes the last occurrence; earlier ones are silently dropped.',
					});
				}
				if (f.frontmatter.present && opts.requireFrontmatterKeys.length > 0) {
					const missing = opts.requireFrontmatterKeys.filter(
						(k) => !f.frontmatter.keys.includes(k),
					);
					if (missing.length > 0) {
						findings.push({
							id: '',
							category: 'frontmatter',
							severity: 'warning',
							file: f.path,
							message: `Missing frontmatter key(s): ${missing.join(', ')}`,
						});
					}
				}
				if (opts.checkUnsafeNames) {
					const name = basename(f.path);
					const unsafe = findUnsafeNameChars(name);
					if (unsafe) {
						findings.push({
							id: '',
							category: 'unsafe-name',
							severity: unsafe.breaksLinks ? 'warning' : 'info',
							file: f.path,
							message: unsafe.breaksLinks
								? `Filename contains "${unsafe.chars}" which breaks wiki links`
								: `Filename is invalid on Windows/sync targets: "${unsafe.chars}"`,
						});
					}
				}
			}
		} else {
			stats.attachments++;
			const ext = f.ext || 'no-ext';
			const agg = stats.attachmentExt[ext] ?? { count: 0, bytes: 0 };
			agg.count++;
			agg.bytes += f.size;
			stats.attachmentExt[ext] = agg;
			const limit = opts.oversizeThresholdMB * 1024 * 1024;
			if (opts.checkOversize && f.size > limit && !ignored.matches(f.path)) {
				findings.push({
					id: '',
					category: 'oversize',
					severity: 'warning',
					file: f.path,
					message: `Large attachment (${humanSize(f.size)})`,
					detail: `Threshold is ${opts.oversizeThresholdMB} MB. Consider compressing or linking externally.`,
				});
			}
		}
	}

	if (opts.checkDuplicates) {
		const groups = [...basenameGroups.values()].filter((a) => a.length > 1);
		for (const g of groups) {
			g.sort((a, b) => (a.path < b.path ? -1 : 1));
			const name = basename(g[0].path);
			findings.push({
				id: '',
				category: 'duplicate',
				severity: 'info',
				file: g[0].path,
				message: `${g.length} notes share the name "${name}" — [[${name.replace(/\.md$/i, '')}]] links are ambiguous`,
				detail: g.map((f) => f.path).join('\n'),
			});
		}
	}

	stats.brokenLinks = findings.filter((x) => x.category === 'broken-link').length;
	stats.biggest = snapshot.files
		.slice()
		.sort((a, b) => b.size - a.size)
		.slice(0, 10)
		.map((f) => ({ path: f.path, size: f.size }));

	findings.sort(byDisplayOrder);
	// Stable deterministic ids after sorting.
	const counters = new Map<string, number>();
	for (const f of findings) {
		const n = counters.get(f.category) ?? 0;
		counters.set(f.category, n + 1);
		f.id = `${f.category}:${f.file}:${n}`;
	}
	return { findings, stats };
}

function byDisplayOrder(a: Finding, b: Finding): number {
	const sev = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
	if (sev !== 0) return sev;
	if (a.category !== b.category) return a.category.localeCompare(b.category);
	const lineA = a.link?.line ?? -1;
	const lineB = b.link?.line ?? -1;
	if (lineA !== lineB) return lineA - lineB;
	return a.file.localeCompare(b.file);
}

function addBrokenLinkFinding(findings: Finding[], f: FileRec, link: FileRec['links'][number]): void {
	const kindLabel = link.embed ? 'embed' : 'link';
	findings.push({
		id: '',
		category: 'broken-link',
		severity: 'error',
		file: f.path,
		message: `Broken ${kindLabel} [[${link.raw}]]`,
		link: { raw: link.raw, target: link.target, subpath: link.subpath, line: link.line, embed: link.embed, kind: link.kind },
	});
}

interface UnsafeName {
	chars: string;
	breaksLinks: boolean;
}

function findUnsafeNameChars(name: string): UnsafeName | null {
	const linkBreakers = name.match(/[#^\[\]|]/);
	if (linkBreakers) return { chars: [...new Set(linkBreakers)].join(' '), breaksLinks: true };
	const windows = name.match(/[<>:"\\?*]/);
	if (windows) return { chars: [...new Set(windows)].join(' '), breaksLinks: false };
	const stem = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : name;
	const edge = stem.match(/^\s|\s$/) || name.match(/\.$/);
	if (edge) return { chars: 'leading/trailing space or dot', breaksLinks: false };
	return null;
}

export function humanSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	const units = ['KB', 'MB', 'GB', 'TB'];
	let v = bytes;
	let u = -1;
	do {
		v /= 1024;
		u++;
	} while (v >= 1024 && u < units.length - 1);
	return `${v >= 100 ? v.toFixed(0) : v.toFixed(1)} ${units[u]}`;
}

/** Split "Note#Head" / "Note#^abc" into linkpath + subpath. */
export function splitSubpath(inner: string): { target: string; subpath?: string } {
	const i = inner.indexOf('#');
	if (i === -1) return { target: inner };
	return { target: inner.slice(0, i), subpath: inner.slice(i) };
}

/** Last meaningful heading segment of a subpath ("#A#B" → "B"). */
export function lastHeadingSegment(subpath: string): string {
	return subpath.split('#').filter(Boolean).pop() ?? '';
}

export { resolveLinkpath } from './resolver';
