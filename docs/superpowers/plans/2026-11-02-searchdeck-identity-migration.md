# SearchDeck Multi-Module Restructure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `*-spring-boot-starter` artifact and `es-rebuild` directory/package identity with a multi-module `searchdeck` repository: `platform` kernel, `console` app/engine, `server` standalone, `quotehub` first integration, and a `ui/` frontend.

**Architecture:** `platform` has no Elasticsearch dependency and owns the page contract, feature packs, branding, host SPI and `ManagedEsIndex`. `console` contains the engine and console implementation and depends on `platform`; `server` depends on `console`; `quotehub` depends on `platform`. The engine stays inside `console` for now because `auth ↔ multicluster ↔ xmigrate ↔ config` currently form cycles; the `engine/` package boundary is isolated for a later extraction.

**Tech Stack:** Java 8, Spring Boot 2.3.12, Maven wrapper, Vue 3 + TypeScript + Vitest, Spring Boot 2.7.18 host (QuoteHub).

**Spec:** `docs/superpowers/specs/2026-11-02-searchdeck-platform-design.md`

## Global Constraints

- No artifact, directory, package, or repository name may contain `es-rebuild` or `spring-boot-starter`.
- Page keys, routes, and endpoint paths stay unchanged; `/es-rebuild.html` and `es.rebuild.*` remain one-release aliases.
- Java 8 source level; no `List.of`, `var`, or text blocks.
- Keep LF storage; after scripted rewrites count CR/LF bytes per touched file.
- Do not bulk-stage or `git checkout` shared files; stage explicit paths.
- Frontend `.ts` is the source of truth; `.js` twins are frozen snapshots. Update both when a token appears in both.
- Full gates: `ui` typecheck + parallel tests, root Maven tests, QuoteHub compile, real-browser smoke.

---

## Target Layout

```
pom.xml                         aggregator/parent, packaging=pom, version=2.0.0
platform/                       searchdeck-platform
  src/main/java/io/github/dengmeiluan/searchdeck/platform/...
  src/main/resources/META-INF/searchdeck-pages.json
modules/console/                searchdeck-console (engine + console + UI assets)
  src/main/java/io/github/dengmeiluan/searchdeck/console/...
  src/main/resources/static/searchdeck/
apps/server/                    searchdeck-server
integrations/quotehub/          searchdeck-quotehub
ui/                             @searchdeck/ui frontend
examples/demo-host/
```

---

### Task 1: Create the multi-module skeleton

**Files:**
- Create: `platform/pom.xml`, `modules/console/pom.xml`, `apps/server/pom.xml`, `integrations/quotehub/pom.xml`
- Modify: root `pom.xml` → aggregator/parent (`packaging=pom`, `<modules>`), version `2.0.0`
- Move: `src/` → `modules/console/src/`; `standalone/src` → `apps/server/src`; `standalone/pom.xml` → `apps/server/pom.xml`

**Interfaces:**
- Produces Maven modules `searchdeck-platform`, `searchdeck-console`, `searchdeck-server`, `searchdeck-quotehub`.

- [ ] **Step 1: Write the parent POM**

Use `spring-boot-starter-parent:2.3.12.RELEASE`, groupId `io.github.dengmeiluan`, version `2.0.0`, packaging `pom`, modules `platform`, `modules/console`, `apps/server`, `integrations/quotehub`. Move dependency versions to `dependencyManagement`; keep the `npm-windows`/`npm-unix` profiles in the parent. Move the console build plugins (exec-maven-plugin, antrun) into `modules/console/pom.xml`.

- [ ] **Step 2: Write `platform/pom.xml`**

Dependencies: `spring-boot-starter` (Jackson), `spring-boot-configuration-processor` optional, `javax.servlet-api` provided if auth SPI moves, JUnit test. No Elasticsearch dependencies.

- [ ] **Step 3: Write console/server/quotehub POMs**

- `modules/console`: depends on `searchdeck-platform`, provided ES stack, web/AOP, sqlite optional, test deps; artifact `searchdeck-console`.
- `apps/server`: depends on `searchdeck-console`; enables `spring-boot-maven-plugin` repackage; artifact `searchdeck-server`.
- `integrations/quotehub`: depends on `searchdeck-platform`; artifact `searchdeck-quotehub`.

- [ ] **Step 4: Move sources**

```bash
mkdir -p modules/console
git mv src modules/console/src
mkdir -p apps/server
git mv standalone/src apps/server/src
git mv standalone/pom.xml apps/server/pom.xml
rmdir standalone 2>/dev/null || true
```

- [ ] **Step 5: Build all modules**

```bash
./mvnw -q -o -DskipTests -Dconsole.build.skip=true compile
```

Expected: reactor builds `searchdeck-platform`, `searchdeck-console`, `searchdeck-server`, `searchdeck-quotehub`.

- [ ] **Step 6: Commit**

```bash
git add pom.xml platform modules apps integrations
git commit -m "refactor: create SearchDeck multi-module layout"
```

