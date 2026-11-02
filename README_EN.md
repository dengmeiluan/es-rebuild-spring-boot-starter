# 🧭 SearchDeck

> **The embeddable operations platform for Elasticsearch.** Zero-downtime index rebuilds,
> a query workbench, observability, data browsing, and host integration — one capability set,
> three delivery modes. 52 pages, **11 feature packs**: all on by default, trimmed by the host.
> First integration: **QuoteHub**, already running in production.

[![Release](https://img.shields.io/github/v/release/dengmeiluan/es-rebuild-spring-boot-starter?display_name=release)](https://github.com/dengmeiluan/es-rebuild-spring-boot-starter/releases)
[![CI](https://github.com/dengmeiluan/es-rebuild-spring-boot-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/dengmeiluan/es-rebuild-spring-boot-starter/actions/workflows/ci.yml)
[![Java](https://img.shields.io/badge/Java-8%2B-007396?logo=openjdk&logoColor=white)](https://openjdk.java.net)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-2.3.x-6DB33F?logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![Elasticsearch](https://img.shields.io/badge/Elasticsearch-7.6%2B-005571?logo=elasticsearch&logoColor=white)](https://www.elastic.co)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

![SearchDeck — Search operations, on deck.](docs/screenshots/searchdeck-banner.svg)

**[Quick start](#-five-minute-integration)** · [中文 README](README.md) · [Feature packs](#-feature-packs) · [QuoteHub integration](docs/integrations/quotehub.md) · [Design constitution](docs/design.md)

---

## 🛳️ What it is

SearchDeck is not a single-purpose index-rebuild tool. It is an **operations deck** that can be
embedded into any search-backed application:

- **Index lifecycle** — alias write-index flip + server-side `_reindex` for zero-downtime rebuilds;
  cross-cluster migration, reindex estimation, snapshots/SLM/ILM, and delete-resurrection compensation.
- **Query workbench** — DSL / ES-SQL / Lucene / sandbox / PIT pagination / syntax bridge,
  with request-body semantic completion, value enums, lint, and tree ⇄ text round-trip.
- **Observability and governance** — node KPIs, alerts, slow requests, top indices, task trees,
  topology, health reports, config drift, and permission surfaces.
- **Host integration** — authentication delegation, connection directory, page-contract menus,
  branding and feature-pack selection. QuoteHub is the first integration.

### What it is not

| It is | It is not |
|---|---|
| An Elasticsearch 7.x ops / query / governance workbench | A general-purpose BI or drag-and-drop dashboard builder |
| Deployable standalone or embeddable as a Spring Boot starter | Tied to a specific cloud or SaaS |
| A console whose product surface and auth can be owned by the host | A business system with built-in domain semantics |
| Page-level authorization (connection × page × read/write) | "Fake permissions" based on hidden menus |

---

## 🧩 Why SearchDeck

1. **One platform, two shapes** — Kibana-style `java -jar` standalone, or embedded into a host
   Spring Boot app sharing its auth and routing.
2. **A trimmable product surface** — 11 feature packs plus per-page exclusion. Deep links to a
   disabled module land on an explanatory "module not enabled" page, never a blank screen or 404.
3. **Host-first SPIs** — `ConsoleAuthDelegate`, `ConnStore`, `ConsoleAuditContributor`, and
   `ConsoleHostIntegration` have clear boundaries. The page contract is the single source of truth
   for frontend navigation, backend page gates, and host menu provisioning.

---

## 📦 Feature packs

All packs are enabled by default. A host lists only what it needs in
`searchdeck.console.features.packs`; `exclude-pages` hides individual pages on top of that.
Feature packs are **deployment choices, not permissions** — authorization remains the page-level
read/write keys in `grantedPages`.

| Pack | Pages | What you get |
|---|---:|---|
| `platform` | 5 | Overview, index workspace, workbench, live dashboard, favorites |
| `search` | 3 | Query workbench (DSL/SQL/Lucene/sandbox/PIT/bridge), search templates, data browser |
| `index` | 5 | Mapping + designer, hot settings, aliases, system indices |
| `quality` | 5 | Index templates, template gallery, config validator, config drift, optimizer |
| `data` | 3 | Bulk editor, Update By Query, document diff |
| `text` | 4 | Analyze, analyzer lab, synonyms, analysis panorama |
| `relevance` | 6 | Score explain, rank detective, boost tuner, match matrix, query X-ray, profile flame graph |
| `lifecycle` | 8 | Managed rebuild, cross-cluster migration, reindex advanced/estimate, snapshots, SLM, ILM |
| `observe` | 9 | Diagnostics, health report, topology, Watcher, tasks/task tree, cluster settings, plugins, remote clusters |
| `security` | 1 | Security center: accounts, permission surface, ops audit |
| `devtools` | 3 | REST passthrough, Dev Tools tabs, Painless sandbox |

> `META-INF/es-console-pages.json` is the single source of truth. Feature packs change exposure,
> never page keys.

**QuoteHub-trimmed console** (demo data) — host branding and only 2 groups / 6 pages:

![QuoteHub-trimmed navigation (demo data)](docs/screenshots/searchdeck-quotehub-nav.png)

**Explainable disabled-module page** (demo data) — deep links never end in a blank screen or 404:

![Disabled-module page (demo data)](docs/screenshots/searchdeck-module-off.png)

---

## 🖥️ Console gallery

**Live operations dashboard** — node KPIs, cluster trends, alerts and slow requests:

![Live dashboard](docs/screenshots/console-live.png)

**Index workspace** — index list + embedded document grid, filters/stats/snapshots/exports:

![Index workspace](docs/screenshots/console-indices.png)

**Data browser** — document CRUD with CSV/Markdown/XLSX export:

![Data browser](docs/screenshots/console-browser.png)

**Cluster overview** — health, storage, document distribution and monitoring history:

![Cluster overview](docs/screenshots/console-overview.png)

> Every screenshot is from the real console. There is no fabricated online demo.

### Ops console capabilities

- **Ad-hoc rebuilds** — wizard-driven zero-downtime rebuild: pick index → review settings/mapping → catch-up strategy → confirm preview → execute and monitor.
- **Index workspace** — index list + embedded document grid: filters/column stats/snapshots/exports/direct edits.
- **Query workbench** — DSL / ES-SQL / Lucene / sandbox / PIT pagination / syntax bridge, with completion and highlighting.
- **Data browser** — document CRUD, column stats, CSV/Markdown/XLSX export.
- **Cluster governance** — indices/aliases/mapping/ILM/snapshots/task tree/settings drift/health report.
- **Audit** — page-level authorization (connection × page × read/write) + host audit contribution.
- **Live monitoring** — node KPIs/alerts/slow requests/top indices, multi-cluster view.

---

## 🚀 Three delivery modes

### A. Standalone (Kibana-style)

```bash
java -jar searchdeck-standalone.jar
```

Ships its own web server (default port `5601`) and ES client stack. Open
`http://localhost:5601/searchdeck.html` and follow the setup wizard. The bootstrap profile lives
in `~/.es-console/` and survives restarts. (2.0 asset name; 1.x releases remain
`es-rebuild-standalone-*.jar` and are renamed in phase 2.)

### B. Embedded console module

Add `searchdeck-console` to a host Spring Boot app. Console assets and HTTP endpoints register automatically;
authentication can delegate to the host (shared login state via iframe). Ideal for integrated delivery.

### C. Host integration (QuoteHub first)

QuoteHub already runs the auth delegate, connection-center contributor, page-contract menu
provisioner, and host audit contributor in production. SearchDeck adds a **branding + feature-pack**
declaration:

```java
@Bean
public ConsoleHostIntegration searchDeckQuoteHubIntegration() {
    return new ConsoleHostIntegration() {
        public String id() { return "quotehub"; }
        public String displayName() { return "QuoteHub"; }
        public List<String> preferredPacks() {
            return Arrays.asList("platform", "search", "index", "data",
                    "lifecycle", "observe", "security", "devtools");
        }
    };
}
```

Full integration surface, QA-era audit retirement, and the acceptance checklist:
[docs/integrations/quotehub.md](docs/integrations/quotehub.md).

---

## ⚡ Five-minute integration

> **Coordinate migration**: the single-jar `es-rebuild-spring-boot-starter` is moving to the
> multi-module `searchdeck-*` 2.0 line: `searchdeck-platform` (kernel), `searchdeck-console`
> (embeddable console), `searchdeck-server` (standalone), `searchdeck-quotehub` (first host adapter).
> The 1.x coordinate remains available during the migration.

### 1. Dependency

```xml
<!-- SearchDeck 2.0: embeddable console (brings the platform kernel) -->
<dependency>
    <groupId>io.github.dengmeiluan</groupId>
    <artifactId>searchdeck-console</artifactId>
    <version>2.0.0</version>
</dependency>

<!-- 1.x compatibility coordinate (current published release) -->
<dependency>
    <groupId>io.github.dengmeiluan</groupId>
    <artifactId>es-rebuild-spring-boot-starter</artifactId>
    <version>1.0.76</version>
</dependency>
```

> **The ES stack is provided by the host.** The starter does not transitively ship ES clients.
> Declare `spring-boot-starter-data-elasticsearch` and `elasticsearch-rest-high-level-client`.
> `EsStackContractValidator` compares real type signatures at startup (not version numbers) and
> refuses to boot on a mismatch with two actionable remediation paths.

### 2. Entity and managed rebuild

```java
@Document(indexName = "bond_quote")
public class BondQuoteES {
    @Id
    private String id;

    @Field(type = FieldType.Keyword)
    private String bondCode;

    @Field(type = FieldType.Text, analyzer = "ik_max_word", searchAnalyzer = "ik_smart")
    private String shortName;
}
```

New fields are safely registered into existing indices at startup (mapping auto-register).
To change a field type, analyzer, or create a new physical index, use the managed rebuild:

```
new index (new mapping) → server-side _reindex backfill → atomic alias flip → observation window → old index retired
```

Reads and writes never stop. Deletes during the rebuild window are replayed after the backfill —
no ghost documents.

### 3. Platform configuration

```yaml
searchdeck:
  console:
    branding:
      product-name: SearchDeck
      tagline: Search operations, on deck.
      integration-id: quotehub
      integration-name: QuoteHub
    features:
      packs: [platform, search, index, lifecycle, observe, devtools]
      exclude-pages: []
es:
  rebuild:
    mode: console
    console:
      store: sqlite
```

The platform layer (`searchdeck.console.*`) describes the product surface; the engine layer
(`es.rebuild.*`) describes rebuild/migration/storage runtime parameters. They do not override
each other.

### 4. HTTP endpoints

Mapping reconciliation is exposed by `InternalEsIndexRebuildController` under `/internal/es/index/`:

| Endpoint | Purpose |
|---|---|
| `POST /internal/es/index/rebuild` | Trigger a zero-downtime rebuild |
| `GET /internal/es/index/keys` | Enumerate registered `ManagedEsIndex` keys |
| `GET /internal/es/index/desired-state.html` | Desired-state page: declare mapping expectations, execute after host confirmation |

### 5. Mapping reconciliation

At startup, `MappingReconcile` runs when `es.rebuild.mapping.auto-register=startup`: new fields are
added safely. Conflicts follow `es.rebuild.mapping.conflict-policy` (`fail` refuses to boot /
`warn` submits only conflict-free additions); conflict remediation returns `USE_ADHOC_REBUILD` for
the managed rebuild. See [integration docs](docs/integration/README.md).

---

## 🏗️ Architecture

```mermaid
flowchart LR
  Host["QuoteHub / host app"] -->|ConsoleHostIntegration| Platform

  subgraph Platform["SearchDeck Platform"]
    Packs["Feature pack registry"]
    UI["Console SPA<br/>52 pages / 11 packs"]
    Auth["Page authorization<br/>connection × page × r/w"]
    Conn["Connection directory and target routing"]
  end

  Platform --> Engine["Rebuild / migrate / mapping engine"]
  Platform --> Observability["Monitoring / diagnostics / audit"]
  Engine --> ES[("Elasticsearch 7.x")]
  Observability --> ES
```

**Layers**: platform kernel (branding/packs/host SPIs) → console modules (query/index/observability/security)
→ engine modules (rebuild/migration/mapping). Packs are declared in the contract; backend page gates
still enforce the complete contract.

---

## 🎛️ Interaction constitution

1. **Shortest path** — frequent actions within one click; rare actions in a ⋯ menu.
2. **Stable position** — an action stays at the same pixel across state transitions.
3. **State preservation** — filters, scroll, drafts, and focus survive paging/refresh/mode switches.
4. **One control, many actions** — mutually exclusive/pair actions become dual-state buttons,
   segmented controls, or dropdowns.
5. **Popover four elements** — surface + border + shadow + radius; Esc closes and returns focus.

Full rules: [docs/design.md](docs/design.md).

---

## ✅ Quality and verification

- **Frontend contract locks + real-browser chains** — contract derivation, DSL round-trip, table kernel,
  permission gates, and keyboard maps all have source/behavior assertions.
- **Backend full gate** — auth, page authorization, rebuild state machine, mapping reconciliation,
  cross-cluster migration, and storage tiers.
- **Real-browser verification** — mock ES + the real console, covering completion, lint, navigation
  trimming, disabled-module deep links, and permission matrices.
- **Negative controls** — invalid contracts, unknown packs, and empty page grants must fail first,
  then pass after the fix.

```bash
cd console && npm ci
npm run typecheck
npm test

./mvnw clean package
./mvnw test -Dconsole.build.skip=true
```

---

## 🗺️ Roadmap

- [x] **Phase 1 · platform identity** — SearchDeck branding, contract packs, runtime UI config,
  `ConsoleHostIntegration` SPI, QuoteHub integration docs, disabled-module page and shortcut trimming.
- [ ] **Phase 2 · coordinates and package structure** — Maven coordinates, Java packages, frontend
  directory/component naming; QuoteHub upgrade and three-account matrix regression.
- [ ] **Phase 3 · open-source launch** — GitHub repository rename, static entry/event/storage key
  migration, release assets and documentation site.

---

## 🛠️ Build from source

```bash
git clone https://github.com/dengmeiluan/es-rebuild-spring-boot-starter.git
cd es-rebuild-spring-boot-starter

cd console && npm ci && npm run build && cd ..
mvn clean package
```

Runnable example: [examples/demo-host](examples/demo-host/).

## Contributing

Issues and PRs are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/design.md](docs/design.md)
before starting. Prefer SPI extensions over hard-coded business fields in the starter.

## License

[Apache-2.0](LICENSE)
