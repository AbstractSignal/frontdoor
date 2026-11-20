# app/ — measurements of the page

**Lead:** a green `make verify` says the box legs answer; it never says a card renders.
The only checks that saw this page in a browser used a CDP harness, not an eye.

**Scope:** dated verdicts about the app, and how to measure the page at all. **Answers:**
what was green when, and the one way a browser gets opened from here. **Last verified:** 2026-11-20 (the service-state panel, measured off the box: the JSON the panel draws, and `npx tsc --noEmit` clean). **No browser verdict since 2026-10-23**: this repo's own check (`bin/dashboard-verify.sh`) needs a headless chromium and the machine these repos are driven from (pve2's `pi-node`, CT140) has none — so the 2026-11-20 line is a measurement of what the panel is *given*, not of what it *draws*.

## Contents

- [How a browser gets opened here](#how-a-browser-gets-opened-here)
- [Verdicts](#verdicts)
- [What no check can see](#what-no-check-can-see)

## How a browser gets opened here

The app is a **HashRouter**, so the page is `…/?lang=en#/homelab`; a plain
`chromium --screenshot` of a Vite dev server shows an empty page (the deferred client never
runs in headless; the built bundle does). The harness that works lives outside the repo
(`.probe/`, gitignored):

- `serve.mjs` answers every path with `dist/index.html` as `text/html` plus a CORS
  header — the bundle's script tags carry `crossorigin`, so a 404-less static host would
  otherwise abort the load;
- `cdp.mjs` drives chromium's own devtools protocol and clips one selector's real bounding box;
- `layout.mjs` prints per-card boxes, wrap counts and dead space;
- checks read the **served bundle** (`curl home.…/ | grep -o '/assets/index-[^.]*\.js'`, then grep
  that asset) rather than the source, so a stale deploy cannot pass.

This model has no image input: the check is geometry + `innerText` + a colour histogram, not a
look at the PNG. A layout that measures fine can still read badly — that judgement stays with
the human.

## Verdicts

| Date | Verdict |
|---|---|
| 2026-10-17 | `make verify` probed CT120 green: container running, page 200 on its own port, `/ha-api/` reaches HA, PBS answers `:8007` with the declared datastore |
| 2026-10-18 | after the Frigate move: `make services` reported `changed=2` (bundle push + dashboard restart; compose graph and PBS byte-identical), asserts passed (`/ha-api/` reaches HA, frigate answers its own API and is **not** in safe mode, go2rtc came up with the declared streams, PBS lists its datastore). The public name then serves `/assets/index-C-thQj8f.js`; that bundle contains **zero** `192.168.69.21` occurrences, its wires table says `frigate: 192.168.66.12`, and both languages' wire line reads `Three Frigate feeds at {addr}, VLAN66 — the browser dials {site}` |
| 2026-10-19 | PBS is HTTPS-only: its quad is not a link a browser can follow; the map draws it with the `edge-inside` dash off `services` |
| 2026-10-22 | the pve1 hero measured 880×1465 at a 1440 viewport (cards 414 wide, 2×3, `overlap=0 clipped=0`), 820×1622 at 820, 390×2881 at 390; panel `innerText` contains **zero** raw i18n keys in either language (a missing key renders as its own name) |
| 2026-10-22 (later) | doors panel + denser map: card metrics changed (`--measure` 0.55→0.45rem, `--flow` 0.6→0.45rem, card/quad 0.86→0.8rem, `--quiet` `#7f8b9a`→`#8e9dab`); map 875×971 at 1440 (was 880×1465), 385×1791 at 390; doors panel 824×456 / 334×1027; 9 links measured live at every viewport. `.svc-rows` is a grid of `minmax(230px,1fr)` columns — a flex row of fixed chips measured `clipped=8`. `.svc-missing` needed `margin-top: 0.5rem` (`overlap=2`) |
| 2026-10-22 (page restructured) | doors 824×533 / 334×1063 with **10** links (the `dns1` row is the tenth); tree 875×498 / 385×1002 with 7 links, `overlap=0 clipped=0`; graph 875×652 / 385×406, `clipped=0` (the first draft drew guests' quads inside the box and measured `clipped=6`, which moved them to the tree); the tree's French `innerText` prints zero raw i18n keys |
| 2026-10-23 | the comb (phone form): worst left 10, worst right 367 of 400, tightest label-row gap 64, baseline max 650 of a 700-high viewBox. The old stacked form clipped `services`, `pbs`, `frigate` (a 78px string ending at x=404 in a 400-wide viewBox) |
| 2026-11-20 | **the service-state panel, measured at its source.** `GET /updates/status` on the services box answers in 0.8–3.5 s, every 5 min: **15 doors** (11 answering — `pbs`, `ha`, `home`, `frigate`, `strata`, `ap1`, `dns1`, `router`, `sw1`, `pve1` at 200, `unraid` at 302 to `/Main`; 4 gated `enabled: false` and NOT dialled — `papers`, `kaneo`, `mealie`, `ai`; **0 down**), **2 installs** both online on **PVE 9.2.31**, **11 guests** (9 running; `pve2 #120 ai-node0` and `pve2 #102 dev-box` stopped), **7 containers** (6 up, `cool_nash` **exited (1) 7 weeks ago** on the infra box — visible for the first time because the read runs `docker ps -a`). `npx tsc --noEmit` clean over `src/status.ts`, `src/pages/Boxes.tsx`, `src/pve1.ts`, `src/boxes.ts`, `src/wires.ts`, `src/i18n.tsx`. The inventory corrections this reading forced: pve1's services box is **#121** (not 120, which on this LAN is pve2's `ai-node0`), PBS is **CT135 at 192.168.66.61** and was being drawn on pve1's node row because `{{ pbs_box_ip }}` arrived unresolved, `unraid` is **#106** (the page drew it with no VMID), `haos` is **`haos13.1`**, `pi-node` **#140 .66.60** was missing from the page entirely, and infra no longer carries the Gree `:1813` leg |
| 2026-11-20 | **the trap this change exists for, still standing:** four doors were Caddy 502 on 2026-11-08 and this page drew all four open, because `fetch(url,{mode:'no-cors'})` cannot read a status code. The marks now come from a LAN-side dial; the browser dial is kept as the second seat and a disagreement draws a pip. No 502 was live to measure on 2026-11-20 (0 doors down), so the mark is verified against the checker's own state words, not against a live 502 |
| 2026-10-23 (page cut down) | the doors list (the only section that changed): 824×562 at 1440 / 334×1055 at 390 with **10** links and 5 section headers. `.svc-rows` is a flex COLUMN of lines (`gap: 0.22rem`): a row is 795 wide, 22 high (one line) at 1440; at 390 the same row is 305 wide, 63 high (the sentence wraps to a third line) — `overlap=0 clipped=0` at both. Legend strip 844×25 (three chips, one line). The panel's `innerText` prints **zero** raw i18n keys, English and French (`svc_desc_*`/`group_*` keys exist in both dicts, French strings still English for these 15) | the doors list (the only section that changed): 824×562 at 1440 / 334×1055 at 390 with **10** links and 5 section headers. `.svc-rows` is a flex COLUMN of lines (`gap: 0.22rem`): a row is 795 wide, 22 high (one line) at 1440; at 390 the same row is 305 wide, 63 high (the sentence wraps to a third line) — `overlap=0 clipped=0` at both. Legend strip 844×25 (three chips, one line). The panel's `innerText` prints **zero** raw i18n keys, English and French (`svc_desc_*`/`group_*` keys exist in both dicts, French strings still English for these 15) |

## What no check can see

- A card that is wrong **only in the browser** (a hook that fails, a chart that draws nothing) is
  invisible to every command in this repo: `make verify` probes the box legs and greps the served
  bundle. That needs DevTools, which no command here produces.
- **The 2026-10-25 panel has no measurement at all.** `src/pages/Boxes.tsx` is HTML boxes nested
  in boxes, sized by CSS (`App.css` `.box`/`.door`), and no browser ran in that pass: nothing in
  this file says how the icon rows sit inside their boxes at 390 or 1440, whether a row wraps
  into a box's neighbour, or whether pve1's box is too tall on a phone. The numbers behind it are
  arithmetic — a 1.9rem door square with a transparent 2px ring and a 1.25rem glyph, a `.doors`
  row that wraps, boxes that flex and grow with their content. Measure it, and say so here,
  before calling the layout done.
- Cross-origin status: an icon's border cannot read a status code, so "no border" is not proof of
  authorisation; and a door that 302s to plain http (`unraid` → `http://…/Main`) draws red because
  the browser refused the redirect, not because the door is dead.
- LAN-only names (`dns1`, `home`, `frigate`, `pbs`) draw red when the page is opened from
  off the net: the public zone carries no record for any of them (all NXDOMAIN over DNS-over-HTTPS)
  and no wildcard.

## Why

- **2026-10-19** PBS answers HTTPS only, so the quad was never a link — `was git:memory/decisions.md#L1684`
- **2026-10-22** the first browser measurement of this app came from the CDP harness, and the check is geometry rather than a look: this model has no image input. The harness is gitignored (`.probe/`), and no commit carries these numbers — re-measure with it before acting on a layout claim
