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
  summary, and keyboard ContextMenu/Shift+F10 access.
- The current-index chip now has a right-click menu for copying the index name/deep link, copying
  a query permission summary (target/env/role/read/write plus the index), opening the index
  workspace, and clearing the local selection. The summary is shared with the mode menu through
  one access composable so both surfaces cannot drift.
- Field and value candidates in the query workbench (FieldPicker, builder FieldSelect,
  MultiFieldPicker, and LuceneInput) now support right-click and keyboard ContextMenu/Shift+F10:
  choose/expand the field, toggle the multi-field selection, fill the candidate, or copy its text,
  with the shared menu shell and no server-side writes.
- The keyboard shortcuts panel now documents the menu key / Shift+F10 entry for query mode tabs,
  field/value candidates, and RT/QRT column headers.

### Changed

- Contributor, PR, issue, security, and README entry points now link the community and
  architecture documentation.

### Fixed

- The audit observability test now drains its asynchronous tasks before returning, preventing a
  late WARN from leaking into the next test method and flaking CI.

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