---

### Task 2: Move the kernel into `searchdeck-platform`

**Files:**
- Move from console package `io.github.dengmeiluan.es.rebuild` (still old at this point): `auth/ConsolePageCatalog.java`, `platform/ConsoleHostIntegration.java`, `platform/PlatformUiProperties.java`, `platform/ConsoleUiConfigService.java`, `spi/ManagedEsIndex.java`
- Target: `platform/src/main/java/io/github/dengmeiluan/searchdeck/platform/{pages,branding,integration,spi}/...`
- Move tests for these classes to `platform/src/test/java/...`
- Modify: imports in console, `spring.factories`, `ConsolePageCatalog.RESOURCE`

**Interfaces:**
- Produces: `io.github.dengmeiluan.searchdeck.platform.pages.ConsolePageCatalog`, `...integration.ConsoleHostIntegration`, `...branding.PlatformUiProperties`, `...spi.ManagedEsIndex`.

- [ ] **Step 1: Copy the contract resource**

```bash
mkdir -p platform/src/main/resources/META-INF
cp modules/console/src/main/resources/META-INF/es-console-pages.json \
   platform/src/main/resources/META-INF/searchdeck-pages.json
```

Set `ConsolePageCatalog.RESOURCE = "META-INF/searchdeck-pages.json"`, `LEGACY_RESOURCE = "META-INF/es-console-pages.json"`, with a fallback load.

- [ ] **Step 2: Move classes and tests**

```bash
mkdir -p platform/src/main/java/io/github/dengmeiluan/searchdeck/platform/{pages,branding,integration,spi}
git mv modules/console/src/main/java/io/github/dengmeiluan/es/rebuild/auth/ConsolePageCatalog.java \
  platform/src/main/java/io/github/dengmeiluan/searchdeck/platform/pages/
git mv modules/console/src/main/java/io/github/dengmeiluan/es/rebuild/platform/*.java \
  platform/src/main/java/io/github/dengmeiluan/searchdeck/platform/{branding,integration}/
git mv modules/console/src/main/java/io/github/dengmeiluan/es/rebuild/spi/ManagedEsIndex.java \
  platform/src/main/java/io/github/dengmeiluan/searchdeck/platform/spi/
```

Split `ConsoleHostIntegration`/`PlatformUiProperties`/`ConsoleUiConfigService` into `integration`/`branding` as appropriate. Move the matching tests.

- [ ] **Step 3: Update references**

```bash
git grep -l "io.github.dengmeiluan.es.rebuild.auth.ConsolePageCatalog\|...platform.ConsoleHostIntegration\|...spi.ManagedEsIndex" -- modules platform apps integrations | xargs perl -pi -e '...'
```

Use exact import rewrites; do not touch `es.rebuild.*` property strings in this task.

- [ ] **Step 4: Build and test the platform + console**

```bash
./mvnw -q -o -Dconsole.build.skip=true -pl platform,modules/console -am test
```

- [ ] **Step 5: Commit**

```bash
git add platform modules/console
git commit -m "refactor: extract searchdeck platform kernel"
```

---

### Task 3: Rename the console base package

**Files:** `modules/console/src/main/java`, `modules/console/src/test/java`, `apps/server`, `examples/demo-host`
**Interfaces:** base package `io.github.dengmeiluan.searchdeck.console`.

- [ ] **Step 1: Move the tree**

```bash
git mv modules/console/src/main/java/io/github/dengmeiluan/es/rebuild \
       modules/console/src/main/java/io/github/dengmeiluan/searchdeck/console
git mv modules/console/src/test/java/io/github/dengmeiluan/es/rebuild \
       modules/console/src/test/java/io/github/dengmeiluan/searchdeck/console
```

- [ ] **Step 2: Rewrite package strings**

```bash
git grep -l "io.github.dengmeiluan.es.rebuild" -- modules apps examples | \
  xargs perl -pi -e 's/io\\.github\\.dengmeiluan\\.es\\.rebuild/io.github.dengmeiluan.searchdeck.console/g'
```

Update `spring.factories` FQCNs to the console auto-config classes and platform classes. Update FQCN/source-path literals in tests (3 `Class.forName`, 2 base-package scans, 7 source paths) and `examples/demo-host` imports.

- [ ] **Step 3: Compile and run the full backend**

```bash
./mvnw -q -o -DskipTests -Dconsole.build.skip=true compile
./mvnw -o -Dconsole.build.skip=true test
```

- [ ] **Step 4: Commit**

```bash
git add modules apps examples
git commit -m "refactor: rename console package to io.github.dengmeiluan.searchdeck.console"
```

---

### Task 4: Move the frontend to `ui/`

**Files:**
- Move: `console/` → `ui/` (filesystem `mv`, preserving node_modules)
- Rename: `ui/package.json` name to `@searchdeck/ui`
- Modify: `ui/vite.config.ts`, `ui/vitest.config.ts`, contract imports, `ui/scripts/perm-scan.mjs`, `modules/console/pom.xml` exec working directory, `scripts/verify.mjs`
- Resource: `modules/console/src/main/resources/static/searchdeck/` outDir; keep `static/console` as alias

