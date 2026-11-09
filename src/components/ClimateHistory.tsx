import { useEffect, useMemo, useRef, useState } from 'react';
import './Climate.css';
import { CLIMATE } from '../climate';
import type { ClimateId } from '../climate';
import { useI18n } from '../i18n';

/* HA's recorder here keeps about a day of history. Measured 2026-10-17 on HA
   2026.9.1: asked for 24h, 48h, 72h and 168h of the same seven units, every window
   returned the same first row (~24h back), so a longer range would draw the same
   curve and label it 7 days. Anything past that needs a source this repo owns. */
const RANGES = [
  { id: '6h', ms: 6 * 3_600_000 },
  { id: '12h', ms: 12 * 3_600_000 },
  { id: '24h', ms: 24 * 3_600_000 },
] as const;
type RangeId = (typeof RANGES)[number]['id'];

/* Colours of the strip under the chart: what a unit is doing, not which unit it is.
   The unit's own colour is in the roster and colours its curves. */
const MODE_COLORS: Record<string, string> = {
  heat: '#f97316',
  cool: '#22d3ee',
  auto: '#22c55e',
  dry: '#a855f7',
  fan_only: '#eab304',
};

const OUT_COLOR = '#94a3b8';

type Row = { t: number; state: string; cur?: number | null; tgt?: number | null; out?: number | null };
type RawRow = { entity_id: string; state: string; last_changed: string; attributes?: Record<string, unknown> };

type SeriesKind = 'room' | 'target' | 'out';
type Series = { id: string; label: string; color: string; kind: SeriesKind; points: { t: number; v: number }[] };

