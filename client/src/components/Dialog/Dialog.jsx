import { createContext, useContext, useState, useCallback, useRef } from 'react';
import './Dialog.css';

const DialogContext = createContext(null);

export function DialogProvider({ children }) {
  const [dialog, setDialog] = useState(null); // { type, title, message, resolve }
  const resolveRef = useRef(null);

  const confirm = useCallback((message, title) => {
    return new Promise(resolve => {
      resolveRef.current = resolve;
      setDialog({ type: 'confirm', title: title || null, message, resolve });
    });
  }, []);

  const alert = useCallback((message, title) => {
    return new Promise(resolve => {
      resolveRef.current = resolve;
      setDialog({ type: 'alert', title: title || null, message, resolve });
    });
  }, []);

  const linkWarning = useCallback((url) => {
    return new Promise(resolve => {
      resolveRef.current = resolve;
      setDialog({ type: 'link', url, resolve });
    });
  }, []);

  const dismiss = (result) => {
    if (resolveRef.current) resolveRef.current(result);
    resolveRef.current = null;
    setDialog(null);
  };

  return (
    <DialogContext.Provider value={{ confirm, alert, linkWarning }}>
      {children}
      {dialog && (
        <div className="dialog-overlay" onMouseDown={() => dismiss(false)}>
          <div className="dialog-box" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <button className="dialog-close" onClick={() => dismiss(false)} aria-label="Close">✕</button>
            {dialog.type === 'link' ? (
              <>
                <div className="dialog-title">Leaving webpost.ing</div>
                <div className="dialog-message dialog-message--link">
                  <span className="dialog-link-label">You're heading to:</span>
                  <span className="dialog-link-url">{dialog.url}</span>
                </div>
                <div className="dialog-actions">
                  <button className="dialog-btn dialog-btn--confirm" onClick={() => dismiss(true)}>Continue →</button>
                </div>
              </>
            ) : (
              <>
                {dialog.title && <div className="dialog-title">{dialog.title}</div>}
                <div className="dialog-message">{dialog.message}</div>
                <div className="dialog-actions">
                  {dialog.type === 'confirm' ? (
                    <>
                      <button className="dialog-btn dialog-btn--confirm" onClick={() => dismiss(true)}>Continue</button>
                      <button className="dialog-btn dialog-btn--cancel" onClick={() => dismiss(false)}>Cancel</button>
                    </>
                  ) : (
                    <button className="dialog-btn dialog-btn--confirm" onClick={() => dismiss(true)}>OK</button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside DialogProvider');
  return ctx;
}
