// Domain types shared by the pure analysis engine and the obsidian adapter.
// Nothing in this file (or engine/suggest/fixes/report) may import 'obsidian'.

export type LinkKind = 'wiki' | 'md';

export interface LinkRef {
	/** Inner text as written, e.g. "Note#Head" for [[Note#Head|alias]] */
	raw: string;
	/** Linkpath only (subpath and display removed), percent-decoded for md links */
	target: string;
	/** "#heading" or "#^block-id" if present */
	subpath?: string;
	/** Display/alias text if present */
	display?: string;
	embed: boolean;
	kind: LinkKind;
	/** 0-based line number */
	line: number;
	col?: number;
}

export interface FmInfo {
	present: boolean;
	valid: boolean;
	/** YAML parser error message when valid === false */
	error?: string;
	keys: string[];
	/** Top-level keys that appear more than once */
	duplicateKeys: string[];
}

export interface FileRec {
	/** Vault-relative path with forward slashes */
	path: string;
	ext: string;
	/** Size in bytes */
	size: number;
	mtime: number;
	ctime: number;
	/** Body length in characters, frontmatter excluded */
	bodyLength: number;
	/** Heading texts (md files only) */
	headings: string[];
	links: LinkRef[];
	frontmatter: FmInfo;
	/** Frontmatter tags + inline #tags */
	tags: string[];
}

export interface VaultSnapshot {
	files: FileRec[];
	generatedAt: number;
	vaultName?: string;
}

export type Category =
	| 'broken-link'
	| 'orphan'
	| 'stub'
	| 'oversize'
	| 'frontmatter'
	| 'duplicate'
	| 'unsafe-name';

export type Severity = 'error' | 'warning' | 'info';

export interface FixRelink {
	kind: 'relink';
	file: string;
	from: string;
	to: string;
}

export interface FixTrash {
	kind: 'trash';
	file: string;
}

export type FixOp = FixRelink | FixTrash;

export interface LinkSuggestion {
	/** Replacement linkpath to use */
	target: string;
	/** 0 = exact, higher = worse */
	distance: number;
	alternatives: string[];
}

export interface Finding {
	/** Deterministic id: category + file + ordinal */
	id: string;
	category: Category;
	severity: Severity;
	/** Primary file this finding is about */
	file: string;
	message: string;
	detail?: string;
	/** Set for link-related findings */
	link?: {
		raw: string;
		target: string;
		subpath?: string;
		line: number;
		embed: boolean;
		/** Link syntax as written — needed to rewrite it correctly */
		kind: 'wiki' | 'md';
	};
	suggestion?: LinkSuggestion;
	fix?: FixOp;
}

export interface EngineOptions {
	/** Body (frontmatter excluded) shorter than this many chars counts as a stub */
	stubThresholdChars: number;
	/** Non-note files larger than this many MB are flagged */
	oversizeThresholdMB: number;
	/** Glob patterns, e.g. ["Templates/**", "Archive/**"] */
	ignoreGlobs: string[];
	/** Extra raw regex patterns matched against paths */
	ignoreRegexes: string[];
	/** Frontmatter keys every frontmatter-bearing note must have */
	requireFrontmatterKeys: string[];
	checkOrphans: boolean;
	checkDuplicates: boolean;
	checkUnsafeNames: boolean;
	checkHeadingLinks: boolean;
	/** Flag nearly-empty notes below stubThresholdChars */
	checkStubs: boolean;
	/** Flag non-note files above oversizeThresholdMB */
	checkOversize: boolean;
	treatTaggedAsLinked: boolean;
	/** Max Levenshtein distance for auto-suggestions */
	maxSuggestDistance: number;
}

export const DEFAULT_OPTIONS: EngineOptions = {
	stubThresholdChars: 80,
	oversizeThresholdMB: 10,
	ignoreGlobs: [],
	ignoreRegexes: [],
	requireFrontmatterKeys: [],
	checkOrphans: true,
	checkDuplicates: true,
	checkUnsafeNames: true,
	checkHeadingLinks: true,
	checkStubs: true,
	checkOversize: true,
	treatTaggedAsLinked: true,
	maxSuggestDistance: 3,
};

export const CATEGORY_LABEL: Record<Category, string> = {
	'broken-link': 'Broken links & embeds',
	'orphan': 'Orphan notes',
	'stub': 'Stub / empty notes',
	'oversize': 'Oversized attachments',
	'frontmatter': 'Frontmatter issues',
	'duplicate': 'Ambiguous duplicate names',
	'unsafe-name': 'Unsafe file names',
};

export const CATEGORY_ORDER: Category[] = [
	'broken-link', 'frontmatter', 'unsafe-name', 'orphan', 'stub', 'duplicate', 'oversize',
];

export interface VaultStats {
	notes: number;
	attachments: number;
	totalSize: number;
	links: number;
	resolvedLinks: number;
	brokenLinks: number;
	orphans: number;
	stubs: number;
	/** extension → {count, bytes} for non-note files */
	attachmentExt: Record<string, { count: number; bytes: number }>;
	/** biggest files, descending */
	biggest: { path: string; size: number }[];
}

export interface ScanResult {
	findings: Finding[];
	stats: VaultStats;
}
