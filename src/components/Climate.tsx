import { useState } from 'react';
import { useEntities, useEntity } from '@hakit/core';
import './Climate.css';
import { CLIMATE } from '../climate';
import type { ClimateId, Group } from '../climate';
import { useI18n } from '../i18n';
import { ClimateHistory } from './ClimateHistory';

type ClimateEntity = ReturnType<typeof useEntity>;

/* What an AC offers beyond heat: the Gree's own option names, kept as HA spells
   them because they are the unit's vocabulary, not the page's. A heat-only unit
   (the five thermostats) has neither, and the cards ask for them. */
const FAN_LABELS: Record<string, string> = {
  auto: 'Auto',
  low: 'Low',
  medium_low: 'Med-Low',
  medium: 'Medium',
  medium_high: 'Med-High',
  high: 'High',
  turbo: 'Turbo',
  quiet: 'Quiet',
};

const SWING_LABELS: Record<string, string> = {
  default: 'Default',
  swing_full: 'Full swing',
  fixed_upmost: 'Up · upmost',
  fixed_middle_up: 'Up · mid-up',
  fixed_middle: 'Middle',
  fixed_middle_low: 'Down · mid-low',
  fixed_lowest: 'Down · lowest',
};

const MODE_ICONS: Record<string, string> = {
  heat: '🔥',
  cool: '❄️',
  auto: '🌡️',
  dry: '💧',
  fan_only: '🌀',
  off: '⏻',
};

function usePending() {
  const [pending, setPending] = useState(false);
  const call = (fn: () => void) => {
    if (pending) return;
    setPending(true);
    fn();
    setTimeout(() => setPending(false), 400);
  };
  return { pending, call };
}

function stepTemp(c: ClimateEntity, delta: number) {
  const a = c.attributes;
  if (c.state === 'off') return;
  const next = Math.min(a.max_temp, Math.max(a.min_temp, (a.temperature ?? 22) + delta));
  if (next !== a.temperature) c.service.setTemperature({ serviceData: { temperature: next } });
}

/* The mode an "on" button picks: an AC has auto, a radiator/floor thermostat does
   not — HA only offers heat there (measured: modes are off/heat). */
function onMode(modes: string[]) {
  return modes.includes('auto') ? 'auto' : 'heat';
}

