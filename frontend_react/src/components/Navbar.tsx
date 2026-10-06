import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Activity, Heart, ShieldCheck, FileText, User as UserIcon, LogOut } from 'lucide-react';
import { User } from '../types';

interface NavbarProps {
  user: User | null;
  onOpenAuth: () => void;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onOpenAuth, onLogout }) => {
  const location = useLocation();

  const navLinks = [
    { name: 'Live Scan', path: '/scan', icon: Activity },
    { name: 'Dashboard', path: '/dashboard', icon: Heart },
    { name: 'Reference Validation', path: '/validation', icon: ShieldCheck },
    { name: 'Reports', path: '/reports', icon: FileText },
  ];

  return (
    <nav className="border-b border-slate-800 bg-[#070b14]/90 backdrop-blur-md sticky top-0 z-50 px-4 lg:px-8 py-3.5 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-rose-600 to-cyan-500 p-0.5 shadow-lg shadow-rose-900/30">
          <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
            <Heart className="w-5 h-5 text-rose-500 animate-pulse fill-rose-500/20" />
          </div>
        </div>
        <div>
          <span className="text-xl font-bold tracking-tight text-white flex items-center gap-1.5">
            Pulse<span className="text-cyan-400">Vision</span>
            <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/60">
              AI 2.0
            </span>
          </span>
          <p className="text-[11px] text-slate-400">Contactless rPPG Biometrics</p>
        </div>
      </Link>

      <div className="hidden md:flex items-center gap-1 bg-slate-900/70 border border-slate-800 p-1 rounded-xl">
        {navLinks.map((link) => {
          const Icon = link.icon;
          const isActive = location.pathname === link.path;
          return (
            <Link
              key={link.path}
              to={link.path}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-900/40'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              {link.name}
            </Link>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        {user ? (
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-white">{user.name}</p>
              <p className="text-[10px] text-slate-400">{user.email}</p>
            </div>
            <button
              onClick={onLogout}
              className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 hover:border-rose-900 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-lg bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg shadow-blue-900/20 transition-all"
          >
            <UserIcon className="w-3.5 h-3.5" />
            Sign In / Register
          </button>
        )}
      </div>
    </nav>
  );
};
