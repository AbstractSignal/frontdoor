/* One place for the dotted quads, because they are facts about the network
   this app runs on, not strings to decorate (docs/network/topology.md keeps the same
   facts). Any page that shows an address dials this list, so a box moving
   address is one edit and not a hunt through the pages.

   PBS and Frigate ARE keys here even though neither is a box: the map draws
   one point per key, and both are things you dial (:8007 and :5000 inside the
   services box). Pages that show them build `${ADDR.pbs}:8007` and `${ADDR.frigate}:5000`
   and say which side of the box each one is - the quad names the box, the port
   names the thing. */

export const ADDR: Record<string, string> = {
  router: '192.168.66.1',
  switch: '192.168.65.5',
  ap: '192.168.65.4',
  proxmox: '192.168.66.2',
  unraid: '192.168.66.10',
  infra: '192.168.66.6',
  services: '192.168.66.12',
  ha: '192.168.66.20',
  /* Frigate is a port INSIDE the services box. PBS is not, and has not been since 2026-11-18:
     it is its own container, **CT135**, at its own lease (.61), with its own door. Both still
     carry a key here because the map draws one point per key and both are things you dial
     (:5000 and :8007) — and while PBS shared the services box, a PBS failure and a frigate
     failure looked identical from a door list, which is the reason this file exists at all.
     The unit of this list is "can I dial this?", not "which LXC owns this lease"
     — infra/services are the PVE-ownership fact, kept in the node's `pve_managed_vmids`,
     and this page is not that question. */
  frigate: '192.168.66.12',
  pbs: '192.168.66.61',
  /* pve2's two GPU boxes this repo's Caddy dials across nodes: llama.cpp on ai-node0 and
     Strata on ai-node1. Their quads are the router DHCP pins (ansible/group_vars/router/main.yml:
     C0:FF:F3 -> .58, C0:FF:F4 -> .59) and the same values terraform/pve2 reports as
     `ai_node0_ipv4` / `ai_node1_ipv4`; the backends are written with the `pve2_*_ip` variables
     because those boxes are DHCP, and this list is where the app fills them.
     `dockerNode1` (.56) was here until 2026-11-08: its box is destroyed, its three backends are
     literals in group_vars now, and the retired lease lives in src/boxes.ts RETIRED, where it names
     a box rather than a host to dial. */
  aiNode0: '192.168.66.58',
  aiNode1: '192.168.66.59',
};

/* The boxes with a name Caddy fronts, so the rows link the name instead of
   printing a quad. Built from group_vars' `dashboard.ha_public_site`,
   `dashboard.frigate_public_site` and `pbs_public_site` by bin/dashboard-build.sh,
   so the bundle and the proxy cannot drift apart. Fronted does NOT mean
   resolvable from the internet: measured off-net (DNS-over-HTTPS), `home`,
   `frigate` and `pbs` are all NXDOMAIN — the public zone carries no record for
   any of them and no wildcard, so it is the LAN's own nameserver that makes the
   names work at all. "Reachable" here means "reachable from inside the network",
   and that is still the whole reason the names exist: a name needs no port and no
   certificate exception, which PBS's quad does (`:8007`, HTTPS only, on a
   certificate for a bootstrap name that matches nothing). `services` is the box
   this page runs on; `gree` is served by the same Caddy container, but under a
   different zone (*.gree.com) and with no quad to show, so it is not a row. */
export const SITES: Record<string, string> = {
  ha: import.meta.env.VITE_HA_URL,
  frigate: import.meta.env.VITE_FRIGATE_URL,
  pbs: import.meta.env.VITE_PBS_URL,
};

