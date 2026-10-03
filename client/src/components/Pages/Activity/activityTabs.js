// The Activity page's tabs, apart from React so the counts and the keys can be tested.

/** [{ id, label, count }] in order; the count is shown small by the tab and hidden at zero. */
export function activityTabs({ posts = 0, comments = 0, reactions = 0, uploads = 0, deletions = 0 } = {}) {
  return [
    { id: 'posts', label: 'Posts', count: posts },
    { id: 'comments', label: 'Comments', count: comments },
    { id: 'reactions', label: 'Reactions', count: reactions },
    { id: 'uploads', label: 'Uploads', count: uploads },
    { id: 'deletions', label: 'Deletions', count: deletions },
  ];
}

/** The tab a key moves to (Left/Right wrap, Home/End jump), or null for any other key. */
export function nextTabId(tabs, active, key) {
  const i = tabs.findIndex(t => t.id === active);
  let next = null;
  if (key === 'ArrowRight') next = (i + 1) % tabs.length;
  else if (key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
  else if (key === 'Home') next = 0;
  else if (key === 'End') next = tabs.length - 1;
  return next === null ? null : tabs[next].id;
}
