import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Armchair, CalendarCheck, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { OFFICE_HERO } from '../lib/constants';
import { emailDomainHint, emailValidationError } from '../lib/email';
import BrandMark from '../components/BrandMark';

export default function Login() {
  const { user, loading, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
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
      navigate(user?.role === 'admin' ? '/admin' : '/reservations');
    } catch (err) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      setError(
        detail
          ? String(detail)
          : status === 401
          ? 'Incorrect email or password. Please try again.'
          : 'Sign in service is unavailable. Please check that the API is running and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-950 lg:flex">
      <div className="relative min-h-[100dvh] overflow-hidden bg-slate-950 lg:hidden">
        <img src={OFFICE_HERO} alt="" className="fixed inset-0 h-[100dvh] w-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-brand-950/95 via-brand-900/90 to-slate-950" />
        <div className="relative flex min-h-[100dvh] flex-col px-5 py-6">
          <div className="flex items-center justify-between">
            <BrandMark size={46} showWordmark />
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/15">
              HQ
            </span>
          </div>

          <div className="mt-10 text-white">
            <p className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium ring-1 ring-white/15">
              <Armchair size={13} />
              Reserve seats faster
            </p>
            <h1 className="mt-4 text-3xl font-bold leading-tight">
              Welcome back
            </h1>
            <p className="mt-2 max-w-sm text-sm leading-6 text-brand-100">
              Sign in to book desks, manage reservations, and see office availability in real time.
            </p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-3 text-white">
            <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/15 backdrop-blur">
              <CalendarCheck size={17} />
              <p className="mt-2 text-xs font-medium">Manage bookings</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 ring-1 ring-white/15 backdrop-blur">
              <Armchair size={17} />
              <p className="mt-2 text-xs font-medium">Find open seats</p>
            </div>
          </div>

          <div className="mt-6 rounded-3xl border border-white/15 bg-white p-5 shadow-2xl">
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
                <div className="relative">
                  <Mail size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={`you${emailDomainHint()}`}
                    className="input-field !pl-10"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
                <div className="relative">
                  <LockKeyhole size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="input-field !pl-10"
                    required
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <label className="flex cursor-pointer items-center gap-2 text-slate-600">
                  <input
                    type="checkbox"
                    checked={remember}
                    onChange={(e) => setRemember(e.target.checked)}
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                  />
                  Remember me
                </label>
                <Link to="/forgot-password" className="font-medium text-brand-600">
                  Forgot?
                </Link>
              </div>

              {error && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <button type="submit" disabled={submitting} className="btn-primary w-full py-3">
                {submitting ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>
      </div>

      <div className="relative hidden w-[52%] overflow-hidden lg:block">
        <img src={OFFICE_HERO} alt="" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-900/90 via-brand-800/85 to-brand-700/80" />
        <div className="absolute inset-0 flex flex-col justify-center px-14 text-white">
          <BrandMark size={46} showWordmark />
          <h2 className="max-w-md text-4xl font-bold leading-tight">
            Workplace flexibility that works for you
          </h2>
          <ul className="mt-8 space-y-4 text-brand-100">
            {[
              'Smart desk reservations',
              'Real-time availability',
              'Seamless workspace experience',
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-base">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20 text-sm">
                  +
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="hidden flex-1 flex-col justify-center bg-white px-8 py-12 sm:px-16 lg:flex">
        <div className="mx-auto w-full max-w-[400px]">
          <BrandMark className="mb-8 lg:hidden" size={42} showWordmark darkText />

          <h1 className="text-2xl font-bold text-slate-900">Welcome back</h1>
          <p className="mt-2 text-slate-500">Sign in to manage your workspace bookings</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={`you${emailDomainHint()}`}
                className="input-field"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="input-field"
                required
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-600"
                />
                Remember me
              </label>
              <Link to="/forgot-password" className="font-medium text-brand-600 hover:text-brand-700">
                Forgot password?
              </Link>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button type="submit" disabled={submitting} className="btn-primary w-full py-3">
              {submitting ? 'Signing in…' : 'Sign In'}
            </button>

          </form>
        </div>
      </div>
    </div>
  );
}
