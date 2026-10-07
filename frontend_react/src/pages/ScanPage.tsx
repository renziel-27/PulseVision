import React, { useRef, useState, useEffect } from 'react';
import { Camera, CameraOff, Activity, ShieldAlert, CheckCircle2, RefreshCw, FileText } from 'lucide-react';
import api from '../services/api';
import { PreflightStatus } from '../types';

export const ScanPage: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scopeCanvasRef = useRef<HTMLCanvasElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [algorithm, setAlgorithm] = useState('pos');
  const [bpm, setBpm] = useState<number | null>(null);
  const [confidence, setConfidence] = useState(0);
  const [sqi, setSqi] = useState(0);
  const [preflight, setPreflight] = useState<PreflightStatus>({
    ready: false,
    face_detected: false,
    lighting_ok: false,
    lighting_mean: 0,
    lighting_contrast: 0,
    position_ok: false,
    stability_ok: false,
    motion_score: 0,
    message: 'Click "Start Camera" to begin scanning.'
  });
  const [statusMsg, setStatusMsg] = useState('Align your face inside the bounding guide.');
  const [waveformDisplay, setWaveformDisplay] = useState<number[]>(Array(100).fill(0));

  // Start Camera
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, frameRate: { ideal: 30 } }
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play().catch(() => {});
      }
      setStream(mediaStream);
      setIsScanning(true);
      setStatusMsg('Camera active. Calibrating face position...');
    } catch (err: any) {
      setStatusMsg(`Camera Error: ${err.message}. Please allow webcam access.`);
    }
  };

  // Stop Camera
  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setIsScanning(false);
    setStatusMsg('Camera stopped.');
    setBpm(null);
  };

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [stream]);

  // Frame processing loop
  useEffect(() => {
    if (!isScanning || !stream) return;

    let animId: number;
    let lastEstimateTime = performance.now();
    let lastFrameTime = performance.now();
    let isProcessing = false;

    const processLoop = async () => {
      if (videoRef.current && canvasRef.current && videoRef.current.readyState >= 2 && !isProcessing) {
        const now = performance.now();
        // Send frame at ~10 FPS (every 100ms) to prevent network congestion
        if (now - lastFrameTime >= 100) {
          lastFrameTime = now;
          isProcessing = true;
          const video = videoRef.current;
          const canvas = canvasRef.current;
          canvas.width = 160;
          canvas.height = 120;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const frameBase64 = canvas.toDataURL('image/jpeg', 0.6);

            try {
              // Send frame for face detection and ROI preflight
              const res = await api.post('/process-frame', { image: frameBase64 });
              const data = res.data;
              console.log("[PulseVision] process-frame response:", data);
              if (data.success && data.preflight) {
                setPreflight(data.preflight);
                if (data.preflight.message) {
                  setStatusMsg(data.preflight.message);
                }
              }

              // Estimate BPM every 800ms
              if (now - lastEstimateTime > 800) {
                lastEstimateTime = now;
                const estRes = await api.post('/estimate-rppg', { algorithm });
                const estData = estRes.data;
                if (estData.success) {
                  if (estData.is_valid && estData.bpm > 0) {
                    setBpm(estData.bpm);
                    setConfidence(estData.confidence);
                    setSqi(estData.sqi);
                    setStatusMsg(`BPM available: ${estData.bpm} BPM (${estData.confidence}% Confidence)`);
                    if (estData.waveform && estData.waveform.length > 0) {
                      setWaveformDisplay(estData.waveform.slice(-100));
                    }
                    // Cache latest valid scan for seamless trial recording in Validation tab
                    localStorage.setItem('pulsevision_latest_scan', JSON.stringify({
                      bpm: estData.bpm,
                      duration: 30,
                      signal_quality: estData.sqi >= 0.7 ? 'Good' : (estData.sqi >= 0.4 ? 'Moderate' : 'Poor')
                    }));
                  } else if (estData.rejection_reason) {
                    setStatusMsg(estData.rejection_reason);
                  }
                }
              }
            } catch (e: any) {
              const errMsg = e?.response?.data?.detail || e?.message || 'Connection error';
              setStatusMsg(`Detection warning: ${errMsg}. Check backend connection.`);
            } finally {
              isProcessing = false;
            }
          } else {
            isProcessing = false;
          }
        }
      }
      animId = requestAnimationFrame(processLoop);
    };

    animId = requestAnimationFrame(processLoop);
    return () => cancelAnimationFrame(animId);
  }, [isScanning, stream, algorithm]);

  // Oscilloscope drawing
  useEffect(() => {
    const canvas = scopeCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 30) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 20) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    if (waveformDisplay.length < 2) return;

    const min = Math.min(...waveformDisplay);
    const max = Math.max(...waveformDisplay);
    const range = max - min || 1;

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#0284c7';
    ctx.shadowBlur = 6;
    ctx.beginPath();

    waveformDisplay.forEach((v, i) => {
      const x = (i / (waveformDisplay.length - 1)) * canvas.width;
      const normalized = (v - min) / range;
      const y = canvas.height * 0.85 - normalized * (canvas.height * 0.7);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });

    ctx.stroke();
    ctx.shadowBlur = 0;
  }, [waveformDisplay]);

  return (
    <div className="max-w-6xl w-full mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row items-start justify-between gap-6 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-2">
            <span>📷 Live Physiological Scanner</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
              isScanning ? 'bg-rose-950 text-rose-400 border border-rose-800' : 'bg-slate-900 text-slate-400'
            }`}>
              {isScanning ? '● Live Stream' : 'Standby'}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time contactless remote photoplethysmography extraction.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs text-slate-400 font-medium">Algorithm:</label>
          <select
            value={algorithm}
            onChange={(e) => setAlgorithm(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-white text-xs px-3 py-2 rounded-lg outline-none focus:border-blue-500"
          >
            <option value="pos">POS (Plane-Orthogonal-to-Skin)</option>
            <option value="chrom">CHROM (Chrominance Subspace)</option>
            <option value="green">GREEN (Hemoglobin Absorption)</option>
            <option value="tscan_1d">TSCAN-1D (Temporal Attention Net)</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Video Feed */}
        <div className="lg:col-span-7 glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col">
          <div className="relative aspect-[4/3] bg-black rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />

            {/* Face Alignment Oval */}
            <div className={`absolute w-[44%] h-[60%] border-2 rounded-[50%_50%_45%_45%] pointer-events-none transition-all ${
              preflight.position_ok ? 'border-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'border-blue-500/60 border-dashed'
            }`}>
              {/* Forehead Skin ROI box */}
              <div className="absolute top-[18%] left-[25%] w-[50%] h-[26%] border border-cyan-400 bg-cyan-400/10 rounded flex items-center justify-center">
                <span className="text-[9px] font-bold text-cyan-300">FOREHEAD ROI</span>
              </div>
            </div>

            {/* Overlay Status Bar */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between text-[11px] pointer-events-none">
              <span className="px-2.5 py-1 rounded-full bg-black/70 backdrop-blur border border-white/10 text-white flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${preflight.lighting_ok ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                Lighting: {preflight.lighting_ok ? 'Optimal' : 'Adjust'}
              </span>
              <span className="px-2.5 py-1 rounded-full bg-black/70 backdrop-blur border border-white/10 text-white flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${preflight.stability_ok ? 'bg-emerald-400' : 'bg-yellow-400'}`}></span>
                Motion: {preflight.stability_ok ? 'Steady' : 'Jitter Detected'}
              </span>
            </div>
          </div>

          {/* Status Message */}
          <div className="mt-3 p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs text-center text-blue-300">
            {statusMsg}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 mt-4">
            {!isScanning ? (
              <button
                onClick={startCamera}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/30 transition-all"
              >
                <Camera className="w-4 h-4" />
                Start Camera
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-rose-400 border border-rose-900/40 font-semibold flex items-center justify-center gap-2 transition-all"
              >
                <CameraOff className="w-4 h-4" />
                Stop Camera
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Real-time Vitals & Waveform */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Main BPM Card */}
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 text-center relative overflow-hidden">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Live Heart Rate</div>
            <div className="flex items-baseline justify-center gap-2 my-2">
              <span className={`text-4xl ${bpm ? 'animate-heartbeat' : ''}`}>❤️</span>
              <span className="text-6xl font-extrabold text-white tracking-tight">
                {bpm ? bpm : '--'}
              </span>
              <span className="text-lg font-bold text-slate-400">BPM</span>
            </div>

            <div className="flex items-center justify-center gap-4 mt-4 pt-4 border-t border-slate-800/80 text-xs text-slate-400">
              <div>
                <span className="block font-bold text-white">{confidence}%</span>
                Confidence
              </div>
              <div className="h-6 w-px bg-slate-800"></div>
              <div>
                <span className="block font-bold text-white">{sqi}</span>
                SQI Quality
              </div>
              <div className="h-6 w-px bg-slate-800"></div>
              <div>
                <span className="block font-bold text-emerald-400">
                  {bpm ? (bpm >= 60 && bpm <= 100 ? 'Normal' : 'Elevated') : 'Waiting'}
                </span>
                Status
              </div>
            </div>
          </div>

          {/* Pulse Waveform Canvas */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                Live Photoplethysmogram (BVP) Waveform
              </h3>
              <span className="text-[10px] text-cyan-400 font-mono">30 FPS Stream</span>
            </div>

            <div className="h-36 bg-slate-950 rounded-xl border border-slate-800/80 overflow-hidden relative">
              <canvas ref={scopeCanvasRef} width={450} height={144} className="w-full h-full" />
            </div>
          </div>

          {/* Quality Preflight Checklist */}
          <div className="glass-panel p-5 rounded-2xl border border-slate-800 text-xs">
            <h4 className="font-bold text-white mb-3 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              Pre-Flight Quality Checklist
            </h4>
            <div className="space-y-2 text-slate-300">
              <div className="flex items-center justify-between">
                <span>Face Detected & Centered:</span>
                <span className={preflight.face_detected ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {preflight.face_detected ? 'Yes' : 'No'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Illumination Level:</span>
                <span className={preflight.lighting_ok ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold'}>
                  {preflight.lighting_mean} ({preflight.lighting_ok ? 'Optimal' : 'Low'})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Subject Motion Jitter:</span>
                <span className={preflight.stability_ok ? 'text-emerald-400 font-bold' : 'text-yellow-400 font-bold'}>
                  {preflight.motion_score} px ({preflight.stability_ok ? 'Stable' : 'Moving'})
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
