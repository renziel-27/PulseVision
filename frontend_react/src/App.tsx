import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { Navbar } from './components/Navbar';
import { LandingPage } from './pages/LandingPage';
import { ScanPage } from './pages/ScanPage';
import { DashboardPage } from './pages/DashboardPage';
import { ValidationPage } from './pages/ValidationPage';
import { ReportsPage } from './pages/ReportsPage';
import { AuthModal } from './pages/AuthModal';
import { User } from './types';
import { Heart, ExternalLink } from 'lucide-react';

export const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  useEffect(() => {
    const storedUser = localStorage.getItem('pulsevision_user');
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
      } catch (e) {
        console.error('Failed to parse cached user:', e);
      }
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('pulsevision_token');
    localStorage.removeItem('pulsevision_user');
    setUser(null);
  };

  const handleAuthSuccess = (authenticatedUser: User) => {
    setUser(authenticatedUser);
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/20 selection:text-cyan-300">
      <Navbar
        user={user}
        onOpenAuth={() => setAuthModalOpen(true)}
        onLogout={handleLogout}
      />

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/scan" element={<ScanPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/validation" element={<ValidationPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <footer className="border-t border-slate-800/80 bg-slate-950/80 backdrop-blur-sm py-8 px-4 text-center text-xs text-slate-500">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Heart className="w-4 h-4 text-rose-500 fill-rose-500/30" />
            <span className="font-semibold text-slate-300">PulseVision AI 2.0</span>
            <span>• Non-Contact Remote Photoplethysmography (rPPG) Research Platform</span>
          </div>
          <div className="flex items-center gap-6">
            <Link to="/scan" className="hover:text-cyan-400 transition-colors">Live Scan</Link>
            <Link to="/dashboard" className="hover:text-cyan-400 transition-colors">Dashboard</Link>
            <Link to="/validation" className="hover:text-cyan-400 transition-colors">Reference Validation</Link>
            <Link to="/reports" className="hover:text-cyan-400 transition-colors">Clinical Reports</Link>
            <a
              href="/docs"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 hover:text-cyan-400 transition-colors"
            >
              API Docs <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
        <p className="mt-4 text-[11px] text-slate-600 max-w-3xl mx-auto">
          PulseVision is intended solely for scientific research, academic benchmarking, and non-diagnostic biometric monitoring.
          It does not diagnose, treat, or prevent any cardiovascular or medical condition.
        </p>
      </footer>

      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
};

export default App;
