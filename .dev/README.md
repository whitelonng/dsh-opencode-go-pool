# Local harness (not part of the shipped plugin)

Scripts that exercise the plugin against the **real** harness packages without
starting the desktop app. They are development aids: `files` in `package.json`
does not ship this directory.

## Prerequisites

The scripts import `@deepseek-ai/*` and `@earendil-works/pi-ai` as bare
specifiers, so those packages must be resolvable from a `node_modules`
directory **above** this checkout. The desktop installation ships them inside
`app.asar`; copy them out once:

```powershell
# ELECTRON_RUN_AS_NODE turns the desktop binary into a node that can read app.asar
$exe = "E:\aitools\dsh\DeepSeek Harness.exe"
& $exe "path\to\copy-packages.js"   # walk @deepseek-ai/<pkg> and @earendil-works/pi-ai into ..\node_modules
```

`..\node_modules` (next to this repo, not inside it) is the intended location.
Run the scripts with the same binary so asar-aware resolution stays available.

## Scripts

| Script | What it proves |
|---|---|
| `smoke.mjs` | Provider route registration, catalog listing, one real streamed call, usage gateway, `status()` payload |
| `failover.mjs` | A bad key is marked invalid, the pool rotates silently, the next key answers, `lastSwitch.reason` recorded |
| `client.mjs` | The browser bundle mounts its Typert contribution (strict codecs with `create()`), registers `settings.section`, and exposes the injected `{ t, api }` props |

Set `OPENCODE_KEY` to a real OpenCode Go key and `DSH_HOME` to a scratch
directory before running:

```powershell
$env:OPENCODE_KEY = "oc_sk_..."
$env:DSH_HOME = "D:\sources\pub-repo\.dev\home"
& $exe "D:\sources\pub-repo\dsh-opencode-go-pool\.dev\smoke.mjs"
```

`client.mjs` needs no key and no network.
