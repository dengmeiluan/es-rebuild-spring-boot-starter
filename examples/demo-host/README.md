# demo-host — minimal embedded host

The runnable version of the quick start: one `@Document` entity, one
`@SpringBootApplication` class, and the full ops console (Setup wizard,
mapping auto-reconcile, adhoc rebuilds, live monitoring) — no other wiring.

## Run it

```bash
# 1. install the starter into your local repository (from the repository root)
mvn -o clean install -DskipTests

# 2. build & start the demo host
cd examples/demo-host
mvn spring-boot:run
```

Open `http://localhost:8081/es-rebuild.html`, complete the Setup wizard with
your Elasticsearch address, then:

- `Article` (`demo-article` index) is managed by mapping auto-register —
  add a `@Field` to the entity, restart, and watch the reconcile log add the
  field without downtime;
- the console exposes adhoc rebuild, data browser, query workbench and live
  monitoring against the connected cluster;
- jobs and the ops-audit trail persist in `~/.es-console/demo-host/jobs.db`
  (`store=sqlite`), so history survives restarts.

Default login is `admin` / `es-console` while the user index is empty —
create your own user before exposing the console beyond localhost.

## What to look at

| File | What it teaches |
|---|---|
| `src/main/java/.../Article.java` | declaring a managed entity (`@Document` + `@Field`) |
| `src/main/resources/application.yml` | the minimal host configuration (`mode=console`, auto-register, sqlite store) |
| `src/test/java/.../DemoHostSmokeTest.java` | proof the embedded console boots with zero wiring |