function ClimateCard({ entity, label, step }: { entity: ClimateId; label: string; step: number }) {
  const i18n = useI18n();
  const { t } = i18n;
  const c = useEntity(entity);
  const a = c.attributes;
  const off = c.state === 'off';
  const modes = (a.hvac_modes ?? []).filter((m) => m !== 'off');
  // A unit that can cool is an air conditioner: only those get the mode nav,
  // because for a heat-only unit the power button already is its whole vocabulary.
  const air = modes.includes('cool');
  const fans = a.fan_modes ?? [];
  const swings = (a.swing_modes ?? []).filter((m) => m in SWING_LABELS);
  const { call } = usePending();

  return (
    <div className={`climate-panel ${off ? 'is-off' : `mode-${c.state}`}`}>
      <header>
        <span className="unit-icon" title={c.state}>{MODE_ICONS[c.state] ?? '❔'}</span>
        <h3>{label}</h3>
        <button
          className={`power ${off ? '' : 'on'}`}
          title={off ? 'Turn on' : 'Turn off'}
          onClick={() => call(() => (off ? c.service.setHvacMode({ serviceData: { hvac_mode: onMode(modes) } }) : c.service.turnOff()))}
        >
          <span className="power-dot" />
          {off ? 'Off' : 'On'}
        </button>
      </header>

      <div className="temps">
        <div className="current" title="Room temperature">
          {a.current_temperature != null ? `${Math.round(a.current_temperature)}°` : '–'}
          <small>room</small>
        </div>
        <div className="target">
          <button onClick={() => call(() => stepTemp(c, -step))} disabled={off}>−</button>
          <span>{a.temperature ?? '–'}°</span>
          <button onClick={() => call(() => stepTemp(c, step))} disabled={off}>+</button>
        </div>
      </div>

      {!off && air && (
        <>
          <nav className="modes">
            {modes.map((mode) => (
              <button
                key={mode}
                className={c.state === mode ? 'active' : ''}
                onClick={() => call(() => c.service.setHvacMode({ serviceData: { hvac_mode: mode } }))}
              >
                {t(`mode_${mode}`)}
              </button>
            ))}
          </nav>

          <div className="row">
            {fans.length > 1 && (
              <label>
                {t('fan')}
                <select value={a.fan_mode ?? 'auto'} onChange={(e) => call(() => c.service.setFanMode({ serviceData: { fan_mode: e.target.value } }))}>
                  {fans.map((m) => (
                    <option key={m} value={m}>{FAN_LABELS[m] ?? m}</option>
                  ))}
                </select>
              </label>
            )}
            {swings.length > 1 && (
              <label>
                {t('swing')}
                <select value={a.swing_mode ?? 'default'} onChange={(e) => call(() => c.service.setSwingMode({ serviceData: { swing_mode: e.target.value } }))}>
                  {swings.map((m) => (
                    <option key={m} value={m}>{SWING_LABELS[m] ?? m}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ClimateAll({ units, labels, step, title }: { units: ClimateId[]; labels: Record<string, string>; step: number; title: string }) {
  const { t } = useI18n();
  // One useEntity per unit of the group. The group's units come from the roster,
  // so the hook count is fixed per mount; a unit added or removed is an edit there.
  const entities = useEntities(units.map((u) => u as ClimateId) as [ClimateId, ...ClimateId[]]) as unknown as ClimateEntity[];
  const items = units.map((u, i) => ({ u, c: entities[i], label: labels[u] ?? u }));
  const { call } = usePending();

  const allOff = items.every(({ c }) => c.state === 'off');
  const anyOn = !allOff;
  const commonMode = items.every(({ c }) => c.state === items[0].c.state) ? items[0].c.state : null;
  const air = items.some(({ c }) => (c.attributes.hvac_modes ?? []).includes('cool'));

  const temps = items.map(({ c }) => c.attributes.temperature);
  const sameTemp = temps.every((x) => x === temps[0]);
  const fanVals = items.map(({ c }) => c.attributes.fan_mode);
  const fanSame = fanVals.every((v) => v === fanVals[0]);
  const fanModes = [...new Set(items.flatMap(({ c }) => c.attributes.fan_modes ?? []))];
  const swingVals = items.map(({ c }) => c.attributes.swing_mode);
  const swingSame = swingVals.every((v) => v === swingVals[0]);
  const swingModes = [...new Set(items.flatMap(({ c }) => (c.attributes.swing_modes ?? []).filter((m: string) => m in SWING_LABELS)))];

  return (
    <div className={`climate-panel ${allOff ? 'is-off' : ''} ${commonMode && !allOff ? `mode-${commonMode}` : ''}`}>
      <header>
        <span className="unit-icon" title={allOff ? 'off' : (commonMode ?? 'mixed')}>{MODE_ICONS[commonMode ?? ''] ?? '❔'}</span>
        <h3>{title}</h3>
        <button
          className={`power ${anyOn ? 'on' : ''}`}
          title={anyOn ? 'Turn off all' : 'Turn on all'}
          onClick={() =>
            call(() =>
              items.forEach(({ c }) =>
                anyOn ? c.service.turnOff() : c.service.setHvacMode({ serviceData: { hvac_mode: onMode(c.attributes.hvac_modes ?? []) } }),
              ),
            )
          }
        >
          <span className="power-dot" />
          {anyOn ? 'On' : 'Off'}
        </button>
      </header>

      <div className="roomtemps">
        {items.map(({ u, c, label }) => (
          <div key={u} className="roomtemp" title={`${label} room temperature`}>
            <small>{label}</small>
            <span>{c.attributes.current_temperature != null ? `${Math.round(c.attributes.current_temperature)}°` : '–'}</span>
          </div>
        ))}
      </div>

      {/* one number when they agree, otherwise every value, so the card cannot read as if they matched */}
      <div className="temps solo">
        <div className={`target ${sameTemp ? '' : 'wide'}`}>
          <button onClick={() => call(() => items.forEach(({ c }) => stepTemp(c, -step)))} disabled={allOff}>−</button>
          <span>{sameTemp ? `${temps[0] ?? '–'}°` : temps.map((x) => x ?? '?').join(' / ') + '°'}</span>
          <button onClick={() => call(() => items.forEach(({ c }) => stepTemp(c, step)))} disabled={allOff}>+</button>
        </div>
      </div>

      {!allOff && air && (
        <>
          <nav className="modes">
            {[...new Set(items.flatMap(({ c }) => c.attributes.hvac_modes ?? []))].filter((m) => m !== 'off').map((mode) => (
              <button
                key={mode}
                className={commonMode === mode ? 'active' : ''}
                onClick={() => call(() => items.forEach((i) => i.c.service.setHvacMode({ serviceData: { hvac_mode: mode } })))}
              >
                {t(`mode_${mode}`)}
              </button>
            ))}
          </nav>

          <div className="row">
            {fanModes.length > 1 && (
              <label>
                {t('fan')}
                <select
                  value={fanSame ? (fanVals[0] ?? 'auto') : ''}
                  onChange={(e) =>
                    e.target.value && call(() => items.forEach(({ c }) => c.service.setFanMode({ serviceData: { fan_mode: e.target.value } })))
                  }
                >
                  {!fanSame && <option value="" disabled>Mixed</option>}
                  {fanModes.map((m) => (
                    <option key={m} value={m}>{FAN_LABELS[m] ?? m}</option>
                  ))}
                </select>
              </label>
            )}
            {swingModes.length > 1 && (
              <label>
                {t('swing')}
                <select
                  value={swingSame ? (swingVals[0] ?? 'default') : ''}
                  onChange={(e) =>
                    e.target.value && call(() => items.forEach(({ c }) => c.service.setSwingMode({ serviceData: { swing_mode: e.target.value } })))
                  }
                >
                  {!swingSame && <option value="" disabled>Mixed</option>}
                  {swingModes.map((m) => (
                    <option key={m} value={m}>{SWING_LABELS[m] ?? m}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ClimateRow({ group }: { group: Group }) {
  const i18n = useI18n();
  const [view, setView] = useState<string>('all');
  const labels = Object.fromEntries(group.units.map((u) => [u.id, i18n.t(u.labelKey)]));
  const active = group.units.some((u) => u.id === view) ? view : 'all';

  return (
    <section className="climate-row">
      <div className="climate-tabs" role="tablist">
        {group.units.map((u) => (
          <button key={u.id} role="tab" aria-selected={active === u.id} className={active === u.id ? 'active' : ''} onClick={() => setView(u.id)}>
            {i18n.t(u.labelKey)}
          </button>
        ))}
        <button role="tab" aria-selected={active === 'all'} className={active === 'all' ? 'active' : ''} onClick={() => setView('all')}>
          {i18n.t(group.allKey)}
        </button>
      </div>

      {active === 'all' ? (
        <ClimateAll units={group.units.map((u) => u.id)} labels={labels} step={group.step} title={i18n.t(group.allKey)} />
      ) : (
        <ClimateCard entity={active as ClimateId} label={labels[active]} step={group.step} />
      )}
    </section>
  );
}

export function Climate() {
  return (
    <section className="climate">
      {CLIMATE.map((g) => (
        <ClimateRow key={g.id} group={g} />
      ))}
      <ClimateHistory />
    </section>
  );
}
