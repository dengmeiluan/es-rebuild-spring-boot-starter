# ESQueryStudio Chrome Extension

**The native ESQueryStudio Vue console, with a browser transport.** Load it unpacked in
Chrome/Edge; the toolbar opens the full 52-page Vue console (the same `ui/` source as the
server), and the browser transport talks directly to Elasticsearch. A small direct tool page
is kept for debugging via the extension context menu.

## Install (unpacked)

1. Open `chrome://extensions` and enable **Developer mode** (top-right).
2. Choose **Load unpacked** and select the **folder that contains `manifest.json`** —
   in this repo that is `extensions/chrome`; if you downloaded the release zip, **extract
   it first** and select the extracted `esquerystudio-chrome-1.0.0` folder. Do **not**
   select the `.zip` file itself; Chrome cannot load a zip as an unpacked extension.
3. Pin **ESQueryStudio** and click the icon — the native Vue console opens in a tab.
4. In the browser connection layer, enter the ES URL/auth and connect. The extension declares
   `http/https` host permission at install time; it only sends requests to the URL you enter.
   Chrome may show a broad-host warning for unpacked installs.

### If install fails

| Symptom | Fix |
|---|---|
| `Manifest file is missing or unreadable` | You selected the parent folder or the zip. Select the folder that directly contains `manifest.json`. |
| `Cannot load extension with file or directory name _metadata` | Remove `__MACOSX` / `_metadata` from the extracted folder, then retry. |
| `This extension is not allowed` / policy block | Use a non-managed Chrome profile, or install in Chrome/Edge with Developer mode enabled; managed profiles can forbid unpacked extensions. |
| Button is greyed out | Enable **Developer mode** first. |
| Extension loads but icon is missing | Pin it from the puzzle menu; open `chrome://extensions` and check for load errors. |

Build the bundled Vue app from the same source:

```bash
cd ui
npm run build:extension
```

A packaged zip is attached to each GitHub Release.

## One Vue source, two transports

- **Native Vue console (browser build)** — `app/` is the same `ui/` Vue source built with
  `--mode browser`; `api.ts` swaps only its lowest transport to direct Elasticsearch. The
  toolbar opens the complete 52-page console with identical routes/components/styles. First
  open shows the native connection layer; credentials stay local.
- **Server mode** — the same `ui/` source is still served by the Spring Boot server through
  `/internal/es/index`. No second UI is maintained.
- **Direct tool page** — right-click the extension icon for the lightweight single-page
  debugging tools; it is intentionally not presented as the full console.

## Direct tool page surfaces

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
