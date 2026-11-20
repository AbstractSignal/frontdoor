import { useEffect, useState } from 'react';

/* The service states on the management page come from a dial taken INSIDE the LAN, not from
   this browser.

   Why the page cannot read its own doors (measured 2026-11-08): the probe this page has always
   used is `fetch(url,{mode:'no-cors'})`, and an opaque response carries no status — no-cors answers
   only "a socket opened". Four doors were Caddy **502** that day (their backend box was gone) and
   all four rendered as ANSWERED, open. A 502 is the fact a reader needs and it is not readable from
   a browser dialling another origin. So the reading is taken by the updates checker, in the services
   box, against the same doors, where a status code is a readable thing — and served to this page
   same-origin at `/updates/status` by that box's own nginx (no token, no new door, no CORS).

   That is also why the browser probe is KEPT and not deleted: it measures this seat. A door can
   answer from the LAN and be unreachable from where you are sitting (an off-net laptop, a VPN seat,
   a name the public zone does not carry). The two readings are different facts, so both are carried
   and a disagreement is SHOWN rather than smoothed over.

   The reading is a reading, not a live stream: it is re-taken every `interval_minutes` on the box
   (`updates.status.interval_minutes` in the infra repo). `generated_at` is printed on the panel for
   exactly that reason — a stale reading has to look stale. Docs: infra `docs/services/updates.md`,
   this repo's `docs/design.md`. */

export type DoorReading = {
  host: string;
  group: string;
  enabled: boolean;
  /* the checker's own words: answering | redirect | auth | no_route | backend_down |
     refused | timeout | no_name | error | disabled. `backend_down` is the one this whole
     file exists for: the front door answered, its backend did not. */
  state: string;
  code: number | null;
  note: string;
};

export type NodeReading = { install: string; node: string; version: string; state: string };
export type GuestReading = { install: string; vmid: number; name: string; kind: string; state: string };
export type ContainerReading = { box: string; name: string; state: string; status: string; image: string };

export type StatusReport = {
  generated_at: string;
  duration_seconds: number;
  interval_minutes: number;
  counts: Record<string, number>;
  doors: DoorReading[];
  nodes: NodeReading[];
  guests: GuestReading[];
  containers: ContainerReading[];
  error?: string;
};

/* The door the infra repo's nginx writes (location /updates/ -> the checker container), so this is
   the same path the Updates panel already uses. */
export const STATUS_PATH = '/updates/status';

export async function readStatus(refresh = false): Promise<StatusReport> {
  const url = refresh ? `${STATUS_PATH}/refresh` : STATUS_PATH;
  const r = await fetch(url, { method: refresh ? 'POST' : 'GET' });
  // 503 is the checker's "first read still running" line, not a failure to hide.
  if (r.status === 503) throw new Error('503');
  if (!r.ok) throw new Error(`http ${r.status}`);
  return (await r.json()) as StatusReport;
}

const clock = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' });
};

/* Poll the CACHED reading (cheap: a box-local JSON file), not a fresh dial. The box re-dials on its
   own timer; polling faster than that only shows the same reading sooner, which is what a page load
   needs. `read now` is the explicit POST, and it is a few seconds, not the minute a full updates
   check takes. */
export function useStatus() {
  const [report, setReport] = useState<StatusReport | null>(null);
  const [error, setError] = useState('');

  const take = (refresh: boolean) => {
    readStatus(refresh)
      .then((r) => {
        setReport(r);
        setError('');
      })
      .catch((e) => setError(String(e && e.message ? e.message : e)));
  };

  useEffect(() => {
    take(false);
    const timer = setInterval(() => take(false), 60000);
    return () => clearInterval(timer);
  }, []);

  const at = report ? clock(report.generated_at) : '';
  const every = report ? report.interval_minutes : 0;

  /* door host -> its LAN reading. Keyed by host because a door IS its host name here. */
  const doors: Record<string, DoorReading> = Object.fromEntries(
    (report?.doors ?? []).map((d) => [d.host, d]),
  );
  /* install + VMID -> the guest as its node states it. VMIDs COLLIDE across the two installs
     (pve1's 101 is haos, pve2's 101 is immich), so the pair is the key, never the number. */
  const guests: Record<string, GuestReading> = Object.fromEntries(
    (report?.guests ?? []).map((g) => [`${g.install}/${g.vmid}`, g]),
  );
  const containers: Record<string, ContainerReading[]> = (report?.containers ?? []).reduce(
    (acc, c) => ({ ...acc, [c.box]: [...(acc[c.box] ?? []), c] }),
    {} as Record<string, ContainerReading[]>,
  );
  const nodes: Record<string, NodeReading> = Object.fromEntries(
    (report?.nodes ?? []).map((n) => [n.install, n]),
  );

  return { report, error, at, every, doors, guests, containers, nodes, readNow: () => take(true) };
}
