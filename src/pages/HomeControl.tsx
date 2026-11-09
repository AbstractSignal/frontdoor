import { Link } from 'react-router-dom';
import { useHass, useHaStatus } from '@hakit/core';
import { useI18n } from '../i18n';
import { Climate } from '../components/Climate';
import { FrigateCamera } from '../components/FrigateCamera';
import { ADDR } from '../wires';

/* The smart home control center: what can actually be acted on in the house.
   Two groups, and each one names the wire it needs, because a control that
   cannot be reached is not a control — the camera feeds ride VLAN66 with the
   services box (docs/network/topology.md: frigate moved out of VLAN69 on 2026-10-18,
   VLAN69 has no internet path) while heating rides VLAN66 through Home Assistant.

   The camera ids and display names are proper nouns (frigate camera names,
   room names), so they stay identical in both languages — only the wiring
   line around them is translated. The feeds themselves bring their own
   header and status dot (src/components/FrigateCamera.tsx). */

const CAMERAS = [
  { id: 'camera_exterieur_1', name: 'Caméra Exterieur' },
  { id: 'chambre_elo', name: 'Chambre Elo' },
  { id: 'chambre_auguste', name: 'Chambre Auguste' },
];

export default function HomeControl() {
  const { t } = useI18n();
  const connectionStatus = useHass((s) => s.connectionStatus);
  const haStatus = useHaStatus();
  const entityCount = Object.keys(useHass((s) => s.entities) ?? {}).length;
  const live = connectionStatus === 'connected' && haStatus === 'RUNNING';

  const haAddr = '192.168.66.20:8123';
  const frigateAddr = `${ADDR.frigate}:5000`;

  return (
    <div className="control">
      <h1>{t('homeControl')}</h1>
      <p className="control-sub">{t('controlSub')}</p>

      <div className={`state ${live ? 'ok' : 'bad'}`}>
        {live ? (
          <>
            <b>{t('haOk')}</b> — {entityCount} {t('entitiesSubscribed')}
          </>
        ) : (
          <>
            <b>{t('stateDead')}</b> — {t('stateDeadHint', { addr: haAddr })}
          </>
        )}
      </div>

      <section>
        <h2>{t('climateTitle')}</h2>
        <Climate />
        <p className="wire">
          {t('climateWire', { addr: haAddr, site: import.meta.env.VITE_HA_URL })}
        </p>
      </section>

      <section>
        <h2>{t('camerasTitle')}</h2>
        <div className="feed-list">
          {CAMERAS.map((c) => (
            <FrigateCamera key={c.id} camera={c.id} label={c.name} />
          ))}
        </div>
        <p className="wire">
          {t('cameraWire', { addr: frigateAddr, site: import.meta.env.VITE_FRIGATE_URL })}
        </p>
      </section>

      <p className="cross">
        {t('alsoManage')}{' '}
        <Link to="/homelab">{t('homelabTitle')}</Link>
      </p>
    </div>
  );
}
