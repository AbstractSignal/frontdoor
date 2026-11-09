import { Link } from 'react-router-dom';
import { useI18n } from '../i18n';
import Boxes from './Boxes';
import Updates from './Updates';

/* Management: what this page runs on, and what answers it.

   One section, and that is the whole page (2026-10-24, at the owner's request):

   1. Where it runs, and whether it answers — src/pages/Boxes.tsx. The LAN's
      physical boxes drawn as they are cabled, and every door of Caddy's own
      stanza list drawn INSIDE the box its backend lease belongs to: the gear on
      the left, pve1 with its guests (the infra and services LXCs, the haos and
      unraid VMs) on the right, pve2 under it. A door is an icon you click, and
      the icon's border is the page's own probe, so the mark and the link are one
      thing. Nothing else on the page lists a service.

   What replaced what, and why: the old two panels — the doors list (src/pages/
   Services.tsx, one line per stanza in the sections `caddy.groups` names) and the
   cables picture (src/pages/WiresGraph.tsx) — are gone. They were the same quads
   twice, and the owner asked for the services to sit on the boxes they answer
   from, in icons, with as little text as the drawing can carry. One drawing now
   answers both questions at once: "which box do I have to walk to", and "is it
   answering". The VLAN lines, the lease chips and the guest boxes it draws are
   the same RUNS/leases data the old panel used, so no cable fact was retyped.

   The sections the proxy sorts its doors by are still its own (group_vars names
   them, the Caddyfile still renders them); this page simply stopped borrowing
   that shelving, because "which physical box" is the question a reader of this
   page has, and "which group of names" is not.

   Everything on the page is still derived: the boxes and their doors come from
   the stanza's backend quad (src/wires.ts `CADDY`, built at build time from
   group_vars) matched against the leases the installs report (src/pve1.ts, src/
   boxes.ts); a link exists only because a stanza exists; an icon exists because
   a door does (src/icons.ts `dot` is the fallback, never a missing icon). What
   `make services`' curl report (LAN side, real status codes) says stays the
   authority for "up"; this page's mark is what the browser could dial. */

export default function Homelab() {
  const { t } = useI18n();

  return (
    <div className="manage">
      <h1>{t('homelabTitle')}</h1>
      <p className="manage-sub">{t('manageSub')}</p>

      <Boxes t={t} />

      <Updates />

      <p className="cross">
        {t('alsoHome')}{' '}
        <Link to="/home">{t('homeControl')}</Link>
      </p>
    </div>
  );
}
