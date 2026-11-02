# SearchDeck for Chrome

A Manifest V3 launcher for a SearchDeck server. It does **not** bundle a second console and does
**not** store Elasticsearch credentials.

## What it does

- Opens the configured SearchDeck console in a tab, or in Chrome's side panel.
- Remembers only the console URL (plus an optional entry path) in `chrome.storage.sync`.
- Requests host access for the exact server origin you save; revoke it any time in
  `chrome://extensions`.
- Offers a reachability check from the options page. The console's own login, cookies, and host
  tokens stay in the console page.

## Load it locally

1. Open `chrome://extensions` and enable **Developer mode**.
2. Choose **Load unpacked** and select this directory (`extensions/chrome`).
3. Open the extension options, enter a running SearchDeck server (for example
   `http://localhost:5601`), and save.
4. Use the toolbar popup or `Ctrl/Cmd+Shift+Y` for the side panel.

The standalone server serves the console at `/searchdeck.html`; host integrations may use a
context path such as `https://host.example.com/ops`.

## Security model

| Boundary | Behavior |
|---|---|
| Credentials | Never read or stored by the extension; the console page owns its session |
| Host access | Optional and per-origin; requested only when you save or test |
| Code | Only local extension scripts; CSP is `script-src 'self'` and the console is loaded from your server |
| Pages | No content scripts, no page injection, no remote code |

Limitations: the server must be reachable from Chrome; mixed content (https extension page loading
an http console) follows Chrome's normal rules; a host that forbids framing cannot be embedded in
the side panel, though opening it in a tab still works.

## Package

Chrome Web Store uploads accept this directory as-is. To validate the manifest locally with Chrome:

```bash
chrome --pack-extension=/path/to/extensions/chrome --no-message-box
```

Delete the generated `.crx`/`.pem` afterwards.

## Tests

```bash
node --test test/*.test.mjs
```

The tests validate URL normalization, manifest/CSP rules, local-only assets, the no-remote-code
contract, and icon sizes. `scripts/generate-icons.py` regenerates the PNG icons with Pillow.
