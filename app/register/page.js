'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
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
        body: JSON.stringify({ username, email: email || null, password })
      });
      if (res.ok) {
        router.push('/login');
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
          Email (optional)
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} />
        </label>
        <label>
          Password (min 8 chars)
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} />
        </label>
        {error && <p style={{ color: 'crimson' }}>{error}</p>}
        <button disabled={loading} type="submit">{loading ? 'Creating…' : 'Create account'}</button>
      </form>
    </div>
  );
}