/* The doors Caddy fronts — NOT a copy. bin/dashboard-build.sh reads the stanza
   list out of ansible/group_vars/infra_lxc/main.yml (`caddy.sites`, the very
   file the proxy's Caddyfile is rendered from) and hands it to the bundle as
   VITE_CADDY, so the rows this page prints ARE the proxy's list: a stanza added,
   retargeted or gated off with `enabled: false` moves a row without an edit here.
   A disabled stanza keeps its row, because "there is no door for this now" is
   something a reader should still see rather than a silently missing line.

   `{{ services_ip }}` and `{{ pbs_box_ip }}` arrive as placeholders and are filled from ADDR
   above: the quad is one fact in one file, and the Caddy backends are written with those
   variables for the same reason. The pve2 backends (`{{ pve2_ai_node0_ip }}`, `{{ pve2_ai_node1_ip }}`)
   are filled the same way from ADDR.aiNode0 / ADDR.aiNode1: their values are leases Ansible reads
   at run time, so the build (bin/dashboard-build.sh, no Ansible) cannot resolve them and leaves
   them raw, and a raw placeholder would give the door a quad nothing owns — the `strata` door was
   drawn with `{{ pve2_ai_node1_ip }}` as its quad until 2026-11-08 because this list had no entry for
   the second GPU box, and the `pbs` door was placed in the SERVICES box until 2026-11-20 because
   `pbs_box_ip` had no fill here (which is also why it could not be seen as its own box). The door's own
   scheme is always https (Caddy terminates TLS at :443 with a Let's Encrypt
   cert); the UPSTREAM scheme is what the backend says, and it is printed because
   it is the thing that makes a self-signed quad answer at all. */
type CaddySite = { host: string; enabled: boolean; backend: string; group?: string };

const rawCaddy = import.meta.env.VITE_CADDY;
const rawGroups = import.meta.env.VITE_GROUPS;

export const CADDY: { name: string; host: string; enabled: boolean; quad: string; port: string; upstream: string; group: string }[] =
  !rawCaddy ? [] : (JSON.parse(rawCaddy) as CaddySite[]).map((s) => {
    const backend = s.backend
      .replace('{{ services_ip }}', ADDR.services)
      .replace('{{ pbs_box_ip }}', ADDR.pbs)
      .replace('{{ pve2_ai_node0_ip }}', ADDR.aiNode0)
      .replace('{{ pve2_ai_node1_ip }}', ADDR.aiNode1);
    const m = /^(https?):\/\/([^:/]+)(?::(\d+))?/.exec(backend);
    return {
      name: s.host.split('.')[0],
      host: s.host,
      enabled: s.enabled,
      quad: m ? m[2] : '',
      /* a backend written without a port means the scheme's own default, and that
         is what makes `http://192.168.66.10` match the card's `:80` chip. */
      port: m ? (m[3] ? `:${m[3]}` : m[1] === 'https' ? ':443' : ':80') : '',
      upstream: m ? m[1] : '',
      group: s.group ?? '',
    };
  });

/* The sections the services panel prints its groups in, in the order the deploy
   config lists them (caddy.groups in group_vars/infra_lxc/main.yml, next door to
   the stanzas that name their group). A stanza whose group is not listed, or left
   empty, goes in the LAST section: the row must never vanish, because a door the
   page hides is a door the reader cannot find. */
export const GROUPS: string[] = !rawGroups ? [] : JSON.parse(rawGroups) as string[];

export const GROUPED: { group: string; sites: typeof CADDY }[] = GROUPS.map((gr, i) => ({
  group: gr,
  sites: CADDY.filter(
    (c) => c.group === gr || (i === GROUPS.length - 1 && !GROUPS.includes(c.group)),
  ),
}));

/* The door for a quad+port a page wants to link: derived, never hand-kept, so
   "is there a name for this?" cannot disagree with the proxy. Keys look like
   `192.168.66.2:8006`; a door whose quad the app does not know (none today)
   simply never matches a port chip. */
export const DOOR: Record<string, string> = Object.fromEntries(
  CADDY.filter((c) => c.enabled && c.quad && c.port).map((c) => [`${c.quad}${c.port}`, `https://${c.host}`]),
);

/* One door per quad, for the rows that name a BOX rather than a port: a quad
   fronted by exactly one name gets that link, a quad fronted by several (the
   services box has three stanzas) gets none, since picking one would be a claim
   the data does not make. */
export const QUAD_DOOR: Record<string, string> = (() => {
  const seen: Record<string, string> = {};
  for (const c of CADDY) {
    if (!c.enabled || !c.quad) continue;
    seen[c.quad] = seen[c.quad] === undefined ? `https://${c.host}` : '';
  }
  return Object.fromEntries(Object.entries(seen).filter(([, v]) => v));
})();

/* The names Caddy has but no LAN quad to show: `gree` is served by the same
   container under another zone (*.gree.com), so it is a door with no quad here
   and never a row of the services panel. */
export const OTHER_ZONE: { zone: string; note: string } = { zone: '*.gree.com', note: 'gree' };
