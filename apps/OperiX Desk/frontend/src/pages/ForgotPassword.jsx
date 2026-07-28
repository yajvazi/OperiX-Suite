import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Mail } from 'lucide-react';
import BrandMark from '../components/BrandMark';
import { requestPasswordReset } from '../api/client';
import { emailDomainHint, emailValidationError } from '../lib/email';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMessage('');
    setError('');

    const emailError = emailValidationError(email);
    if (emailError) {
      setError(emailError);
      return;
    }

    setBusy(true);
    try {
      const response = await requestPasswordReset(email);
      setMessage(response.detail || 'If an account exists, a reset link has been sent.');
    } catch (err) {
      setError(String(err?.response?.data?.detail ?? 'Could not send reset link right now.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-5 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#1d4ed8_0%,transparent_35%),linear-gradient(135deg,#0f172a_0%,#172b4d_50%,#020617_100%)]" />
      <div className="relative w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandMark size={48} showWordmark />
        </div>

        <form onSubmit={handleSubmit} className="rounded-3xl border border-white/10 bg-white p-6 shadow-2xl">
          <Link to="/login" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-brand-700">
            <ArrowLeft size={16} />
            Back to login
          </Link>

          <h1 className="text-2xl font-bold text-slate-900">Forgot password?</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            Enter your email and we will send you a secure link to reset your DeskDibs password.
          </p>

          <div className="mt-6">
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
            <div className="relative">
              <Mail size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={`you${emailDomainHint()}`}
                className="input-field !pl-10"
                required
              />
            </div>
          </div>

          {message && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              {message}
            </div>
          )}
          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button type="submit" disabled={busy} className="btn-primary mt-6 w-full py-3">
            {busy ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
      </div>
    </div>
  );
}
