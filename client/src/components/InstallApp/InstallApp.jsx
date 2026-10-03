import { useState, useSyncExternalStore } from 'react';
import { canInstall, promptInstall, isStandalone, isIos, subscribe } from '../../utils/installApp.js';
import './InstallApp.css';

export default function InstallApp() {
  // Re-render when the browser offers the prompt or the app gets installed.
  const available = useSyncExternalStore(subscribe, canInstall);
  const standalone = useSyncExternalStore(subscribe, isStandalone);
  const [help, setHelp] = useState('');

  if (standalone) {
    return <button type="button" className="settings-btn install-app-btn" disabled>Installed</button>;
  }

  const click = () => {
    if (available) { promptInstall(); return; }
    setHelp(isIos()
      ? "Tap the Share button, then 'Add to Home Screen'."
      : "In your browser's menu, choose 'Install app' or 'Add to Home screen'.");
  };

  return (
    <div className="install-app">
      <button type="button" className="settings-btn settings-btn--primary install-app-btn" onClick={click}>
        Install app
      </button>
      {help && <p className="install-app-help" role="status">{help}</p>}
    </div>
  );
}
