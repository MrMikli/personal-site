'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({ message: 'Registration failed' }));
        setError(data.message || 'Registration failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Register</h1>
      <form onSubmit={onSubmit}>
        <label>
          Username (required)
          <input type="text" value={username} onChange={e => setUsername(e.target.value)} required minLength={3} maxLength={32} />
        </label>
        <label>
          Password (min 8 chars)
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
        </label>
        {error && <p className={styles.error}>{error}</p>}
        <button disabled={loading} type="submit">{loading ? 'Creating…' : 'Create account'}</button>
      </form>
    </div>
  );
}
