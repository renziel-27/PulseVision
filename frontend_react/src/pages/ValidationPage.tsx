import React, { useState, useEffect, useRef } from 'react';
import {
  Watch, Plus, CheckCircle, Download, RefreshCw, Trash2, Edit3, X,
  AlertTriangle, Info, Layers, Cpu, Database, Activity, FileText, Check, Eye, Settings
} from 'lucide-react';
import api from '../services/api';
import { ValidationTrial, ValidationStats } from '../types';

export const ValidationPage: React.FC = () => {
  const [trials, setTrials] = useState<ValidationTrial[]>([]);
  const [stats, setStats] = useState<ValidationStats | null>(null);
  const [nextTrialCode, setNextTrialCode] = useState('T001');

  // Form states
  const [smartwatchBpm, setSmartwatchBpm] = useState('');
  const [pulsevisionBpm, setPulsevisionBpm] = useState('');
  const [participantCode, setParticipantCode] = useState('P01');
  const [condition, setCondition] = useState('Resting');
  const [duration, setDuration] = useState('30');
  const [signalQuality, setSignalQuality] = useState('Good');
  const [notes, setNotes] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Bulk Selection states
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Edit Modal states
  const [editingTrial, setEditingTrial] = useState<ValidationTrial | null>(null);
  const [editSwBpm, setEditSwBpm] = useState('');
  const [editPvBpm, setEditPvBpm] = useState('');
  const [editParticipant, setEditParticipant] = useState('');
  const [editCondition, setEditCondition] = useState('Resting');
  const [editStatus, setEditStatus] = useState('VALID');
  const [editInvalidReason, setEditInvalidReason] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Bulk Edit Modal states
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [bulkCondition, setBulkCondition] = useState('UNCHANGED');
  const [bulkStatus, setBulkStatus] = useState('UNCHANGED');
  const [bulkNotes, setBulkNotes] = useState('');

  // Delete states
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<{ id: number; code: string } | null>(null);

  // Single Trial Details modal
  const [detailTrial, setDetailTrial] = useState<ValidationTrial | null>(null);

  // Metric Info Modal
  const [metricInfoKey, setMetricInfoKey] = useState<string | null>(null);

  // System Insights Modal & Active Tab
  const [systemInsightsOpen, setSystemInsightsOpen] = useState(false);
  const [insightsTab, setInsightsTab] = useState<'architecture' | 'models' | 'database' | 'math' | 'disclaimer'>('architecture');

  const scatterCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const errorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [scatterTooltip, setScatterTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    trial: ValidationTrial | null;
  }>({ visible: false, x: 0, y: 0, trial: null });

  useEffect(() => {
    fetchTrials();
    syncLatestScan();
  }, []);

  useEffect(() => {
    renderScatterPlot();
    renderErrorChart();
  }, [trials]);

  const fetchTrials = async () => {
    try {
      const res = await api.get('/validation/trials');
      if (res.data.success) {
        setTrials(res.data.trials || []);
        setStats(res.data.stats || null);
        if (res.data.next_trial_code) {
          setNextTrialCode(res.data.next_trial_code);
        }
      }
    } catch (e) {
      console.error("Trials fetch error:", e);
    }
  };

  const syncLatestScan = async () => {
    try {
      const res = await api.get('/validation/latest-scan');
      if (res.data.success && res.data.has_scan) {
        setPulsevisionBpm(String(res.data.bpm));
        setDuration(String(Math.round(res.data.duration_seconds || 30)));
        setSignalQuality(res.data.signal_quality || 'Good');
        setStatusMsg({ text: res.data.message, type: 'info' });
        return;
      }
    } catch (e) {
      console.warn("Could not sync latest scan from backend:", e);
    }

    try {
      const localScanStr = localStorage.getItem('pulsevision_latest_scan');
      if (localScanStr) {
        const localScan = JSON.parse(localScanStr);
        if (localScan && localScan.bpm) {
          setPulsevisionBpm(String(localScan.bpm));
          if (localScan.duration) setDuration(String(Math.round(localScan.duration)));
          if (localScan.signal_quality) setSignalQuality(localScan.signal_quality);
          setStatusMsg({ text: `Loaded latest scan from session (${localScan.bpm} BPM)`, type: 'info' });
          return;
        }
      }
    } catch (e) {
      console.warn("Could not read local scan:", e);
    }
    setStatusMsg({ text: 'No live scan found. You may enter the PulseVision BPM manually.', type: 'info' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sw = parseFloat(smartwatchBpm);
    const pv = parseFloat(pulsevisionBpm);

    if (isNaN(sw) || sw < 30 || sw > 240) {
      setStatusMsg({ text: 'Please enter a valid Smartwatch BPM (range 30–240).', type: 'error' });
      return;
    }
    if (isNaN(pv) || pv <= 0) {
      setStatusMsg({ text: 'Awaiting valid PulseVision BPM. Please run a Live Scan first.', type: 'error' });
      return;
    }

    setIsSaving(true);
    try {
      const isPoor = signalQuality.toLowerCase() === 'poor';
      const payload = {
        smartwatch_bpm: sw,
        pulsevision_bpm: pv,
        trial_code: nextTrialCode,
        participant_code: participantCode.trim() || 'P01',
        reference_source: 'Smartwatch',
        condition,
        measurement_duration: parseFloat(duration) || 30.0,
        signal_quality: isPoor ? 0.3 : 1.0,
        status: isPoor ? 'INVALID' : 'VALID',
        invalid_reason: isPoor ? 'Poor signal quality' : null,
        notes: notes.trim() || null
      };
      console.log("[PulseVision] trial payload:", payload);
      const res = await api.post('/validation/trial', payload);
      console.log("[PulseVision] trial response:", res.data);

      if (res.data.id || res.data.success !== false) {
        setStatusMsg({ text: `Trial ${res.data.trial_code || nextTrialCode} saved successfully!`, type: 'success' });
        setSmartwatchBpm('');
        setNotes('');
        await fetchTrials();
      }
    } catch (err: any) {
      setStatusMsg({ text: `Save failed: ${err.response?.data?.detail || err.message}`, type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleOpenEdit = (t: ValidationTrial) => {
    setEditingTrial(t);
    setEditSwBpm(String(t.smartwatch_bpm ?? t.reference_bpm));
    setEditPvBpm(String(t.pulsevision_bpm));
    setEditParticipant(t.participant_code || 'P01');
    setEditCondition(t.condition || 'Resting');
    setEditStatus(t.status || 'VALID');
    setEditInvalidReason(t.invalid_reason || '');
    setEditNotes(t.notes || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTrial) return;

    try {
      const res = await api.put(`/validation/trial/${editingTrial.id}`, {
        smartwatch_bpm: parseFloat(editSwBpm),
        pulsevision_bpm: parseFloat(editPvBpm),
        participant_code: editParticipant,
        condition: editCondition,
        status: editStatus,
        invalid_reason: editInvalidReason,
        notes: editNotes
      });

      if (res.data.id) {
        setEditingTrial(null);
        fetchTrials();
      }
    } catch (err: any) {
      alert(`Update failed: ${err.message}`);
    }
  };

  // Selection handlers
  const toggleSelectTrial = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === trials.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(trials.map(t => t.id)));
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Bulk Edit handlers
  const handleSaveBulkEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedIds.size === 0) return;

    const payload: {
      trial_ids: number[];
      condition?: string;
      status?: string;
      notes?: string;
    } = {
      trial_ids: Array.from(selectedIds)
    };

    if (bulkCondition !== 'UNCHANGED') payload.condition = bulkCondition;
    if (bulkStatus !== 'UNCHANGED') payload.status = bulkStatus;
    if (bulkNotes.trim()) payload.notes = bulkNotes.trim();

    try {
      const res = await api.post('/validation/bulk-update', payload);
      if (res.data.success) {
        setBulkEditOpen(false);
        setBulkNotes('');
        setBulkCondition('UNCHANGED');
        setBulkStatus('UNCHANGED');
        clearSelection();
        fetchTrials();
      }
    } catch (err: any) {
      alert(`Bulk edit failed: ${err.response?.data?.detail || err.message}`);
    }
  };

  // Delete handlers
  const handleConfirmSingleDelete = async () => {
    if (!singleDeleteTarget) return;
    try {
      await api.delete(`/validation/trial/${singleDeleteTarget.id}`);
      setSingleDeleteTarget(null);
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(singleDeleteTarget.id);
        return next;
      });
      fetchTrials();
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const res = await api.post('/validation/bulk-delete', {
        trial_ids: Array.from(selectedIds)
      });
      if (res.data.success) {
        setBulkDeleteConfirmOpen(false);
        clearSelection();
        fetchTrials();
      }
    } catch (err: any) {
      alert(`Bulk delete failed: ${err.response?.data?.detail || err.message}`);
    }
  };

  const handleExportCsv = (trialIdList?: number[]) => {
    let url = '/api/validation/export-csv';
    if (trialIdList && trialIdList.length > 0) {
      url += '?trial_ids=' + trialIdList.join(',');
    }
    window.open(url, '_blank');
  };

  const renderScatterPlot = () => {
    const canvas = scatterCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width > 50 ? rect.width : 500;
    const h = rect.height > 50 ? rect.height : 220;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.resetTransform?.();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pad = 42;
    const minBPM = 40;
    const maxBPM = 160;

    const toX = (bpm: number) => pad + ((bpm - minBPM) / (maxBPM - minBPM)) * (w - 2 * pad);
    const toY = (bpm: number) => (h - pad) - ((bpm - minBPM) / (maxBPM - minBPM)) * (h - 2 * pad);

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let b = 40; b <= 160; b += 20) {
      const x = toX(b);
      const y = toY(b);
      ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, h - pad); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`${b}`, x, h - pad + 13);
      ctx.textAlign = 'right';
      ctx.fillText(`${b}`, pad - 6, y + 3);
    }

    // Axis Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Smartwatch BPM (Reference)', w / 2, h - 6);

    ctx.save();
    ctx.translate(12, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('PulseVision BPM', 0, 0);
    ctx.restore();

    // y = x dashed agreement line
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(toX(minBPM), toY(minBPM));
    ctx.lineTo(toX(maxBPM), toY(maxBPM));
    ctx.stroke();
    ctx.setLineDash([]);

    if (trials.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No paired validation data available.', w / 2, h / 2 - 6);
      return;
    }

    // Plot Points
    trials.forEach((t) => {
      const swVal = t.smartwatch_bpm ?? t.reference_bpm;
      const pvVal = t.pulsevision_bpm;
      if (swVal == null || pvVal == null) return;

      const x = toX(swVal);
      const y = toY(pvVal);
      const err = Math.abs(swVal - pvVal);
      const isValid = (t.status || 'VALID').toUpperCase() === 'VALID';

      let dotColor = '#00ff9d';
      if (!isValid) dotColor = '#64748b';
      else if (err > 4.0) dotColor = '#ff2a6d';
      else if (err > 2.0) dotColor = '#ffb800';

      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, 2 * Math.PI);
      ctx.fill();

      // Highlight selected point
      if (selectedIds.has(t.id)) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  };

  // Scatter mouse move handler for tooltip
  const handleScatterMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = scatterCanvasRef.current;
    if (!canvas || trials.length === 0) return;

    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const pad = 42;
    const minBPM = 40;
    const maxBPM = 160;
    const w = rect.width;
    const h = rect.height;

    const toX = (bpm: number) => pad + ((bpm - minBPM) / (maxBPM - minBPM)) * (w - 2 * pad);
    const toY = (bpm: number) => (h - pad) - ((bpm - minBPM) / (maxBPM - minBPM)) * (h - 2 * pad);

    let closest: ValidationTrial | null = null;
    let minDist = 14;

    trials.forEach(t => {
      const swVal = t.smartwatch_bpm ?? t.reference_bpm;
      const pvVal = t.pulsevision_bpm;
      if (swVal == null || pvVal == null) return;

      const px = toX(swVal);
      const py = toY(pvVal);
      const dist = Math.hypot(mouseX - px, mouseY - py);
      if (dist < minDist) {
        minDist = dist;
        closest = t;
      }
    });

    if (closest) {
      setScatterTooltip({
        visible: true,
        x: mouseX,
        y: mouseY,
        trial: closest
      });
    } else {
      setScatterTooltip(prev => ({ ...prev, visible: false }));
    }
  };

  const handleScatterClick = () => {
    if (scatterTooltip.visible && scatterTooltip.trial) {
      setDetailTrial(scatterTooltip.trial);
    }
  };

  const renderErrorChart = () => {
    const canvas = errorCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width > 50 ? rect.width : 500;
    const h = rect.height > 50 ? rect.height : 180;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.resetTransform?.();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const pad = 38;
    const maxErr = 10;
    const toY = (err: number) => (h - pad) - (Math.min(err, maxErr) / maxErr) * (h - 2 * pad);

    if (trials.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('No error data available yet.', w / 2, h / 2);
      return;
    }

    // Grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    for (let e = 0; e <= maxErr; e += 2) {
      const y = toY(e);
      ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
      ctx.fillStyle = '#64748b';
      ctx.font = '9px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${e}`, pad - 6, y + 3);
    }

    // 2 BPM Good threshold
    ctx.strokeStyle = 'rgba(0, 255, 157, 0.25)';
    ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(pad, toY(2)); ctx.lineTo(w - pad, toY(2)); ctx.stroke();

    // 4 BPM Moderate threshold
    ctx.strokeStyle = 'rgba(255, 42, 109, 0.25)';
    ctx.beginPath(); ctx.moveTo(pad, toY(4)); ctx.lineTo(w - pad, toY(4)); ctx.stroke();
    ctx.setLineDash([]);

    // Axis Labels
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Trial (Chronological)', w / 2, h - 4);

    ctx.save();
    ctx.translate(12, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Abs Error (BPM)', 0, 0);
    ctx.restore();

    // Bars
    const sorted = [...trials].reverse();
    const step = (w - 2 * pad) / Math.max(sorted.length - 1, 1);
    sorted.forEach((t, i) => {
      const x = pad + i * step;
      const y = toY(t.absolute_error);
      const isValid = (t.status || 'VALID').toUpperCase() === 'VALID';

      let color = '#00ff9d';
      if (!isValid) color = '#64748b';
      else if (t.absolute_error > 4.0) color = '#ff2a6d';
      else if (t.absolute_error > 2.0) color = '#ffb800';

      ctx.fillStyle = color;
      const barW = Math.max(2, Math.min(10, step * 0.6));
      ctx.fillRect(x - barW / 2, y, barW, (h - pad) - y);
    });
  };

  const hasValidTrials = (stats?.valid_trials ?? 0) > 0;

  // Metric info explanations
  const metricDetails: Record<string, { title: string; formula: string; text: string; note: string }> = {
    mae: {
      title: 'MAE — Mean Absolute Error',
      formula: 'MAE = (1 / N) * ∑ |PulseVision_i - Smartwatch_i|',
      text: 'Measures the average magnitude of absolute error between camera rPPG estimates and smartwatch readings in beats per minute (BPM).',
      note: 'Lower is better. Clinical benchmark target: MAE ≤ 3.0 BPM for resting conditions.'
    },
    rmse: {
      title: 'RMSE — Root Mean Square Error',
      formula: 'RMSE = √[ (1 / N) * ∑ (PulseVision_i - Smartwatch_i)² ]',
      text: 'Measures the standard deviation of estimation errors. Because errors are squared before averaging, RMSE penalizes large outlier errors more heavily than MAE.',
      note: 'Lower is better. Good agreement target: RMSE ≤ 4.5 BPM.'
    },
    pearson: {
      title: 'Pearson Correlation Coefficient (r)',
      formula: 'r = ∑(x - x̄)(y - ȳ) / √[ ∑(x - x̄)² * ∑(y - ȳ)² ]',
      text: 'Evaluates the linear relationship and co-directional tracking between camera PulseVision measurements and smartwatch reference heart rates across varying heart rate states.',
      note: 'Range [-1.0, 1.0]. A value near 1.0 indicates strong agreement. Requires at least 2 valid trials.'
    },
    trials: {
      title: 'Valid Validation Trials (N)',
      formula: 'N_valid = Total Trials - Excluded Invalid Trials',
      text: 'The count of trials verified with acceptable optical signal quality. Trials tagged as INVALID (due to poor lighting, motion artifact, or sensor detachment) are recorded in the database but excluded from statistics.',
      note: 'Ensures biometric statistics are mathematically defensible and uncorrupted by invalid captures.'
    },
    bland_altman: {
      title: 'Bland–Altman Agreement Analysis',
      formula: 'Mean Bias = d̄ ± 1.96 * SD_diff (95% Limits of Agreement)',
      text: 'Standard biostatistical methodology for assessing agreement between two clinical or consumer measurement modalities.',
      note: 'Evaluates whether camera rPPG systematically over- or under-estimates relative to the reference smartwatch.'
    }
  };

  return (
    <div className="max-w-6xl w-full mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
            <Watch className="w-7 h-7 text-cyan-400" />
            Smartwatch <span className="text-cyan-400">Heart-Rate Validation & Benchmark</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">
            Empirical validation of camera-based PulseVision heart-rate estimates against simultaneously recorded smartwatch measurements.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setSystemInsightsOpen(true)}
            className="px-3 py-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-cyan-300 flex items-center gap-1.5 transition-colors shadow-sm"
            title="Inspect end-to-end architecture and model details"
          >
            <Settings className="w-3.5 h-3.5 text-cyan-400" />
            System Insights
          </button>
          <button
            onClick={() => { fetchTrials(); }}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300 flex items-center gap-1.5 transition-colors"
            title="Recalculate validation statistics from database"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            Recalculate
          </button>
          <button
            onClick={() => handleExportCsv()}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-xs font-semibold text-white flex items-center gap-2 shadow-lg transition-all"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Aggregate Statistics Cards (Real Database Backed with Interactive Info Tooltips) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
        <div className="glass-panel p-5 rounded-2xl border border-slate-800 relative group">
          <div className="flex justify-between items-center mb-2">
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">MAE (BPM)</span>
            <button
              onClick={() => setMetricInfoKey('mae')}
              className="w-4 h-4 rounded-full bg-slate-800 hover:bg-cyan-900/60 text-slate-400 hover:text-cyan-300 text-[10px] font-bold flex items-center justify-center transition-colors"
              title="What is MAE?"
            >
              i
            </button>
          </div>
          <div className="text-3xl font-extrabold text-cyan-400">
            {hasValidTrials && stats?.mae !== null ? `${stats?.mae} BPM` : '--'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Mean Absolute Error</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800 relative group">
          <div className="flex justify-between items-center mb-2">
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">RMSE (BPM)</span>
            <button
              onClick={() => setMetricInfoKey('rmse')}
              className="w-4 h-4 rounded-full bg-slate-800 hover:bg-blue-900/60 text-slate-400 hover:text-blue-300 text-[10px] font-bold flex items-center justify-center transition-colors"
              title="What is RMSE?"
            >
              i
            </button>
          </div>
          <div className="text-3xl font-extrabold text-blue-400">
            {hasValidTrials && stats?.rmse !== null ? `${stats?.rmse} BPM` : '--'}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Root Mean Square Error</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800 relative group">
          <div className="flex justify-between items-center mb-2">
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Pearson Correlation (r)</span>
            <button
              onClick={() => setMetricInfoKey('pearson')}
              className="w-4 h-4 rounded-full bg-slate-800 hover:bg-emerald-900/60 text-slate-400 hover:text-emerald-300 text-[10px] font-bold flex items-center justify-center transition-colors"
              title="What is Pearson r?"
            >
              i
            </button>
          </div>
          <div className="text-3xl font-extrabold text-emerald-400">
            {hasValidTrials && stats?.pearson_r !== null && stats?.pearson_r !== undefined
              ? Number(stats.pearson_r).toFixed(4)
              : (stats?.valid_trials === 1 ? 'N/A (N=1)' : '--')}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Linear trend agreement</p>
        </div>

        <div className="glass-panel p-5 rounded-2xl border border-slate-800 relative group">
          <div className="flex justify-between items-center mb-2">
            <span className="text-slate-400 text-xs font-semibold uppercase tracking-wider">Valid Validation Trials</span>
            <button
              onClick={() => setMetricInfoKey('trials')}
              className="w-4 h-4 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] font-bold flex items-center justify-center transition-colors"
              title="What are Valid Trials?"
            >
              i
            </button>
          </div>
          <div className="text-3xl font-extrabold text-white">
            {stats?.valid_trials ?? 0}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {stats?.total_trials ?? 0} total trials ({stats?.invalid_trials ?? 0} invalid)
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
        {/* Record New Validation Trial Form */}
        <div className="lg:col-span-5 glass-panel p-6 rounded-2xl border border-slate-800 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Watch className="w-4 h-4 text-cyan-400" />
                Record New Validation Trial
              </h2>
              <span className="px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono text-[11px]">
                {nextTrialCode}
              </span>
            </div>

            <div className="p-3 mb-4 rounded-xl bg-cyan-950/20 border border-cyan-800/40 text-[11px] text-cyan-200">
              ⏱️ <strong>Measurement Synchronization:</strong> Record the smartwatch BPM during the same measurement window as the PulseVision reading.
            </div>

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Trial ID (Auto-Generated)</label>
                  <input
                    type="text"
                    value={nextTrialCode}
                    readOnly
                    className="w-full bg-slate-900/60 border border-slate-800 rounded-lg p-2.5 text-cyan-400 font-mono font-bold outline-none cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Participant Code</label>
                  <input
                    type="text"
                    value={participantCode}
                    onChange={(e) => setParticipantCode(e.target.value)}
                    placeholder="e.g. P01"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono outline-none focus:border-cyan-400"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Reference Source</label>
                <div className="w-full bg-slate-900/60 border border-slate-800 rounded-lg p-2.5 text-slate-200 flex items-center justify-between">
                  <span className="font-semibold flex items-center gap-2">
                    <span>⌚</span> Smartwatch Heart Rate
                  </span>
                  <span className="text-[10px] text-slate-500">Consumer Reference</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Smartwatch BPM *</label>
                  <input
                    type="number"
                    step="0.5"
                    min="30"
                    max="240"
                    placeholder="e.g. 76.0"
                    value={smartwatchBpm}
                    onChange={(e) => setSmartwatchBpm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-cyan-400 font-mono font-bold text-sm outline-none focus:border-cyan-400"
                    required
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-slate-400">PulseVision BPM</label>
                    <button
                      type="button"
                      onClick={syncLatestScan}
                      className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                    >
                      <RefreshCw className="w-2.5 h-2.5" /> Sync Live
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="Enter or sync BPM"
                    value={pulsevisionBpm}
                    onChange={(e) => setPulsevisionBpm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 focus:border-cyan-400 rounded-lg p-2.5 text-emerald-400 font-mono font-bold text-sm outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Condition</label>
                  <select
                    value={condition}
                    onChange={(e) => setCondition(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-cyan-400"
                  >
                    <option value="Resting">Resting</option>
                    <option value="Recovery">Recovery</option>
                    <option value="After Normal Activity">After Normal Activity</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Measurement Duration</label>
                  <input
                    type="number"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    placeholder="30s"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white font-mono outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Signal Quality</label>
                  <div className="w-full py-2.5 px-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-center font-semibold">
                    {signalQuality}
                  </div>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Timestamp</label>
                  <input
                    type="text"
                    value="Auto-generated (UTC)"
                    readOnly
                    className="w-full bg-slate-900/60 border border-slate-800 rounded-lg p-2.5 text-slate-500 font-mono text-[11px] outline-none cursor-not-allowed"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Participant remained still, stable indoor lighting"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-cyan-400"
                />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold flex items-center justify-center gap-2 shadow-lg transition-all disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4" />
                {isSaving ? 'SAVING TRIAL...' : 'SAVE VALIDATION TRIAL'}
              </button>

              {statusMsg && (
                <p className={`text-[11px] text-center ${statusMsg.type === 'error' ? 'text-rose-400' : 'text-cyan-300'}`}>
                  {statusMsg.text}
                </p>
              )}
            </form>
          </div>

          <div className="mt-4 pt-4 border-t border-slate-800/60 text-[11px] text-slate-500">
            <p>💡 Tip: Run a Live Scan first to generate the camera-based PulseVision BPM, then record the smartwatch value at the same time.</p>
          </div>
        </div>

        {/* Visualizations (Right Column) */}
        <div className="lg:col-span-7 flex flex-col gap-6">
          {/* Main Scatter Plot */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col">
            <div className="flex justify-between items-center mb-2">
              <div>
                <h3 className="text-sm font-bold text-white">PulseVision vs Smartwatch BPM</h3>
                <p className="text-[11px] text-slate-400">X: Smartwatch BPM · Y: PulseVision BPM</p>
              </div>
              <span className="text-[11px] font-mono text-cyan-400 bg-cyan-950/40 border border-cyan-800/60 px-2 py-0.5 rounded">
                y = x Agreement
              </span>
            </div>

            {/* Threshold Legend */}
            <div className="flex flex-wrap gap-3 text-[10px] text-slate-400 mb-2 pb-2 border-b border-slate-800">
              <span className="flex items-center gap-1"><span className="text-emerald-400 font-bold">●</span> Good (≤ 2 BPM)</span>
              <span className="flex items-center gap-1"><span className="text-yellow-400 font-bold">●</span> Moderate (≤ 4 BPM)</span>
              <span className="flex items-center gap-1"><span className="text-rose-400 font-bold">●</span> High Diff (&gt; 4 BPM)</span>
              <span className="flex items-center gap-1"><span className="text-cyan-400 font-bold">┅</span> Perfect (y=x)</span>
            </div>

            <div className="w-full h-52 relative">
              <canvas
                ref={scatterCanvasRef}
                onMouseMove={handleScatterMouseMove}
                onMouseLeave={() => setScatterTooltip(prev => ({ ...prev, visible: false }))}
                onClick={handleScatterClick}
                className="w-full h-full cursor-crosshair"
              />
              {scatterTooltip.visible && scatterTooltip.trial && (
                <div
                  className="absolute pointer-events-none z-10 px-2.5 py-1.5 rounded-lg bg-slate-950/95 border border-cyan-500/40 text-[11px] text-slate-200 shadow-xl backdrop-blur-md transform -translate-x-1/2 -translate-y-full -mt-2"
                  style={{ left: scatterTooltip.x, top: scatterTooltip.y }}
                >
                  <div className="font-bold text-white flex items-center justify-between gap-2">
                    <span>{scatterTooltip.trial.trial_code || `T${scatterTooltip.trial.id}`}</span>
                    <span className="text-cyan-400 text-[10px]">{scatterTooltip.trial.participant_code || 'P01'}</span>
                  </div>
                  <div className="text-slate-300 mt-0.5">
                    Watch: <strong className="text-cyan-400">{scatterTooltip.trial.smartwatch_bpm ?? scatterTooltip.trial.reference_bpm}</strong> | PV: <strong className="text-emerald-400">{scatterTooltip.trial.pulsevision_bpm}</strong>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Abs Error: <span className="text-yellow-400 font-bold">{scatterTooltip.trial.absolute_error} BPM</span> (Click to inspect)
                  </div>
                </div>
              )}
            </div>
            <div className="text-[10px] text-slate-500 text-center mt-2">
              *Prototype visualization thresholds — not medical standards. Hover or click data point to inspect trial.*
            </div>
          </div>

          {/* Absolute Error by Trial */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <div>
                <h3 className="text-sm font-bold text-white">Absolute Error by Trial</h3>
                <p className="text-[11px] text-slate-400">X: Chronological Trial · Y: Absolute Error (BPM)</p>
              </div>
              <span className="text-[11px] font-mono text-indigo-400 bg-indigo-950/40 border border-indigo-800/60 px-2 py-0.5 rounded">
                Mean Bias: {stats?.mean_bias !== null && stats?.mean_bias !== undefined ? `${stats.mean_bias > 0 ? '+' : ''}${stats.mean_bias} BPM` : '--'}
              </span>
            </div>
            <div className="w-full h-44 relative">
              <canvas ref={errorCanvasRef} className="w-full h-full" />
            </div>
            <div className="text-[10px] text-slate-500 text-center mt-1">
              Agreement visualization only — not a clinical threshold.
            </div>
          </div>

          {/* Bland-Altman Limits of Agreement */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs text-slate-400">
            <div className="flex items-center gap-1.5 flex-wrap">
              <strong className="text-white">Agreement Analysis (Bland–Altman):</strong>
              <button
                onClick={() => setMetricInfoKey('bland_altman')}
                className="w-4 h-4 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white text-[10px] font-bold flex items-center justify-center transition-colors mr-1"
                title="What is Bland-Altman?"
              >
                i
              </button>
              {stats?.valid_trials && stats.valid_trials >= 3 && stats.loa_upper !== null ? (
                <span>
                  Mean Bias = <span className="text-white font-bold">{stats.mean_bias! > 0 ? '+' : ''}{stats.mean_bias} BPM</span> · 95% Agreement Limits: <span className="text-cyan-400 font-bold">[{stats.loa_lower} to {stats.loa_upper}] BPM</span>
                </span>
              ) : (
                <span>Additional paired measurements are required for agreement analysis.</span>
              )}
            </div>
            <span className="text-[10px] font-mono text-slate-500">
              {stats?.valid_trials && stats.valid_trials >= 3 ? `N = ${stats.valid_trials} valid trials` : 'N ≥ 3 required'}
            </span>
          </div>
        </div>
      </div>

      {/* Validation Trials Log Table & Contextual Bulk Action Bar */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 mb-8 relative">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Validation Trials History</h2>
            <p className="text-[11px] text-slate-400">Historical empirical observations stored in database (click row to inspect)</p>
          </div>
          <span className="text-xs font-mono text-slate-400">{trials.length} trials recorded</span>
        </div>

        {/* Floating Contextual Bulk Action Bar */}
        {selectedIds.size > 0 && (
          <div className="sticky top-20 z-20 mb-4 p-3 rounded-xl bg-slate-900/95 border border-cyan-500/40 shadow-2xl flex items-center justify-between gap-4 backdrop-blur-md transition-all">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-cyan-300">
                Selected: <span className="text-white">{selectedIds.size}</span> trial{selectedIds.size > 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setBulkEditOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-slate-700"
              >
                <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                Edit
              </button>
              <button
                onClick={() => setBulkDeleteConfirmOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-rose-800/60"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                Delete
              </button>
              <button
                onClick={() => handleExportCsv(Array.from(selectedIds))}
                className="px-3 py-1.5 rounded-lg bg-cyan-900/80 hover:bg-cyan-800 text-cyan-200 text-xs font-semibold flex items-center gap-1.5 transition-colors border border-cyan-700/60"
              >
                <Download className="w-3.5 h-3.5" />
                Export Selected
              </button>
              <button
                onClick={clearSelection}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white text-xs transition-colors"
              >
                ✕ Clear
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/80 text-slate-400 uppercase text-[10px]">
              <tr>
                <th className="p-2.5 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={trials.length > 0 && selectedIds.size === trials.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                  />
                </th>
                <th className="p-2.5">TRIAL</th>
                <th className="p-2.5">PARTICIPANT</th>
                <th className="p-2.5">CONDITION</th>
                <th className="p-2.5">SMARTWATCH BPM</th>
                <th className="p-2.5">PULSEVISION BPM</th>
                <th className="p-2.5">ABS ERROR</th>
                <th className="p-2.5">STATUS</th>
                <th className="p-2.5">TIME</th>
                <th className="p-2.5 text-right">ACTIONS</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {trials.length > 0 ? (
                trials.map((t) => {
                  const refVal = t.smartwatch_bpm ?? t.reference_bpm;
                  const isValid = (t.status || 'VALID').toUpperCase() === 'VALID';
                  const trialCode = t.trial_code || `T${String(t.id).padStart(3, '0')}`;
                  const isSelected = selectedIds.has(t.id);

                  return (
                    <tr
                      key={t.id}
                      className={`hover:bg-slate-900/50 cursor-pointer transition-colors ${
                        isSelected ? 'bg-cyan-950/20' : isValid ? '' : 'opacity-60 bg-rose-950/10'
                      }`}
                    >
                      <td className="p-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectTrial(t.id)}
                          className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                        />
                      </td>
                      <td
                        className="p-2.5 font-bold text-white font-mono"
                        onClick={() => setDetailTrial(t)}
                      >
                        {trialCode}
                      </td>
                      <td className="p-2.5 font-mono text-slate-400" onClick={() => setDetailTrial(t)}>
                        {t.participant_code || 'P01'}
                      </td>
                      <td className="p-2.5" onClick={() => setDetailTrial(t)}>
                        {t.condition || 'Resting'}
                      </td>
                      <td className="p-2.5 font-mono text-cyan-400 font-bold" onClick={() => setDetailTrial(t)}>
                        {refVal} BPM
                      </td>
                      <td className="p-2.5 font-mono text-emerald-400 font-bold" onClick={() => setDetailTrial(t)}>
                        {t.pulsevision_bpm} BPM
                      </td>
                      <td className="p-2.5 font-bold" onClick={() => setDetailTrial(t)}>
                        <span className={`px-2 py-0.5 rounded text-[11px] ${
                          t.absolute_error <= 2.0
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                            : t.absolute_error <= 4.0
                            ? 'bg-yellow-950 text-yellow-400 border border-yellow-800/40'
                            : 'bg-rose-950 text-rose-400 border border-rose-800/40'
                        }`}>
                          {t.absolute_error} BPM
                        </span>
                      </td>
                      <td className="p-2.5" onClick={() => setDetailTrial(t)}>
                        {isValid ? (
                          <span className="px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40 text-[10px] font-semibold">VALID</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800/40 text-[10px] font-semibold" title={t.invalid_reason || 'Rejected'}>INVALID</span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-500 font-mono text-[11px]" onClick={() => setDetailTrial(t)}>
                        {t.timestamp ? new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                      </td>
                      <td className="p-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setDetailTrial(t)}
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-cyan-300 mr-1"
                          title="Inspect trial details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(t)}
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white mr-1"
                          title="Edit trial"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setSingleDeleteTarget({ id: t.id, code: trialCode })}
                          className="p-1 rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400"
                          title="Delete trial"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-500">
                    No comparative trials entered yet. Record smartwatch measurements above to evaluate system accuracy.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Research Disclaimer Notice */}
      <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 text-center text-[11px] text-slate-500 leading-relaxed">
        🛡️ <strong>Research & Wellness Prototype Notice:</strong> PulseVision AI is an experimental computer-vision research platform and not a certified medical diagnostic device. The smartwatch is an independent consumer reference comparison device used solely for empirical benchmarking.
      </div>

      {/* MODAL 1: Single Trial Edit Modal */}
      {editingTrial && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setEditingTrial(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-cyan-400" />
              Edit Validation Trial
            </h3>
            <p className="text-xs text-slate-400 mb-4">Modify stored measurement observation</p>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Smartwatch BPM</label>
                  <input
                    type="number"
                    step="0.5"
                    min="30"
                    max="240"
                    value={editSwBpm}
                    onChange={(e) => setEditSwBpm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-cyan-400 font-mono font-bold outline-none focus:border-cyan-400"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">PulseVision BPM</label>
                  <input
                    type="number"
                    step="0.5"
                    min="30"
                    max="240"
                    value={editPvBpm}
                    onChange={(e) => setEditPvBpm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-emerald-400 font-mono font-bold outline-none focus:border-cyan-400"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Participant</label>
                  <input
                    type="text"
                    value={editParticipant}
                    onChange={(e) => setEditParticipant(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-cyan-400 font-mono"
                    required
                  />
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Condition</label>
                  <select
                    value={editCondition}
                    onChange={(e) => setEditCondition(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-cyan-400"
                  >
                    <option value="Resting">Resting</option>
                    <option value="Recovery">Recovery</option>
                    <option value="After Normal Activity">After Normal Activity</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-cyan-400"
                  >
                    <option value="VALID">VALID (Included in stats)</option>
                    <option value="INVALID">INVALID (Excluded from stats)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Invalid Reason</label>
                  <input
                    type="text"
                    value={editInvalidReason}
                    onChange={(e) => setEditInvalidReason(e.target.value)}
                    placeholder="e.g. Excessive motion"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Notes</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold"
                >
                  Save Changes
                </button>
                <button
                  type="button"
                  onClick={() => setEditingTrial(null)}
                  className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Bulk Edit Modal */}
      {bulkEditOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setBulkEditOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-base font-bold text-white mb-1 flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-cyan-400" />
              Bulk Edit Selected Trials
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Apply changes across <strong className="text-cyan-300">{selectedIds.size}</strong> selected trials. Fields left unchanged will retain their original values.
            </p>

            <form onSubmit={handleSaveBulkEdit} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Condition</label>
                <select
                  value={bulkCondition}
                  onChange={(e) => setBulkCondition(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-cyan-400"
                >
                  <option value="UNCHANGED">— Keep Unchanged —</option>
                  <option value="Resting">Resting</option>
                  <option value="Recovery">Recovery</option>
                  <option value="After Normal Activity">After Normal Activity</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Status</label>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-cyan-400"
                >
                  <option value="UNCHANGED">— Keep Unchanged —</option>
                  <option value="VALID">VALID (Included in stats)</option>
                  <option value="INVALID">INVALID (Excluded from stats)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1">Append or Replace Notes</label>
                <input
                  type="text"
                  value={bulkNotes}
                  onChange={(e) => setBulkNotes(e.target.value)}
                  placeholder="Optional notes to apply to all selected trials"
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2.5 text-white outline-none focus:border-cyan-400"
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold"
                >
                  Apply to {selectedIds.size} Trials
                </button>
                <button
                  type="button"
                  onClick={() => setBulkEditOpen(false)}
                  className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Bulk Delete Confirmation Modal */}
      {bulkDeleteConfirmOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative text-center">
            <div className="w-12 h-12 rounded-full bg-rose-950/80 border border-rose-800/60 text-rose-400 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Delete {selectedIds.size} Selected Trials?</h3>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              This action will permanently delete these {selectedIds.size} trials from the database and recalculate all statistical metrics. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmBulkDelete}
                className="flex-1 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs"
              >
                Delete {selectedIds.size} Trials
              </button>
              <button
                onClick={() => setBulkDeleteConfirmOpen(false)}
                className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: Single Delete Target Confirmation Modal */}
      {singleDeleteTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative text-center">
            <div className="w-12 h-12 rounded-full bg-rose-950/80 border border-rose-800/60 text-rose-400 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white mb-2">Delete Trial {singleDeleteTarget.code}?</h3>
            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              This will remove this observation from the database and recalculate validation statistics.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirmSingleDelete}
                className="flex-1 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs"
              >
                Delete Trial
              </button>
              <button
                onClick={() => setSingleDeleteTarget(null)}
                className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: Single Trial Inspection Drawer / Modal */}
      {detailTrial && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setDetailTrial(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <Eye className="w-5 h-5 text-cyan-400" />
              <div>
                <h3 className="text-base font-bold text-white">Trial {detailTrial.trial_code || `T${detailTrial.id}`}</h3>
                <p className="text-[11px] text-slate-400">Detailed observation breakdown</p>
              </div>
            </div>

            <div className="space-y-3 text-xs divide-y divide-slate-800/60">
              <div className="grid grid-cols-2 gap-2 pt-2">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Participant</span>
                  <span className="font-mono font-bold text-white">{detailTrial.participant_code || 'P01'}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Condition</span>
                  <span className="text-slate-200">{detailTrial.condition || 'Resting'}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Smartwatch BPM (Reference)</span>
                  <span className="font-mono font-bold text-cyan-400 text-sm">
                    {detailTrial.smartwatch_bpm ?? detailTrial.reference_bpm} BPM
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">PulseVision BPM (Optical)</span>
                  <span className="font-mono font-bold text-emerald-400 text-sm">
                    {detailTrial.pulsevision_bpm} BPM
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Absolute Error</span>
                  <span className="font-mono font-bold text-yellow-400 text-sm">
                    {detailTrial.absolute_error} BPM
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Error Percentage</span>
                  <span className="font-mono text-slate-300">
                    {(((detailTrial.absolute_error) / ((detailTrial.smartwatch_bpm ?? detailTrial.reference_bpm) || 1)) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Status</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                    (detailTrial.status || 'VALID').toUpperCase() === 'VALID'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/40'
                      : 'bg-rose-950 text-rose-400 border border-rose-800/40'
                  }`}>
                    {detailTrial.status || 'VALID'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] uppercase">Recorded At</span>
                  <span className="font-mono text-slate-400 text-[11px]">
                    {detailTrial.timestamp ? new Date(detailTrial.timestamp).toLocaleString() : '--'}
                  </span>
                </div>
              </div>

              {detailTrial.invalid_reason && (
                <div className="pt-2">
                  <span className="text-slate-500 block text-[10px] uppercase">Exclusion Reason</span>
                  <span className="text-rose-400">{detailTrial.invalid_reason}</span>
                </div>
              )}

              {detailTrial.notes && (
                <div className="pt-2">
                  <span className="text-slate-500 block text-[10px] uppercase">Trial Notes</span>
                  <span className="text-slate-300 italic">{detailTrial.notes}</span>
                </div>
              )}
            </div>

            <div className="flex gap-3 pt-5 mt-3 border-t border-slate-800">
              <button
                onClick={() => {
                  const t = detailTrial;
                  setDetailTrial(null);
                  handleOpenEdit(t);
                }}
                className="flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                Edit Trial
              </button>
              <button
                onClick={() => setDetailTrial(null)}
                className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 font-semibold text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: Metric Info Popover Modal */}
      {metricInfoKey && metricDetails[metricInfoKey] && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-950 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setMetricInfoKey(null)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-3">
              <Info className="w-5 h-5 text-cyan-400" />
              <h3 className="text-base font-bold text-white">{metricDetails[metricInfoKey].title}</h3>
            </div>

            <div className="p-3 mb-4 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-cyan-300">
              {metricDetails[metricInfoKey].formula}
            </div>

            <p className="text-xs text-slate-300 mb-3 leading-relaxed">
              {metricDetails[metricInfoKey].text}
            </p>

            <p className="text-xs text-slate-400 bg-slate-900/60 p-3 rounded-lg border border-slate-800/60 leading-relaxed">
              💡 {metricDetails[metricInfoKey].note}
            </p>

            <div className="mt-5 text-right">
              <button
                onClick={() => setMetricInfoKey(null)}
                className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: System Insights (Decoupled Technical Dashboard) */}
      {systemInsightsOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0f19] border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl relative max-h-[85vh] flex flex-col">
            <button
              onClick={() => setSystemInsightsOpen(false)}
              className="absolute top-4 right-4 text-slate-500 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 mb-4">
              <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-800 text-cyan-400">
                <Settings className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">System Insights & Technical Diagnostics</h3>
                <p className="text-xs text-slate-400">Deep architecture, rPPG algorithm pipelines, and biostatistical models</p>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-slate-800 pb-3 mb-4 overflow-x-auto text-xs">
              <button
                onClick={() => setInsightsTab('architecture')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  insightsTab === 'architecture'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <Layers className="w-3.5 h-3.5" /> Architecture
              </button>
              <button
                onClick={() => setInsightsTab('models')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  insightsTab === 'models'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <Cpu className="w-3.5 h-3.5" /> Models & Pipelines
              </button>
              <button
                onClick={() => setInsightsTab('database')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  insightsTab === 'database'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <Database className="w-3.5 h-3.5" /> Database ER
              </button>
              <button
                onClick={() => setInsightsTab('math')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  insightsTab === 'math'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <Activity className="w-3.5 h-3.5" /> Mathematical Formulas
              </button>
              <button
                onClick={() => setInsightsTab('disclaimer')}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  insightsTab === 'disclaimer'
                    ? 'bg-cyan-600 text-white shadow-md'
                    : 'bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" /> Disclaimer
              </button>
            </div>

            {/* Tab Contents */}
            <div className="flex-1 overflow-y-auto pr-1 text-xs text-slate-300 space-y-4">
              {insightsTab === 'architecture' && (
                <div className="space-y-4">
                  <p className="text-slate-400">
                    PulseVision AI operates an asynchronous remote photoplethysmography (rPPG) optical extraction pipeline, processing video frames from standard webcams without physical contact:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-center">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="font-bold text-cyan-400 mb-1">1. Video Input</div>
                      <div className="text-[10px] text-slate-400">Webcam 30 FPS RGB stream</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="font-bold text-cyan-400 mb-1">2. Face ROI</div>
                      <div className="text-[10px] text-slate-400">MediaPipe Mesh (Cheek & Forehead)</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="font-bold text-cyan-400 mb-1">3. rPPG Projection</div>
                      <div className="text-[10px] text-slate-400">POS / CHROM / TS-CAN Extraction</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="font-bold text-cyan-400 mb-1">4. Filtering</div>
                      <div className="text-[10px] text-slate-400">Butterworth Bandpass (0.75–3.5 Hz)</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="font-bold text-cyan-400 mb-1">5. Peak / FFT</div>
                      <div className="text-[10px] text-slate-400">Dominant Freq → Heart Rate BPM</div>
                    </div>
                  </div>
                </div>
              )}

              {insightsTab === 'models' && (
                <div className="space-y-3">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        POS (Plane-Orthogonal-to-Skin)
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40 text-[10px]">Active</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Projects RGB components onto a plane orthogonal to skin tone vector; resilient to moderate head motion.</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        CHROM (Chrominance-based)
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40 text-[10px]">Active</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Utilizes difference signals (3R-2G, 1.5R+G-1.5B) to eliminate specular reflection and white-light variations.</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        TS-CAN (Temporal Shift Convolutional Attention Network)
                        <span className="px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40 text-[10px]">Active Neural</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Deep 1D attention neural model trained for continuous spatial-temporal pulse wave extraction.</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-white flex items-center gap-2">
                        FastICA & Green Channel
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px]">Ensemble Standby</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Independent component decomposition and green absorption channel fallback.</div>
                    </div>
                  </div>
                </div>
              )}

              {insightsTab === 'database' && (
                <div className="space-y-3">
                  <p className="text-slate-400">Database Schema (MySQL / SQLite relational entities):</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="font-bold text-white mb-1 flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-cyan-400" /> Users</div>
                      <div className="text-[10px] text-slate-400 font-mono">id (PK), email, name, password_hash, phone, created_at</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="font-bold text-white mb-1 flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-blue-400" /> HealthScans</div>
                      <div className="text-[10px] text-slate-400 font-mono">id (PK), user_id (FK), estimated_bpm, confidence, classification, stress_level, fatigue_level, algorithm_name, timestamp</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="font-bold text-white mb-1 flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-emerald-400" /> ValidationTrials</div>
                      <div className="text-[10px] text-slate-400 font-mono">id (PK), user_id (FK), trial_code, participant_code, smartwatch_bpm, pulsevision_bpm, absolute_error, condition, status, timestamp</div>
                    </div>
                    <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                      <div className="font-bold text-white mb-1 flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-yellow-400" /> AuditLogs</div>
                      <div className="text-[10px] text-slate-400 font-mono">id (PK), user_id, action, timestamp, details</div>
                    </div>
                  </div>
                </div>
              )}

              {insightsTab === 'math' && (
                <div className="space-y-3 font-mono">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-white font-bold font-sans mb-1">Mean Absolute Error (MAE)</div>
                    <div className="text-cyan-400 text-[11px]">MAE = (1 / N) * ∑ |PulseVision_i - Smartwatch_i|</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-white font-bold font-sans mb-1">Root Mean Square Error (RMSE)</div>
                    <div className="text-blue-400 text-[11px]">RMSE = √[ (1 / N) * ∑ (PulseVision_i - Smartwatch_i)² ]</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-white font-bold font-sans mb-1">Pearson Correlation Coefficient (r)</div>
                    <div className="text-emerald-400 text-[11px]">r = ∑(x - x̄)(y - ȳ) / √[ ∑(x - x̄)² * ∑(y - ȳ)² ]</div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
                    <div className="text-white font-bold font-sans mb-1">Bland-Altman 95% Limits of Agreement</div>
                    <div className="text-purple-400 text-[11px]">LoA = Mean Bias ± 1.96 * SD_diff</div>
                  </div>
                </div>
              )}

              {insightsTab === 'disclaimer' && (
                <div className="p-4 rounded-xl bg-rose-950/20 border border-rose-800/40 text-rose-200 leading-relaxed space-y-2">
                  <div className="font-bold text-rose-300 text-sm flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-400" />
                    Investigational Software Notice
                  </div>
                  <p>
                    PulseVision AI is developed strictly for research, engineering benchmarking, and academic demonstration of non-contact photoplethysmography algorithms.
                  </p>
                  <p>
                    It is not FDA approved, CE certified, or designated as a medical diagnostic device. It must not be used as a substitute for professional clinical medical advice, diagnosis, or treatment.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setSystemInsightsOpen(false)}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs"
              >
                Close Insights
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

