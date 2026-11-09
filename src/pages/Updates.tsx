import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../i18n';

/* The updates report: which components of the homelab have pending updates.
   The page itself computes nothing — it renders the checker's report, which
   lives in the services box (the `updates` container) and is reached through
   the dashboard's own nginx as same-origin /updates/. That is why this page
   needs no token and no new door: the checker's only door is this page's
   door, and the checker dials the PVE APIs, the LXC boxes over SSH, the
   registries and HA itself.

     GET  /updates/report   → the last cached report (503 while the first runs)
     POST /updates/refresh  → run a full check now and return it (a minute,
                              not a second: it SSHes four boxes) */

type Detail = Record<string, unknown>;

type Component = {
  id: string;
  kind: string;
  name: string;
  status: 'ok' | 'updates' | 'error';
  summary: string;
  details: Detail[];
};

type Report = {
  generated_at: string;
  duration_seconds: number;
  pending_components: number;
  error_components: number;
  components: Component[];
};

const KIND_KEY: Record<string, string> = {
  pve: 'updates_kind_pve',
  lxc: 'updates_kind_lxc',
  vm: 'updates_kind_vm',
};

export default function Updates() {
  const { t } = useI18n();
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/updates/report');
      if (r.status === 503) throw new Error(t('updates_first_check'));
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setReport((await r.json()) as Report);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await fetch('/updates/refresh', { method: 'POST' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setReport((await r.json()) as Report);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  };

  const when = report
    ? new Date(report.generated_at).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : '—';

  const row = (c: Component) => (
    <div key={c.id} className={`u-row ${c.status}`}>
      <span className={`u-dot ${c.status}`} aria-hidden="true" />
      <span className="u-name">
        {c.name}
        <span className="u-kind">{t(KIND_KEY[c.kind] ?? c.kind)}</span>
      </span>
      <span className="u-summary">{c.summary}</span>
      {c.details.length > 0 && (
        <details className="u-details">
          <summary>{t('updates_details')}</summary>
          <pre className="u-json">{JSON.stringify(c.details, null, 2)}</pre>
        </details>
      )}
    </div>
  );

  return (
    <div className="updates">
      <h2 className="panel-title">
        {t('updates_title')}
        <span className="panel-live">{t('updates_checked', { at: when })}</span>
      </h2>

      {report && (
        <p className="u-totals">
          {t('updates_totals', {
            pending: String(report.pending_components),
            errors: String(report.error_components),
          })}
        </p>
      )}

      {error && <p className="u-error">{t('updates_error', { e: error })}</p>}

      {report && report.components.map(row)}

      <button className="u-refresh" onClick={() => void refresh()} disabled={refreshing}>
        {refreshing ? t('updates_refreshing') : t('updates_refresh')}
      </button>
    </div>
  );
}
