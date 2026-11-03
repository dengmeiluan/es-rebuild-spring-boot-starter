# Changelog

All notable changes to ESQueryStudio are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [1.0.0] — 2026-11-05

First public release under the ESQueryStudio name. ESQueryStudio is the Elasticsearch
query workbench built for Spring Boot: six query modes share one live session,
and the same console carries index lifecycle, observability and host integration.

### Query workbench

- Six modes in one page: DSL builder, ES-SQL, Lucene, query sandbox, PIT deep
  pagination and SQL ⇄ DSL syntax bridge.
- Mapping-aware completion, value enums and lint: field types, `text`/`keyword`
  sub-fields, analyzers, date formats and sortability come from the live index.
- Tree ⇄ text two-way sync, including unknown-clause raw fallback and nested
  `bool` structures; no silent loss when one side cannot be structured.
- Cross-mode history, favorites, drafts and shareable base64 DSL deep links.
- Result surface with table / JSON / Tree / card views, histogram, `took` /
  `_shards` / `totalGte` honesty and CSV / Markdown / XLSX / NDJSON export.
- Relevance lab: score explain (BM25 factor tree), rank detective, query X-ray,
  clause hit matrix, boost tuner and Profile flame graph.

### Chrome extension

- MV3 front-end direct query workbench: DSL, Lucene, ES-SQL, PIT pagination,
  per-document explain, profile, CSV/JSON export and a live cluster monitor.
- Optional host permissions, service-worker network broker, local-only assets,
  local history/favorites caps and in-memory monitor samples (120 points).
- Backend-only features are documented as out of scope instead of silently faked.

### Platform

- Embeddable Spring Boot starter plus a standalone server: one capability set,
  three delivery modes (standalone jar, embedded module, host SPI).
- 52 pages in 13 groups, 11 feature packs with per-page exclusion. Feature packs
  are deployment choices; page-level read/write authorization remains separate.
- Page contract `META-INF/esquerystudio-pages.json` as the single source for frontend
  navigation, backend page gates and host menu registration.
- `ConsoleHostIntegration`, `ConsoleAuthDelegate`, `ConnStore` and
  `ConsoleAuditContributor` SPIs; no hosting business model is hard-coded.
- Index lifecycle: zero-downtime alias-flip rebuilds, cross-cluster migration,
  reindex estimation, snapshots / SLM / ILM and delete-resurrection compensation.

### Quality and security

- Full frontend source-literal and behavior suites, backend Maven suite,
  real-browser probes, permission matrix and contract negative controls.
- Async generation guards, function-body write gates, stale-result honesty and
  abort-vs-failure separation across query and ops surfaces.
- Reproducible release profile: fixed `project.build.outputTimestamp`,
  sources/javadoc/SBOM, SHA-256 parity and tag-driven GitHub Release.
- CodeQL, OpenSSF Scorecard, Dependency Review and Dependabot enabled.
