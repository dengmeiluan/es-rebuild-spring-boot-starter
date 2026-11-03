# Changelog

All notable changes to SearchDeck are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Community health and governance files: Code of Conduct, governance, support, NOTICE, citation,
  editorconfig, CODEOWNERS, and a documentation index with an architecture guide.
- Security and supply-chain automation: Dependabot, CodeQL, OpenSSF Scorecard, dependency review,
  and a tag-driven release workflow with version validation, checksums, SBOM, and provenance
  attestation.
- Maven `release` profile: attached sources/Javadoc jars, aggregate CycloneDX SBOM, enforcer rules,
  and a fixed `project.build.outputTimestamp` for reproducible archives.
- Local verification now includes Chrome/DBX launcher tests, DBX package verification, a
  documentation relative-link guard, and module-boundary/release-version tests.
- Community and package metadata: homepage/bugs/keywords for npm packages, Maven issue/CI metadata,
  CODEOWNERS, and release version alignment across POM, UI, launchers, and CITATION.
- Query workbench mode tabs now expose a right-click menu with mode deep-link copy, an optional
  default entry mode, cross-mode history, current env/role context, a copyable read/write permission
  summary, and keyboard ContextMenu/Shift+F10 access. After the identity probe settles, the menu
  header also shows a read/write badge (可写 / 只读 / 无查询读权).
- The current-index chip now has a right-click menu for copying the index name/deep link, copying
  a query permission summary (target/env/role/read/write plus the index), opening the index
  workspace, and clearing the local selection, with keyboard ContextMenu/Shift+F10 access from any
  chip button. The summary is shared with the mode menu through one access composable so both
  surfaces cannot drift.
- Field and value candidates in the query workbench (FieldPicker, builder FieldSelect,
  MultiFieldPicker, and LuceneInput) now support right-click and keyboard ContextMenu/Shift+F10:
  choose/expand the field, toggle the multi-field selection, fill the candidate, or copy its text,
  with the shared menu shell and no server-side writes.
- The keyboard shortcuts panel now documents the menu key / Shift+F10 entry (with ↑/↓ selection
  inside the menu) for query mode tabs, field/value candidates, index chips, and RT/QRT column
  headers.
- The architecture guide now documents the shared frontend interaction kernels
  (`CellContextMenu`, `useQueryAccess`, and the candidate pickers) so contributors extend them
  instead of forking per-view menus.
- The shared context menu now moves focus to its first item when opened, supports ↑/↓ cycling
  between actions, and restores focus to the trigger on close. This applies to every right-click
  surface using `CellContextMenu`, including the new query-workbench menus.
- Context menus now use a dedicated top z-index tier (`--z-ctx-top`) above picker islands and
  fullscreen surfaces, fixing menus opened from field candidates being covered by the candidate
  popup in the real browser.
- Boost Tuner field rows now support right-click and keyboard ContextMenu/Shift+F10 to copy the
  field name, toggle disable/enable, or remove the field; only the local tuning draft changes.
- Workspace config rows now support right-click and keyboard ContextMenu/Shift+F10 to show/hide a
  widget, change its column span, or move it up/down; the layout persists locally.
- The Security users table now merges a host `用户操作…` group into the QRT cell menu (copy
  username/role, delete). Delete stays behind `canWriteUsers` and the existing critical-confirm
  chain; QRT also opens the cell menu from a focused row via ContextMenu/Shift+F10.
- RT (index workspace result table) now opens its cell menu from a focused row via
  ContextMenu/Shift+F10; its window-level close guard now only reacts to Escape instead of any
  keydown, which previously closed the menu in the same keystroke.
- Config Drift object rows now support right-click and keyboard ContextMenu/Shift+F10 to run the
  drift check, copy the indexKey/alias, or copy a deep link; all actions stay read-only.
- Shared context menus now support full submenu keyboard navigation: →/Enter focuses the first
  child, ↑/↓ cycles children, and ←/Esc returns focus to the parent group before closing.
