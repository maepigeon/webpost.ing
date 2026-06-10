import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
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

const ROLES = ['user', 'trusted', 'restricted', 'admin', 'frozen'];

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
  const [importUsername, setImportUsername] = useState('');
  const [importResult, setImportResult] = useState('');
  const [importError, setImportError] = useState('');
  const importFileRef = useRef(null);
  const [sortCol, setSortCol] = useState('username');
  const [sortDir, setSortDir] = useState('asc');

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

  const sortUser = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };
  const sortArrow = (col) => sortCol === col ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  const filteredUsers = users
    .filter(u => !search || u.username?.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const numCols = ['post_count','comment_count','storage_bytes','post_bytes','comment_bytes','bg_pattern_bytes'];
      if (numCols.includes(sortCol)) return dir * ((Number(a[sortCol] ?? 0)) - (Number(b[sortCol] ?? 0)));
      return dir * String(a[sortCol] ?? '').localeCompare(String(b[sortCol] ?? ''));
    });

  return (
    <div className="admin-panel">
      <h1 className="admin-title">Admin Dashboard</h1>
      {msg && <div className="admin-flash">{msg}</div>}

      <div className="admin-tabs">
        {['users', 'stats', 'limits', 'flagged', 'import'].map(t => (
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
                <th className="admin-th-sort" onClick={() => sortUser('username')}>Username{sortArrow('username')}</th>
                <th className="admin-th-sort" onClick={() => sortUser('role')}>Role{sortArrow('role')}</th>
                <th className="admin-th-sort" onClick={() => sortUser('post_count')}>Posts{sortArrow('post_count')}</th>
                <th className="admin-th-sort" onClick={() => sortUser('comment_count')}>Comments{sortArrow('comment_count')}</th>
                <th className="admin-th-sort" onClick={() => sortUser('storage_bytes')}>Uploads{sortArrow('storage_bytes')}</th>
                <th className="admin-th-sort" onClick={() => sortUser('post_bytes')}>Post Text{sortArrow('post_bytes')}</th>
                <th className="admin-th-sort" onClick={() => sortUser('comment_bytes')}>Comment Text{sortArrow('comment_bytes')}</th>
                <th className="admin-th-sort" onClick={() => sortUser('bg_pattern_bytes')}>BG Pattern{sortArrow('bg_pattern_bytes')}</th>
                <th>Admin</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map(u => (
                <tr key={u.username} className={[
                  u.is_admin ? 'admin-row--admin' : '',
                  u.role === 'frozen' ? 'admin-row--frozen' : '',
                ].filter(Boolean).join(' ')}>
                  <td>
                    <Link to={`/users/${u.username}`} className="admin-user-link">{u.username}</Link>
                  </td>
                  <td>
                    <select value={u.role || 'user'} onChange={e => setRole(u.username, e.target.value)}
                      style={{ color: u.role === 'frozen' ? '#ef4444' : 'inherit' }}>
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
      {/* ── Import tab ─────────────────────────────────────────────────── */}
      {tab === 'import' && (
        <div>
          <p className="admin-hint">Restore a user from a data export (.json). Profile and posts will be imported. A new user is created if the username doesn't exist (temp password set — admin must reset).</p>
          <div className="admin-create-form">
            <h3>Import User Data</h3>
            <div className="admin-create-row">
              <input
                placeholder="Target username"
                value={importUsername}
                onChange={e => setImportUsername(e.target.value)}
                maxLength={32}
              />
              <input
                type="file"
                accept=".json,application/json"
                ref={importFileRef}
                style={{ fontSize: '13px' }}
              />
              <button onClick={async () => {
                setImportResult(''); setImportError('');
                const file = importFileRef.current?.files[0];
                if (!file) { setImportError('Select a JSON export file.'); return; }
                if (!importUsername.trim()) { setImportError('Enter a target username.'); return; }
                try {
                  const text = await file.text();
                  const exportData = JSON.parse(text);
                  const result = await ADMIN_IMPORT_USER(importUsername.trim(), exportData);
                  setImportResult(result.message || 'Import complete.');
                  if (importFileRef.current) importFileRef.current.value = '';
                  setImportUsername('');
                } catch (e) {
                  setImportError(e.response?.data?.error || e.message || 'Import failed.');
                }
              }} disabled={!importUsername.trim()}>Import</button>
            </div>
            {importResult && <p style={{ color: '#2e7d32', fontSize: '13px', marginTop: '8px' }}>{importResult}</p>}
            {importError && <p className="admin-error">{importError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