async function fetchHistory(entityIds: string[], startMs: number, endMs: number): Promise<Map<string, Row[]>> {
  // Same-origin via the Vite proxy (see vite.config.ts) — direct browser→HA REST is CORS-blocked.
  const url = new URL('/ha-api/api/history/period', window.location.origin);
  url.searchParams.set('start_date', new Date(startMs).toISOString());
  url.searchParams.set('end_date', new Date(endMs).toISOString());
  url.searchParams.set('filter_entity_id', entityIds.join(','));
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${import.meta.env.VITE_HA_TOKEN}` } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const groups = (await res.json()) as RawRow[][];
  const byEntity = new Map<string, Row[]>();
  for (const group of groups ?? []) {
    for (const r of group) {
      const a = r.attributes ?? {};
      const num = (v: unknown) => (typeof v === 'number' ? v : null);
      const row: Row = { t: Date.parse(r.last_changed), state: String(r.state) };
      row.cur = num(a.current_temperature);
      row.tgt = num(a.temperature);
      row.out = num(a.outside_temperature);
      const list = byEntity.get(r.entity_id) ?? [];
      list.push(row);
      byEntity.set(r.entity_id, list);
    }
  }
  return byEntity;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver((entries) => setW(entries[0].contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const fmtTime = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDay = (t: number) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });

function timeTicks(start: number, end: number) {
  const span = end - start;
  const steps = [30 * 60e3, 3_600e3, 2 * 3_600e3, 3 * 3_600e3, 6 * 3_600e3, 12 * 3_600e3, 86_400e3, 2 * 86_400e3];
  let step = steps[steps.length - 1];
  for (const s of steps) {
    if (span / s <= 7) {
      step = s;
      break;
    }
  }
  const ticks: number[] = [];
  for (let t = Math.ceil(start / step) * step; t < end; t += step) ticks.push(t);
  return { ticks, step };
}

function yTicks(min: number, max: number) {
  const span = max - min;
  const steps = [0.5, 1, 2, 5, 10];
  let step = 10;
  for (const s of steps) {
    if (span / s <= 4) {
      step = s;
      break;
    }
  }
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) ticks.push(v);
  return ticks;
}

function pathFor(points: { t: number; v: number }[], x: (t: number) => number, y: (v: number) => number) {
  if (points.length === 0) return '';
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
}

function TempChart({ series, start, end }: { series: Series[]; start: number; end: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const H = 150;
  const padL = 34;
  const padR = 8;
  const padT = 10;
  const padB = 20;
  const [hover, setHover] = useState<number | null>(null);

  const all = series.flatMap((s) => s.points);
  if (all.length === 0 || width === 0) return <div ref={ref} className="hist-chart" />;

  let min = Math.min(...all.map((p) => p.v));
  let max = Math.max(...all.map((p) => p.v));
  if (min === max) {
    min -= 1;
    max += 1;
  }

  const x = (t: number) => padL + ((t - start) / (end - start)) * (width - padL - padR);
  const y = (v: number) => padT + ((max - v) / (max - min)) * (H - padT - padB);

  const xt = timeTicks(start, end);
  const yt = yTicks(min, max);
  const dayTicks = xt.step >= 86_400e3;

  const at = (T: number) =>
    series.map((s) => {
      let found: { t: number; v: number } | null = null;
      for (let i = s.points.length - 1; i >= 0; i--) {
        if (s.points[i].t <= T) {
          found = s.points[i];
          break;
        }
      }
      return { s, p: found };
    });

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left + padL;
    setHover(Math.min(end, Math.max(start, start + ((mx - padL) / (width - padL - padR)) * (end - start))));
  };

  const hoverInfo = hover != null ? at(hover) : null;
  const tipLeft = hover != null ? x(hover) : 0;
  const flip = hover != null && tipLeft > width / 2;

  return (
    <div ref={ref} className="hist-chart">
      <svg width={width} height={H}>
        {yt.map((v) => (
          <g key={v}>
            <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} className="hist-grid" />
            <text x={padL - 5} y={y(v) + 3} textAnchor="end" className="hist-tick">{v}°</text>
          </g>
        ))}
        {xt.ticks.map((t) => (
          <text key={t} x={x(t)} y={H - 5} textAnchor="middle" className="hist-tick">
            {dayTicks ? fmtDay(t) : fmtTime(t)}
          </text>
        ))}
        {series.map((s) => (
          <path
            key={s.id}
            d={pathFor(s.points, x, y)}
            fill="none"
            stroke={s.color}
            strokeWidth={s.kind === 'room' ? 2 : s.kind === 'target' ? 1.2 : 1.5}
            strokeDasharray={s.kind === 'target' ? '2 3' : s.kind === 'out' ? '6 4' : undefined}
            opacity={s.kind === 'target' ? 0.45 : 1}
          />
        ))}
        {hover != null && (
          <line x1={tipLeft} x2={tipLeft} y1={padT} y2={H - padB} className="hist-cursor" />
        )}
        <rect
          x={padL}
          y={padT}
          width={Math.max(0, width - padL - padR)}
          height={H - padT - padB}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {hoverInfo && (
        <div className="hist-tip" style={{ left: flip ? undefined : tipLeft + 10, right: flip ? width - tipLeft + 10 : undefined }}>
          <div className="hist-tip-time">{dayTicks ? `${fmtDay(hover!)} ${fmtTime(hover!)}` : fmtTime(hover!)}</div>
          {hoverInfo.filter(({ p }) => p).map(({ s, p }) => (
            <div key={s.id}>
              <span className="hist-dot" style={{ background: s.color }} />
              {s.label}: {p!.v}°
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type Segment = { start: number; end: number; state: string };

function segmentsFor(rows: Row[], start: number, end: number): Segment[] {
  const segs: Segment[] = [];
  for (let i = 0; i < rows.length; i++) {
    const s = Math.max(start, rows[i].t);
    const e = Math.min(end, i + 1 < rows.length ? rows[i + 1].t : end);
    if (e > s) segs.push({ start: s, end: e, state: rows[i].state });
  }
  return segs;
}

function fmtDuration(ms: number) {
  const h = Math.floor(ms / 3_600e3);
  const m = Math.round((ms % 3_600e3) / 60e3);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

function RuntimeRow({ label, rows, start, end }: { label: string; rows: Row[]; start: number; end: number }) {
  const segs = useMemo(() => segmentsFor(rows, start, end), [rows, start, end]);
  const onMs = segs.reduce((acc, s) => (s.state !== 'off' ? acc + (s.end - s.start) : acc), 0);
  const span = end - start;

  return (
    <div className="runtime-row">
      <span className="rt-label" title={label}>{label}</span>
      <div className="rt-bar">
        {segs.map((s, i) =>
          s.state !== 'off' && (
            <div
              key={i}
              className="rt-seg"
              style={{
                left: `${((s.start - start) / span) * 100}%`,
                width: `${((s.end - s.start) / span) * 100}%`,
                background: MODE_COLORS[s.state] ?? '#6b7280',
              }}
              title={`${fmtTime(s.start)}–${fmtTime(s.end)} · ${s.state}`}
            />
          )
        )}
      </div>
      <span className="rt-on">on {fmtDuration(onMs)}</span>
    </div>
  );
}

/* The seven units of the roster, in flat form: the chart needs one entry per unit,
   and its colour is the roster's, so the chip, the curves and the strip agree. */
const UNITS = CLIMATE.flatMap((g) => g.units);
const ALL_IDS = UNITS.map((u) => u.id as ClimateId);

export function ClimateHistory() {
  const { t, lang } = useI18n();
  const [range, setRange] = useState<RangeId>('24h');
  const [data, setData] = useState<Map<string, Row[]> | null>(null);
  const [error, setError] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    const ms = RANGES.find((r) => r.id === range)!.ms;
    const load = () => {
      const end = Date.now();
      fetchHistory(ALL_IDS.map(String), end - ms, end)
        .then((m) => {
          if (!alive) return;
          setData(m);
          setError(false);
        })
        .catch(() => alive && setError(true));
    };
    load();
    const iv = setInterval(load, 5 * 60_000);
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [range]);

  const ms = RANGES.find((r) => r.id === range)!.ms;
  const end = Date.now();
  const start = end - ms;

  const shown = UNITS.filter((u) => !hidden.includes(u.id));
  const shownIds = shown.map((u) => u.id);

  const series: Series[] = useMemo(() => {
    if (!data) return [];
    const s: Series[] = [];
    for (const u of UNITS) {
      if (hidden.includes(u.id)) continue;
      const rows = data.get(u.id) ?? [];
      const label = t(u.labelKey);
      s.push({
        id: u.id,
        label,
        color: u.color,
        kind: 'room',
        points: rows.filter((r) => r.cur != null).map((r) => ({ t: r.t, v: r.cur as number })),
      });
      s.push({
        id: `${u.id}-tgt`,
        label: `${label} ${t('target_word')}`,
        color: u.color,
        kind: 'target',
        points: rows.filter((r) => r.tgt != null).map((r) => ({ t: r.t, v: r.tgt as number })),
      });
    }
    const outUnit = UNITS.find((u) => (data.get(u.id) ?? []).some((r) => r.out != null));
    if (outUnit) {
      s.push({
        id: 'outside',
        label: t('outside'),
        color: OUT_COLOR,
        kind: 'out',
        points: (data.get(outUnit.id) ?? []).filter((r) => r.out != null).map((r) => ({ t: r.t, v: r.out as number })),
      });
    }
    return s;
  }, [data, hidden, t, lang]);

  const noData = data !== null && series.every((s) => s.points.length === 0);

  // the strip's legend lists only what those units actually did in the window
  const seenStates = [...new Set(shownIds.flatMap((id) => (data?.get(id) ?? []).map((r) => r.state)))].filter(
    (s) => s !== 'off',
  );

  return (
    <section className="climate-history">
      <header>
        <h3>{t('history_title')}</h3>
        <div className="range-tabs" role="tablist">
          {RANGES.map((r) => (
            <button key={r.id} role="tab" aria-selected={range === r.id} className={range === r.id ? 'active' : ''} onClick={() => setRange(r.id)}>
              {r.id}
            </button>
          ))}
        </div>
      </header>

      <div className="hist-chips">
        {UNITS.map((u) => (
          <button
            key={u.id}
            className={hidden.includes(u.id) ? '' : 'on'}
            onClick={() => setHidden((h) => (h.includes(u.id) ? h.filter((x) => x !== u.id) : [...h, u.id]))}
          >
            <i className="swatch" style={{ background: u.color }} />
            {t(u.labelKey)}
          </button>
        ))}
      </div>

      {error && <p className="hist-error">{t('history_error')}</p>}
      {!data && !error && <p className="hist-loading">{t('history_loading')}</p>}
      {noData && <p className="hist-empty">{t('history_empty')}</p>}

      {data && !noData && (
        <>
          <TempChart series={series} start={start} end={end} />
          <div className="hist-legend">
            {series.map((s) => (
              <span key={s.id} className="hist-legend-item">
                <i className={`swatch ${s.kind}`} style={{ background: s.kind === 'room' ? s.color : undefined, borderColor: s.color }} />
                {s.label}
              </span>
            ))}
          </div>

          <div className="hist-runtime">
            <div className="hist-subtitle">{t('runtime_title')}</div>
            {shown.map((u) => (
              <RuntimeRow key={u.id} label={t(u.labelKey)} rows={data.get(u.id) ?? []} start={start} end={end} />
            ))}
            <div className="hist-legend">
              {seenStates.map((state) => (
                <span key={state} className="hist-legend-item">
                  <i className="swatch mode" style={{ background: MODE_COLORS[state] ?? '#6b7280' }} />
                  {t(`mode_${state}`)}
                </span>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
