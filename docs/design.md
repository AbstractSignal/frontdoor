# design the homelab page

**Lead:** the page dials names, never quads; the app inlines its URLs at build time.

**Scope:** the app in this repo — React + Vite on `@hakit/core` + `@hakit/components`
(ha-component-kit v6), served by nginx in the services box. **Answers:** what each card
dials, and the rules that are not style choices. **Last verified:** 2026-10-25.

**Cross-repo rule:** a path of the form `docs/<x>` that is not a file of this `docs/` tree lives in
[AbstractSignal/infra](https://github.com/AbstractSignal/infra), the repo that owns the box, Caddy,
DNS, the secrets and the deploy.

## Contents

- [What it is](#what-it-is)
- [What the cards dial](#what-the-cards-dial)
- [Rules that are not style choices](#rules-that-are-not-style-choices)
- [The page structure (nested boxes since 2026-10-25)](#the-page-structure-nested-boxes-since-2026-10-25)
- [Climate roster](#the-climate-roster-is-declared)
- [Why](#why)

## What it is

Built 2026-10-16 from source that used to live outside this repo (copied, gitignored build
artifacts excluded, `package-lock.json` kept so `npm ci` is reproducible). It replaced the
gethomepage v2 feature gated off the infra box on 2026-10-15 — same hostname
(`home.abstractsignal.com`), different object.

Reach HA itself with a Bearer token over REST (`docs/devices/home-assistant.md`); the app
dials the **name**, so moving a box behind a name needs no app change.

## What the cards dial

| Card / component | Dials | Set from |
|---|---|---|
| `useHaStatus`, entity list, the `ws://` state stream | HA's origin | `VITE_HA_URL` = `https://` + `dashboard.ha_public_site` |
| camera cards: MSE (`/live/mse/api/ws`) then WebRTC (`/live/webrtc/api/ws`, 720p transcode), snapshot polling last; Android Firefox lands on WebRTC | Frigate — since 2026-10-18 this repo's own, in the services box (`docs/services/frigate.md`) | `VITE_FRIGATE_URL` = `https://` + `dashboard.frigate_public_site` |
| activity history (`ClimateHistory.tsx`) | same-origin `/ha-api/...` | nginx's `location /ha-api/` → `dashboard.ha_upstream` (HA's LAN origin, server-side) |
| updates panel (`Updates.tsx`): the cached report + a refresh button | same-origin `/updates/report` (GET) and `/updates/refresh` (POST) | nginx's `location /updates/` → the `services-updates` container by name (`docs/services/updates.md`) |

The token is embedded in the served page (the kit's own README says so), hence gitignored
`dist`/`.env` and hence a Caddy-fronted site — never a bare LAN address.

## Rules that are not style choices

- **An https page cannot open `ws://`** (mixed content, refused before a byte is sent), and
  Caddy's `tls` sites redirect browsers to https — so HA/Frigate must be Caddy-fronted names,
  and a LAN URL in `VITE_HA_URL` is only correct if the page itself is served over HTTP.
- **A URL change is a rebuild, not a restart**: Vite inlines `import.meta.env.VITE_*`.
- **The bundle is built on the control machine, never on a guest**: `npm ci` needs an internet
  path, and VLAN66's path to npm's registry is nobody's contract.
- **`/ha-api/` is nginx's work, not the app's**: a `proxy_pass` with a URI replaces the matched
  prefix, and nginx's default `Host` would be the browser's (the public site name), from which
  HA builds addresses nothing reaches — hence `proxy_set_header Host {{ dashboard.ha_host }}`.
- **`src/wires.ts` `ADDR` is the single list of dotted quads** (`SITES` for the boxes with a
  Caddy name); every page that shows an address imports it, so a box moving address is one edit.
  A LAN address is rendered as text, never as a link: only `SITES` entries render as links.
- **Camera ids and room names are proper nouns** — the three Frigate camera names stay identical
  in both languages; only the wiring line around them is translated.
- **PBS has no `SITES` entry**: its row prints a quad the page cannot link, and it answers HTTPS
  only, so the quad was never a link a browser could follow (`docs/services/pbs.md`).
- **The sections are Caddy's own idea, not the page's**: `caddy.groups` in group_vars names them,
  each stanza carries its `group`, and `VITE_GROUPS` still carries that list to the bundle — but
  since 2026-10-24 the Homelab page does not shelve its doors by it. Grouping by physical box is
  the question that page answers; the proxy keeps sorting its stanzas by its own sections.
- **Directory bind mounts, never single files**: Ansible's atomic replace swaps the inode, and a
  file bind keeps serving the old content. nginx also restarts when the rendered config or the
  bundle changed — a bind-mount change is not a compose-config change.
- **Fonts are vendored, not CDN'd** (`public/fonts/`, Chivo + Chivo Mono as woff2, OFL).
  Filenames are not content-hashed, so a *changed* font under the same name stays cached — bump
  the filename. nginx serves `/fonts/*` with `font/woff2` without a location block.
- **`nginx:stable` here** is configured by replacing `/etc/nginx/nginx.conf` (the whole dir is
  bind-mounted), so nothing in that file may `include` a file the repo does not write; `mime_types
  /etc/mime.types` lives outside `/etc/nginx` and ships with the image. Cache headers use `expires`
  (`cache_control`/`cache_max_age` belong to a different module and were dropped for that reason).

## The page structure (nested boxes since 2026-10-25)

Two panels on the Homelab page, all derived. The first is **where it runs, and whether it
answers** — `src/pages/Boxes.tsx`. The second is **what needs updating** — `src/pages/Updates.tsx`,
which draws the updates checker's report (`docs/services/updates.md`): one row per component with a
state dot and the checker's own summary, and a refresh button that is the `POST /updates/refresh`
dial. The page computes nothing; it renders the checker's answer. The LAN's physical boxes are DOM boxes nested
in DOM boxes (2026-10-25, at the owner's second request for simpler): a box for
pve1, a box for the services LXC inside it, and inside that box one clickable
icon per service — no cable picture, no side list of names, no section headers:

- **the gear** (`src/pve1.ts` `OFF`): the router's, the switch's and the AP's
  boxes, each carrying the one door its lease fronts. No quad is printed on them —
  the box's own label is enough, and the owner asked for icons, not text.
- **pve1 and its guests**: the node's row carries PVE's UI; the infra LXC (#110) carries
  the Technitium console; the services LXC (#121) carries this page and the NVR; **pbs (#135)**
  carries the backup server, because PBS left the services box for a box of its own on 2026-11-18
  (infra `docs/services/pbs.md`); `haos13.1` (#101) carries Home Assistant; `unraid` (#106) carries
  its own UI. The box is the LEASE's
  owner, never the stanza's `group` — that mapping is `src/boxes.ts` `CLUSTER`,
  built from the leases the installs report, so a retargeted stanza moves its
  icon and a new pve1 guest needs no edit in `src/`.
- **pve2**, the second install (`192.168.66.3`, PVE 9.2.31, re-read 2026-11-20): drawn as a box
  because it is a physical box on this LAN, and carrying NO icon on its own row, because no stanza
  of this proxy fronts the node itself. Four of its guests are doorless — `#pve2 100 docker-arr`,
  `#pve2 101 immich`, `#pve2 102 dev-box` (its lease is in the .65 family, .183) and `#pve2 140
  pi-node` — each an empty box, which is the honest answer to "can I reach pve2 from here". Its two
  GPU guests DO carry doors (`ai`, `strata`), drawn inside pve2 because the lease's owner is the box,
  not the box Caddy happens to run on. `ai-node0` is stopped ON PURPOSE, and the page now says the
  node's own word for that instead of leaving a reader to guess.

What a door carries: its glyph (src/icons.ts, a name → file map into the vendored
icon set below, and a door with no entry gets a ring the page draws rather than a
guessed logo), its link target (the stanza's own host — the icon IS the door), and
its border, which since 2026-11-20 is a **LAN-side reading** (`src/status.ts` → the infra repo's
updates checker, `GET /updates/status`): `answering` (200) draws nothing, `redirect` (302) and
`no_route` (404) draw a corner tick, `auth` (401/403) a dotted ring, **`backend_down`
(502/503/504) the fault's hue at double weight** — the front door is up and what is behind it is
not — `refused` the plain fault ring, `timeout`/`no_name`/`error` amber dashes, and a gated
`enabled: false` stanza dimmed. The page's own probe (`fetch(url,{mode:'no-cors'})`) is kept as the
SECOND seat's reading and draws a pip only where the two disagree, and the tooltip names which seat
a mark came from (`mark_lan` / `mark_seat`).
Its name is on the anchor itself — `title` (the tooltip) and `aria-label` (the
accessible name) — and the words are the `name_*`/`ui_dns_console` keys both dicts
already carry, so a service is named once across the app. A glyph may not carry a
name, an address or a state.

What a door cannot carry, and what the panel draws beside it instead: whether a GUEST is running
(`.g-state`, the node's own word from `/cluster/resources`) and what CONTAINERS are up inside a box
(`.containers`, Docker's own word from `docker ps -a`). A door says nothing about a stopped box or
an exited container, and `#120 ai-node0` stopped on purpose must not borrow a dead service's mark.

The glyphs are the selfh.st icon pack, vendored (2026-10-25, at the owner's request
to use selfh.st/apps icons): `public/assets/icons/<name>.v4.0.3.svg`,
copied from github.com/selfhst/icons `svg/*-dark.svg` on 2026-10-25 — the release
is recorded in the repo's own `build/VERSION` (4.0.3), and IN THE FILENAME, because
nginx caches `/assets/*` for 7 days and a redrawn icon under the same name would
stay cached (the same rule the vendored fonts follow, `design.md` above). The pack
is Attribution 4.0 (CC BY 4.0, from the repo's own `LICENSE`, fetched the same day),
so the page prints a credit line (`icons_credit`) — a brand logo inside it belongs
to its own project, which is why the credit names the pack and not each logo. The
`-dark` variant is what is vendored, because this page is a dark card. `ap1` has no
entry in the map: this repo has not measured what the AP's UI is (`docs/network/topology.md`
names the box and its MAC), so it gets the page's own ring, which claims nothing.

What the page no longer draws, and why: the cables and the VLAN hues. The owner
asked twice for simpler, and a reader of this page walks to a box, not along a run.
The runs are still `src/pve1.ts` `RUNS` for anything that wants them (the panel
that drew them, `src/pages/WiresGraph.tsx`, is deleted), and the prose of the same
facts is `docs/network/topology.md`. `src/boxes.ts` carries no layout any more: a
box's size is CSS, and nothing here is a coordinate.

`wires.ts` answers "how do I reach it" (the quads you DIAL, from group_vars); `pve1.ts` answers
"which box is this, and what is on it" — a guest's lease and the quad you dial are not the same
fact (VMID 110 answers `.66.6` and `.69.22`, `wires.ts` lines 240-241). The same distinction is why
an icon sits in a box by LEASE and links to a HOST: `dns1`'s icon sits in the infra LXC's box (its
lease) and dials `192.168.66.6:8384` (its stanza).

What was cut, and why it stays cut: `src/pages/Hierarchy.tsx` (the pve → container
→ service tree), `src/pages/PveMap.tsx` (the flat card grid) and the old
`NetworkMap.tsx` fan are deleted — a fact living in two panels is two things to
keep in step. So are `src/pages/Services.tsx` (the doors list) and
`src/pages/WiresGraph.tsx` (the cables picture), together 2026-10-24 at the
owner's request: they were the same quads twice, and the owner asked for the
services to sit on the box they answer from, in icons, with as little text as the
drawing can carry. One drawing answers both questions now — "which box do I have
to walk to" and "is it answering" — so the sections `caddy.groups` names are no
longer this page's shelving (the proxy still sorts its stanzas by them; the page
stopped borrowing that order). The tally chips above those sections went the same
way: an icon's border is its own state, and a count of states next to it is one
more thing to keep in step for no new answer.

## The climate roster is declared

`src/climate.ts`, not discovered: HA cannot tell a heated floor from a baseboard
heater — measured 2026-10-17 on HA 2026.9.1, all five heaters are `platform: homekit_controller`
with modes `off`/`heat`, two carrying no name at all. So the grouping is knowledge about the
house and lives in the app (id, label key, colour, setpoint step):

- **Air**: `climate.salon`, `climate.etage` (platform `gree`, modes auto/cool/dry/fan_only/heat,
  8 fan modes, 12 swing modes, ±1° setpoint)
- **Heated floor**: `climate.th1310wf_b723d8` (master bathroom), `climate.th1310wf_b5de94`
  (main-floor bathroom)
- **Baseboard**: `climate.th1123wf_a78bf0`, `climate.chambre_auguste`,
  `climate.chambre_lionel_thermostat_lionel`
- The five thermostats accept `set_temperature`, `turn_on`/`turn_off`/`set_hvac_mode` and nothing
  else — power plus setpoint, an "on" button that picks `heat` (auto is not one of their modes),
  ±0.5° (setpoints 5–30°C on one, 5–36.2°C on three, fractions accepted).
- Labels for the two unnamed floor units come from the house, not from HA; printing the entity
  id would put `Th1310Wf B5De94` on a control card.

Ranges stay 6/12/24h: HA's recorder here keeps about a day (24h/48h/72h/168h windows of the same
seven units all returned the same first row). Past that needs a source this repo owns.

To find entities on HA 2026.9.1, use REST `GET /api/states` (444 entities, 3 `camera.*`, 7
`climate.*`); `/api/entities` is 404, and the `config/entity_registry/*` websocket commands
cannot be reached (long-lived JWT refused — `docs/devices/home-assistant.md`).

## Why

- **2026-11-20** the door marks moved to a seat that can read a status code: `no-cors` reports only "a socket opened", so four Caddy 502s on 2026-11-08 were drawn open — the state is now read inside the LAN by infra's updates checker (`src/status.ts` → `GET /updates/status`) and the browser's own dial survives as the second seat, with a pip where the two disagree
- **2026-11-20** a door's box is decided by its backend quad, so an unresolved placeholder is a door with no box: `pbs.abstractsignal.com` proxied to `{{ pbs_box_ip }}`, the bundle carried the raw text, `quad` parsed to `''`, and PBS was drawn on pve1's NODE row instead of in its own #135 box — `ADDR.pbs` is `192.168.66.61` and `wires.ts` fills `pbs_box_ip` the way it already filled `services_ip`
- **2026-11-20** a stopped guest is not a fault: `#120 ai-node0` and `#102 dev-box` are stopped on purpose, so the page prints the node's own word (`running` / `stopped`, from `/cluster/resources`) beside the guest box and dims it rather than marking it red — the door mark cannot say this at all
- **2026-11-20** the page drew a services box at `#120` on pve1 while pve1's services box has been `#121` since 2026-11-11, and `#120` on this LAN is pve2's `ai-node0`: two different boxes, one number, one page that would have named the wrong one. `pi-node` (#140, .66.60 — the box these repos' own commands run from) was missing from the pve2 list entirely, and a guest the page does not list is a guest no reader can see is down

- **2026-10-15** the dashboard is a gethomepage v2 on the infra box, gated off CT110 — `git:memory/decisions.md#L1067`
- **2026-10-16** mixed content is what decides the URL shapes: an https page cannot open `ws://` — `git:memory/decisions.md#L1106`
- **2026-10-16** the v2 dies at its own feature flags, and the LAN quad answers nothing over https: the page dials names, TLS ends at Caddy — `git:memory/decisions.md#L1106`
- **2026-10-16** the infra/services split and the URL rule that follows from it — `was git:memory/decisions.md#L1106` (+ `docs/concepts.md`, `docs/proxy/https.md`)
- **2026-10-17** the control page answers seven devices in three groups: the roster is declared, discovery is gone — a wrong grouping is a wrong control group, not a cosmetic label — `was git:memory/decisions.md#L1333`
- **2026-10-18** the homelab page lists what you can dial, not what PVE owns — `was git:memory/decisions.md#L1658`
- **2026-10-19** PBS is a key of `ADDR` and of no `SITES` list: a claim nobody can dial is not a claim the page should draw — `was git:memory/decisions.md#L1684`
- **2026-10-23** the door is drawn as a funnel, and the phone form of the map as a comb: two drawings of the same data, never a scaled one — `was git:memory/decisions.md#L1760`

## Related

- deploy and symptoms → `operations.md`
- what the page dials → `docs/devices/home-assistant.md`, `docs/services/frigate.md`
- dated verdicts and how the browser was opened → `measurements.md`
- **2026-10-23** the phone form of the map is a comb, not a smaller fan: two drawings of the same data, never a scaled one — `git:memory/decisions.md#L1785`
