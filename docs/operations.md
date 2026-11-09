# Operations — deploy the app

**Lead:** build HERE (`bin/dashboard-build.sh`), deploy and verify THERE
(`make services` / `make verify` in [AbstractSignal/infra](https://github.com/AbstractSignal/infra)),
in that order. A changed URL is a rebuild, never a restart.

**Scope:** the app the nginx in the services box serves. **Answers:** what to run, in which
order, and what each step asserts. **Last verified:** 2026-11-08.

**Cross-repo rule:** anything written `infra/...`, `group_vars/...`, `playbooks/...` or
`make <target>` belongs to the infra repo; this repo owns the app, this build, and the asserts below.

## Contents

- [Deploy (the infra repo's path)](#deploy-the-infra-repos-path)
- [The three things the bundle dials](#the-three-things-the-bundle-dials)
- [What the Homelab page shows](#what-the-homelab-page-shows-2026-10-22-cut-down-2026-10-23)
- [Dev path](#dev-path-this-machine-not-the-box)
- [Troubleshooting](#troubleshooting)
- [Why](#why) The old shape — `npm run dev` on this machine at
`192.168.65.183:5173` behind a firewalld port — is kept below as the dev path,
because iterating on the app still happens here.

## Deploy (the infra repo's path)

```bash
make dashboard-build      # infra: clones this repo into vendor/frontdoor/, renders .env from its group_vars + SOPS, runs bin/dashboard-build.sh there
make services-bootstrap   # sshd ON THE NODE for VMID 120 (only a fresh box needs it)
make services             # infra playbooks/services-lxc.yml: Docker + nginx + push vendor/frontdoor/dist + the PBS image
make verify               # probes the box: container running, page 200, /ha-api reaches HA
make pbs-remotes          # what PVE's pbs backup remotes say (read-only)
make pbs-remotes-apply    # re-point them at this box (writes on the NODE, needs the SOPS credential)
```

Order matters and each step asserts the previous one, with the reason. A fresh
box needs `bin/tofu.sh pve1 apply` before `services-bootstrap` (Terraform owns
existence); `services` refuses to run until `vendor/frontdoor/dist` exists. After the
apply, **before** `services-bootstrap`, two things have to happen or the box is
unreachable at the wrong address:

```bash
make router-apply                # the dhcp-host pin for BC:24:11:C0:FF:F0 (see below)
ansible proxmox -a 'pct reboot 120'   # from ansible/playbooks/; re-dials the lease
```

- **That cwd is load-bearing** (measured 2026-10-26): an ad-hoc run from `ansible/`
  with `-i inventory.ini` resolves this repo's `group_vars` relative-path includes
  one directory too high, so the secrets lookup dies with
  `could not locate file in lookup: .../ansible/../group_vars/all/secrets.yml` and the
  whole task fails on the password keyword. It reads as a broken repo; it is a wrong
  cwd. The Makefile's own targets pair `cd ansible` with `-i ./inventory.ini`, and
  ad-hoc work pairs `cd ansible/playbooks` with `-i ../inventory.ini` — the pair,
  not either half, fixes the include root.

VLAN66's DHCP pool is `start=100 limit=150`, so an un-pinned fresh box leases
`.100`–`.249` (measured: `192.168.66.226`) and only the router pin puts it at
`.12`. A live box keeps its current lease until boot, so the reboot is part of
the chain, and `bin/tofu.sh pve1 refresh` then has to report
`services_ipv4.eth0 = 192.168.66.12` before anything renders that address.

What the box answers: `http://<192.168.66.12>:8080/` (plain HTTP, high port).
What browsers dial: `https://home.abstractsignal.com` — the infra box's Caddy is
the front door, and TLS ends there. Nothing here has a certificate.

Also on that box, not in this app: PBS answers `:8007` (`services-pbs`, built from
`ansible/playbooks/templates/services-pbs/`), and PVE's two `pbs` remotes name
that address. Nothing in the bundle dials it, so a dead PBS cannot make a page
dead — `make pbs-remotes` is the play that checks that side of the box. The updates
checker publishes no port at all: the updates panel dials it same-origin at
`/updates/...`, which nginx rewrites onto the `services-updates` container by name
(`docs/services/updates.md`). A dead checker shows as an error row on the panel and a
failed `make verify`, never a blank page.

## The three things the bundle dials

infra renders these into the clone's `.env` from its `group_vars/services_lxc/main.yml`
(+ SOPS' `ha_token`); `bin/dashboard-build.sh` here builds with them and asserts the bundle
carries them — the app inlines them at build time, so **a changed URL is
a rebuild, never a restart**:

| Key | Value comes from | Why that shape |
|---|---|---|
| `VITE_HA_URL` | `https://` + `dashboard.ha_public_site` | Caddy-fronted name. An https page **cannot** open the `ws://` stream `@hakit` builds (mixed content, refused before a byte is sent), and the page is https because Caddy redirects browsers to https |
| `VITE_FRIGATE_URL` | `https://` + `dashboard.frigate_public_site` | Same reasoning; Frigate/go2rtc serves MSE (`/live/mse/api/ws`) and WebRTC (`/live/webrtc/api/ws`, 720p transcode) over websockets, and Caddy passes the upgrade through |
| `VITE_HA_TOKEN` | `dashboard.ha_token_secret` key in SOPS | Embedded in the served page. That is why `dist` and `.env` are gitignored and why the site is never a bare LAN address |

The app's activity-history card instead fetches **same-origin `/ha-api/...`**,
which nginx rewrites onto `dashboard.ha_upstream` (HA's LAN origin, server-side —
no CORS, no mixed content). If that site stanza is ever disabled, the matching
`VITE_*` value has to go back to a LAN URL **and** the page has to be served over
HTTP, or the cards die silently in the browser console (`docs/concepts.md#why`).

Frigate is this repo's own service in the same box (0.18.2 at `192.168.66.12:5000`, VLAN66 —
`docs/services/frigate.md`); camera feeds go through its built-in go2rtc
with the same paths as the HA integration: MSE first, WebRTC fallback (25s grace,
cold transcode startup), snapshot polling last. Android Firefox lands on WebRTC.

## What the Homelab page shows (one panel, nested boxes, 2026-10-25)

One panel, all derived: **where it runs, and whether it answers** (`src/pages/Boxes.tsx`).
The LAN's physical boxes are DOM boxes nested in DOM boxes, and every Caddy stanza of
`infra/ansible/group_vars/infra_lxc/main.yml` (read at build time into `VITE_CADDY`
by `bin/dashboard-build.sh`) is drawn INSIDE the box whose lease it answers from,
as a clickable icon:

- the box an icon sits in comes from the leases the installs report (`src/pve1.ts`
  `RESOURCES`, `src/boxes.ts` `CLUSTER`), not from a stanza's `group`: `dns1`'s icon
  is in the infra LXC's box because Technitium's lease is there, and it dials
  `192.168.66.6:8384` because that is its stanza. A new pve1 guest needs no edit in
  `src/`.
- the glyph comes from `src/icons.ts`, a door NAME → file map into the vendored
  selfh.st pack below: the glyph IS the link, so clicking it dials the service, and
  the anchor carries `title` (tooltip) and `aria-label` (accessible name) from the
  `name_*`/`ui_dns_console` keys both dicts already carry. No icon text, no second
  mark. A door with no entry in that map gets a ring the page draws, not a guessed
  logo — `ap1` is that case, since this repo never measured what the AP's UI is.
- the border is the page's own probe (`fetch(url,{mode:'no-cors'})`): answered draws
  no border, refused draws RED (the owner's ask, and this page's one status
  indicator), slow draws amber dashes and breathes, a gated stanza (`enabled: false`)
  is dimmed and links nothing.
- pve2 (`192.168.66.3`, PVE 9.2.2, measured on the node 2026-10-24) carries two live
  doors and one retired row since 2026-11-08: `ai` (ai-node0 `.66.58`) and `strata`
  (ai-node1 `.66.59`) are drawn inside their own guest rows, `#pve2 100 docker-arr`,
  `#pve2 101 immich` and `#pve2 102 dev-box` stay empty (foreign, no stanza of this
  repo), and `#pve2 110 docker-node1 RETIRED` is a row `src/boxes.ts` `RETIRED` draws
  so the three dark doors that still name `.56` land in the box that held the guest
  instead of being orphaned into pve1's row. A guest the page no longer has gets that
  row rather than deletion: `src/wires.ts` keeps a disabled stanza as a row, and a
  quad nobody owns is the failure mode. Its VMIDs collide with pve1's — pve2's 101 is
  immich, pve1's 101 is haos — so pve2's guests print their install id, and a bare
  `#101` on a LAN page would be a wrong claim.
- what is NOT drawn: the cables and the VLAN hues. A reader of this page walks to a
  box, not along a run, so the runs (`src/pve1.ts` `RUNS`) stay data for anything that
  wants them and `docs/network/topology.md` keeps their prose.

A browser cannot read a cross-origin status code, so "answered" is not proof you are
authorised, **and it is not proof the backend is alive**: measured 2026-11-08, the three
doors behind the destroyed CT110 answered `502` and still drew no border, as did `ai`
while VMID 120 was stopped — Caddy answers, so the fetch succeeds. The only mark this page
can own is the dimmed one, which is why a retired box's stanzas stay declared with
`enabled: false`, and `make verify` carries both halves of the fact: 90-verify.yml "Assert every gated
door is gone from DNS and from Caddy" (measured 2026-11-08 on the three doors of the destroyed CT110: no A
record at Technitium, no TLS vhost at Caddy) and "Assert every cross-node door reaches past
Caddy") is what fails on a 5xx, because it dials from the LAN side and can read the code. That probe
picks its doors by the stanza's `node:` key (`group_vars/infra_lxc/main.yml`: `ai` and `strata` carry
`node: pve2`), because the door's backend node is a fact the stanza must state - a filter on the backend
address cannot work, since the play resolves `pve2_ai_node0_ip` into a lease before the filter sees it.
`make services`' curl report, dialled from the LAN side, stays the
authority for "up". Two reads are the browser refusing, not a dead door: a door that
redirects to plain http (`unraid` → `http://…/Main`), and a name only the LAN's
nameserver knows (`dns1`, `home`, `frigate`, `pbs`) when the page is opened from off
the net.

What was cut, and why it stays cut. On 2026-10-23, at the owner's request ("the Cables
graph, the rest is cluttered"): `src/pages/Hierarchy.tsx` (the pve → container →
service tree) is DELETED, and with it the quad/VMID columns of the doors panel and its
"Dials with no door" group — a port with no stanza was no longer on the page at all. The
tally chips above the sections went on 2026-10-24 for the same reason: an icon's border
is its own state, so a count of states beside it restated what the marks already said.
Cut together the same day, also at the owner's request ("group services per physical
boxes, minimal text and icons, the icons clickable, a red border for unreachable"):
`src/pages/Services.tsx` (the doors list) and `src/pages/WiresGraph.tsx` (the cables
picture) — the same quads twice, and the owner wanted the services on the box they
answer from, in icons. The page therefore has no sections (the proxy still sorts its
stanzas by `caddy.groups`; the page stopped borrowing that shelving), and `pve1.ts`'s
`GRAPH` layout is deleted — `src/boxes.ts` carries no layout at all now, since a box's
size is CSS and nothing here is a coordinate.

On 2026-10-25, at the owner's second request ("even simpler… a box for pve1, a box for
services in that box, clickable icons for each service"), the drawing went: the SVG
viewBox, the cable lines, the VLAN hues and the `g-*`/`.b-*` drawing CSS are gone, and
the panel became HTML boxes nested in boxes with the selfh.st pack's glyphs inside
them. The facts did not move — same `CLUSTER`, same `CADDY`, same probe.

`src/pve1.ts` keeps `UNNAMED` (go2rtc `:8971`, services-console `:8443`) even though
no page shows it now: it is the fact "this port has no door", and the stanza that
closes it belongs to `group_vars`.

## The icon set is vendored (the pack, not a CDN)

`public/assets/icons/<name>.v<release>.svg`, copied straight from
`github.com/selfhst/icons` (`https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/<name>-dark.svg`)
by hand on 2026-10-25 — release 4.0.3, taken from the repo's own `build/VERSION` the
same day, 7,786 icons per the pack's own badge JSON that day. Vite copies `public/`
verbatim, so the served path is `/assets/icons/...`, which is nginx's `expires 7d`
location: **the release is in the filename for that reason**, and a redrawn icon has
to change name (the same discipline as the vendored fonts). The pack's license is
Attribution 4.0 (its own `LICENSE`, fetched 2026-10-25), which is why the page prints
`icons_credit`.

To add or refresh a glyph:

```bash
curl -sO https://cdn.jsdelivr.net/gh/selfhst/icons@main/svg/<name>-dark.svg   # then rename to <name>.v<release>.svg
```

and add the door name to `ICONS` in `src/icons.ts`. Check the name exists
before assuming it: the pack has no `pbs`, no generic router glyph — `grep` its own
tree (`api.github.com/repos/selfhst/icons/git/trees/main?recursive=1`). A door with
no entry keeps the page's own ring, which claims nothing, so a missing glyph is never
a wrong logo.

## Dev path (this machine, not the box)

```bash
npm run dev    # from this repo's root; Vite binds 0.0.0.0:5173
```

This machine sits on **192.168.65.x**; HA and the box are on 192.168.66.x, so
whether a LAN device can reach the dev server depends on the router, and firewalld
here blocks ports by default (the old deploy opened `5173/tcp` in the `public`
zone, permanently). Nothing in the repo owns that firewalld rule — it is why the
deploy moved off this machine.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Browser says `ERR_CANNOT_CONNECT` on a LAN name (`home.`/`ha.`) | Not the app, and not the box: the **router's nameserver forward** is gone, so the name escapes to the internet and the public zone answers NXDOMAIN (a reboot can restore an old config generation — `docs/network/router/dns-server.md#why-the-list-looks-like-this`). Probe the two legs separately: `dig <name> @192.168.66.6` (Technitium) and `dig <name> @192.168.66.1` (what the browser's path actually asks). Bypass DNS to prove the Caddy leg: `curl --resolve <name>:443:192.168.66.6 https://<name>/` |
| Site answers 502 | The backend is the **services** box, not Caddy: VMID 120 missing, its lease drifted off the router pin, or `dist` never built. `make verify` probes all three |
| Page loads, cards stay blank | Open DevTools → Console. Usually the `ws://`-on-https-page trap above, or a token that expired (the login screen instead of the dashboard means the same thing). Nothing in this repo can see a browser: `make verify` probes the box legs and greps the **served bundle** — a card wrong only in the render is invisible to it |
| Fresh box never answers ssh | `make services-bootstrap` (the sshd drop-in ON THE NODE) — a fresh LXC inherits Debian's `PermitRootLogin prohibit-password` and this repo is keyless |
| `apt` fails installing `docker.io` with 404s | The fresh box's Packages index is stale (measured: every pool URL that has moved since the base image was built 404s). The playbook runs `update_cache: true` for that reason; never add `upgrade`/`dist-upgrade` here |
| nginx container loops, `docker ps` looks fine | Read `docker logs`, not `docker ps`. nginx:stable here is nginx/1.30.6 and rejects two idioms the config used to carry: `worker_processes` inside `events { }` and `mime_types` (no such directive) |
| Camera card stuck, then SNAPSHOTS | The app's diag line (`MSE ws/mime/KB`, `WebRTC ICE <state>`) pins the stage; check go2rtc is up and its candidates point at a LAN IP |
| `/ha-api/` answers 400 | HA refuses any request that carries `X-Forwarded-For` (its own 400, LAN address included). The location block sets `Host` only; the assert accepts `401` = HA answered, `400`/`502`/`504`/`404` = fail |
| The **front door** answers 400 (`ha.`/`home.`) | Same HA guard, and Caddy's `reverse_proxy` adds `X-Forwarded-For` by default - so every request through TLS ends at the infra box carried an XFF HA could not match. Measured at `192.168.66.20:8123`: no XFF -> `401`, `X-Forwarded-For: 192.168.66.6` -> `400`. The fix is one directive in the Caddyfile generator (`infra-lxc.yml`: `header_up -X-Forwarded-For` inside every plain-HTTP LAN stanza - the https/self-signed ones keep their own block), so HA's own settings stay untouched and both doors now speak the same headers. After it: `https://ha.abstractsignal.com/api/` and `https://home.abstractsignal.com/ha-api/api/` answer `401` bare, `200` with the token. Do NOT trust a curl WS probe: curl negotiates h2 and HA then answers `No WebSocket UPGRADE hdr: None` even dialled straight at its LAN address - a raw HTTP/1.1 upgrade answers `101 Switching Protocols` through the `ha` stanza, and nginx's `/ha-api/` does not tunnel the upgrade (the bundle dials WS at `ha.`, REST at `/ha-api/`) |
| History card empty | `/ha-api/` is nginx's location block: `make verify` asserts it reaches HA; a 200 there with an empty card means HA has no data for the period, not a broken proxy |
| Updates panel says the checker is not answering | `/updates/` is nginx's location block: `make verify` asserts `GET /updates/health` reaches the container. A 503 on `/report` is the first check still running (a minute), not a failure; a 502/504 is a broken proxy or a checker that crashed on boot — read `docker logs services-updates` |
| Updates panel shows an error row for a box | The checker reached the page but that one dial failed: the row's summary carries the reason (an SSH refusal names the box, a registry 404 names the image). A moved lease or a renamed secret is a group_vars edit, then `make services` |
| History stops at 24h | Expected, and the chart only offers 6/12/24h: HA's recorder here keeps about a day (measured 2026-10-17 — 24h, 48h, 72h and 168h windows of the same seven entities all returned the same first row). Past that needs a source this repo owns |
| Climate page is missing a device | The roster is declared in `src/climate.ts`, not discovered: HA cannot tell a heated floor from a baseboard heater (`design.md`). A unit HA gained is an edit there, then `make dashboard-build` + `make services` |
| The page **names** the old box while the feeds come from the new one | Not the deploy: the addresses the pages show are repo facts — `src/wires.ts` (`ADDR.frigate`), `HomeControl.tsx` (`frigateAddr`), `FrigateCamera.tsx` (the `VITE_FRIGATE_URL ||` fallback) and `i18n.tsx`'s `cameraWire` in **both** languages. Move those, then run the rebuild chain above. `make verify` cannot see the words; the check that does is fetching the served asset and grepping it for the old quad (`curl home.…/ | grep -o '/assets/index-[^.]*\.js'` then grep that asset) |
| A glyph is missing or stale | Two different things. Missing: the door name is not in `ICONS` in `src/icons.ts`, so the page draws its own ring — add the file (see *The icon set is vendored*). Stale: the file kept its name across a pack release, and nginx's 7-day `/assets/` cache is serving the old copy — bump the release in the filename, then `make dashboard-build` + `make services`. The check that sees either is fetching the served page and grepping for the icon path |
| A URL change did nothing | Expected: the values are inlined at build time. Re-run `make dashboard-build` then `make services` |
| A deploy refuses on "datastore has no headroom" | Not the app: `pbs.min_free_kib` in `group_vars/services_lxc` asserts the box's disk still has room to be a backup capacity budget. The sizing is terraform's (`terraform/pve1/containers.tf`), and an EDIT to that container needs the box's `protection` lifted on the node first (`pct set 120 -protection 0`) |
## Why

- **2026-11-08 — a door's backend node became declared data.** `make verify`'s cross-node probe had been selecting doors by a backend string containing `pve2_` and matched nothing (the play resolves that variable first), so it printed `skipping: [infra]` on the same run where `ai` answered 502. `node:` on the stanza is now what the gate reads, and the page's own box drawing already needed the same fact.
- **2026-11-08 — the bundle was four stanzas behind the proxy** (built 2026-10-29, `mealie` added 2026-10-30 and `strata` 2026-11-06 never built), and `strata` had no `ADDR`/`FOREIGN` entry at all, so a rebuild alone would have drawn it with `{{ pve2_ai_node1_ip }}` as its quad. `make dashboard-build` is not optional after a stanza changes: the door list is compiled into the bundle.

- **2026-10-15** the app deploy stays on the control machine: VLAN66 has no vendor route, and the box has no browser — `git:memory/decisions.md#L1106`
- **2026-10-16** `home.abstractsignal.com` is the new app, not the old gethomepage v2 — `git:memory/decisions.md#L1106`
- **2026-10-17** the control page answers seven devices in three groups: the roster is declared, discovery is gone (a wrong grouping is a wrong control group) — `git:memory/decisions.md#L1333`

 PVE's `pbs` entries no longer name this box (its lease moved, or the box's PBS never built). `pbs-remotes-apply` re-writes them from Terraform's lease; it needs `pbs_root_password` in SOPS, and `--extra-json` is not a synonym for `-e` (see `Makefile`) |
