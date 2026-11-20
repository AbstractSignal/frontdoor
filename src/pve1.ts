/* pve1, as PVE states it — the ownership side of the LAN's facts.

   Two questions, two files, and the app keeps them apart on purpose:
     src/wires.ts  what a NAME resolves to (the quads you DIAL, the names Caddy
                   fronts), built from group_vars so the bundle cannot drift
                   from the proxy.
     src/pve1.ts   what the NODE reports: VMID, resource kind, which VLAN link
                   a guest carries, which lease that link got, what answers in
                   it. Read off the node (PVE 9.2.31) and measured in
                   docs/proxmox/node.md + docs/network/topology.md.

   A guest's lease and the quad you dial are NOT the same fact, and the old
   hero drew one number for both:
     - VMID 110 answers its own VLAN66 lease (.66.6) AND a VLAN69 lease
       (.69.22) — two links, two leases, one box.
     - PBS and Frigate were both ports INSIDE the services box until 2026-11-18; PBS is
       a BOX of its own now (CT135, 192.168.66.61) and Frigate is still a port.
       A door's backend quad is the fact that says which, and it is the proxy's, not
       this file's.
   So this file answers "which box is this, and what is on it"; wires.ts
   answers "how do I reach it".

   Nothing here is live, and the map says so: this node's API auth is a
   node-side fact (docs/proxmox/node.md — api2 tokens come out 403 on this
   build), and the bundle is baked at build time by bin/dashboard-build.sh.
   `measured` is the day the node said what is written here; a state that
   moved is a data change, not a stale picture pretending to be current. */

import { ADDR } from './wires';

type Kind = 'lxc' | 'vm' | 'node';
type Owner = 'repo' | 'foreign';
type State = 'running' | 'stopped' | 'untested';
type Pool = '66' | '69' | 'both';
type Role = 'door' | 'here';

type Port = { p: string; k: string; site?: string };

export interface Resource {
  vmid: number | null; // null: the node hosts it but this repo does not model it
  kind: Kind;
  name: string;
  pool: Pool;
  leases: string[];
  vlans: string[]; // parallel to leases: the VLAN link each lease came in on
  owner: Owner;
  state: State;
  ports: Port[]; // the ports that answer, with what they are
  note: string; // i18n key: the one sentence this card carries
  role?: Role; // the two places a reader looks for first
}

export interface Fact {
  key: string;
  pool: Pool | 'off'; // 'off': the .65 family — another subnet, no VLAN hue to claim
  vlan: string; // the VLAN link the quad lives on; '' when no VLAN claim is checkable
  note: string;
}

/* The node itself. `addr` is the node's own VLAN66 lease on vmbr0, not a
   guest's; a node has no VMID, and the map prints that absence rather than
   inventing a number. */
export const NODE: Resource = {
  vmid: null,
  kind: 'node',
  name: 'proxmox',
  pool: 'both',
  leases: [ADDR.proxmox],
  vlans: ['66'],
  owner: 'repo',
  state: 'running',
  ports: [{ p: ':8006', k: 'ui_pve' }],
  note: 'note_proxmox',
};

/* The node, as PVE states it: version, and the day this file's facts were read
   off it. A node has no VMID, and this file does not carry the node's repoid —
   a reader of a LAN page does not dial a repoid. */
export const PVE = { name: 'pve1', version: '9.2.31', measured: '2026-11-20' };

/* VLAN pools on vmbr0 — the LAN's two halves, and the hue every card is
   bordered in (ansible/group_vars/router `vlan_pools` + `zones` is the
   router's copy of the same fact). */
export const POOLS: { id: string; k: string }[] = [
  { id: '66', k: 'pool_66' },
  { id: '69', k: 'pool_69' },
];

/* Every resource the node reports, in VMID order — the order PVE's own list
   prints, so a new guest lands where the node would put it. VMID 100 (frigate,
   the guide box), 102 (docker-critical) and 105 (pbs) are gone: the owner
   deleted those three on the node on 2026-10-22 by hand, so the list skips
   those slots rather than printing a guest that is no longer there. What is
   left is what the node said on 2026-10-18 — the list has not been re-read
   off the node since, and this session had no way to read it (no host alias
   `pve1` resolves here). */
/* Every resource the node reports, in VMID order — the order PVE's own list
   prints, so a new guest lands where the node would put it. Re-read off the node on
   2026-11-20 (the status read, `/cluster/resources`, infra `docs/services/updates.md`).
   Slots this list skips because the node has nothing in them: 100, 102 and 105 (the
   three guide boxes the owner deleted on 2026-10-22) and 120 — pve1's services box came
   back from an archive as **121** on 2026-11-11, and the only #120 on this LAN is pve2's
   `ai-node0`. A page that drew pve1's services box as #120 was naming pve2's GPU box. */
