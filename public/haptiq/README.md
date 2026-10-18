# Haptiq site

Plain HTML, CSS, and JS. No build step. The repository's `public/index.html` routes visitors here; the previous Neurarium viewer remains at `public/research-viewer.html`.

## Run it

From the repository root, run `python tools/serve.py` and open `http://localhost:8000/`. The brain meshes use `fetch()`, so opening `brain.html` directly from disk will not work.

## Files

| File | What it is |
|---|---|
| `index.html` | Landing page |
| `login.html` | Demo login → Overview or requested page |
| `overview.html` and `overview/` | Migraine Loop daily flow, experiments, portfolio, and history |
| `dashboard.html` | Existing monthly snapshot, attack, session, signal, and summary sections |
| `brain.html` | Signed-in interactive brain view |
| `css/styles.css` | Shared Haptiq styles and brand tokens |
| `js/brain-page.js` | Brain controls and dashboard result display |
| `js/brain/` | Mesh model, pathways, devices, and renderer |
| `js/data.js` | Sample dashboard data; replace `load()` with your API |
| `js/auth.js` | Demo login; replace `signIn()` with real authentication |

The login check runs only in the browser. Production access control must validate sessions on the server and restrict the brain page and its assets. The illustration does not show measured brain activity or treatment response.

The private Overview source and hub are retained in a local `integrations/molten-hackathon/` checkout. Only the built browser app is published here. The shipped Overview opens in simulated demo mode; live hardware requires the local hub and trusted devices.
