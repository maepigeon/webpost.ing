import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { isActiveRoute } from './overflow.js';

/**
 * A button that opens a dropdown of links. Used for both More and the account
 * menu, so they look and behave the same: Escape and outside click close it,
 * arrow keys move between rows, focus goes back to the button on Escape.
 *
 * items: { key, label, route, badge?, separated? }
 */
export default function NavMenu({ label, items, className = '', dot = false, ariaLabel }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const btnRef = useRef(null);
  const panelRef = useRef(null);
  const focusOnOpen = useRef(null);
  const menuId = useId();
  const { pathname } = useLocation();

  // The bar outlives page changes, so close on navigation.
  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const outside = e => { if (!root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const rows = () => Array.from(panelRef.current?.querySelectorAll('[role="menuitem"]') || []);

  // Keyboard opening moves focus into the menu; a tap leaves it on the button.
  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    const list = rows();
    (focusOnOpen.current === 'last' ? list[list.length - 1] : list[0])?.focus();
    focusOnOpen.current = null;
  }, [open]);

  function onKeyDown(e) {
    if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
      btnRef.current?.focus();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    if (!open) {
      if (e.target === btnRef.current) {
        focusOnOpen.current = e.key === 'ArrowUp' || e.key === 'End' ? 'last' : 'first';
        setOpen(true);
      }
      return;
    }
    const list = rows();
    if (!list.length) return;
    const at = list.indexOf(document.activeElement);
    let next;
    if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    else if (e.key === 'ArrowDown') next = at < 0 ? 0 : (at + 1) % list.length;
    else next = at <= 0 ? list.length - 1 : at - 1;
    list[next].focus();
  }

  // Tabbing out of the menu closes it. A null target (a click on a button in
  // Safari) is left to the outside-click handler.
  function onBlur(e) {
    if (open && e.relatedTarget && !root.current?.contains(e.relatedTarget)) setOpen(false);
  }

  return (
    <div className="nav-menu-wrap" ref={root} onKeyDown={onKeyDown} onBlur={onBlur}>
      <button
        type="button"
        ref={btnRef}
        className={`navButton nav-menu-btn ${className}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={ariaLabel}
        onClick={() => setOpen(o => !o)}
      >
        {label}
        <span className="nav-chevron" aria-hidden="true" />
        {dot && <span className="nav-more-dot" aria-hidden="true" />}
      </button>

      {open && (
        <div className="nav-menu-panel" id={menuId} role="menu" ref={panelRef} aria-label={ariaLabel}>
          {items.map(item => {
            const active = isActiveRoute(pathname, item.route);
            return (
              <Link
                key={item.key}
                to={item.route}
                role="menuitem"
                tabIndex={-1}
                aria-current={active ? 'page' : undefined}
                className={`nav-menu-item${active ? ' nav-menu-item--active' : ''}${item.separated ? ' nav-menu-item--separated' : ''}`}
                onClick={() => setOpen(false)}
              >
                {item.label}
                {item.badge > 0 && <span className="nav-badge">{item.badge > 99 ? '99+' : item.badge}</span>}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
