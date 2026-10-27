// Path + pattern helpers. Pure, no obsidian imports.

/** Normalize a vault path: forward slashes, no leading/trailing slash. */
export function normPath(p: string): string {
	return p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

export function dirname(p: string): string {
	const n = normPath(p);
	const i = n.lastIndexOf('/');
	return i === -1 ? '' : n.slice(0, i);
}

export function basename(p: string): string {
	const n = normPath(p);
	const i = n.lastIndexOf('/');
	return i === -1 ? n : n.slice(i + 1);
}

export function extname(p: string): string {
	const b = basename(p);
	const i = b.lastIndexOf('.');
	return i <= 0 ? '' : b.slice(i + 1).toLowerCase();
}

export function stripExt(p: string): string {
	const n = normPath(p);
	const i = n.lastIndexOf('.');
	const s = n.lastIndexOf('/');
	return i > s && i > 0 ? n.slice(0, i) : n;
}

export function joinPath(...parts: string[]): string {
	return parts.map(normPath).filter(Boolean).join('/');
}

/** Relative path from `fromDir` to `to`, in posix form. */
export function relativePath(fromDir: string, to: string): string {
	const from = fromDir ? fromDir.split('/') : [];
	const toParts = normPath(to).split('/');
	let i = 0;
	while (i < from.length && i < toParts.length - 1 && from[i] === toParts[i]) i++;
	const up = from.length - i;
	const down = toParts.slice(i).join('/');
	return up > 0 ? '../'.repeat(up) + down : down;
}

/**
 * Minimal glob compiler supporting `**`, `*`, `?` and a leading `!` for
 * negation. Patterns are matched against the full vault path.
 */
export function globToRegex(pattern: string): { rx: RegExp; negate: boolean } {
	let p = normPath(pattern);
	let negate = false;
	if (p.startsWith('!')) {
		negate = true;
		p = p.slice(1);
	}
	let re = '';
	for (let i = 0; i < p.length; i++) {
		const c = p[i];
		if (c === '*') {
			if (p[i + 1] === '*') {
				// ** — any number of path segments (or part of one)
				re += '.*';
				i++;
				if (p[i + 1] === '/') i++; // swallow the slash after **
			} else {
				re += '[^/]*';
			}
		} else if (c === '?') {
			re += '[^/]';
		} else if ('\\^$.|+()[]{}'.includes(c)) {
			re += '\\' + c;
		} else {
			re += c;
		}
	}
	// Vault paths are matched case-insensitively, like Obsidian's own resolution.
	return { rx: new RegExp('^' + re + '$', 'i'), negate };
}

export interface Matcher {
	matches(path: string): boolean;
}

/** Compile ignore glob patterns + regex strings into one matcher. */
export function buildMatcher(globs: string[], regexes: string[]): Matcher {
	const pos: RegExp[] = [];
	const neg: RegExp[] = [];
	for (const g of globs) {
		const { rx, negate } = globToRegex(g);
		(negate ? neg : pos).push(rx);
	}
	const rawRx: RegExp[] = [];
	for (const r of regexes) {
		try {
			rawRx.push(new RegExp(r, 'i'));
		} catch {
			// invalid user regex: ignore rather than break every scan
		}
	}
	return {
		matches(path: string): boolean {
			const p = normPath(path);
			if (rawRx.some((rx) => rx.test(p))) return true;
			if (neg.some((rx) => rx.test(p))) return false;
			return pos.some((rx) => rx.test(p));
		},
	};
}

/** Escaped for use in a RegExp body. */
export function escapeRe(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Decode a percent-encoded link component; keep the raw text on bad input. */
export function decodeLinkComponent(s: string): string {
	if (!/%[0-9a-fA-F]{2}/.test(s)) return s;
	try {
		return decodeURIComponent(s);
	} catch {
		return s;
	}
}

/**
 * Ancestor folders of `path` that do not exist yet, top-down, judged by the
 * `has` predicate. A root-level file (no folder part) returns [].
 */
export function missingParents(path: string, has: (folder: string) => boolean): string[] {
	const n = normPath(path);
	const i = n.lastIndexOf('/');
	if (i <= 0) return [];
	const out: string[] = [];
	let acc = '';
	for (const d of n.slice(0, i).split('/')) {
		if (!d) continue;
		acc = acc ? acc + '/' + d : d;
		if (!has(acc)) out.push(acc);
	}
	return out;
}

/**
 * Split an md-style link destination into decoded linkpath + subpath.
 * The '#' that starts a subpath is located BEFORE decoding, so a filename
 * containing a literal '#' (which md links must write as %23) is not
 * mistaken for a subpath marker.
 */
export function splitMdLink(dest: string): { target: string; subpath: string } {
	const i = dest.indexOf('#');
	return {
		target: decodeLinkComponent(i === -1 ? dest : dest.slice(0, i)),
		subpath: i === -1 ? '' : decodeLinkComponent(dest.slice(i)),
	};
}
