import React, { useState, useEffect } from 'react';
import { Heart, Activity, ShieldCheck, Clock, TrendingUp } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import api from '../services/api';
import { ScanRecord } from '../types';

export const DashboardPage: React.FC = () => {
  const [summary, setSummary] = useState<any>(null);
  const [scans, setScans] = useState<ScanRecord[]>([]);

  useEffect(() => {
    fetchSummary();
  }, []);

  const fetchSummary = async () => {
    try {
      const res = await api.get('/dashboard/summary');
      setSummary(res.data);
      if (res.data.recent_scans) {
        setScans(res.data.recent_scans);
      }
    } catch (e) {
      console.error("Dashboard error:", e);
    }
  };

  const chartData = scans
    .filter((s) => s.estimated_bpm)
    .reverse()
    .map((s, idx) => ({
      name: `Scan #${s.id}`,
      bpm: s.estimated_bpm,
      time: s.started_at.split('T')[1]?.slice(0, 5) || `#${idx + 1}`
    }));

  return (
    <div className="max-w-6xl w-full mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white">
          Physiological Dashboard
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Historical overview of accepted rPPG measurements and research trials.
        </p>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-3 text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Latest Heart Rate</span>
            <Heart className="w-4 h-4 text-rose-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">
              {summary?.latest_bpm ? summary.latest_bpm : '--'}
            </span>
            <span className="text-xs text-slate-400 font-bold">BPM</span>
          </div>
          <p className="text-[11px] text-emerald-400 mt-2">
            Quality: {summary?.latest_signal_quality || 'No data'}
          </p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-3 text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Total Scans</span>
            <Activity className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-3xl font-extrabold text-white">
            {summary?.total_scans ?? 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            Accepted: {summary?.accepted_scans_count ?? 0} sessions
          </p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-3 text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Average Resting BPM</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">
              {summary?.average_resting_bpm ? summary.average_resting_bpm : '--'}
            </span>
            <span className="text-xs text-slate-400 font-bold">BPM</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Across accepted sessions</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800">
          <div className="flex items-center justify-between mb-3 text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider">Reference Trials</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">
            {summary?.total_validation_trials ?? summary?.total_smartwatch_trials ?? 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Ground-truth pairs recorded</p>
        </div>
      </div>

      {/* Historical Trend Chart */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 mb-8">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-400" />
          Historical Heart Rate Trajectory (Accepted Measurements)
        </h2>

        <div className="h-64 w-full">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} domain={[50, 120]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                />
                <Line
                  type="monotone"
                  dataKey="bpm"
                  stroke="#38bdf8"
                  strokeWidth={2.5}
                  dot={{ fill: '#0284c7', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-slate-500">
              No accepted scan history yet. Complete a live scan to populate trajectory.
            </div>
          )}
        </div>
      </div>

      {/* Recent Scans Table */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800">
        <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
          Recent Scan Sessions
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px]">
              <tr>
                <th className="p-3">Session ID</th>
                <th className="p-3">Estimated BPM</th>
                <th className="p-3">Algorithm</th>
                <th className="p-3">Signal Quality</th>
                <th className="p-3">Classification</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {scans.length > 0 ? (
                scans.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-900/40">
                    <td className="p-3 font-mono">#{s.id}</td>
                    <td className="p-3 font-bold text-white">
                      {s.estimated_bpm ? `${s.estimated_bpm} BPM` : 'Rejected'}
                    </td>
                    <td className="p-3">{s.algorithm_name}</td>
                    <td className="p-3">{s.signal_quality}</td>
                    <td className="p-3">{s.classification}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        s.accepted ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                      }`}>
                        {s.accepted ? 'Accepted' : 'Rejected'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="p-4 text-center text-slate-500">
                    No scan sessions recorded.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
