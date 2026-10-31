import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { api, initBridge } from './lib/api';
import { App } from './App';
import { Logo } from './components/Icons';

const root = createRoot(document.getElementById('root')!);
root.render(<div className="loading-screen"><Logo className="logo" size={56} /></div>);

(async () => {
  try {
    await initBridge();
    const state = await api.getState();
    root.render(<StrictMode><App initial={state} /></StrictMode>);
  } catch (e) {
    root.render(
      <div className="loading-screen">
        <div className="empty">
          <h3>Order Hub couldn’t start</h3>
          <p>{(e as Error).message}</p>
          <button className="btn" onClick={() => location.reload()}>Try again</button>
        </div>
      </div>,
    );
  }
})();
