import { HashRouter, Routes, Route, Outlet, Link, useLocation } from 'react-router-dom';
import { HassConnect } from '@hakit/core';
import { ThemeProvider } from '@hakit/components';
import { LanguageProvider, useI18n, type Lang } from './i18n';
import Home from './pages/Home';
import HomeControl from './pages/HomeControl';
import Media from './pages/Media';
import Homelab from './pages/Homelab';
import './App.css';

const langs: Lang[] = ['en', 'fr'];

function Shell() {
  const { pathname } = useLocation();
  const { lang, setLang, t } = useI18n();
  return (
    <div className="page">
      <div className="topbar">
        {pathname !== '/' ? (
          <Link to="/" className="back">
            {t('backHome')}
          </Link>
        ) : (
          <span />
        )}
        <div className="lang-switch" role="group" aria-label="Language">
          {langs.map((l) => (
            <button key={l} type="button" className={lang === l ? 'active' : ''} onClick={() => setLang(l)}>
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
      <Outlet />
    </div>
  );
}

export default function App() {
  return (
    <HassConnect hassUrl={import.meta.env.VITE_HA_URL} hassToken={import.meta.env.VITE_HA_TOKEN}>
      <ThemeProvider>
        <LanguageProvider>
          <HashRouter>
            <Routes>
              <Route element={<Shell />}>
                <Route path="/" element={<Home />} />
                <Route path="/home" element={<HomeControl />} />
                <Route path="/media" element={<Media />} />
                <Route path="/homelab" element={<Homelab />} />
              </Route>
            </Routes>
          </HashRouter>
        </LanguageProvider>
      </ThemeProvider>
    </HassConnect>
  );
}
