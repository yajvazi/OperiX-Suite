import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { emailDomainHint, emailValidationError } from '../lib/email';
import BrandMark from '../components/BrandMark';

export default function Login() {
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-600 border-t-transparent" />
      </div>
    );
  }
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    const emailError = emailValidationError(email);
    if (emailError) {
      setError(emailError);
      return;
    }
    setSubmitting(true);
    try {
      const { user } = await login(email, password);
      navigate(user?.role === 'admin' || user?.permissions?.includes('workspace.manage') ? '/admin' : '/');
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      setError(
        detail
          ? String(detail)
          : status === 401
          ? 'Incorrect email or password. Please try again.'
          : err?.message || 'Sign in service is unavailable. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="desk-login-page">
      <section className="desk-login-art" aria-hidden="true">
        <div className="desk-login-art-glow" />
        <div className="desk-login-art-card">
          <div className="desk-login-art-card-top"><span className="desk-brand-dot" /><span>Today’s flow</span><strong>+18.4%</strong></div>
          <div className="desk-login-chart"><i /><i /><i /><i /><i /><i /><i /></div>
          <div className="desk-login-art-label"><span>Reservations confirmed</span><strong>48</strong></div>
        </div>
        <div className="desk-login-copy"><span>OperiX Suite</span><h2>Make every workspace feel effortless.</h2><p>One calm workspace for your team, desks, and reservations.</p></div>
      </section>
      <section className="desk-login-panel">
        <BrandMark className="desk-login-brand" size={30} showWordmark darkText />
        <div className="desk-login-heading"><span>Welcome back</span><h1>Sign in to Desk</h1><p>Use the same OperiX account you use across the Suite.</p></div>
        <form onSubmit={handleSubmit} className="desk-login-form">
          <label>Email address<div className="desk-input-icon"><Mail size={17} /><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`you${emailDomainHint()}`} autoComplete="email" required /></div></label>
          <label>Password<div className="desk-input-icon"><LockKeyhole size={17} /><input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password" required /></div></label>
          {error && <div className="desk-login-error" role="alert">{error}</div>}
          <button type="submit" disabled={submitting} className="desk-login-submit">{submitting ? 'Signing in…' : 'Sign in'}<ArrowRight size={17} /></button>
        </form>
        <div className="desk-login-footer"><span>Protected by your OperiX account</span><Link to="/forgot-password">Forgot password?</Link></div>
      </section>
    </main>
  );
}
