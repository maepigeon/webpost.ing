import { useState, useEffect, useRef } from 'react';
import {
  ADMIN_GET_STATUS, ADMIN_LIST_USERS, ADMIN_CREATE_USER, ADMIN_DELETE_USER,
  ADMIN_SET_ADMIN, ADMIN_SET_ROLE, ADMIN_GET_STATS, ADMIN_GET_ROLE_LIMITS,
  ADMIN_SET_ROLE_LIMIT, ADMIN_GET_FLAGGED, ADMIN_CLEANUP_ORPHANS,
  ADMIN_EXPORT_USER, ADMIN_IMPORT_USER
} from '../../Posts/BasicTextPostServerApi.js';
import './AdminPanel.css';

function fmt(bytes) {
  if (bytes < 0) return 'unlimited';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

const ROLES = ['user', 'trusted', 'restricted', 'admin'];

export default function AdminPanel() {
  const [isAdmin, setIsAdmin] = useState(null);
  const [tab, setTab] = useState('users');
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [roleLimits, setRoleLimits] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [createError, setCreateError] = useState('');
  const [limitEdits, setLimitEdits] = useState({});
  const [search, setSearch] = useState('');
  const [msg, setMsg] = useState('');
  const [importTarget, setImportTarget] = useState('');
  const [importResult, setImportResult] = useState(null);
  const importFileRef = useRef(null);

  useEffect(() => {
    ADMIN_GET_STATUS()
      .then(d => setIsAdmin(d.isAdmin))
      .catch(() => setIsAdmin(false));
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    if (tab === 'users') ADMIN_LIST_USERS().then(setUsers).catch(() => {});
    if (tab === 'stats') ADMIN_GET_STATS().then(setStats).catch(() => {});
    if (tab === 'limits') ADMIN_GET_ROLE_LIMITS().then(d => { setRoleLimits(d); setLimitEdits({}); }).catch(() => {});
    if (tab === 'flagged') ADMIN_GET_FLAGGED().then(setFlagged).catch(() => {});
  }, [isAdmin, tab]);

  const flash = (m) => { setMsg(m); setTimeout(() => setMsg(''), 3000); };

  const createUser = async () => {
    setCreateError('');
    try {
      await ADMIN_CREATE_USER(newUsername, newPassword);
      setNewUsername(''); setNewPassword('');
      flash('User created.');
      ADMIN_LIST_USERS().then(setUsers);
    } catch (e) {
      setCreateError(e.response?.data || 'Failed to create user.');
    }
  };

  const deleteUser = async (username) => {
    if (!window.confirm(`Delete user "${username}" and ALL their data? This cannot be undone.`)) return;
    try {
      await ADMIN_DELETE_USER(username);
      setUsers(us => us.filter(u => u.username !== username));
      flash(`Deleted ${username}.`);
    } catch (e) {
      flash(e.response?.data || 'Failed to delete user.');
    }
  };

  const setRole = async (username, role) => {
    if (!window.confirm(`Change role for "${username}" to "${role}"?`)) return;
    try {
      await ADMIN_SET_ROLE(username, role);
      setUsers(us => us.map(u => u.username === username ? { ...u, role } : u));
      flash(`Role updated for ${username}.`);
    } catch {}
  };

  const toggleAdmin = async (username, current) => {
    const action = current ? 'Remove admin from' : 'Make admin';
    if (!window.confirm(`${action} "${username}"?`)) return;
    try {
      await ADMIN_SET_ADMIN(username, !current);
      setUsers(us => us.map(u => u.username === username ? { ...u, is_admin: !current } : u));
      flash(`Admin status toggled for ${username}.`);
    } catch {}
  };

  const saveLimit = async (role) => {
    const edits = limitEdits[role] || {};
    try {
      await ADMIN_SET_ROLE_LIMIT(
        role,
        edits.maxStorageBytes != null ? Number(edits.maxStorageBytes) : undefined,
        edits.maxPostsPerDay != null ? Number(edits.maxPostsPerDay) : undefined
      );
      flash(`Limits saved for role "${role}".`);
      ADMIN_GET_ROLE_LIMITS().then(d => { setRoleLimits(d); setLimitEdits({}); });
    } catch {}
  };

  if (isAdmin === null) return <div className="admin-panel"><p>Loading…</p></div>;
  if (!isAdmin) return <div className="admin-panel"><p className="admin-denied">Access denied — admin only.</p></div>;

  const filteredUsers = users.filter(u =>
    !search || u.username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="admin-panel">
      <h1 className="admin-title">Admin Dashboard</h1>
      {msg && <div className="admin-flash">{msg}</div>}

      <div className="admin-tabs">
        {['users', 'stats', 'limits', 'flagged'].map(t => (
          <button key={t} className={`admin-tab${tab === t ? ' admin-tab--active' : ''}`} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {/* ── Users tab ───────────────────────────────────────────────────── */}
      {tab === 'users' && (
        <div>
          <div className="admin-create-form">
            <h3>Create User</h3>
            <div className="admin-create-row">
              <input placeholder="Username" value={newUsername} onChange={e => setNewUsername(e.target.value)} maxLength={32} />
              <input placeholder="Password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} maxLength={32} />
              <button onClick={createUser} disabled={!newUsername || !newPassword}>Create</button>
            </div>
            {createError && <p className="admin-error">{createError}</p>}
          </div>

          <div className="admin-search-row">
            <input placeholder="Search users…" value={search} onChange={e => setSearch(e.target.value)} />
            <span className="admin-count">{filteredUsers.length} user{filteredUsers.length !== 1 ? 's' : ''}</span>
          </div>

          <table className="admin-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Role</th>
                <th>Posts</th>
                <th>Comments</th>
                <th>Uploads</th>
                <th>Post Text</th>
                <th>Comment Text</th>
                <th>BG Pattern</th>
                <th>Admin</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => (
                <tr key={u.username} className={u.is_admin ? 'admin-row--admin' : ''}>
                  <td>{u.username}</td>
                  <td>
                    <select value={u.role || 'user'} onChange={e => setRole(u.username, e.target.value)}>
                      {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td>{u.post_count ?? 0}</td>
                  <td>{u.comment_count ?? 0}</td>
                  <td>{fmt(Number(u.storage_bytes ?? 0))}</td>
                  <td>{fmt(Number(u.post_bytes ?? 0))}</td>
                  <td>{fmt(Number(u.comment_bytes ?? 0))}</td>
                  <td>{fmt(Number(u.bg_pattern_bytes ?? 0))}</td>
                  <td>
                    <input type="checkbox" checked={!!u.is_admin} onChange={() => toggleAdmin(u.username, !!u.is_admin)} />
                  </td>
                  <td style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <button className="admin-btn" onClick={async () => {
                      try { await ADMIN_EXPORT_USER(u.username); }
                      catch { flash(`Export failed for ${u.username}.`); }
                    }}>Export</button>
                    <button className="admin-btn admin-btn--danger" onClick={() => deleteUser(u.username)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Stats tab ───────────────────────────────────────────────────── */}
      {tab === 'stats' && stats && (
        <div>
          <div className="admin-stats-grid">
            {[
              ['Total Users', stats.totalUsers],
              ['Total Posts', stats.totalPosts],
              ['Published Posts', stats.publishedPosts],
              ['Total Comments', stats.totalComments],
              ['Total Uploads', stats.totalUploads],
              ['Upload Storage', fmt(Number(stats.totalStorage))],
              ['Post Text Size', fmt(Number(stats.totalPostBytes ?? 0))],
            ].map(([label, val]) => (
              <div key={label} className="admin-stat-card">
                <div className="admin-stat-value">{val}</div>
                <div className="admin-stat-label">{label}</div>
              </div>
            ))}
          </div>
          <div className="admin-orphan-row">
            <p className="admin-hint">Orphaned uploads are files no longer referenced by any post (grace period: 1 hour).</p>
            <button className="admin-btn" onClick={async () => {
              try {
                const r = await ADMIN_CLEANUP_ORPHANS();
                flash(`Deleted ${r.deleted} orphaned file${r.deleted !== 1 ? 's' : ''}.`);
                ADMIN_GET_STATS().then(setStats);
              } catch { flash('Cleanup failed.'); }
            }}>Delete Orphaned Uploads</button>
          </div>

          <div className="admin-orphan-row" style={{ marginTop: '20px' }}>
            <p className="admin-hint">Restore a user's data from a previously exported JSON file (profile + posts).</p>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                placeholder="Target username"
                value={importTarget}
                onChange={e => setImportTarget(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '13px' }}
              />
              <input
                type="file"
                accept=".json"
                ref={importFileRef}
                style={{ display: 'none' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file || !importTarget.trim()) { flash('Enter a target username first.'); return; }
                  try {
                    const text = await file.text();
                    const result = await ADMIN_IMPORT_USER(importTarget.trim(), text);
                    setImportResult(result);
                    flash(`Restore complete: ${result.postsRestored} posts restored.`);
                  } catch (err) {
                    flash(err?.response?.data?.error || 'Restore failed.');
                  }
                  e.target.value = '';
                }}
              />
              <button className="admin-btn" onClick={() => {
                if (!importTarget.trim()) { flash('Enter a target username first.'); return; }
                importFileRef.current?.click();
              }}>Restore from file…</button>
            </div>
            {importResult && (
              <p className="admin-hint" style={{ marginTop: '6px' }}>
                Last restore: profile {importResult.profileRestored ? 'restored' : 'skipped'}, {importResult.postsRestored} posts restored.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── Limits tab ──────────────────────────────────────────────────── */}
      {tab === 'limits' && (
        <div>
          <p className="admin-hint">Set default limits for each user role. Use -1 for unlimited.</p>
          <table className="admin-table">
            <thead>
              <tr><th>Role</th><th>Max Storage (bytes)</th><th>Max Posts/Day</th><th></th></tr>
            </thead>
            <tbody>
              {roleLimits.map(rl => (
                <tr key={rl.role}>
                  <td><strong>{rl.role}</strong></td>
                  <td>
                    <input
                      type="number"
                      value={limitEdits[rl.role]?.maxStorageBytes ?? rl.max_storage_bytes}
                      onChange={e => setLimitEdits(le => ({ ...le, [rl.role]: { ...(le[rl.role] || {}), maxStorageBytes: e.target.value } }))}
                      style={{ width: 120 }}
                    />
                    <span className="admin-hint-small"> ({fmt(Number(limitEdits[rl.role]?.maxStorageBytes ?? rl.max_storage_bytes))})</span>
                  </td>
                  <td>
                    <input
                      type="number"
                      value={limitEdits[rl.role]?.maxPostsPerDay ?? rl.max_posts_per_day}
                      onChange={e => setLimitEdits(le => ({ ...le, [rl.role]: { ...(le[rl.role] || {}), maxPostsPerDay: e.target.value } }))}
                      style={{ width: 80 }}
                    />
                  </td>
                  <td><button className="admin-btn" onClick={() => saveLimit(rl.role)}>Save</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Flagged tab ─────────────────────────────────────────────────── */}
      {tab === 'flagged' && (
        <div>
          <p className="admin-hint">Users flagged for unusually high storage (&gt;50 MB) or post rate (&gt;20 posts/day).</p>
          {flagged.length === 0
            ? <p className="admin-empty">No flagged users.</p>
            : (
              <table className="admin-table">
                <thead>
                  <tr><th>Username</th><th>Posts Today</th><th>Total Posts</th><th>Storage</th><th>Uploads</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {flagged.map(u => (
                    <tr key={u.username}>
                      <td>{u.username}</td>
                      <td className={u.posts_today > 20 ? 'admin-cell--warn' : ''}>{u.posts_today}</td>
                      <td>{u.post_count}</td>
                      <td className={Number(u.storage_bytes) > 52428800 ? 'admin-cell--warn' : ''}>{fmt(Number(u.storage_bytes))}</td>
                      <td>{u.upload_count}</td>
                      <td><button className="admin-btn admin-btn--danger" onClick={() => deleteUser(u.username)}>Delete</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          }
        </div>
      )}
    </div>
  );
}
