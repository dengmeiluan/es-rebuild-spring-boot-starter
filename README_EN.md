# es-rebuild-spring-boot-starter

> **Zero-downtime Elasticsearch index rebuild** for Spring Boot: alias-based write-index flip
> + server-side `_reindex`, with job tracking, delete-resurrection compensation, and a
> batteries-included ops console. Implement one interface (`ManagedEsIndex`) and you are done.

[![Release](https://img.shields.io/github/v/release/dengmeiluan/es-rebuild-spring-boot-starter)](https://github.com/dengmeiluan/es-rebuild-spring-boot-starter/releases)
[![CI](https://github.com/dengmeiluan/es-rebuild-spring-boot-starter/actions/workflows/ci.yml/badge.svg)](https://github.com/dengmeiluan/es-rebuild-spring-boot-starter/actions/workflows/ci.yml)
[![Java](https://img.shields.io/badge/Java-8+-007396?logo=openjdk&logoColor=white)](https://openjdk.java.net)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-2.3.x-6DB33F?logo=springboot&logoColor=white)](https://spring.io/projects/spring-boot)
[![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)

[中文 README](README.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## The problem it solves

Elasticsearch mappings are **immutable in place** — changing one field's type traditionally
means downtime, re-export, and traffic switching. This starter turns the whole procedure into
one dependency:

```
create new index → server-side _reindex backfill → atomic alias write-index flip
→ observation window → retire old index
```

Reads and writes never stop: writes always go through the alias (served by the write-index
flip), queries ride the alias across both indices during the transition, deletes that happen
inside the rebuild window are **compensated after backfill** (delete-resurrection), and job
state is persisted, resumable and auditable.

## Features

- **Zero-downtime rebuild** — atomic alias flip + server-side `_reindex`, dual-index
  observation window, safe old-index retirement
- **Delete-resurrection compensation** — documents deleted during the rebuild window are
  deleted again after backfill; no ghost data
- **Job tracking** — persisted state machine (JDBC store), restart-safe, auditable
- **Ops console out of the box** — 60+ page ES ops console (rebuild wizard / data browser /
  query workbench / cluster governance / audit / live monitoring) shipped inside the jar,
  zero frontend build for the host app
- **Multi-cluster** — connection catalog + SPI hosting
- **ES stack contract validation** — startup-time type-signature comparison (not version
  numbers); mismatches refuse to start with actionable remediation text
- **Compat layer** — 7.x total-hits / bulk-NDJSON shape differences handled

## Quick start

### 1. Add the dependency

```xml
<dependency>
    <groupId>io.github.dengmeiluan</groupId>
    <artifactId>es-rebuild-spring-boot-starter</artifactId>
    <version>1.0.0</version>
</dependency>
```

> ### ⚠ ES stack is `provided` — bring your own
>
> The starter does **not** transitively ship the ES stack. Declare both of these in your pom:
>
> ```xml
> <dependency>
>     <groupId>org.springframework.boot</groupId>
>     <artifactId>spring-boot-starter-data-elasticsearch</artifactId>
> </dependency>
> <dependency>
>     <groupId>org.elasticsearch.client</groupId>
>     <artifactId>elasticsearch-rest-high-level-client</artifactId>
> </dependency>
> ```
>
> Why: hosts almost always carry their own ES stack. If the starter also declared one with
> `compile`, Maven's nearest-wins resolution would silently pick one version — mismatches
> explode at runtime, typically **after** the target index has been created, leaving a
> half-copy. See [docs/es-stack-contract.md](docs/es-stack-contract.md) for the full FAQ.

### 2. Implement ManagedEsIndex

```java
@Component
public class OrderIndex implements ManagedEsIndex {
    @Override public String alias()      { return "orders"; }
    @Override public String writeIndex() { return "orders-v2"; }
    @Override public Settings settings() { return Settings.builder()
        .put("index.number_of_shards", 3).build(); }
    @Override public XContentBuilder mapping() throws IOException { /* your new mapping */ }
}
```

### 3. Trigger a rebuild

```http
POST /internal/es/index/rebuild
```

…or open the built-in console: `http://localhost:8080/es-rebuild.html`

### 4. Configuration

```yaml
es:
  rebuild:
    mode: console          # rebuild-only | console
    adhoc:
      store: jdbc          # persist job state (in-memory by default)
```

All properties ship with IDE metadata (`spring-boot-configuration-processor`).

## HTTP endpoints & mapping auto-reconcile

Endpoints live under the `/internal/es/index/` path prefix, served by
`InternalEsIndexRebuildController`:

| Endpoint | Purpose |
|---|---|
| `POST /internal/es/index/rebuild` | trigger a zero-downtime rebuild |
| `GET /internal/es/index/keys` | list registered `ManagedEsIndex` keys |
| `GET /internal/es/index/desired-state.html` | desired-state page: declare the mapping you want, review, execute |

Startup mapping auto-reconcile (`MappingReconcile`, enabled via
`es.rebuild.mapping.auto-register`) adds new fields automatically; conflicts are handled per
`es.rebuild.mapping.conflict-policy` (`fail` = refuse to start, `warn` = merge conflict-free
additions only) with `USE_ADHOC_REBUILD` as the remediation pointer.
See the [integration docs](docs/integration/README.md).

## Build from source

```bash
git clone https://github.com/dengmeiluan/es-rebuild-spring-boot-starter.git
cd es-rebuild-spring-boot-starter
cd console && npm ci && npm run build && cd ..   # Node 18+
mvn clean package                                 # JDK 8+
```

Test suites:

```bash
mvn clean test -Dconsole.build.skip=true   # backend (~990 cases; console output must exist)
cd console && npm test                     # frontend (~8200 cases)
```

## Compatibility

| Dependency | Version | Notes |
|---|---|---|
| Java | 8+ | |
| Spring Boot | 2.3.x baseline | ES stack provided; declare your own matching pair |
| Elasticsearch | 7.6+ server | `compat` layer covers 7.x shape differences |

## License

[Apache-2.0](LICENSE)
