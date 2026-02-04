'use client';
import { useEffect, useState } from 'react';

export default function UsersList() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

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

  return (
    <div>
      {loading && <p>Loading users…</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {!loading && users.length === 0 && <p>No users found.</p>}
      {!loading && users.length > 0 && (
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Username</th>
              <th style={{ textAlign: 'left', borderBottom: '1px solid #ddd', padding: 8 }}>Admin</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td style={{ padding: 8 }}>{u.username}</td>
                <td style={{ padding: 8 }}>
                  <label style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="checkbox"
                      checked={u.isAdmin}
                      onChange={e => toggle(u.username, e.target.checked)}
                    />
                    {u.isAdmin ? 'Yes' : 'No'}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
