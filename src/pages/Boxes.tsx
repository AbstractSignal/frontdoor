import { useEffect, useState } from 'react';
import { ADDR, CADDY } from '../wires';
import { iconFile } from '../icons';
import { NODE, OFF, PVE, RESOURCES } from '../pve1';
import { CLUSTER, FOREIGN, INSTALLS, RETIRED, TIP } from '../boxes';

/* Where a service runs, and whether it answers now — nested boxes, icons, and
   nothing else (2026-10-25, at the owner's request: "a box for pve1, a box for
   services inside it, clickable icons for each service, same for the other boxes").

   A box is a physical box. A box inside a box is a thing that lives in it. An
   icon inside a box is a door of Caddy's own stanza list, and the icon IS the
   link: clicking it dials the service. There is no list of names next to the
   drawing, no cable picture, no section headers: the owner's question is "which
   box do I have to walk to", and the page answers it by putting the door in the
   box.

     pve1 · 192.168.66.2          [PVE]
       #110 infra                 [Technitium]
       #120 services              [this page] [NVR] [PBS]
       #101 haos                  [Home Assistant]
       unraid (its own box, no VMID here) [Unraid]
     pve2 · 192.168.66.3          (no door)
       #100 docker-arr            (no door)
       #101 immich                (no door)
       #102 dev-box               (no door)
       #120 ai-node0              [llama.cpp]
       #130 ai-node1              [Strata]
       #110 docker-node1 RETIRED [Paperless] [Kaneo] [Mealie] (all three dark)
     router, switch, ap           each with its one door

   The box an icon sits in is the LEASE's owner (src/pve1.ts, src/boxes.ts),
   never a stanza's `group`, and the icon's target is the stanza's own host — a
   guest's lease and the quad you dial are not the same fact, so `dns1`'s icon
   sits in the infra box and dials `192.168.66.6:8384`.

   The border around an icon is this page's own probe, dialled on this load
   (`fetch(url,{mode:'no-cors'})`): something answered, or nothing did, NOT a
   status code.

     answered  → no border: the door is open, and nothing is claimed about log-in
     refused   → RED border: the status mark the owner asked for
     slow      → amber dashes, breathing: the probe had not come back, which is
                 not a dead door, so it must not borrow the dead door's mark
     dimmed    → the stanza is gated `enabled: false`: there is no door now, and
                 nothing links
     grey      → still probing

   What `answered` cannot mean (measured 2026-11-08): Caddy answers `502` when its
   backend box is gone, and an opaque `no-cors` fetch cannot read a status — so a
   green mark here means "the front door answered", never "the app answered". The
   four doors that were 502 that day (papers, kaneo, mealie on the destroyed CT110,
   and `ai` while its box was stopped) all rendered unbordered. The only mark that
   carries the repo's own knowledge is `dimmed`, which is why a retired box's stanzas
   stay declared with `enabled: false` instead of being deleted.

   The icon's name is the link's accessible name and its tooltip (`TIP` in src/
   boxes.ts over the `name_*` keys both dicts already carry); the glyphs
   themselves (src/icons.ts, the vendored selfh.st pack) are decoration and say
   no name, no address, no state. A door with no glyph gets a ring drawn by the
   page rather than a guessed logo — the AP is that case, because this repo has
   not measured what its UI is.

   What the page no longer draws: the cables (the `RUNS` list as an SVG) and the
   VLAN hues. The owner asked twice for simpler, and a reader of this page walks
   to a box, not along a run; the runs are still src/pve1.ts for anything that
   wants them, and `docs/network/topology.md` is their prose. */

const PROBE_MS = 6000;

/* One dial, one answer: the request completes (an opaque body is all
   cross-origin allows) or the network refuses it. Every door is https — Caddy
   terminates TLS at :443 — so no mixed-content block is in play. */
const dial = (host: string, ms: number = PROBE_MS): Promise<string> =>
  new Promise((resolve) => {
    let left = false;
    const lose = (why: string) => {
      if (left) return;
      left = true;
      resolve(why);
    };
    const timer = setTimeout(() => lose('slow'), ms);
    const request = fetch(`https://${host}/`, { mode: 'no-cors' });
    request.then(
      () => {
        clearTimeout(timer);
        lose('answered');
      },
      () => {
        clearTimeout(timer);
        lose('refused');
      },
    );
  });

type Door = { name: string; host: string; enabled: boolean };

