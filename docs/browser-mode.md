# Browser mode (Chrome extension)

ESQueryStudio keeps one Vue console and switches only the lowest transport:

```text
ui/ (Vue 3, 52 pages)
  ├─ server mode  → /internal/es/index → Spring Boot console
  └─ browser mode → browserApi.ts       → Elasticsearch REST directly
```

The Chrome extension is the same `ui/` source built with `--mode browser`.
`npm run build:extension` emits `extensions/chrome/app/`; the toolbar opens the
full native Vue console, not a second hand-written UI.

## What runs locally

| Capability | Browser-mode implementation |
|---|---|
| Connection directory | Multiple local profiles in extension storage; top-bar switcher selects the data-plane target |
| Authentication | Elasticsearch-native Basic auth or API Key; credentials stay on this device |
| Query workbench | Direct ES REST for DSL, Lucene, ES-SQL, PIT, explain/profile, bulk and reindex |
| Monitoring | IndexedDB samples; an open console tab samples the current target, the service worker samples every saved profile |
| Operation audit | Local IndexedDB request ring, capped at 20k rows, shown in Security |
| Managed rebuild | Client-side `_reindex` + `_tasks` polling + atomic alias swap; jobs persist locally |
| Cross-cluster migration | Client `scroll` + `_bulk`; written data survives a closed tab, the job is marked `INTERRUPTED` for an explicit resume |
| Config validator | Client L1 lint + temp-index dry-run |
| Config drift | Local baseline captured on first check, compared with live mapping/settings |
| Settings impact / guarded apply | Local ES 7.10 DYNAMIC/STATIC/ILLEGAL classification + L1 gate + rebuild estimate; in-page confirmToken; real `PUT /{index}/_settings`; local `GUARDED_ACTION` receipt |
| Task progress | `_tasks/<taskId>` mapped to the server `ReindexProgress` shape |

## Honest limits

These are deliberate lossy equivalents, not silent fake successes:

- **Cross-instance locks** — the System page shows jobs running in this browser;
  two browsers do not coordinate a cluster-wide lock.
- **Code-provider mapping reconcile** — the startup reconcile needs server-side
  `@Mapping` sources; browser mode offers the local config-drift baseline instead.
- **Closed-tab sampling** — the service worker writes one cluster-level health row
  per saved profile per minute; node/top-index detail resumes when a console tab is open.
- **Client migration** — `scroll` + `_bulk` stops when the tab closes; written
  documents remain and the job must be resumed explicitly.
- **Audit scope** — the local audit ring is per browser profile and capped at
  20k rows; it is not a compliance-grade cross-instance ledger.

## Install and build

```bash
# build the same Vue source in browser mode
cd ui
npm ci
npm run build:extension
```

Load `extensions/chrome` (the folder containing `manifest.json`) in
`chrome://extensions` with Developer mode enabled. A packaged zip is attached to
each GitHub Release; extract it before loading.

First run shows only the browser connection dialog. It probes the endpoint and
credentials before saving; a wrong address or key stays in the dialog with the
real error. The server-mode `LoginOverlay`/`SetupWizard` are intentionally not
mounted in browser mode.

## Data and security

- Credentials are stored in this extension's `localStorage`, with a
  `chrome.storage.local` mirror used by the service worker; they are sent only to
  the Elasticsearch endpoint you configured.
- Monitoring, audit and job records stay in the extension origin's
  IndexedDB/localStorage. No third-party telemetry and no remote code.
- REST console and direct-ES actions run with the Elasticsearch credentials you
  grant. Use a least-privilege ES account and network controls appropriate to
  your threat model.

See [extensions/chrome/README.md](../extensions/chrome/README.md) for the
complete capability table, security notes and verification command.
