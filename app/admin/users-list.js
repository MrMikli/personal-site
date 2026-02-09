'use client';
import { useEffect, useState } from 'react';
import styles from './users-list.module.css';

export default function UsersList() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [deletingUserId, setDeletingUserId] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load users');
      setUsers(data.users || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggle(username, isAdmin) {
    setError('');
    const prev = users.slice();
    setUsers(prev.map(u => u.username === username ? { ...u, isAdmin } : u));
    try {
      const res = await fetch('/api/admin/toggle-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, isAdmin })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Update failed');
    } catch (e) {
      setError(e.message);
      // revert on error
      setUsers(prev);
    }
  }

  async function deleteUser(user) {
    if (!user?.id) return;
    setError('');

    const ok = confirm(
      `Delete user "${user.username}"? This will also remove any gauntlet/heat signups and rolls for this user.`
    );
    if (!ok) return;

    const prev = users.slice();
    setDeletingUserId(user.id);
    setUsers(prev.filter(u => u.id !== user.id));

    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'DELETE'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Delete failed');
    } catch (e) {
      setError(e.message);
      setUsers(prev);
    } finally {
      setDeletingUserId(null);
    }
  }

  return (
    <div>
      {loading && <p>Loading users…</p>}
      {error && <p className={styles.error}>{error}</p>}
      {!loading && users.length === 0 && <p>No users found.</p>}
      {!loading && users.length > 0 && (
        <div className="table-wrap">
          <table className="table-compact">
            <thead>
              <tr>
                <th>Username</th>
                <th>Admin</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id}>
                  <td>{u.username}</td>
                  <td>
                    <label className={styles.inlineLabel}>
                      <input
                        type="checkbox"
                        checked={u.isAdmin}
                        onChange={e => toggle(u.username, e.target.checked)}
                        disabled={deletingUserId === u.id}
                      />
                      {u.isAdmin ? 'Yes' : 'No'}
                    </label>
                  </td>
                  <td>
                    <button
                      type="button"
                      className={styles.dangerButton}
                      onClick={() => deleteUser(u)}
                      disabled={deletingUserId === u.id}
                    >
                      {deletingUserId === u.id ? 'Deleting…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
