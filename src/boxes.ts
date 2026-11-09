/* Which physical box a door sits in — the one fact the Homelab page is drawn
   around, and the reason it has no hand-listed service anywhere.

   The unit here is "which box do I have to walk to". A door answers it on its
   own: the stanza's backend quad (src/wires.ts `quad`) is a lease, and every
   lease this LAN has belongs to exactly one physical box. The mapping is read
   off the two installs, never restated:
     - pve1's leases are src/pve1.ts (`NODE`, `RESOURCES`): the node and its
       guests, so the infra and services LXCs and the haos/unraid VMs are boxes
       INSIDE pve1's box, which is what the owner asked for on 2026-10-24.
     - the LAN's own devices (`OFF`) are the network-gear cluster: the router,
       the switch, the AP.
     - pve2 is a second Proxmox install on the same LAN, measured on the node
       itself 2026-10-24 — see ansible/group_vars/pve2/main.yml and
       docs/network/topology.md. This repo owns that node (terraform/pve2/,
       group_vars/pve2/) and owns TWO of its guests (120 `ai-node0` .66.58, 130
       `ai-node1` .66.59 — `pve_managed_vmids` there is [120, 130] since 2026-11-08);
       100 `docker-arr` (.66.53), 101 `immich` (.66.30) and 102 `dev-box` stay
       foreign, with no Caddy stanza of this repo in front of them. Both owned
       guests carry doors (`ai`, `strata`) whose backends cross nodes — Caddy sits
       on pve1's infra box — but the box a door sits in is the lease's owner, so
       those icons are drawn inside pve2's box, not pve1's.

   Two traps the mapping has to keep apart, both measured:
     - VMID ids collide across installs. pve1's 101 is `haos`; pve2's 101 is
       `immich`. A bare `#101` on a LAN page is a wrong claim, so a guest's label
       carries the install it belongs to.
     - a guest's lease and the quad you DIAL are not the same fact (src/pve1.ts
       says it for VMID 110); the box is the lease's owner, the door is the quad's
       front, and this file only ever answers the first.

   The page draws these as NESTED boxes (a pve2 box, a services box inside pve1,
   icons inside the services box), so nothing here carries coordinates: the order
   of the boxes is `CLUSTERS` below, and their size is CSS. The cables are not
   drawn any more — the owner asked for the boxes and their icons, and the runs
   this LAN has are still src/pve1.ts `RUNS` for anything that wants them
   (`docs/network/topology.md` is the prose of the same facts). */

import { NODE, OFF, RESOURCES } from './pve1';
import { ADDR } from './wires';

/* The Proxmox installs on this LAN. `quad` is the install's own lease on its own
   vmbr0, not a guest's; `name` is the repo's module-dir name and `node` is what
   PVE advertises for it (`pvesh get /nodes`), which is not the same string on
   pve2 and is why 10-node-prep.yml asserts the two agree. */
export const INSTALLS: { key: string; name: string; node: string; version: string; quad: string; measured: string }[] = [
  { key: 'pve1', name: 'pve1', node: 'pve', version: '8.4.19', quad: ADDR.proxmox, measured: '2026-10-18' },
  { key: 'pve2', name: 'pve2', node: 'proxmox2', version: '9.2.2', quad: '192.168.66.3', measured: '2026-10-24' },
];

/* pve2's guests that still EXIST, as that node reported them (`pct list`/`qm list`
   over its own ssh target, and `bin/tofu.sh pve2 output` for the two this repo owns).
   `dev-box` is a VM with no VLAN66 lease of its own to name, so its lease is empty
   rather than invented. The leases that DO name are router DHCP pins
   (ansible/group_vars/router/main.yml): ai-node0 C0:FF:F3 -> .58, ai-node1
   C0:FF:F4 -> .59 — the same quads the `ai` and `strata` Caddy backends dial. */
export const FOREIGN: { key: string; vmid: number; kind: 'lxc' | 'vm'; lease: string }[] = [
  { key: 'docker-arr', vmid: 100, kind: 'lxc', lease: '192.168.66.53' },
  { key: 'immich', vmid: 101, kind: 'lxc', lease: '192.168.66.30' },
  { key: 'dev-box', vmid: 102, kind: 'vm', lease: '' },
  { key: 'ai-node0', vmid: 120, kind: 'lxc', lease: '192.168.66.58' },
  { key: 'ai-node1', vmid: 130, kind: 'lxc', lease: '192.168.66.59' },
];

/* A guest that is GONE but whose doors are still declared. The doors stay rows
   (src/wires.ts keeps a disabled stanza visible: "no door now" is a fact a reader
   should see), so their quad still needs a box to be drawn in — and it is the box
   that held the guest, not the box Caddy happens to run on. Drawn as a RETIRED row,
   never as a live guest: CT110 `docker-node1` was destroyed on 2026-11-08 and its
   MAC (C0:FF:F1) and lease (.56) are free and deliberately unused
   (docs/proxmox/lxc/retire.md, docs/network/router/dhcp-pins.md). */
export const RETIRED: { key: string; vmid: number; lease: string; install: 'pve1' | 'pve2' }[] = [
  { key: 'docker-node1', vmid: 110, lease: '192.168.66.56', install: 'pve2' },
];

/* The cluster the page draws a box in, keyed by the QUAD so a door finds its way
   in on the one fact its stanza carries. Built from the leases the installs and
   their guests report, so a retargeted stanza moves its icon and a new guest
   under pve1 needs no edit here. */
export const CLUSTER: Record<string, 'gear' | 'pve1' | 'pve2'> = (() => {
  const of: Record<string, 'gear' | 'pve1' | 'pve2'> = {};
  for (const o of OFF) of[ADDR[o.key]] = 'gear';
  of[NODE.leases[0]] = 'pve1';
  for (const r of RESOURCES) for (const l of r.leases) of[l] = 'pve1';
  for (const i of INSTALLS) if (i.key === 'pve2') of[i.quad] = 'pve2';
  for (const f of FOREIGN) if (f.lease) of[f.lease] = 'pve2';
  for (const r of RETIRED) if (r.lease) of[r.lease] = r.install;
  return of;
})();

/* A door whose quad matches nothing: the page keeps it, puts it in the pve1 box,
   and names it with its quad. A door the page cannot place is still a door the
   reader can click; hiding it is the failure mode src/wires.ts warns about for
   sections. */

/* The tooltip an icon answers with, in the same `ui_*` words the climate and the
   node cards already use, so a service is named once across the app. Keyed by
   door name; an unlisted door falls back to its own name, which is derived, so a
   new stanza still gets an honest tooltip without an edit here. */
export const TIP: Record<string, string> = {
  pve1: 'name_pve1',
  router: 'name_router',
  sw1: 'name_sw',
  ap1: 'name_ap',
  unraid: 'name_unraid',
  dns1: 'ui_dns_console',
  home: 'name_home',
  ha: 'name_ha',
  frigate: 'name_frigate',
  pbs: 'name_pbs',
  papers: 'name_papers',
  kaneo: 'name_kaneo',
  mealie: 'name_mealie',
  ai: 'name_ai',
  strata: 'name_strata',
};

/* The clusters, in the order the page reads them (gear first, then the two
   installs): stated in src/pages/Boxes.tsx, which is where the boxes live. */
