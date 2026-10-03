import { useRef } from 'react';
import './ProfileTabs.css';
import { showTabBar } from './profileTabs.js';

/**
 * The row of tabs under a profile's header card: Posts, Notes and, for the
 * owner, Drafts and Subscribers. A tablist: Left/Right (and Home/End) move
 * between tabs and select the one they land on.
 *
 * @param tabs      [{ id, label, count }] in order (see visibleTabs)
 * @param active    the selected tab's id
 * @param onSelect  called with a tab id
 */
export default function ProfileTabs({ tabs, active, onSelect }) {
  const refs = useRef({});

  const onKeyDown = (e) => {
    const i = tabs.findIndex(t => t.id === active);
    let next = null;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    if (next === null) return;
    e.preventDefault();
    const id = tabs[next].id;
    onSelect(id);
    refs.current[id]?.focus();
  };

  if (!showTabBar(tabs)) return null;

  return (
    <div className="profile-tabs" role="tablist" aria-label="Profile sections" onKeyDown={onKeyDown}>
      {tabs.map(t => (
        <button key={t.id} type="button" role="tab" id={`profile-tab-${t.id}`}
          ref={el => { refs.current[t.id] = el; }}
          aria-selected={t.id === active}
          aria-controls="profile-tabpanel"
          tabIndex={t.id === active ? 0 : -1}
          className={`profile-tab${t.id === active ? ' is-active' : ''}`}
          onClick={() => onSelect(t.id)}>
          <span>{t.label}</span>
          {typeof t.count === 'number' && t.count > 0 && <span className="profile-tab-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}