**Interfaces:** frontend tests run from `ui/`; Vite alias `@contract` points to `platform/src/main/resources/META-INF/searchdeck-pages.json`.

- [ ] **Step 1: Move the directory and set the alias**

```bash
mv console ui
```

In `ui/vite.config.ts` and `ui/vitest.config.ts`:

```ts
resolve: {
  alias: {
    '@': '/src',
    '@contract': new URL('../platform/src/main/resources/META-INF/searchdeck-pages.json', import.meta.url).pathname,
  },
}
```

Set `build.outDir = '../modules/console/src/main/resources/static/searchdeck'` and `server.fs.allow` to include the repo root. Update the `starterVersion()` artifactId anchor to `searchdeck-console`.

- [ ] **Step 2: Rewrite contract imports and paths**

Replace every `META-INF/es-console-pages.json` import with `@contract`; update the 8 spec imports and `ui/scripts/perm-scan.mjs` path. Update the Maven exec plugin `workingDirectory` to `ui` and the antrun require/purge paths to `static/searchdeck`.

- [ ] **Step 3: Update docs/build scripts**

Update `README.md`, `README_EN.md`, `scripts/verify.mjs`, `CONTRIBUTING.md` commands from `console/` to `ui/`, and artifact names to `searchdeck-*`.

- [ ] **Step 4: Run frontend gates**

```bash
cd ui && npx vue-tsc --noEmit && node scripts/test-parallel.mjs
```

- [ ] **Step 5: Commit**

```bash
git add ui modules/console scripts README.md README_EN.md CONTRIBUTING.md
git commit -m "refactor: move frontend to ui and searchdeck static entry"
```

---

### Task 5: QuoteHub first integration

**Files:** `D:\idea_project\quotehub`:
- `backend/pom.xml` → `searchdeck-console:2.0.0`
- 10 main/test Java files: imports `io.github.dengmeiluan.searchdeck.console.*`
- `frontend/vite.config.ts`: add `/quotehub/searchdeck.html`
- `.env`: keep `ES_REBUILD_CONSOLE_CONN_SYNC_ENABLED` working

- [ ] **Step 1: Bump and rewrite imports**

```bash
cd /d/idea_project/quotehub
perl -pi -e 's/io\\.github\\.dengmeiluan\\.es\\.rebuild/io.github.dengmeiluan.searchdeck.console/g' \
  backend/src/main/java/com/quotehub/admin/**/*.java backend/src/test/java/com/quotehub/admin/**/*.java
```

Do not rewrite `es.rebuild.console.*` `@Value` keys; the bridge keeps them valid.

- [ ] **Step 2: Compile and run host contract tests**

```bash
cd backend
mvn -q -DskipTests compile
mvn -q -Dtest=EsConsoleAuthDelegateTest,EsConsoleAuditContributorTest,ConnectionCenterEsConnContributorTest,LinkMenuProvisionerTest,LinkMenuProvisionerSyncEventTest,EsConsoleConnSyncWiringTest test
```

- [ ] **Step 3: Commit in QuoteHub**

```bash
git add backend/pom.xml backend/src frontend/vite.config.ts
git commit -m "feat: upgrade SearchDeck 2.0 multi-module coordinates"
```

---

### Task 6: Final verification and cleanup

- [ ] **Step 1:** Update `docs/integrations/quotehub.md` (artifact `searchdeck-console`, config prefix bridge, new entries).
- [ ] **Step 2:** Add the `searchdeck.elasticsearch.*` → `es.rebuild.*` alias post-processor from the previous plan if not already present.
- [ ] **Step 3:** Run:
```bash
cd ui && npx vue-tsc --noEmit && node scripts/test-parallel.mjs
cd .. && ./mvnw -o test
cd /d/idea_project/quotehub/backend && mvn -q -DskipTests compile
```
- [ ] **Step 4:** Real-browser smoke: mock stack + `#/overview`, pack trim, `/searchdeck.html`, `/module-off`, QuoteHub branding.
- [ ] **Step 5:** Report remaining Phase 3 items: GitHub repository rename, `static/console` → `static/searchdeck` alias removal, event/storage key migration, engine artifact extraction after cycle-breaking.

---

## Self-Review

- Spec coverage: multi-module layout (Task 1), platform kernel (Task 2), package identity (Task 3), `ui/` directory + static entry (Task 4), QuoteHub first integration (Task 5), docs/gates (Task 6).
- No placeholders: commands and target paths are concrete.
- Deliberate deferral: a separate `searchdeck-engine` artifact. The current package graph has cycles (`auth ↔ multicluster ↔ xmigrate ↔ config`); extracting it first would be a fake module. The `engine/` package boundary inside console is the prerequisite.
