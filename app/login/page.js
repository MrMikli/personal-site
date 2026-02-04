'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, password })
      });
      if (res.ok) {
        router.push('/protected');
      } else {
        const data = await res.json().catch(() => ({ message: 'Login failed' }));
        setError(data.message || 'Login failed');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1>Login</h1>
      <form onSubmit={onSubmit}>
        <label>
          Email or Username
          <input type="text" value={identifier} onChange={e => setIdentifier(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </label>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button disabled={loading} type="submit">{loading ? 'Signing in…' : 'Login'}</button>
      </form>
    </div>
  );
}
