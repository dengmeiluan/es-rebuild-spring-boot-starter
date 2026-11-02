# SearchDeck for DBX

A frontend-only DBX plugin (host API 1) that adds a **SearchDeck workbench**. DBX plugin UIs run
inside an isolated iframe: they have no direct network access, no Tauri access, and no arbitrary
remote frames. This plugin therefore works as a launcher — it remembers the SearchDeck console URL
and hands the console to your browser, where SearchDeck's login and ES credentials stay.

## Build and test

```bash
npm test                 # manifest, sandbox, asset and URL-parity tests
python scripts/package.py
python scripts/verify_package.py
```

The package is written to `dist/io.github.dengmeiluan.searchdeck-<version>-universal.dbxp`.

## Install locally

1. In DBX, open **Plugin Center** and enable **Allow unsigned development package**.
2. Install the generated `.dbxp`.
3. Open the **SearchDeck** workbench, save your console URL, then copy/open it in your browser.

The package is unsigned. Official distribution requires signing through the DBX Marketplace
review flow; see the DBX plugin development documentation for signing and repository metadata.

## Why a launcher instead of an embedded console

DBX's plugin sandbox is deliberately narrow:

- the UI iframe is loaded with `sandbox="allow-scripts"` and a restrictive CSP;
- arbitrary network access is denied; `host.network:https://<origin>` can add up to eight fixed
  HTTPS origins to `connect-src`, but a user-configurable SearchDeck URL cannot be declared there;
- embedding an arbitrary remote page is not part of the host contract.

A full in-DBX console would therefore need one of:

1. **Sidecar-backed panels** — a native DBX sidecar proxies SearchDeck APIs and the plugin renders a
   compact read-only/dashboard UI. This keeps the sandbox intact and is the recommended path.
2. **Host support for framed consoles** — DBX would need a first-class, reviewable frame/webview
   contribution with origin allowlisting.
3. **A compact native workbench** — reimplement a small subset (health, indices, saved queries) on
   top of `host.network` with a build-time fixed SearchDeck origin.

The launcher ships first because it is safe, useful, and does not weaken DBX's security boundary.

## Files

```text
extensions/dbx/
├── manifest.json          DBX Manifest v1
├── assets/plugin.svg      Plugin icon
├── ui/                    Sandboxed workbench (vanilla JS, no build step)
├── scripts/package.py     Deterministic .dbxp zip (manifest at root)
├── scripts/verify_package.py
└── test/                  Manifest, sandbox, asset and URL-parity tests
```