- Cluster switcher connection rows now support right-click and keyboard ContextMenu/Shift+F10:
  switch to the connection (same authorization and RED-cluster confirmation as click) or copy its
  name, ID, endpoint, and environment; all actions stay local/read-only.
- Overview index ranking, health distribution, and recent-job rows now support right-click and
  keyboard ContextMenu/Shift+F10 to open the index workspace/browser/job page or copy the
  name/status/deep link.
- Live dashboard node cards and active alerts now open the shared menu on right-click or
  ContextMenu/Shift+F10: open node diagnostics/alert destination or copy node/alert identifiers and
  thresholds.
- The shared alt-view result cards (DSL/IndexHub json/tree/cards) now support right-click and
  keyboard ContextMenu/Shift+F10 to open the document or copy its _id/document JSON/_source.
- DSL aggregation bucket rows now support right-click and keyboard ContextMenu/Shift+F10 to drill
  down/exclude a bucket or copy its key/count.
- Every custom list/card row menu (tasks, snapshots, aliases, index list, health checks, watcher,
  ILM/lifecycle/SLM policies, templates, remote clusters, favorites, topology shards, flame rows,
  config validation, diffs, optimizer suggestions, analysis components, DevTools tabs/response
  rows, REST response, hot settings, migration jobs) now also opens from the menu key or
  Shift+F10, with focusable rows and a shared `utils/menuKey.ts` anchor. The hotkey panel lists
  the new entry.
- `TemplatesView` menu-key entry was bound to `@keydown.menu`, which never matches the browser's
  `ContextMenu` key; it now uses the shared predicate and also accepts Shift+F10.

### Changed

- Contributor, PR, issue, security, and README entry points now link the community and
  architecture documentation.

### Fixed

- The audit observability test now drains its asynchronous tasks before returning, preventing a
  late WARN from leaking into the next test method and flaking CI.
- Right-clicking a connection row inside the cluster switcher now opens its context menu instead
  of closing the switcher popover first; the rows stop the mousedown bubble so the menu has a
  live anchor.

## [2.0.0] — 2026-11-02

### Added

- **Multi-module architecture**: `searchdeck-platform` (page contract, feature packs, branding,
  host SPI), `searchdeck-console` (engine + console + embedded UI), `searchdeck-server`
  (standalone deployment), and `@searchdeck/ui` (Vue 3 console source).
- **Feature packs**: 52 pages grouped into 13 navigation groups and 11 deploy-time packs, with
  per-page exclusion and a versioned page contract shared by navigation, backend gates, and host
  menu provisioning.
- **Host integration SPI**: `ConsoleHostIntegration`, `ConsoleAuthDelegate`, `ConnStore`, and
  `ConsoleAuditContributor` allow any Spring Boot host to own branding, authentication, connection
  directory, and audit without forking the console.
- **Standalone setup wizard**: first-boot credential guidance, control-cluster binding, and
  persistent bootstrap profiles under `~/.searchdeck/`.
- **Unified config prefix**: `searchdeck.elasticsearch.*` for engine runtime and
  `searchdeck.console.*` for the product surface.
- **Docs and examples**: bilingual README, integration guides, and a runnable demo host.

### Changed

- Renamed the project, repository, Maven coordinates, Java packages, SQLite defaults, runtime
  storage keys, and default credentials to the SearchDeck identity.
- Replaced the single static entry with `/searchdeck.html` → `/searchdeck/index.html`; removed
  legacy entry aliases and legacy page-contract fallbacks.
- Reworked the frontend build to emit assets under `static/searchdeck/` and purged stale generated
  JavaScript twins in favor of TypeScript sources.
- Consolidated rebuild, migration, mapping, observability, and security pages under one console
  with a shared table kernel, command palette, and keyboard model.

### Removed

- Single-jar starter packaging, host-specific integration module, legacy configuration alias
  bridge, legacy static entry pages, and duplicated page-contract resources.
