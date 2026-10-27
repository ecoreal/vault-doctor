# Changelog

## 1.0.1 — 2026-10-28

- Fixed: after "fix all", the automatic rescan could still report the pre-fix
  broken links, because Obsidian had not finished reindexing the modified
  files yet. The rescan now waits for the metadata cache to settle first
  (found during real-app verification on Obsidian 1.12.7).

## 1.0.0 — 2026-10-28

Initial release.

- Checks: broken links (wiki, markdown, embeds, heading links), orphan notes,
  stub/empty notes, oversized attachments, frontmatter lint (invalid YAML,
  duplicate keys, missing required keys), ambiguous duplicate basenames,
  unsafe file names.
- Dashboard view with severity chips, collapsible sections, jump-to-line.
- Did-you-mean suggestions (Levenshtein + same-folder preference) with
  one-click relink fixes and batch "fix all" for a section.
- Trash fix for empty notes.
- Markdown report export.
- Settings: ignore globs/regexes, thresholds, required frontmatter keys,
  per-check toggles, report path/length.
