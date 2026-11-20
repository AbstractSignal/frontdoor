import { useEffect, useState } from 'react';
import { ADDR, CADDY } from '../wires';
import { iconFile } from '../icons';
import { NODE, OFF, PVE, RESOURCES } from '../pve1';
import { CLUSTER, FOREIGN, INSTALLS, RETIRED, TIP } from '../boxes';
import { useStatus } from '../status';

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
       #121 services              [this page] [NVR]
       #135 pbs                   [PBS]
       #101 haos                  [Home Assistant]
       #106 unraid                [Unraid]
     pve2 · 192.168.66.3          (no door)
       #100 docker-arr            (no door)
       #101 immich                (no door)
       #102 dev-box               (no door)
       #120 ai-node0              [llama.cpp]      stopped, on purpose
       #130 ai-node1              [Strata]
       #140 pi-node               (no door)
       #110 docker-node1 RETIRED [Paperless] [Kaneo] [Mealie] (all three dark)
     router, switch, ap           each with its one door

   THE STATE A MARK CLAIMS (changed 2026-11-20, at the owner's request that the page
   "reflect all service states"). Each door's mark now comes from a dial taken inside
   the LAN by the updates checker, which is the only seat that can read a status code:

     answering    200            → no border: the door answered
     redirect     301/302/307    → no border + a corner tick: the door answered and points elsewhere
     auth         401/403        → dotted border: the door answers behind a login, which says
                                   something about the front door and nothing about the service
     no_route     404            → no border + a corner tick: it answered, there is no page here
     backend_down 502/503/504    → THICK RED border: the front door is up and its backend is not.
                                   This is the mark the whole change exists to draw: on 2026-11-08
                                   four doors were Caddy 502 and the page drew all four open, because
                                   `fetch(url,{mode:'no-cors'})` cannot read a status code at all.
     refused      no socket      → RED border: nothing listens at that address
     timeout / no_name / error   → amber dashes: the dial did not get an answer, which is not the
                                   same fact as a refusal and must not borrow its mark
     disabled     enabled:false  → dimmed, no link: there is no door declared for this now

   The browser's own probe is KEPT, because it measures a different thing: this seat. A door can
   answer in the LAN and be unreachable from where you are sitting, and a name only the LAN's own
   nameserver knows reads as dead from off the net. When the two disagree the icon gets a small
   SEAT pip and the tooltip names both readings, because smoothing a disagreement into one mark is
   how a dead service gets drawn open. While the LAN reading has not arrived (or the checker is
   down) the page falls back to its own dial and says so on the panel — a page drawing marks it
   cannot justify is the failure mode this change was asked to end.

   A box's GUESTS and the CONTAINERS inside it are drawn from the same reading, because the door
   mark cannot answer them: `#120 ai-node0` is stopped ON PURPOSE and a red mark would be a lie
   about a decision, while a container that EXITED is invisible to any door. Both come from the
   node itself (`/cluster/resources`) and from `docker ps -a` on the box, so "running", "stopped"
   and "exited" are the node's words and Docker's words, not this page's guess.

   The icon's name is the link's accessible name and its tooltip (`TIP` in src/
   boxes.ts over the `name_*` keys both dicts already carry); the glyphs
   themselves (src/icons.ts, the vendored selfh.st pack) are decoration and say
   no name, no address, no state. A door with no glyph gets a ring drawn by the
   page rather than a guessed logo — the AP is that case, because this repo has
   not measured what its UI is.

   What the page no longer draws: the cables (the `RUNS` list as an SVG) and the VLAN hues. The
   owner asked twice for simpler, and a reader of this page walks to a box, not along a run; the
   runs are still src/pve1.ts for anything that wants them, and `docs/network/topology.md` is their
   prose. */

const PROBE_MS = 6000;

/* One dial from THIS SEAT, one answer: the request completes (an opaque body is all
   cross-origin allows) or the network refuses it. Every door is https — Caddy
   terminates TLS at :443 — so no mixed-content block is in play.
   This is NOT the source of a door's mark any more (see the header); it is the seat's
   own reading, kept so a disagreement between seats is visible. */
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
type ContainerMark = { name: string; state: string };

/* The classes a mark can wear, and the words that explain it. A LAN state and a seat state share
   this table so a tooltip never has to invent its own vocabulary. */
const STATE_KEYS = [
  'answering',
  'redirect',
  'auth',
  'no_route',
  'backend_down',
  'refused',
  'timeout',
  'no_name',
  'error',
  'disabled',
];

