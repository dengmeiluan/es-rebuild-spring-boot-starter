# es-rebuild-standalone

Standalone (Kibana-style) distribution of the ES rebuild ops console: one bootable jar that
carries its own web server and Elasticsearch client stack. No host application required.

## Build

The standalone module builds **after** the starter module and pins the same version:

```bash
# from the repository root
mvn -o clean install -DskipTests    # publish the starter jar to the local repository
cd standalone
mvn clean package                   # build the bootable fat jar
```

`StandalonePomContractTest` guards the version pairing (the starter dependency inside this
pom must equal the repository root version) and the executable-jar discipline (repackage is
never skipped — the mirror image of the library jar's `BOOT-INF=0` rule).

## Run

```bash
java -jar target/es-rebuild-standalone-1.0.2.jar
```

| What | Where |
|---|---|
| Console entry page | `http://localhost:5601/es-rebuild.html` |
| First-connect wizard | served automatically when no control cluster is bound (`/internal/es/index/setup/status` reports `bound:false`) |
| Control-cluster profile | `~/.es-console/es-rebuild-standalone/` (persists across restarts) |
| Default login | `admin` / `es-console` — active only while the user index is empty; it dies the moment you create a real user in the console |
| Port | `--server.port=...` (default `5601`) |

### First-boot order

1. Start the jar and open the console page — the Setup wizard asks for the control cluster
   (login is intentionally refused with `SETUP_REQUIRED` until then, so no credentials are
   needed to bind the first cluster).
2. Complete the wizard; the bootstrap profile is stored locally.
3. Log in with the default credentials and create your own user (any created user disables
   the fallback account).

> **Exposing the console beyond localhost?** Create a real user immediately (the fallback
> `admin` account only exists while the user index is empty), or front the jar with your own
> gateway auth. All starter keys apply (`es.rebuild.*`, see
> [docs/integration/configuration-reference.md](../docs/integration/configuration-reference.md)).

All starter configuration keys apply (`es.rebuild.*`, see
[docs/integration/configuration-reference.md](../docs/integration/configuration-reference.md)).
