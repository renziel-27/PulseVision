import React, { useState } from 'react';
import { X, Lock, Mail, User as UserIcon, Phone } from 'lucide-react';
import api from '../services/api';
import { User } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: User) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    try {
      if (isLogin) {
        const res = await api.post('/auth/login', { email, password });
        localStorage.setItem('pulsevision_token', res.data.access_token);
        localStorage.setItem('pulsevision_user', JSON.stringify(res.data.user));
        onSuccess(res.data.user);
        onClose();
      } else {
        const res = await api.post('/auth/register', { name, email, password, phone });
        localStorage.setItem('pulsevision_token', res.data.access_token);
        localStorage.setItem('pulsevision_user', JSON.stringify(res.data.user));
        onSuccess(res.data.user);
        onClose();
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="glass-panel-glow w-full max-w-md p-6 rounded-2xl border border-slate-700 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="text-xl font-bold text-white mb-2">
          {isLogin ? 'Sign In to PulseVision' : 'Create Researcher Account'}
        </h2>
        <p className="text-xs text-slate-400 mb-6">
          {isLogin ? 'Access your historical vitals and validation trials.' : 'Participate in contactless rPPG trials.'}
        </p>

        {errorMsg && (
          <div className="p-3 mb-4 rounded-lg bg-rose-950/80 border border-rose-800 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {!isLogin && (
            <div>
              <label className="block text-slate-400 mb-1">Full Name</label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Dr. Alex Rivera"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2.5 pl-9 pr-3 text-white outline-none focus:border-cyan-400"
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-slate-400 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="email"
                placeholder="name@university.edu"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2.5 pl-9 pr-3 text-white outline-none focus:border-cyan-400"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-400 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2.5 pl-9 pr-3 text-white outline-none focus:border-cyan-400"
                required
              />
            </div>
          </div>

          {!isLogin && (
            <div>
              <label className="block text-slate-400 mb-1">Phone Number (optional for SMS)</label>
              <div className="relative">
                <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="+14155552671"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg py-2.5 pl-9 pr-3 text-white outline-none focus:border-cyan-400"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold shadow-lg shadow-blue-900/30 transition-all"
          >
            {isLogin ? 'Sign In' : 'Complete Registration'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-400">
          {isLogin ? "Don't have an account? " : "Already registered? "}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setErrorMsg('');
            }}
            className="text-cyan-400 font-semibold hover:underline"
          >
            {isLogin ? 'Register now' : 'Sign in'}
          </button>
        </div>
      </div>
    </div>
  );
};
