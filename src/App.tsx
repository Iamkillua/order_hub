import { useCallback, useEffect, useState } from 'react';
import type { AppState } from './lib/api';
import { HubProvider, useHub } from './lib/hub';
import { Shell, type Route } from './components/Shell';
import { Toasts } from './components/ui';
import { Setup, NicknameStep } from './pages/Setup';
import { TodoPage } from './pages/Todo';
import { OrdersPage } from './pages/Orders';
import { OverviewPage } from './pages/Overview';
import { NicknamesPage } from './pages/Nicknames';
import { SettingsPage } from './pages/Settings';

const ready = (s: AppState) => s.hasCredentials && s.signedIn && !!s.sheet;

export function App({ initial }: { initial: AppState }) {
  const [state, setState] = useState(initial);
  const [onboarding, setOnboarding] = useState(false);

  if (!ready(state)) {
    return <Setup state={state} onState={(s) => { if (!state.sheet && s.sheet) setOnboarding(true); setState(s); }} />;
  }

  return (
    <HubProvider key={`${state.sheet!.spreadsheetId}|${state.sheet!.tab}|${state.account?.email}`} initial={state} onStateChange={setState}>
      {onboarding ? <NicknameStep onDone={() => setOnboarding(false)} /> : <Main />}
      <Toasts />
    </HubProvider>
  );
}

const ORDER: Route[] = ['todo', 'orders', 'overview', 'nicknames', 'settings'];

function Main() {
  const { refresh, dirtyGuard } = useHub();
  const [route, setRoute] = useState<Route>('todo');

  const go = useCallback((r: Route) => {
    if (r === route) return;
    if (dirtyGuard.current?.()) return;
    setRoute(r);
  }, [route, dirtyGuard]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F5' || (e.ctrlKey && e.key.toLowerCase() === 'r')) {
        e.preventDefault();
        void refresh();
      } else if (e.ctrlKey && !e.shiftKey && !e.altKey && /^[1-5]$/.test(e.key)) {
        e.preventDefault();
        go(ORDER[Number(e.key) - 1]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [refresh, go]);

  return (
    <Shell route={route} go={go}>
      {route === 'todo' && <TodoPage go={go} />}
      {route === 'orders' && <OrdersPage />}
      {route === 'overview' && <OverviewPage go={go} />}
      {route === 'nicknames' && <NicknamesPage />}
      {route === 'settings' && <SettingsPage />}
    </Shell>
  );
}
