import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, ShieldCheck, Cpu, Waves, ArrowRight, Eye, AlertTriangle } from 'lucide-react';

export const LandingPage: React.FC = () => {
  return (
    <div className="flex flex-col items-center">
      {/* Research Disclaimer Strip */}
      <div className="w-full bg-rose-950/40 border-b border-rose-900/50 py-2 px-4 text-center text-xs text-rose-300 flex items-center justify-center gap-2">
        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
        <span>
          <strong>RESEARCH & MONITORING PROTOTYPE:</strong> PulseVision is an experimental rPPG physiological assessment system and is NOT a certified medical diagnostic device.
        </span>
      </div>

      {/* Hero Section */}
      <section className="max-w-6xl w-full px-6 py-16 md:py-24 flex flex-col md:flex-row items-center justify-between gap-12">
        <div className="max-w-xl text-center md:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/60 border border-blue-800 text-blue-400 text-xs font-semibold mb-6">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping"></span>
            AI-Powered Remote Photoplethysmography
          </div>

          <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white leading-[1.1] mb-6">
            See Your Pulse. <br />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-rose-400 bg-clip-text text-transparent">
              Without Contact.
            </span>
          </h1>

          <p className="text-slate-400 text-base md:text-lg mb-8 leading-relaxed">
            Extract microvascular blood-volume pulse waveforms and continuous heart rate directly from ordinary facial webcam video in real-time. Powered by classical optical models and deep neural attention networks.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 justify-center md:justify-start">
            <Link
              to="/scan"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/40 transition-all transform hover:-translate-y-0.5"
            >
              Start Live Camera Scan
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              to="/validation"
              className="w-full sm:w-auto px-6 py-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              Reference Validation
            </Link>
          </div>
        </div>

        {/* 3D Anatomical Heart Hero Visual */}
        <div className="relative w-72 h-72 md:w-96 md:h-96 flex items-center justify-center">
          <div className="absolute inset-0 bg-gradient-to-tr from-rose-600/20 to-cyan-500/20 rounded-full blur-3xl animate-pulse"></div>
          <div className="relative glass-panel-glow w-64 h-64 md:w-80 md:h-80 rounded-full flex flex-col items-center justify-center text-center p-6 border-2 border-slate-700/60">
            <div className="relative mb-3">
              <span className="text-6xl md:text-7xl animate-heartbeat block filter drop-shadow-[0_0_20px_rgba(244,63,94,0.6)]">
                ❤️
              </span>
              <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-rose-600/80 text-[10px] uppercase font-bold text-white px-2 py-0.5 rounded-full shadow-md">
                Pulse: 72 BPM
              </div>
            </div>
            <h3 className="text-lg font-bold text-white mt-1">Real-Time Hemoglobin Flow</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-[200px]">
              Micro-color changes in facial capillaries tracked at 30 frames per second.
            </p>
          </div>
        </div>
      </section>

      {/* Feature Pillars */}
      <section className="max-w-6xl w-full px-6 py-12 border-t border-slate-800/80">
        <div className="text-center mb-12">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-3">Core Research Architecture</h2>
          <p className="text-slate-400 text-sm max-w-xl mx-auto">
            Combining rigorous bio-optical signal processing with deep spatial-temporal neural networks.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-950/80 border border-blue-800 text-blue-400 flex items-center justify-center mb-4">
              <Waves className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">POS & CHROM Models</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Mathematical projection of skin color signals on orthogonal planes eliminating specular reflections and motion artifacts.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all">
            <div className="w-12 h-12 rounded-xl bg-cyan-950/80 border border-cyan-800 text-cyan-400 flex items-center justify-center mb-4">
              <Cpu className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">TS-CAN Neural Net</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Temporal Shift Attention Network modeling facial appearance and capillary pulse flow with pre-trained PURE weights.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all">
            <div className="w-12 h-12 rounded-xl bg-emerald-950/80 border border-emerald-800 text-emerald-400 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Quality Rejection</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Zero fabrication rule: signals degraded by low lighting or head motion are explicitly rejected with corrective guidance.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-slate-800 hover:border-slate-700 transition-all">
            <div className="w-12 h-12 rounded-xl bg-purple-950/80 border border-purple-800 text-purple-400 flex items-center justify-center mb-4">
              <Eye className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Fatigue & Stress</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              6-point Eye Aspect Ratio (EAR), blink frequency, and pulse variance indicators clearly labeled as research proxies.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};