export const RESOURCES: Resource[] = [
  {
    vmid: 101,
    kind: 'vm',
    name: 'haos13.1',
    pool: 'both',
    leases: [ADDR.ha, '192.168.69.20'],
    vlans: ['66', '69'],
    owner: 'repo',
    state: 'running',
    ports: [{ p: ':8123', k: 'ui_ha', site: 'ha' }],
    note: 'note_ha',
  },
  {
    /* unraid HAS a VMID now (106). The page used to draw it with `vmid: null` because the
       repo modelled it as a guest it did not own; it is claimed and audited now
       (`owner: appliance` in the pve1 manifest), so a reader can name the slot. */
    vmid: 106,
    kind: 'vm',
    name: 'unraid',
    pool: '66',
    leases: [ADDR.unraid],
    vlans: ['66'],
    owner: 'repo',
    state: 'running',
    ports: [{ p: ':80', k: 'ui_unraid' }],
    note: 'note_unraid',
  },
  {
    vmid: 110,
    kind: 'lxc',
    name: 'infra',
    pool: 'both',
    leases: [ADDR.infra, '192.168.69.22'],
    vlans: ['66', '69'],
    owner: 'repo',
    state: 'running',
    /* `:1813` (the Gree leg) left this box on 2026-10-31: it runs on the ROUTER as a procd
       service now (infra `docs/services/gree.md`), so the front-door box carries the door,
       DNS and DNS console, and nothing else. */
    ports: [{ p: ':53', k: 'ui_dns' }, { p: ':443', k: 'ui_caddy' }, { p: ':8443', k: 'ui_dns_console' }],
    note: 'note_v110',
    role: 'door',
  },
  {
    vmid: 121,
    kind: 'lxc',
    name: 'services',
    pool: '66',
    leases: [ADDR.services],
    vlans: ['66'],
    owner: 'repo',
    state: 'running',
    ports: [
      { p: ':8080', k: 'ui_dashboard' },
      { p: ':5000', k: 'ui_frigate_new', site: 'frigate' },
    ],
    note: 'note_v120',
    role: 'here',
  },
  {
    /* PBS is a BOX, not a port inside another box: it moved to CT135 on 2026-11-18 (infra
       `docs/services/pbs.md`), its door proxies to .61:8007, and "is the backup server up?"
       now has one box to walk to. */
    vmid: 135,
    kind: 'lxc',
    name: 'pbs',
    pool: '66',
    leases: [ADDR.pbs],
    vlans: ['66'],
    owner: 'repo',
    state: 'running',
    ports: [{ p: ':8007', k: 'ui_pbs', site: 'pbs' }],
    note: 'note_pbs',
  },
];

/* The physical runs, now as the edges of a graph: each one names the VLAN ids
   it carries (`vlan: []` = a drop that carries no VLAN claim, which is what the
   AP's is: it lives in the .65 family, another subnet, docs/network/topology.md).
   Unraid is a VM ON this node, so it has no run of its own — that absence is the
   fact, and the graph draws the guest inside the node's box instead. */
export const RUNS: { a: string; b: string; k: string; vlan: string[] }[] = [
  { a: 'router', b: 'switch', k: 'run_uplink', vlan: ['66', '69'] },
  { a: 'switch', b: 'proxmox', k: 'run_carry6669', vlan: ['66', '69'] },
  { a: 'switch', b: 'ap', k: 'run_ap', vlan: [] },
];

/* Dials that answer on the boxes but have NO name in front of them: you can
   only reach them by quad+port, so they are the gap a Caddy stanza would close.
   The list is hand-kept because the question is "is there a UI behind this port",
   which the port chips on the cards cannot answer (`:53` is the DNS itself, and
   `:443` is the door). go2rtc's UI (:8971) is the one measured gap left: Technitium's
   console (:8443 on the infra box) got a door on 2026-10-22 — `dns1.abstractsignal.com`
   in caddy.sites — so its chip on the infra card is a link and this list no longer
   names it. `gree` (:1813) is not a gap either: it has a door, in another zone
   (src/wires.ts OTHER_ZONE, *.gree.com). */
export const UNNAMED: { quad: string; port: string; k: string; note: string }[] = [
  { quad: ADDR.services, port: ':8971', k: 'ui_go2rtc', note: 'note_go2rtc' },
];

/* The quads that answer this page but are NOT resources on the node. Off-node
   so they stay outside the node's panel: a reader asking "is this on pve1?"
   gets no wrong yes. */
export const OFF: Fact[] = [
  { key: 'router', pool: '66', vlan: '66', note: 'note_router' },
  { key: 'switch', pool: '66', vlan: '66', note: 'note_switch' },
  { key: 'ap', pool: 'off', vlan: '', note: 'note_ap' },
];

/* The Caddy names the map can print; only the ones src/wires.ts `SITES` carries
   become links (the bundle carries those values from group_vars, the rest are
   LAN facts and the dial stays the reader's). */
