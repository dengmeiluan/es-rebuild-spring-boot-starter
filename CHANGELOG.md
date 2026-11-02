# Changelog

All notable changes to SearchDeck are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project uses
[Semantic Versioning](https://semver.org/).

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
