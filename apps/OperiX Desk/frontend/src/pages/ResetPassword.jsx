import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { resetPassword } from '../api/client';
import BrandMark from '../components/BrandMark';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) {
      setMessage('Reset link is missing or invalid.');
      return;
    }
    if (password.length < 8) {
      setMessage('Password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setBusy(true);
    setMessage('');
    try {
      await resetPassword(token, password);
      setMessage('Password updated successfully. Redirecting to login...');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setMessage(String(err?.response?.data?.detail ?? 'Could not update password.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-5 py-8">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#1d4ed8_0%,transparent_35%),linear-gradient(135deg,#0f172a_0%,#172b4d_50%,#020617_100%)]" />
      <form onSubmit={handleSubmit} className="relative w-full max-w-md rounded-3xl border border-white/10 bg-white p-6 shadow-2xl">
        <div className="mb-6 flex justify-center">
          <BrandMark size={48} showWordmark darkText />
        </div>
        <Link to="/login" className="mb-5 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-brand-700">
          <ArrowLeft size={16} />
          Back to login
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Set a New Password</h1>
          <p className="mt-1 text-sm text-slate-500">
            Choose a new password for your DeskDibs account.
          </p>
        </div>
        <div className="relative mt-5">
          <LockKeyhole size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field !pl-10"
            required
          />
        </div>
        <div className="relative">
          <LockKeyhole size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="password"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input-field !pl-10"
            required
          />
        </div>
        {message && <p className="text-sm text-slate-600">{message}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full py-3">
          {busy ? 'Saving...' : 'Update Password'}
        </button>
      </form>
    </div>
  );
}
