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
