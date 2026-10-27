# Vault Doctor

[![CI](https://github.com/ecoreal/vault-doctor/actions/workflows/ci.yml/badge.svg)](../../actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**Health checks for your Obsidian vault — with one-click fixes.**

Vault Doctor scans your vault the way a doctor would: it finds what's broken,
what's missing, and what's quietly rotting — then helps you fix it in one click.
No AI, no accounts, no network access; everything runs locally.

## What it checks

| Check | What you get |
| --- | --- |
| 🩺 **Broken links & embeds** | Wiki links `[[...]]`, markdown links, embeds and **heading links** (`[[note#section]]`) that don't resolve — including renamed/deleted targets |
| 🧭 **Did-you-mean suggestions** | Every broken link gets up to 3 ranked replacement candidates (edit-distance + same-folder preference) with a one-click **Apply fix** |
| 👻 **Orphan notes** | Notes no other note links to, and which link nowhere themselves |
| 📝 **Stub / empty notes** | Notes below a body-length threshold; truly empty ones can be trashed |
| 🧹 **Frontmatter lint** | Invalid YAML, duplicate top-level keys, missing required keys |
| 🏷️ **Ambiguous names** | Multiple notes sharing one basename — `[[name]]` links silently pick one |
| 🚫 **Unsafe file names** | Characters that break wiki links (`# ^ [ ] |`) or are invalid on Windows/sync targets |
| 📦 **Attachment inventory** | Files above your size threshold, plus a per-type size breakdown |

## Usage

1. Install (below) and enable the plugin.
2. Click the 🩺 ribbon icon, the status bar item, or run **Vault Doctor: Scan vault now**.
3. The dashboard opens with findings grouped by category. Click any row's file
   reference to jump to the exact line.
4. Fix things:
   - **Apply fix** — rewrites the broken link to the suggested target
     (preserves aliases and `#subpaths`, handles both wiki and markdown syntax).
   - **Fix all N links** — batch-fix every suggested relink in a section.
   - **Move to trash** — for empty notes (system trash, recoverable).
5. **Export report** writes a full markdown report into your vault
   (path configurable in settings) — great for vault audits and diffs over time.

### Commands

- `run-scan` — Scan vault now
- `export-report` — Export report as note

## Installation (from release)

1. Download `main.js`, `manifest.json` and `styles.css` from the latest release.
2. Put them in `<vault>/.obsidian/plugins/vault-doctor/`.
3. Enable **Vault Doctor** in Settings → Community plugins.

### Building from source

```bash
npm install
npm run build     # type-checks, bundles to main.js
npm test          # vitest unit suite
```

Copy `main.js`, `manifest.json`, `styles.css` into your vault's plugin folder,
or symlink it:

```bash
ln -s "$PWD" "<your-vault>/.obsidian/plugins/vault-doctor"
```

## Settings

- Ignore paths (globs and regexes) — skip templates, archives, journals…
- Stub threshold (body characters), oversized-attachment threshold (MB)
- Suggestion distance for did-you-mean fixes
- Required frontmatter keys (for vaults with metadata standards)
- Report file path and report length
- Toggle any check independently

## Design notes

- The analysis engine is a **pure function** over a vault snapshot
  (`src/engine.ts`) — fully unit-tested, no Obsidian dependencies.
- Link resolution mirrors Obsidian's own algorithm (root path → relative path →
  shortest basename match, case-insensitive).
- Fixes are **content-level rewrites** scoped to link syntax only: plain text,
  code blocks and display text are never touched.

## License

[MIT](LICENSE)
