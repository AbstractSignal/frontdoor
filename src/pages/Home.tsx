import { Link } from 'react-router-dom';
import { useHass, useHaStatus } from '@hakit/core';
import { useI18n } from '../i18n';
import { ADDR } from '../wires';

/* The landing page is the index of this address: what you can open from here,
   and which box answers each one. The network itself is drawn on the
   management page (src/pages/NetworkMap.tsx) — here the boxes are only the
   line under each destination, because what a reader needs at the door is the
   next click, not the map.

   Media keeps its own sentence rather than a faded card: an affordance that
   opens nothing has nothing to point at. */

export default function Home() {
  const { t } = useI18n();
  const connectionStatus = useHass((s) => s.connectionStatus);
  const haStatus = useHaStatus();
  const entityCount = Object.keys(useHass((s) => s.entities) ?? {}).length;
  const live = connectionStatus === 'connected' && haStatus === 'RUNNING';

  const entries = [
    {
      to: '/home',
      title: t('homeControl'),
      desc: t('homeControlDesc'),
      where: `HA ${ADDR.ha}, Frigate ${ADDR.frigate}`,
    },
    {
      to: '/media',
      title: t('mediaLibrary'),
      desc: t('mediaLibraryDesc'),
      where: `Unraid ${ADDR.unraid}`,
      note: t('mediaPlaceholder'),
    },
    {
      to: '/homelab',
      title: t('homelabTitle'),
      desc: t('manageDesc'),
      where: `This box ${ADDR.services} (page :8080, PBS :8007), front door ${ADDR.infra}`,
    },
  ];

  return (
    <div className="home">
      <h1>{t('homeTitle')}</h1>
      <p className="home-sub">{t('homeSub')}</p>

      <div className="entries">
        {entries.map((e) => (
          <div key={e.to} className="entry">
            <h2 className="entry-title">
              <Link to={e.to}>{e.title}</Link>
            </h2>
            <p className="entry-desc">{e.desc}</p>
            <p className="entry-where">{e.where}</p>
            {e.note && <p className="entry-note">{e.note}</p>}
          </div>
        ))}
      </div>

      <p className="ledger">
        {t('comingSoon')}: {['calendar', 'todoList', 'shopping'].map((k) => t(k)).join(', ')}
      </p>

      <div className={`state ${live ? 'ok' : 'bad'}`}>
        {live ? (
          <>
            <b>{t('haOk')}</b> — {entityCount} {t('entitiesSubscribed')}
          </>
        ) : (
          <>
            <b>{t('stateDead')}</b> — {t('stateDeadHint', { addr: ADDR.ha })}
          </>
        )}
      </div>
    </div>
  );
}
