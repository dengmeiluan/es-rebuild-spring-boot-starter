# ESQueryStudio Chrome Extension

**Direct-to-Elasticsearch query workbench, no backend required.** Load it unpacked in
Chrome/Edge, connect to an ES 7.x/8.x cluster, and use the query surfaces that do
not need server-side orchestration.

## Install (unpacked)

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this `extensions/chrome` directory.
3. Pin **ESQueryStudio** and click the icon — the workbench opens in a tab.
4. Enter the cluster URL, choose auth, click **连接并检查**. The extension declares
   `http/https` host permission at install time; it only sends requests to the URL
   you enter. Chrome may show a broad-host warning for unpacked installs.

A packaged zip is attached to each GitHub Release.

## Two modes

- **Direct workbench** — the embedded single-page query/ops console in this folder; no backend needed.
- **Full console** — the *actual* 52-page ESQueryStudio UI loaded unmodified in an iframe from a
  running server (standalone `esquerystudio-server` or a host console entry). It preserves every
  page/interaction; point it at `http://<host>:5601/esquerystudio/index.html`. If the target sets
  `X-Frame-Options`/CSP, use **Open in new tab**.

## Included (direct mode)

| Surface | Direct ES call |
|---|---|
| DSL query | `POST /{index}/_search` |
| Lucene query | `query_string` via `_search` |
| ES-SQL | `POST /_sql?format=json` |
| PIT deep pagination | open PIT → `_search` + `search_after` → close PIT |
| Explain | `POST /{index}/_explain/{id}` |
| Profile | `profile: true` on the DSL request |
| REST console | Any `http(s)` ES API, including tasks, snapshots and settings |
| Reindex | Guided `POST /_reindex`, optional query/slices, async task polling via `_tasks/<id>` and cancel |
| Live monitor | `_cluster/health` + `_nodes/stats`, configurable 3/5/10/30 s interval and 60/120/240-point in-memory cap |
| History / favorites | `chrome.storage.local`, capped at 100 / 50 entries; saved connection profiles and per-mode drafts |
| Mapping assist | Field insert from live mapping, JSON syntax/field lint, condition summary; right-click selected text opens Lucene/DSL prefill |

## Full-console note

The full console is deliberately **not reimplemented** in the extension: the real Vue app is loaded
from a running server, so UI pages, interactions and backend-only features stay exactly as shipped.
The direct workbench covers the no-backend path; it does not pretend to be the full 52-page UI.

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
- `host_permissions` cover `http/https` so users can connect arbitrary clusters;
  this is a deliberate install-time trade-off for a direct-ES console.
- Requests use the extension's http/https host permission. Cluster CORS,
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