export default function Boxes({ t }: { t: (k: string, vars?: Record<string, string>) => string }) {
  const [live, setLive] = useState<{ at: string; s: Record<string, string> }>({ at: '', s: {} });
  useEffect(() => {
    const started = new Date();
    const at = started.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const q = CADDY.filter((c) => c.enabled);
    setLive({ at, s: {} });
    /* one state per door as it lands, so a slow LAN shows partial readings
       instead of a panel that flips once at six seconds. */
    for (const c of q) {
      void dial(c.host).then((s) => setLive((prev) => ({ ...prev, s: { ...prev.s, [c.host]: s } })));
    }
  }, []);

  /* the doors a set of leases fronts: derived from the stanza's backend quad, so
     a retargeted stanza moves its icon and a new guest needs no edit here. */
  const doorsOn = (leases: string[]) => CADDY.filter((c) => c.quad && leases.includes(c.quad));
  /* A door whose quad matches no lease anywhere: it still gets drawn, in pve1's
     row, named by its quad — a hidden door is a door the reader cannot find. */
  const unplaced = CADDY.filter((c) => !c.quad || !CLUSTER[c.quad]);

  const oneDoor = (c: Door) => {
    const state = !c.enabled ? 'off' : live.s[c.host] ?? 'none';
    const tip = t(TIP[c.name] ?? c.name);
    const file = iconFile(c.name);
    const glyph = file === '' ? (
      <span className="b-dot" aria-hidden="true" />
    ) : (
      <img className="b-icon" src={`/assets/icons/${file}`} alt="" />
    );
    return c.enabled ? (
      <a key={c.host} className={`door ${state}`} href={`https://${c.host}`} title={tip} aria-label={tip}>
        {glyph}
      </a>
    ) : (
      <span key={c.host} className={`door ${state} b-off`} title={`${tip} — ${t('door_off')}`}>
        {glyph}
      </span>
    );
  };

  /* a physical box, and the boxes inside it. `label` is the box's own identity
     (its name and, where the page knows it, its quad or its VMID); the doors are
     its, and nothing else is drawn. */
  const box = (key: string, label: string, list: Door[], guests: { id: string; label: string; list: Door[] }[]) => (
    <div key={key} className="box">
      <span className="box-label">{label}</span>
      {list.length > 0 && (
        <span className="doors">
          {list.map((c) => oneDoor(c))}
        </span>
      )}
      {guests.length > 0 && (
        <div className="guests">
          {guests.map((g) => (
            <div key={g.id} className="box-guest">
              <span className="box-label">{g.label}</span>
              {g.list.length > 0 && (
                <span className="doors">
                  {g.list.map((c) => oneDoor(c))}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const gear = OFF.map((o) => box(o.key, `${o.key} ${ADDR[o.key]}`, doorsOn([ADDR[o.key]]), []));

  const pve1 = box(
    'pve1',
    `pve1 ${PVE.version} ${ADDR.proxmox}`,
    [...doorsOn(NODE.leases), ...unplaced],
    RESOURCES.map((r) => ({
      id: r.name,
      label: `${r.vmid === null ? t('vmid_none') : `#${r.vmid}`} ${r.name}`,
      list: doorsOn(r.leases),
    })),
  );

  /* The node's own row carries only the doors on the node's OWN lease: a guest
     door drawn here would appear twice, once per guest box below it. */
  const pve2Box = box(
    'pve2',
    `pve2 ${INSTALLS[1].version} ${INSTALLS[1].quad}`,
    doorsOn([INSTALLS[1].quad]),
    [...FOREIGN.map((f) => ({
      id: f.key,
      label: `#pve2 ${f.vmid} ${f.key}`,
      list: doorsOn([f.lease]),
    })),
    /* A guest that no longer exists, drawn so the dark doors on its old lease are not orphaned
       into pve1's row: a declared stanza is a row, and the lease it names belongs here. */
    ...RETIRED.map((r) => ({
      id: r.key,
      label: `#pve2 ${r.vmid} ${r.key} ${t('retired_box')}`,
      list: doorsOn([r.lease]),
    }))],
  );

  return (
    <div className="boxes" role="figure" aria-label="which box each service answers from">
      <h2 className="panel-title">
        {t('boxes_title')}
        <span className="panel-live">{t('services_live', { at: live.at || '—' })}</span>
      </h2>

      <div className="box-lan">
        <div className="box-rack">{gear}</div>
        <div className="box-rack">
          {pve1}
          {pve2Box}
        </div>
      </div>

      <div className="box-legend">
        {(['refused', 'slow'] as const).map((st) => (
          <span key={st} className={`legend-item ${st}`}>
            <span className={`chip ${st}`} aria-hidden="true" />
            {t(`status_${st}`)}
          </span>
        ))}
      </div>

      <details className="panel-details">
        <summary>{t('services_note_title')}</summary>
        <p className="panel-note">{t('services_note')}</p>
      </details>
      <p className="box-foot">{t('boxes_note')}</p>
      <p className="box-credit">{t('icons_credit')}</p>
    </div>
  );
}
