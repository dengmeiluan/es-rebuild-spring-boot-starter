# ESQueryStudio Chrome Extension

**Direct-to-Elasticsearch query workbench, no backend required.** Load it unpacked in
Chrome/Edge, connect to an ES 7.x/8.x cluster, and use the query surfaces that do
not need server-side orchestration.

## Install (unpacked)

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this `extensions/chrome` directory.
3. Pin **ESQueryStudio** and click the icon — the workbench opens in a tab.
4. Enter the cluster URL, choose auth, click **连接并检查**. Chrome asks for
   permission for that origin on first connect.

A packaged zip is attached to each GitHub Release.

## Included

| Surface | Direct ES call |
|---|---|
| DSL query | `POST /{index}/_search` |
| Lucene query | `query_string` via `_search` |
| ES-SQL | `POST /_sql?format=json` |
| PIT deep pagination | open PIT → `_search` + `search_after` → close PIT |
| Explain | `POST /{index}/_explain/{id}` |
| Profile | `profile: true` on the DSL request |
| REST console | Any `http(s)` ES API, including `POST /_reindex?wait_for_completion=false`, tasks, snapshots and settings |
| Live monitor | `_cluster/health` + `_nodes/stats` every 5 s |
| History / favorites | `chrome.storage.local`, capped at 100 / 50 entries |

## Server-side control plane (not duplicated)

- Accounts, roles, page-level permissions and server-enforced authorization
- Audit persistence, job stores (SQLite/JDBC), scheduled tasks and Watchers
- The full 52-page console, feature packs, host menu/SSO integration

The REST console deliberately exposes reindex, tasks, snapshots and settings
directly; the user owns the cluster credentials and accepts the risk. The
Spring Boot starter / standalone server remains the control plane for host
identity, audit and long-running job orchestration.

## Data and security

- Credentials stay on this machine in `chrome.storage.local` only when **记住凭据**
  is checked; otherwise they live in this page's memory.
- The service worker is a narrow broker: only `http`/`https`, allowlisted
  methods, 8 MB request cap, no remote code, no third-party telemetry.
- Requests are made with the granted optional host permission. Cluster CORS,
  TLS, gateway allowlists and network reachability still apply; ask the ES
  administrator to allow the extension origin if a gateway blocks it.
- Live-monitor samples are kept in memory only, capped at 120 points (~10 min),
  and are discarded on refresh. No silent persistence of monitoring history.

## Verification

```bash
node scripts/verify-extension.mjs
```

The guard checks the MV3 manifest, broker method/protocol allowlist, local-only
assets, required UI surfaces and absence of remote-code/telemetry references.
