import React, { useState, useEffect } from 'react';
import { FileText, Download, Send, MessageSquare } from 'lucide-react';
import api from '../services/api';

export const ReportsPage: React.FC = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [smsPhone, setSmsPhone] = useState('');
  const [smsStatus, setSmsStatus] = useState('');

  useEffect(() => {
    fetchReports();
  }, []);

  const fetchReports = async () => {
    try {
      const res = await api.get('/reports');
      if (res.data.reports) {
        setReports(res.data.reports);
      }
    } catch (e) {
      console.error("Reports error:", e);
    }
  };

  const handleSendSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smsPhone) return;

    try {
      const res = await api.post('/send-sms', {
        phone: smsPhone,
        user_name: 'PulseVision Participant',
        bpm: 74.0,
        classification: 'Normal Range',
        stress_level: 'Low (Relaxed)',
        fatigue_level: 'Normal'
      });

      if (res.data.success) {
        setSmsStatus(`SMS Dispatched: ${res.data.status}`);
        setSmsPhone('');
      } else {
        setSmsStatus(`Error: ${res.data.error || 'Failed'}`);
      }
    } catch (err: any) {
      setSmsStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="max-w-6xl w-full mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
          <FileText className="w-7 h-7 text-blue-400" />
          Clinical Research Reports
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          Download PDF assessment summaries with embedded pulse waveforms, FFT spectrum, and validation metrics.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Reports List */}
        <div className="lg:col-span-8 glass-panel p-6 rounded-2xl border border-slate-800">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4">
            Generated PDF Reports
          </h2>

          <div className="space-y-3">
            {reports.length > 0 ? (
              reports.map((r) => (
                <div key={r.id} className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-white flex items-center gap-2">
                      <FileText className="w-4 h-4 text-rose-500" />
                      {r.file_name}
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Created: {r.created_at}</p>
                  </div>

                  <a
                    href={r.download_url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-md"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Download PDF
                  </a>
                </div>
              ))
            ) : (
              <div className="p-6 text-center text-xs text-slate-500">
                No PDF reports generated yet. Complete a scan session to export a report.
              </div>
            )}
          </div>
        </div>

        {/* SMS Notification Card */}
        <div className="lg:col-span-4 glass-panel p-6 rounded-2xl border border-slate-800">
          <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-emerald-400" />
            SMS Summary Dispatch
          </h2>

          <p className="text-xs text-slate-400 mb-4 leading-relaxed">
            Send an instant text message summary with estimated heart rate and research disclaimer to a registered phone number.
          </p>

          <form onSubmit={handleSendSms} className="space-y-4 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">Phone Number (numeric with +)</label>
              <input
                type="text"
                placeholder="+14155552671"
                value={smsPhone}
                onChange={(e) => setSmsPhone(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-emerald-400"
                required
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-semibold flex items-center justify-center gap-2 shadow-md transition-all"
            >
              <Send className="w-4 h-4" />
              Dispatch SMS Report
            </button>

            {smsStatus && (
              <p className="text-[11px] text-emerald-300 text-center">{smsStatus}</p>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
