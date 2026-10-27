// Adapter: builds a VaultSnapshot from the live vault via the obsidian API.
// This is the only place (besides UI) that touches obsidian APIs.

import { App, ReferenceCache, TFile, parseYaml } from 'obsidian';
import { FileRec, LinkRef, VaultSnapshot } from './types';
import { analyzeFrontmatter, bodyLengthOf } from './frontmatter';
import { extname } from './pathutil';

/** Yield to the UI every N files so big vaults don't freeze the app. */
const CHUNK = 150;

function splitTarget(link: string, kind: LinkRef['kind']): { target: string; subpath?: string } {
	let text = link;
	if (kind === 'md') {
		try {
			text = decodeURIComponent(link);
		} catch {
			text = link;
		}
	}
	const i = text.indexOf('#');
	if (i === -1) return { target: text };
	return { target: text.slice(0, i), subpath: text.slice(i) };
}

function wikiRaw(original: string | undefined, link: string): string {
	if (original) {
		const stripped = original.replace(/^\s*!?\[\[/, '').replace(/\]\]\s*$/, '');
		if (stripped) return stripped;
	}
	return link;
}

function isWikiSyntax(r: ReferenceCache): boolean {
	return /^\s*!?\[\[/.test(r.original ?? '');
}

function tagsFromCache(fmTags: unknown, inline: string[]): string[] {
	const out = new Set<string>();
	const add = (t: string) => {
		const clean = t.replace(/^#/, '').trim();
		if (clean) out.add(clean);
	};
	if (typeof fmTags === 'string') fmTags.split(/[,\s]+/).forEach(add);
	else if (Array.isArray(fmTags)) fmTags.forEach((t) => typeof t === 'string' && add(t));
	inline.forEach(add);
	return [...out];
}

type FmLink = ReferenceCache & { key?: string };

export async function collectSnapshot(
	app: App,
	onProgress?: (done: number, total: number) => void,
): Promise<VaultSnapshot> {
	const files = app.vault.getFiles();
	const snapshot: VaultSnapshot = {
		files: [],
		generatedAt: Date.now(),
		vaultName: app.vault.getName(),
	};

	for (let i = 0; i < files.length; i++) {
		const file = files[i];
		const ext = extname(file.path);
		const rec =
			ext === 'md' || ext === 'canvas'
				? await collectNote(app, file, ext)
				: collectAttachment(file, ext);
		snapshot.files.push(rec);
		if (i % CHUNK === CHUNK - 1) {
			onProgress?.(i + 1, files.length);
			await new Promise((r) => setTimeout(r, 0));
		}
	}
	return snapshot;
}

function collectAttachment(file: TFile, ext: string): FileRec {
	return {
		path: file.path,
		ext,
		size: file.stat.size,
		mtime: file.stat.mtime,
		ctime: file.stat.ctime,
		bodyLength: 0,
		headings: [],
		links: [],
		frontmatter: { present: false, valid: true, keys: [], duplicateKeys: [] },
		tags: [],
	};
}

async function collectNote(app: App, file: TFile, ext: string): Promise<FileRec> {
	const [content, cache] = await Promise.all([
		app.vault.cachedRead(file),
		Promise.resolve(app.metadataCache.getFileCache(file)),
	]);
	const links: LinkRef[] = [];

	const pushRef = (r: ReferenceCache, embed: boolean) => {
		const kind: LinkRef['kind'] = isWikiSyntax(r) ? 'wiki' : 'md';
		const { target, subpath } = splitTarget(r.link, kind);
		if (!target && !subpath) return; // empty [[]] link
		links.push({
			raw: kind === 'wiki' ? wikiRaw(r.original, r.link) : r.link,
			target,
			subpath,
			embed,
			kind,
			line: r.position.start.line,
			col: r.position.start.col,
		});
	};

	for (const l of cache?.links ?? []) pushRef(l, false);
	for (const e of cache?.embeds ?? []) pushRef(e, true);
	for (const l of (cache?.frontmatterLinks ?? []) as FmLink[]) {
		const { target, subpath } = splitTarget(l.link, 'wiki');
		if (!target) continue;
		links.push({
			raw: l.link,
			target,
			subpath,
			embed: false,
			kind: 'wiki',
			line: l.position.start.line,
			col: l.position.start.col,
		});
	}

	const fmTags = (
		cache as { frontmatter?: { tags?: unknown } | null } | null
	)?.frontmatter?.tags;
	const inlineTags = (cache?.tags ?? []).map((t) => t.tag);

	return {
		path: file.path,
		ext,
		size: file.stat.size,
		mtime: file.stat.mtime,
		ctime: file.stat.ctime,
		bodyLength: bodyLengthOf(content),
		headings: (cache?.headings ?? []).map((h) => h.heading),
		links,
		frontmatter: analyzeFrontmatter(content, parseYaml),
		tags: tagsFromCache(fmTags, inlineTags),
	};
}
