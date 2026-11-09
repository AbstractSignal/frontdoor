# frontdoor — the homelab control page

One page that answers what is reachable, built as a Vite/React bundle and served by the nginx in
the services box. This repo is the SOURCE and the BUILD; the deploy is not here.

- what the page is and which door each card answers → `docs/design.md`
- the probes and what they returned → `docs/measurements.md`
- how it is built, pushed, re-built → `docs/operations.md`

## The two repos

| repo | owns |
|---|---|
| this one | the app (`src/`, `public/`, `index.html`), its docs, `bin/dashboard-build.sh`, `bin/dashboard-verify.sh`, `bin/ha-ws.mjs` |
| [AbstractSignal/infra](https://github.com/AbstractSignal/infra) | the box that serves the bundle, Caddy's doors, the DNS names, the DHCP pins, the SOPS secrets, and the deploy (`make services`) |

infra clones this repo into its gitignored `vendor/frontdoor/`, renders `.env` there from its own
`group_vars` + SOPS, then runs `bin/dashboard-build.sh` inside the clone and pushes `dist/` into the
box. The split is why: the values Vite INLINES are infra facts (a Caddy stanza's host, a lease, a
token), and no secret ever needs to live in this repo.

## Build it here

```bash
cp ../infra/dashboard.env.example .env   # the VITE_* contract lives in the infra repo (SOPS renders the real values)
npm install
npm run build            # or bin/dashboard-build.sh: same build, plus the assert that the bundle carries .env
npm run dev              # iterate on this machine, not on the box
```

`.env` and `dist` are gitignored: Vite inlines `import.meta.env.VITE_*`, so a committed `dist` is a
committed token.

## Verify what a browser actually sees

```bash
bin/dashboard-verify.sh 'http://<door>:<port>/?#/homelab' '.box-lan,.box,.door,.b-icon'
node bin/ha-ws.mjs --origin http://<ha-host>:8123 --cmd manifest:list
```