export default function Boxes({ t }: { t: (k: string, vars?: Record<string, string>) => string }) {
  const status = useStatus();
  const { report, doors: lan, guests, containers, nodes, at, every, error } = status;

  /* the seat's own readings, one per door as they land, so a slow LAN shows partial readings
     instead of a panel that flips once at six seconds. */
  const [seat, setSeat] = useState<{ at: string; s: Record<string, string> }>({ at: '', s: {} });
  useEffect(() => {
    const started = new Date();
    const stamp = started.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setSeat({ at: stamp, s: {} });
    for (const c of CADDY.filter((c) => c.enabled)) {
      void dial(c.host).then((s) => setSeat((prev) => ({ ...prev, s: { ...prev.s, [c.host]: s } })));
    }
  }, []);

  /* the doors a set of leases fronts: derived from the stanza's backend quad, so
     a retargeted stanza moves its icon and a new guest needs no edit here. */
  const doorsOn = (leases: string[]) => CADDY.filter((c) => c.quad && leases.includes(c.quad));
  /* A door whose quad matches no lease anywhere: it still gets drawn, in pve1's
     row, named by its quad — a hidden door is a door the reader cannot find. */
  const unplaced = CADDY.filter((c) => !c.quad || !CLUSTER[c.quad]);

  const oneDoor = (c: Door) => {
    const read = lan[c.host];
    const mine = seat.s[c.host];
    /* the mark: the LAN reading when there is one, this seat's dial only as the fallback. */
    const state = !c.enabled ? 'disabled' : read ? read.state : mine ? (mine === 'answered' ? 'answering' : mine === 'refused' ? 'refused' : 'timeout') : 'error';
    const word = STATE_KEYS.includes(state) ? t(`state_${state}`) : t('state_unknown');
    const code = read && read.code ? ` ${read.code}` : '';
    /* two seats, two facts: only claim a disagreement when the LAN dial reached the door at all. */
    const disagrees =
      !!read && !!mine &&
      !['disabled', 'refused', 'timeout', 'no_name'].includes(read.state) &&
      (read.state === 'answering' ? mine !== 'answered' : mine === 'refused');
    const tip = [
      t(TIP[c.name] ?? c.name),
      `${word}${code}`,
      read ? t('mark_lan', { at: at || '—' }) : t('mark_seat', { at: seat.at || '—' }),
      disagrees ? t('seat_diff', { s: mine === 'answered' ? t('seat_answered') : t('seat_refused') }) : '',
      read && read.note ? read.note : '',
    ]
      .filter(Boolean)
      .join(' — ');

    const glyph = iconFile(c.name) === '' ? (
      <span className="b-dot" aria-hidden="true" />
    ) : (
      <img className="b-icon" src={`/assets/icons/${iconFile(c.name)}`} alt="" />
    );

    const mark = (
      <>
        {glyph}
        {(state === 'redirect' || state === 'no_route') && <i className="tick" aria-hidden="true" />}
        {disagrees && <i className="seat" aria-hidden="true" />}
      </>
    );

    return c.enabled ? (
      <a key={c.host} className={`door ${state}`} href={`https://${c.host}`} title={tip} aria-label={tip}>
        {mark}
      </a>
    ) : (
      <span key={c.host} className={`door ${state} b-off`} title={`${tip} — ${t('door_off')}`}>
        {mark}
      </span>
    );
  };

  /* a guest's state, in the node's own words. A stopped guest is NOT a fault here: `ai-node0` and
     `dev-box` are stopped on purpose, so the page says the word and lets the dimming carry the
     difference. An unreported guest is the honest case of a row the node has no answer for (a
     retired box). Any state word the node uses that this dict has no key for is printed as-is —
     the node's word is the fact, and inventing a translation for it would hide it. */
  const guestState = (install: string, vmid: number | null) => {
    const g = vmid === null ? undefined : guests[`${install}/${vmid}`];
    if (!g) return { state: 'unreported', label: t('guest_unreported') };
    const known = g.state === 'running' || g.state === 'stopped';
    return { state: g.state, label: known ? t(`guest_${g.state}`) : g.state };
  };

  /* a physical box, and the boxes inside it. `label` is the box's own identity
     (its name and, where the page knows it, its quad or its VMID); the doors are
     its, and nothing else is drawn. */
  const box = (
    key: string,
    label: string,
    list: Door[],
    guestsIn: { id: string; label: string; list: Door[]; state: string; stateLabel: string; containers: ContainerMark[] }[],
  ) => (
    <div key={key} className="box">
      <span className="box-label">{label}</span>
      {list.length > 0 && (
        <span className="doors">
          {list.map((c) => oneDoor(c))}
        </span>
      )}
      {guestsIn.length > 0 && (
        <div className="guests">
          {guestsIn.map((g) => (
            <div key={g.id} className={`box-guest ${g.state}`}>
              <span className="box-label">{g.label}</span>
              <span className={`g-state ${g.state}`} title={g.stateLabel}>
                {g.stateLabel}
              </span>
              {g.list.length > 0 && (
                <span className="doors">
                  {g.list.map((c) => oneDoor(c))}
                </span>
              )}
              {g.containers.length > 0 && (
                <span className="containers" title={t('containers_title')}>
                  {g.containers.map((c) => (
                    <span key={c.name} className={`container ${c.state}`}>
                      {c.name}
                    </span>
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  /* containers are named by the box they run in, which is the guest's own name on the node. Docker's
     own state word rides along in the class, because `exited` is the fact a door cannot show. */
  const containersOf = (name: string): ContainerMark[] =>
    (containers[name] ?? []).map((c) => ({ name: c.name, state: c.state }));

  const gear = OFF.map((o) => box(o.key, `${o.key} ${ADDR[o.key]}`, doorsOn([ADDR[o.key]]), []));

  const pve1 = box(
    'pve1',
    `pve1 ${nodes.pve1 ? `${nodes.pve1.version} ${nodes.pve1.state}` : `${PVE.version}`} ${ADDR.proxmox}`,
    [...doorsOn(NODE.leases), ...unplaced],
    RESOURCES.map((r) => {
      const s = guestState('pve1', r.vmid);
      return {
        id: r.name,
        label: `${r.vmid === null ? t('vmid_none') : `#${r.vmid}`} ${r.name}`,
        list: doorsOn(r.leases),
        state: s.state,
        stateLabel: s.label,
        containers: containersOf(r.name),
      };
    }),
  );

  /* The node's own row carries only the doors on the node's OWN lease: a guest
     door drawn here would appear twice, once per guest box below it. */
  const pve2Box = box(
    'pve2',
    `pve2 ${nodes.pve2 ? `${nodes.pve2.version} ${nodes.pve2.state}` : `${INSTALLS[1].version}`} ${INSTALLS[1].quad}`,
    doorsOn([INSTALLS[1].quad]),
    [...FOREIGN.map((f) => {
      const s = guestState('pve2', f.vmid);
      return {
        id: f.key,
        label: `#pve2 ${f.vmid} ${f.key}`,
        list: doorsOn([f.lease]),
        state: s.state,
        stateLabel: s.label,
        containers: containersOf(f.key),
      };
    }),
    /* A guest that no longer exists, drawn so the dark doors on its old lease are not orphaned
       into pve1's row: a declared stanza is a row, and the lease it names belongs here. The status
       read cannot report it, and `unreported` is the honest mark for that. */
    ...RETIRED.map((r) => ({
      id: r.key,
      label: `#pve2 ${r.vmid} ${r.key} ${t('retired_box')}`,
      list: doorsOn([r.lease]),
      state: 'unreported',
      stateLabel: t('guest_unreported'),
      containers: [] as ContainerMark[],
    }))],
  );

  return (
    <div className="boxes" role="figure" aria-label="which box each service answers from">
      <h2 className="panel-title">
        {t('boxes_title')}
        <span className="panel-live">
          {report
            ? t('services_lan_live', { at, every: String(every) })
            : t('services_seat_live', { at: seat.at || '—' })}
          <button className="read-now" onClick={status.readNow} title={t('read_now')}>
            {t('read_now')}
          </button>
        </span>
      </h2>

      {error && (
        <p className="status-error" role="status">
          {t('status_error', { e: error })}
        </p>
      )}

      <div className="box-lan">
        <div className="box-rack">{gear}</div>
        <div className="box-rack">
          {pve1}
          {pve2Box}
        </div>
      </div>

      <div className="box-legend">
        {(['backend_down', 'refused', 'timeout', 'auth', 'disabled'] as const).map((st) => (
          <span key={st} className={`legend-item ${st}`}>
            <span className={`chip ${st}`} aria-hidden="true" />
            {t(`state_${st}`)}
          </span>
        ))}
        <span className="legend-item seat">
          <span className="chip seat" aria-hidden="true" />
          {t('seat_legend')}
        </span>
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
