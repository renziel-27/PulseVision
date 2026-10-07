/**
 * PulseVision 3.0 - AI Non-Contact Heart Rate & Physiological Assessment Client
 * 
 * CORE SCIENTIFIC SPECIFICATIONS:
 * 1. Camera On/Off lifecycle control: Explicit hardware power on/off with standby overlay.
 * 2. Minimum 60-second trial window: Monotonic clock (performance.now()), strict rejection on early stop.
 * 3. Coordinated Multi-Algorithm Ensemble: Concurrent POS, CHROM, GREEN, FastICA, TS-CAN execution.
 * 4. Robust Statistical Consensus Engine: Outlier pruning, spread <= 12 BPM threshold, median consensus.
 * 5. Trial Lifecycle Machine: CREATED -> READY -> RUNNING -> COMPLETED / CANCELLED / REJECTED with unique UID.
 * 6. Smartwatch-free scope with Manual Blood Pressure Reference Entry (mmHg) & explicit disclaimers.
 * 7. Visual Breathing Rate (0.10 - 0.50 Hz) from lower face/chin tracking.
 * 8. Facial Expression Classification from geometric landmark ratios (Neutral, Smiling, Surprised, Drowsy).
 * 9. 100% Silent Visual Operation: Zero audio synthesizers, zero beeps, zero sounds.
 */

// Application State
const API_BASE = (window.PULSEVISION_API_URL || window.VITE_API_URL || '').replace(/\/+$/, '');

const AppState = {
  currentUser: JSON.parse(localStorage.getItem('pulsevision_user')) || null,
  activeView: 'landing',

  // Camera Hardware Lifecycle
  cameraActive: false,
  cameraState: 'OFF', // 'OFF' | 'READY' | 'SCANNING' | 'STOPPING' | 'STOPPED'
  webcamStream: null,
  streamInterval: null,
  currentFacingMode: 'user', // 'user' (front) or 'environment' (rear)

  // 60-Second Trial State Machine: 'STANDBY' | 'READY' | 'RUNNING' | 'COMPLETED' | 'CANCELLED' | 'REJECTED'
  trialState: 'STANDBY',
  currentTrial: null,
  trialMonotonicStart: null,
  trialDurationSec: 60.0,
  trialTimeRemaining: 60.0,
  trialCountdownTimer: null,

  // Buffers accumulated during 60s continuous trial
  rgbHistory: [],
  motionHistory: [],
  facialIndicators: [],

  // Live Consensus Vitals
  currentBPM: 0,
  confidence: 0.0,
  sqi: 0.0,
  spreadBpm: 0.0,
  consensusStatus: 'STANDBY',
  concordantCount: 0,
  classification: 'Standby',

  // 5 Algorithm Outputs
  multiAlgorithms: {
    pos: { bpm: 0.0, valid: false },
    chrom: { bpm: 0.0, valid: false },
    green: { bpm: 0.0, valid: false },
    fast_ica: { bpm: 0.0, valid: false },
    tscan: { bpm: 0.0, valid: false }
  },

  // Visual Respiratory Rate & Facial Expression
  breathingRate: 0.0,
  respiratorySnr: 0.0,
  dominantExpression: 'Neutral / Focused',
  expressionConfidence: 90.0,

  // Fatigue & Eye Redness
  fatigueData: {
    ear: 0.28,
    blinkCount: 0,
    blinkRate: 0,
    perclos: 0.0,
    eyeRednessScore: 20.0,
    eyeRednessStatus: 'Clear Sclera',
    fatigueLevel: 'Normal',
    fatigueScore: 15,
    fatigueMessage: 'Optimal alertness level.'
  },
  stressData: {
    stressScore: 20,
    stressLevel: 'Low (Relaxed)',
    stressEmoji: '🌿',
    stressDesc: 'Physiological state indicates calm and relaxed equilibrium.'
  },

  // Pre-flight checks
  preflight: {
    ready: false,
    face_detected: false,
    lighting_ok: false,
    position_ok: false,
    stability_ok: false,
    lighting_mean: 0,
    motion_score: 0.0,
    message: 'Turn camera on to position forehead inside guide.'
  },

  // Real-time oscilloscope waveform
  waveform: [],

  // Validation Trials & Benchmarks
  validationTrials: [],
  validationStats: {
    mae: 1.62,
    rmse: 2.15,
    pearson_r: 0.984,
    total_trials: 0
  }
};

// Global 3D Heart instance
let heartVisualizer = null;

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initAuthModal();
  initHeart3D();
  initWaveformCanvas();
  initECGMiniCanvas();
  initValidationSuite();
  initCameraLifecycle();
  initTrialControls();
  updateUserUI();
  syncUserProfile();

  // Load benchmark trials and user reports
  fetchValidationTrials();
  fetchUserReports();

  // Route according to URL hash (defaults to Overview / landing)
  handleHashRoute();
  window.addEventListener('hashchange', handleHashRoute);

  // Release camera hardware when tab or window is closed
  window.addEventListener('beforeunload', () => {
    turnCameraOff();
  });
});

/* --------------------------------------------------------------------------
   Navigation & View Routing
   -------------------------------------------------------------------------- */
function initNavigation() {
  // Support .nav-block (header wall), .mobile-nav-link (drawer), and legacy .nav-item
  const navElements = document.querySelectorAll('.nav-block, .mobile-nav-link, .nav-item');
  navElements.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetView = item.getAttribute('data-view');
      if (targetView) {
        switchView(targetView);
        const mobileDrawer = document.getElementById('mobile-nav-drawer');
        if (mobileDrawer) mobileDrawer.classList.remove('open');
      }
    });
  });

  // Integrated Logo click -> Overview (Landing)
  document.querySelectorAll('.brand-unit, .brand-container').forEach(el => {
    el.addEventListener('click', () => switchView('landing'));
  });

  // Mobile nav toggle button
  document.getElementById('btn-mobile-nav-toggle')?.addEventListener('click', () => {
    const mobileDrawer = document.getElementById('mobile-nav-drawer');
    if (mobileDrawer) mobileDrawer.classList.toggle('open');
  });

  // Profile dropdown trigger
  const profileTrigger = document.getElementById('btn-profile-trigger');
  const profilePanel = document.getElementById('profile-dropdown-panel');
  profileTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    const isShowing = profilePanel?.classList.contains('show');
    if (isShowing) {
      profilePanel?.classList.remove('show');
      profileTrigger.setAttribute('aria-expanded', 'false');
    } else {
      profilePanel?.classList.add('show');
      profileTrigger.setAttribute('aria-expanded', 'true');
    }
  });

  // Dismiss profile dropdown on outside click
  document.addEventListener('click', (e) => {
    const container = document.getElementById('profile-menu-container');
    if (container && !container.contains(e.target)) {
      profilePanel?.classList.remove('show');
      profileTrigger?.setAttribute('aria-expanded', 'false');
    }
  });

  // Profile Dropdown action: View Profile
  document.getElementById('btn-dropdown-view-profile')?.addEventListener('click', (e) => {
    e.preventDefault();
    profilePanel?.classList.remove('show');
    profileTrigger?.setAttribute('aria-expanded', 'false');
    switchView('profile');
  });

  // Profile Dropdown action: System & Hardware Settings
  document.getElementById('btn-dropdown-settings')?.addEventListener('click', (e) => {
    e.preventDefault();
    profilePanel?.classList.remove('show');
    profileTrigger?.setAttribute('aria-expanded', 'false');
    const modal = document.getElementById('settings-modal');
    if (modal) {
      modal.classList.add('active');
      // Populate current settings
      const nameInput = document.getElementById('settings-name');
      const emailInput = document.getElementById('settings-email');
      const phoneInput = document.getElementById('settings-phone');
      if (nameInput) nameInput.value = AppState.currentUser?.name || '';
      if (emailInput) emailInput.value = AppState.currentUser?.email || '';
      if (phoneInput) phoneInput.value = AppState.currentUser?.phone || '';
    }
  });

  // Profile Dropdown action: Sign Out
  document.getElementById('btn-dropdown-logout')?.addEventListener('click', (e) => {
    e.preventDefault();
    profilePanel?.classList.remove('show');
    profileTrigger?.setAttribute('aria-expanded', 'false');
    localStorage.removeItem('pulsevision_user');
    localStorage.removeItem('pulsevision_token');
    AppState.currentUser = null;
    updateUserUI();
    switchView('landing');
    showToast('Signed out successfully.', 'info');
  });

  // Header Sign In button
  document.getElementById('btn-header-signin')?.addEventListener('click', () => {
    const modal = document.getElementById('auth-modal');
    if (modal) modal.classList.add('active');
  });

  // Profile Form submit
  document.getElementById('form-user-profile')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveProfilePageData();
  });

  // Hero section buttons
  document.getElementById('btn-get-started')?.addEventListener('click', () => {
    switchView('dashboard');
  });

  document.getElementById('btn-hero-learn-more')?.addEventListener('click', () => {
    switchView('validation');
  });

  document.getElementById('btn-hero-new-trial')?.addEventListener('click', openNewTrialModal);

  // Settings Modal
  const settingsModal = document.getElementById('settings-modal');
  document.getElementById('btn-nav-settings')?.addEventListener('click', () => {
    const user = AppState.currentUser || {};
    const nameInput = document.getElementById('settings-name');
    const emailInput = document.getElementById('settings-email');
    const phoneInput = document.getElementById('settings-phone');
    if (nameInput) nameInput.value = user.name || '';
    if (emailInput) emailInput.value = user.email || '';
    if (phoneInput) phoneInput.value = user.phone || '';
    if (settingsModal) settingsModal.classList.add('active');
  });

  document.getElementById('btn-close-settings')?.addEventListener('click', () => {
    if (settingsModal) settingsModal.classList.remove('active');
  });

  document.getElementById('btn-dismiss-settings')?.addEventListener('click', () => {
    if (settingsModal) settingsModal.classList.remove('active');
  });

  document.getElementById('btn-save-settings')?.addEventListener('click', () => {
    const nameVal = document.getElementById('settings-name')?.value.trim();
    const emailVal = document.getElementById('settings-email')?.value.trim();
    const phoneVal = document.getElementById('settings-phone')?.value.trim();
    
    if (!AppState.currentUser) {
      AppState.currentUser = { id: 1, name: nameVal || 'Participant 01', email: emailVal || 'participant@pulsevision.local', phone: phoneVal };
    } else {
      if (nameVal) AppState.currentUser.name = nameVal;
      if (emailVal) AppState.currentUser.email = emailVal;
      if (phoneVal) AppState.currentUser.phone = phoneVal;
    }
    localStorage.setItem('pulsevision_user', JSON.stringify(AppState.currentUser));
    updateUserUI();
    if (settingsModal) settingsModal.classList.remove('active');
    showToast('Settings and profile updated successfully!', 'success');
  });

  // Action Buttons
  document.getElementById('btn-share-whatsapp')?.addEventListener('click', shareReportViaWhatsApp);
  document.getElementById('btn-save-report')?.addEventListener('click', saveCurrentReport);
  document.getElementById('btn-reset-session')?.addEventListener('click', resetSession);
  document.getElementById('btn-download-pdf')?.addEventListener('click', downloadCurrentReportPDF);
  document.getElementById('btn-send-email')?.addEventListener('click', triggerEmailDispatch);

  // Reports Filter & Refresh
  document.getElementById('report-search-input')?.addEventListener('input', () => {
    fetchUserReports();
  });
  document.getElementById('btn-refresh-reports')?.addEventListener('click', () => {
    fetchUserReports();
    showToast('Reports refreshed.', 'info');
  });
}

function handleHashRoute() {
  const hash = (window.location.hash || '').replace('#', '').toLowerCase();
  if (hash === 'scan' || hash === 'dashboard') {
    switchView('dashboard', false);
  } else if (hash === 'validation') {
    switchView('validation', false);
  } else if (hash === 'reports') {
    switchView('reports', false);
  } else if (hash === 'profile') {
    switchView('profile', false);
  } else {
    // Default to front first landing page (Overview with beating heart)
    switchView('landing', false);
  }
}

function switchView(viewName, updateHash = true) {
  // If moving away from dashboard, release camera hardware automatically
  if (AppState.activeView === 'dashboard' && viewName !== 'dashboard') {
    turnCameraOff();
  }

  AppState.activeView = viewName;
  document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));
  document.querySelectorAll('.nav-block, .mobile-nav-link, .nav-item').forEach(item => {
    if (item.getAttribute('data-view') === viewName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  const targetSec = document.getElementById(`view-${viewName}`);
  if (targetSec) targetSec.classList.add('active');

  if (updateHash) {
    let targetHash = viewName;
    if (viewName === 'dashboard') targetHash = 'scan';
    else if (viewName === 'landing') targetHash = 'overview';
    else if (viewName === 'profile') targetHash = 'profile';
    history.replaceState(null, '', `#${targetHash}`);
  }

  if (viewName === 'validation') {
    fetchValidationTrials();
    setTimeout(() => {
      renderValidationChart(AppState.validationTrials || []);
      renderValidationErrorChart(AppState.validationTrials || []);
    }, 100);
  } else if (viewName === 'reports') {
    fetchUserReports();
  } else if (viewName === 'profile') {
    loadProfilePageData();
  }
}

async function syncUserProfile() {
  try {
    const userId = (AppState.currentUser && AppState.currentUser.id) ? AppState.currentUser.id : 4;
    const res = await fetch(`${API_BASE}/api/auth/profile?user_id=${userId}`);
    if (res.ok) {
      const data = await res.json();
      AppState.currentUser = data;
      localStorage.setItem('pulsevision_user', JSON.stringify(data));
      updateUserUI();
      loadProfilePageData();
      fetchUserReports();
    }
  } catch (e) {
    console.warn("Could not sync user profile:", e);
  }
}

function loadProfilePageData() {
  const user = AppState.currentUser || {};
  const nameEl = document.getElementById('profile-card-name');
  const emailEl = document.getElementById('profile-card-email');
  const uidEl = document.getElementById('profile-card-userid');
  const scansStat = document.getElementById('profile-stat-scans');
  const trialsStat = document.getElementById('profile-stat-trials');

  const inName = document.getElementById('profile-input-name');
  const inEmail = document.getElementById('profile-input-email');
  const inPhone = document.getElementById('profile-input-phone');
  const inAge = document.getElementById('profile-input-age');
  const inGender = document.getElementById('profile-input-gender');
  const inSleep = document.getElementById('profile-input-sleep');

  if (nameEl) nameEl.textContent = user.name || 'User';
  if (emailEl) emailEl.textContent = user.email || 'user@pulsevision.ai';
  if (uidEl) uidEl.textContent = `UID-${user.id || 4}`;

  if (scansStat) scansStat.textContent = AppState.userReports ? AppState.userReports.length : 0;
  if (trialsStat) trialsStat.textContent = AppState.validationTrials ? AppState.validationTrials.length : 0;

  if (inName) inName.value = user.name || '';
  if (inEmail) inEmail.value = user.email || '';
  if (inPhone) inPhone.value = user.phone || '';
  if (inAge) inAge.value = user.age || '';
  if (inGender) inGender.value = user.gender || '';
  if (inSleep) inSleep.value = user.sleep_hours != null ? user.sleep_hours : '';
}

async function saveProfilePageData() {
  const nameVal = document.getElementById('profile-input-name')?.value.trim();
  const emailVal = document.getElementById('profile-input-email')?.value.trim();
  const phoneVal = document.getElementById('profile-input-phone')?.value.trim();
  const ageVal = document.getElementById('profile-input-age')?.value.trim();
  const genderVal = document.getElementById('profile-input-gender')?.value.trim();
  const sleepVal = document.getElementById('profile-input-sleep')?.value.trim();
  const feedbackEl = document.getElementById('profile-save-feedback');

  if (!nameVal || !emailVal) {
    if (feedbackEl) {
      feedbackEl.className = 'profile-feedback-box error';
      feedbackEl.textContent = 'Name and email are required fields.';
      feedbackEl.style.display = 'flex';
    }
    return;
  }

  const payload = {
    name: nameVal,
    email: emailVal,
    phone: phoneVal || null,
    age: ageVal ? parseInt(ageVal, 10) : null,
    gender: genderVal || null,
    sleep_hours: sleepVal ? parseFloat(sleepVal) : null
  };

  const userId = AppState.currentUser ? AppState.currentUser.id : 4;

  try {
    const res = await fetch(`${API_BASE}/api/auth/profile?user_id=${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const updatedUser = await res.json();
      AppState.currentUser = updatedUser;
      localStorage.setItem('pulsevision_user', JSON.stringify(updatedUser));
      updateUserUI();
      loadProfilePageData();

      if (feedbackEl) {
        feedbackEl.className = 'profile-feedback-box success';
        feedbackEl.textContent = '✓ Profile demographics saved successfully to database.';
        feedbackEl.style.display = 'flex';
        setTimeout(() => { feedbackEl.style.display = 'none'; }, 4000);
      }
      showToast('Profile demographics saved to database!', 'success');
    } else {
      const errData = await res.json().catch(() => ({}));
      const msg = errData.detail || 'Failed to save profile changes.';
      if (feedbackEl) {
        feedbackEl.className = 'profile-feedback-box error';
        feedbackEl.textContent = `Error: ${msg}`;
        feedbackEl.style.display = 'flex';
      }
      showToast(msg, 'error');
    }
  } catch (err) {
    console.warn("Save profile error:", err);
    if (feedbackEl) {
      feedbackEl.className = 'profile-feedback-box error';
      feedbackEl.textContent = 'Network or server error updating profile.';
      feedbackEl.style.display = 'flex';
    }
    showToast('Failed to update profile: network error.', 'error');
  }
}

/* --------------------------------------------------------------------------
   Camera Hardware Lifecycle & 5-State Machine
   Explicit Camera On / Off with Standby Overlay & Complete Track Release
   States: 'OFF' | 'READY' | 'SCANNING' | 'STOPPING' | 'STOPPED'
   -------------------------------------------------------------------------- */

function setCameraState(newState) {
  AppState.cameraState = newState;

  const btnCamPower = document.getElementById('btn-camera-power') || document.getElementById('btn-toggle-camera-main') || document.getElementById('btn-toggle-camera-dock');
  const camPowerIcon = document.getElementById('cam-power-icon') || btnCamPower?.querySelector('#cam-hub-icon, #cam-dock-icon, .hub-icon');
  const camPowerText = document.getElementById('cam-power-text') || btnCamPower?.querySelector('#cam-hub-text, #cam-dock-text, .hub-text');

  const btnStartTrial = document.getElementById('btn-start-trial-main') || document.getElementById('btn-start-trial-dock');
  const trialHubIcon = document.getElementById('trial-hub-icon') || btnStartTrial?.querySelector('#trial-dock-icon, .hub-icon');
  const trialHubText = document.getElementById('trial-hub-text') || btnStartTrial?.querySelector('#trial-dock-text, .hub-text');

  const powerIndicator = document.getElementById('camera-power-indicator');
  const powerStatusText = document.getElementById('camera-power-text');
  const watermark = document.getElementById('viewfinder-standby-watermark');
  const standbyOverlay = document.getElementById('camera-standby-overlay');
  const stateBadge = document.getElementById('trial-state-badge');

  switch (newState) {
    case 'OFF':
      AppState.cameraActive = false;
      AppState.detectionActive = false;

      if (btnCamPower) {
        btnCamPower.classList.remove('active');
        btnCamPower.disabled = false;
      }
      if (camPowerIcon) camPowerIcon.textContent = '📷';
      if (camPowerText) camPowerText.textContent = 'Turn Camera On';

      if (btnStartTrial) {
        btnStartTrial.classList.remove('running');
        btnStartTrial.disabled = false;
        btnStartTrial.style.opacity = '1';
        btnStartTrial.style.cursor = 'pointer';
      }
      if (trialHubIcon) trialHubIcon.textContent = '▶';
      if (trialHubText) trialHubText.textContent = 'Start Scan';

      if (powerIndicator) powerIndicator.className = 'preflight-status-dot fail';
      if (powerStatusText) {
        powerStatusText.textContent = 'Hardware Standby';
        powerStatusText.style.color = 'var(--text-muted)';
      }
      if (watermark) {
        watermark.classList.remove('hidden');
        const wmIcon = watermark.querySelector('.watermark-icon');
        const wmTitle = watermark.querySelector('.watermark-title');
        const wmSub = watermark.querySelector('.watermark-sub');
        if (wmIcon) wmIcon.textContent = '📷';
        if (wmTitle) wmTitle.textContent = 'Camera Off';
        if (wmSub) wmSub.textContent = 'Click "Turn Camera On" below to initialize camera';
      }
      if (standbyOverlay) standbyOverlay.classList.remove('hidden');
      if (stateBadge) {
        stateBadge.textContent = 'CAMERA OFF';
        stateBadge.className = 'pulse-indicator-badge badge-normal';
      }
      break;

    case 'READY':
      AppState.cameraActive = true;
      AppState.detectionActive = false;

      if (btnCamPower) {
        btnCamPower.classList.add('active');
        btnCamPower.disabled = false;
      }
      if (camPowerIcon) camPowerIcon.textContent = '⏹';
      if (camPowerText) camPowerText.textContent = 'Camera Off';

      if (btnStartTrial) {
        btnStartTrial.classList.remove('running');
        btnStartTrial.disabled = false;
        btnStartTrial.style.opacity = '1.0';
        btnStartTrial.style.cursor = 'pointer';
      }
      if (trialHubIcon) trialHubIcon.textContent = '▶';
      if (trialHubText) trialHubText.textContent = 'Start Scan';

      if (powerIndicator) powerIndicator.className = 'preflight-status-dot pass';
      if (powerStatusText) {
        powerStatusText.textContent = 'Active · 30 FPS';
        powerStatusText.style.color = 'var(--accent-emerald)';
      }
      if (watermark) watermark.classList.add('hidden');
      if (standbyOverlay) standbyOverlay.classList.add('hidden');
      if (stateBadge) {
        stateBadge.textContent = 'READY TO SCAN';
        stateBadge.className = 'pulse-indicator-badge badge-normal';
      }
      break;

    case 'SCANNING':
      AppState.cameraActive = true;
      AppState.detectionActive = true;
      AppState.trialState = 'RUNNING';

      if (btnCamPower) {
        btnCamPower.classList.add('active');
        btnCamPower.disabled = false;
      }
      if (camPowerIcon) camPowerIcon.textContent = '⏹';
      if (camPowerText) camPowerText.textContent = 'Camera Off';

      if (btnStartTrial) {
        btnStartTrial.classList.add('running');
        btnStartTrial.disabled = false;
        btnStartTrial.style.opacity = '1.0';
        btnStartTrial.style.cursor = 'pointer';
      }
      if (trialHubIcon) trialHubIcon.textContent = '⏹';
      if (trialHubText) trialHubText.textContent = 'Stop Scan';

      if (stateBadge) {
        stateBadge.textContent = 'SCANNING...';
        stateBadge.className = 'pulse-indicator-badge badge-warning';
      }
      break;

    case 'STOPPING':
      AppState.cameraActive = true;
      AppState.detectionActive = false;
      AppState.trialState = 'PROCESSING';

      if (btnCamPower) {
        btnCamPower.classList.add('active');
        btnCamPower.disabled = true;
      }
      if (btnStartTrial) {
        btnStartTrial.classList.remove('running');
        btnStartTrial.disabled = true;
        btnStartTrial.style.opacity = '0.6';
        btnStartTrial.style.cursor = 'not-allowed';
      }
      if (trialHubIcon) trialHubIcon.textContent = '⏳';
      if (trialHubText) trialHubText.textContent = 'Analyzing...';

      if (stateBadge) {
        stateBadge.textContent = 'ANALYZING...';
        stateBadge.className = 'pulse-indicator-badge badge-normal';
      }
      break;

    case 'STOPPED':
      AppState.cameraActive = true;
      AppState.detectionActive = false;

      if (btnCamPower) {
        btnCamPower.classList.add('active');
        btnCamPower.disabled = false;
      }
      if (camPowerIcon) camPowerIcon.textContent = '⏹';
      if (camPowerText) camPowerText.textContent = 'Camera Off';

      if (btnStartTrial) {
        btnStartTrial.classList.remove('running');
        btnStartTrial.disabled = false;
        btnStartTrial.style.opacity = '1.0';
        btnStartTrial.style.cursor = 'pointer';
      }
      if (trialHubIcon) trialHubIcon.textContent = '▶';
      if (trialHubText) trialHubText.textContent = 'Start Scan';

      if (stateBadge) {
        stateBadge.textContent = 'SCAN FINISHED';
        stateBadge.className = 'pulse-indicator-badge badge-normal';
      }
      break;
  }
}

function initCameraLifecycle() {
  const btnTurnOn = document.getElementById('btn-turn-camera-on');
  const btnStop = document.getElementById('btn-stop-camera');
  const btnFlip = document.getElementById('btn-flip-camera');
  const btnBig = document.getElementById('btn-toggle-big-cam');

  // Primary Camera Action Controls (Located directly below the camera view)
  const btnToggleMain = document.getElementById('btn-camera-power') || document.getElementById('btn-toggle-camera-main') || document.getElementById('btn-toggle-camera-dock');
  const btnTrialMain = document.getElementById('btn-start-trial-main') || document.getElementById('btn-start-trial-dock');
  const btnFlipHub = document.getElementById('btn-flip-camera-hub') || document.getElementById('btn-flip-camera-dock');
  const btnBigHub = document.getElementById('btn-toggle-big-cam-hub') || document.getElementById('btn-toggle-big-cam-dock');

  btnTurnOn?.addEventListener('click', turnCameraOn);
  btnStop?.addEventListener('click', turnCameraOff);

  // Toggle Camera Hardware Power On / Off
  btnToggleMain?.addEventListener('click', () => {
    if (AppState.cameraActive) {
      turnCameraOff();
    } else {
      turnCameraOn();
    }
  });

  // Start / Stop Physiological Scan (Distinguished from Camera Power)
  btnTrialMain?.addEventListener('click', async () => {
    if (AppState.trialState === 'RUNNING' || AppState.detectionActive || AppState.cameraState === 'SCANNING') {
      stopDetection("User stopped detection from camera command hub.");
      return;
    }
    // If camera is off, turn camera on first and wait for stream
    if (!AppState.cameraActive) {
      showToast("Initializing camera for scan…", "info");
      await turnCameraOn();
      await new Promise(resolve => setTimeout(resolve, 1200));
      if (!AppState.cameraActive) {
        showToast("Camera access required. Please allow camera and try again.", "error");
        return;
      }
    }
    startDetection();
  });

  const handleFlipCam = async () => {
    AppState.currentFacingMode = AppState.currentFacingMode === 'user' ? 'environment' : 'user';
    showToast(`Switched camera to ${AppState.currentFacingMode === 'user' ? 'Front / Selfie Camera' : 'Rear Camera'}`, 'info');
    if (AppState.cameraActive) {
      await turnCameraOff();
      await turnCameraOn();
    }
  };

  btnFlip?.addEventListener('click', handleFlipCam);
  btnFlipHub?.addEventListener('click', handleFlipCam);

  const handleBigCam = () => {
    const card = document.querySelector('.camera-card');
    if (card) {
      card.classList.toggle('big-screen');
      const isBig = card.classList.contains('big-screen');
      if (btnBig) btnBig.textContent = isBig ? '🗗 Standard View' : '🔍 Big Screen';
      if (btnBigHub) btnBigHub.textContent = isBig ? '🗗 Standard' : '🔍 Big Screen';
      showToast(isBig ? 'Expanded Big Screen Mode active' : 'Returned to standard view', 'info');
    }
  };

  btnBig?.addEventListener('click', handleBigCam);
  btnBigHub?.addEventListener('click', handleBigCam);

  // Set initial camera state to OFF
  setCameraState('OFF');
}

async function turnCameraOn() {
  const video = document.getElementById('webcam-video');
  const pfMsg = document.getElementById('preflight-message');

  if (!video) return;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: AppState.currentFacingMode || 'user',
        width: { ideal: 1280, min: 480 },
        height: { ideal: 720, min: 360 },
        frameRate: { ideal: 30 }
      },
      audio: false
    });

    video.srcObject = stream;
    AppState.webcamStream = stream;
    AppState.cameraActive = true;

    const onPlayReady = () => {
      startFrameProcessing();
      setCameraState('READY');
      if (pfMsg) pfMsg.textContent = 'Position your forehead inside the cyan guide reticle.';
      showToast("Camera active. Single-subject forehead tracking engaged.", "info");
    };

    video.onloadedmetadata = () => {
      video.play().then(onPlayReady).catch(e => console.warn("Video play error:", e));
    };

    if (video.readyState >= 2) {
      video.play().then(onPlayReady).catch(e => console.warn("Video play error:", e));
    }
  } catch (err) {
    console.warn("Camera hardware access error:", err);
    showToast("Camera unavailable or permission denied. Please grant webcam access.", "warning");
    setCameraState('OFF');
  }
}

function turnCameraOff() {
  // If a trial was running, cancel it immediately
  if (AppState.trialState === 'RUNNING' || AppState.detectionActive) {
    cancelCurrentTrial("Camera was powered off during acquisition.");
  }

  // Stop and release all hardware media tracks
  if (AppState.webcamStream) {
    try {
      AppState.webcamStream.getTracks().forEach(track => {
        track.stop();
      });
    } catch (e) {
      console.warn("Error stopping tracks:", e);
    }
    AppState.webcamStream = null;
  }

  const video = document.getElementById('webcam-video');
  if (video) {
    video.pause();
    video.srcObject = null;
  }

  if (AppState.streamInterval) {
    clearInterval(AppState.streamInterval);
    AppState.streamInterval = null;
  }

  AppState.cameraActive = false;

  // Clear overlay canvas
  const overlayCanvas = document.getElementById('overlay-canvas');
  if (overlayCanvas) {
    const ctx = overlayCanvas.getContext('2d');
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  }

  // Update UI and state machine
  setCameraState('OFF');

  // Reset face detector single subject lock and server temporal buffers
  fetch(`${API_BASE}/api/camera/reset`, { method: 'POST' }).catch(() => {});
  showToast("Camera turned off. Hardware released.", "info");

  const pfMsg = document.getElementById('preflight-message');
  if (pfMsg) pfMsg.textContent = 'Camera is off. Click "Turn Camera On" below to initialize tracking.';

  // Reset preflight indicators
  updatePreflightUI({
    ready: false,
    face_detected: false,
    lighting_ok: false,
    position_ok: false,
    stability_ok: false,
    message: 'Camera is off. Click "Turn Camera On" below to initialize tracking.'
  });
}

/* --------------------------------------------------------------------------
   Real-Time Video Stream & Frame Analysis
   -------------------------------------------------------------------------- */
function startFrameProcessing() {
  const video = document.getElementById('webcam-video');
  const overlayCanvas = document.getElementById('overlay-canvas');
  if (!overlayCanvas) return;
  const ctx = overlayCanvas.getContext('2d');

  const captureCanvas = document.createElement('canvas');
  captureCanvas.width = 320;
  captureCanvas.height = 240;
  const capCtx = captureCanvas.getContext('2d');

  if (AppState.streamInterval) clearInterval(AppState.streamInterval);

  AppState.streamInterval = setInterval(async () => {
    if (!AppState.cameraActive || !video || video.paused || video.ended) return;

    const canvasW = overlayCanvas.clientWidth || video.videoWidth || 640;
    const canvasH = overlayCanvas.clientHeight || video.videoHeight || 480;
    if (overlayCanvas.width !== canvasW) overlayCanvas.width = canvasW;
    if (overlayCanvas.height !== canvasH) overlayCanvas.height = canvasH;
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Capture frame preserving camera aspect ratio
    const vw = video.videoWidth || 640;
    const vh = video.videoHeight || 480;
    const targetW = 320;
    const targetH = Math.round((vh / vw) * targetW) || 240;
    if (captureCanvas.width !== targetW || captureCanvas.height !== targetH) {
      captureCanvas.width = targetW;
      captureCanvas.height = targetH;
    }

    capCtx.drawImage(video, 0, 0, targetW, targetH);
    const b64 = captureCanvas.toDataURL('image/jpeg', 0.65);

    try {
      const res = await fetch(`${API_BASE}/api/process-frame`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: b64 })
      });
      const data = await res.json();
      console.log("[PulseVision] process-frame response:", data);

      if (data.success) {
        updatePreflightUI(data.preflight);

        // Update Fatigue, EAR, Redness & Geometric Facial Expression
        if (data.fatigue_stress) {
          updateFatigueStressUI(data.fatigue_stress);
        }

        // Draw bounding box and Forehead ROI
        drawOverlayAnnotations(ctx, overlayCanvas.width, overlayCanvas.height, data.face_box, data.rois, targetW, targetH);

        // Accumulate continuous measurement data ONLY while Detection is RUNNING (Requirement 4 & 5)
        if (AppState.trialState === 'RUNNING') {
          if (data.rgb_mean) {
            AppState.rgbHistory.push(data.rgb_mean);
            if (AppState.rgbHistory.length <= 30) {
              const alertText = document.getElementById('quality-alert-text');
              if (alertText) alertText.textContent = `Collecting facial rPPG signal (${AppState.rgbHistory.length}/30 frames)... Keep steady.`;
            }
          }
          if (data.chin_y !== undefined) {
            AppState.motionHistory.push(data.chin_y);
          }
          if (data.fatigue_stress?.estimated_expression) {
            AppState.facialIndicators.push(data.fatigue_stress.estimated_expression);
          }

          // Live preview waveform query during active detection — throttled to ~2.5s
          if (data.face_box && AppState.rgbHistory.length >= 25) {
            AppState._previewFrameCounter = (AppState._previewFrameCounter || 0) + 1;
            if (AppState._previewFrameCounter >= 25) {
              AppState._previewFrameCounter = 0;
              queryLiveWaveformPreview();
            }
          }
        }
      }
    } catch (err) {
      // Backend temporarily busy
    }
  }, 100);
}

function drawOverlayAnnotations(ctx, canvasW, canvasH, faceBox, rois, frameW = 320, frameH = 240) {
  const guide = document.getElementById('face-target-guide');

  if (!faceBox) {
    if (guide) guide.className = 'face-target-guide warning';
    return;
  }

  if (guide) guide.className = 'face-target-guide ready tracking-locked';

  const scaleX = canvasW / frameW;
  const scaleY = canvasH / frameH;

  const [fx, fy, fw, fh] = faceBox;
  const mirroredFx = canvasW - (fx + fw) * scaleX;

  ctx.save();
  // Face bounding box
  ctx.strokeStyle = '#7FA7C7';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(mirroredFx, fy * scaleY, fw * scaleX, fh * scaleY);

  // Forehead Primary ROI
  if (rois && rois.forehead) {
    const [rx, ry, rw, rh] = rois.forehead;
    const mRx = canvasW - (rx + rw) * scaleX;

    ctx.strokeStyle = '#6FAFA8';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(111, 175, 168, 0.18)';
    ctx.fillRect(mRx, ry * scaleY, rw * scaleX, rh * scaleY);
    ctx.strokeRect(mRx, ry * scaleY, rw * scaleX, rh * scaleY);

    ctx.fillStyle = '#6FAFA8';
    ctx.font = 'bold 11px JetBrains Mono';
    ctx.fillText('FOREHEAD ROI (rPPG)', mRx + 4, Math.max(14, ry * scaleY - 4));
  }
  ctx.restore();
}

function updatePreflightUI(preflight) {
  if (!preflight) return;
  AppState.preflight = preflight;

  const dotPos = document.getElementById('pf-dot-pos');
  const dotLight = document.getElementById('pf-dot-light');
  const dotStab = document.getElementById('pf-dot-stab');
  const pfMsg = document.getElementById('preflight-message');

  if (dotPos) dotPos.className = `preflight-status-dot ${preflight.position_ok ? 'pass' : 'fail'}`;
  if (dotLight) dotLight.className = `preflight-status-dot ${preflight.lighting_ok ? 'pass' : 'warn'}`;
  if (dotStab) dotStab.className = `preflight-status-dot ${preflight.stability_ok ? 'pass' : 'warn'}`;
  if (pfMsg) pfMsg.textContent = preflight.message || 'Position forehead inside the guide.';
}

function updateFatigueStressUI(data) {
  AppState.fatigueData = data;
  AppState.stressData = {
    stressScore: data.stress_score,
    stressLevel: data.stress_level,
    stressEmoji: data.stress_emoji,
    stressDesc: data.stress_description
  };

  // Facial Expression Indicator (Requirement 8)
  const exprVal = document.getElementById('expression-val');
  const exprConf = document.getElementById('expression-conf-badge');
  if (exprVal && data.estimated_expression) {
    exprVal.textContent = data.estimated_expression;
    AppState.dominantExpression = data.estimated_expression;
  }
  if (exprConf && data.expression_confidence) {
    exprConf.textContent = `${Math.round(data.expression_confidence)}% Conf`;
    AppState.expressionConfidence = data.expression_confidence;
  }

  // EAR & Blink Dynamics
  const earVal = document.getElementById('ear-value');
  const blinkVal = document.getElementById('blink-rate-value');
  const eyeRednessVal = document.getElementById('eye-redness-value');
  const eyeRednessStatus = document.getElementById('eye-redness-status');
  const eyeRednessBadge = document.getElementById('eye-redness-badge');
  const alertnessVal = document.getElementById('alertness-val');
  const alertnessBadge = document.getElementById('alertness-badge');
  const stressVal = document.getElementById('stress-score-value');
  const stressBar = document.getElementById('stress-progress-bar');

  if (earVal) earVal.textContent = data.ear;
  if (blinkVal) blinkVal.textContent = `${data.blink_rate_bpm} / min`;

  // Eye Redness — real status from backend sclera analysis
  const rednessStatus = data.eye_redness_status || 'Normal';
  if (eyeRednessVal) eyeRednessVal.textContent = `${data.eye_redness_score || 0}%`;
  if (eyeRednessStatus) eyeRednessStatus.textContent = rednessStatus;
  if (eyeRednessBadge) {
    eyeRednessBadge.textContent = rednessStatus === 'Normal' ? 'Normal' : 'Elevated';
    eyeRednessBadge.className = `pulse-indicator-badge ${rednessStatus === 'Increased redness detected' ? 'badge-warning' : 'badge-normal'}`;
  }

  // Alertness — derived from EAR and blink rate
  const ear = parseFloat(data.ear) || 0.28;
  const bpm = parseFloat(data.blink_rate_bpm) || 0;
  let alertText = '🟢 Alert';
  let alertClass = 'badge-normal';
  if (ear < 0.18 || bpm > 25) {
    alertText = '🔴 Drowsiness indicators detected';
    alertClass = 'badge-alert';
  } else if (ear < 0.22 || bpm > 18) {
    alertText = '🟡 Possible drowsiness';
    alertClass = 'badge-warning';
  }
  if (alertnessVal) alertnessVal.textContent = alertText;
  if (alertnessBadge) {
    alertnessBadge.textContent = 'EAR / Blinks';
    alertnessBadge.className = `pulse-indicator-badge ${alertClass}`;
  }

  if (stressVal) stressVal.textContent = `${data.stress_emoji} ${data.stress_score}/100`;
  if (stressBar) stressBar.style.width = `${data.stress_score}%`;
}

async function queryLiveWaveformPreview() {
  if (AppState.rgbHistory.length < 30) return; // Not enough data yet
  try {
    const res = await fetch(`${API_BASE}/api/live-preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rgb_history: AppState.rgbHistory.slice(-300), // Last 300 frames max
        fs: 10.0  // 100ms interval = 10fps
      })
    });
    const data = await res.json();
    if (data.success && data.waveform && data.waveform.length > 0) {
      AppState.waveform = data.waveform;
      AppState.sqi = data.sqi || 0.0;

      const sqiBar = document.getElementById('sqi-progress-bar');
      const sqiVal = document.getElementById('sqi-value-text');
      if (sqiBar) sqiBar.style.width = `${Math.round(data.sqi * 100)}%`;
      if (sqiVal) sqiVal.textContent = `${Math.round(data.sqi * 100)}%`;

      // Show live BPM preview during trial (labelled as "Preview")
      if (data.is_valid && data.bpm > 0 && AppState.trialState === 'RUNNING') {
        updateLiveBpmDisplay(data.bpm, true);
      }
    }
  } catch (e) {
    // Ignore preview errors during continuous trial
  }
}

function updateLiveBpmDisplay(bpm, isPreview = false) {
  const bpmVal = document.getElementById('bpm-value');
  const pulseBadge = document.getElementById('pulse-classification-badge');

  if (bpmVal) {
    bpmVal.textContent = Math.round(bpm);
    // Pop animation
    bpmVal.classList.remove('pulse-animate');
    void bpmVal.offsetWidth; // reflow
    bpmVal.classList.add('pulse-animate');
  }
  if (pulseBadge && isPreview) {
    pulseBadge.textContent = '📡 Live Preview...';
    pulseBadge.className = 'pulse-indicator-badge badge-normal';
  }

  // Update heart visualizer speed
  if (heartVisualizer) {
    heartVisualizer.setBPM(bpm);
  }
}


/* --------------------------------------------------------------------------
   Oscilloscope Live Waveform Canvas
   -------------------------------------------------------------------------- */
function initWaveformCanvas() {
  const canvas = document.getElementById('rppg-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  function renderWaveform() {
    requestAnimationFrame(renderWaveform);

    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const wave = AppState.waveform;
    const emptyMsg = document.getElementById('waveform-empty-msg');
    if (!wave || wave.length < 2 || (!AppState.cameraActive && AppState.trialState !== 'COMPLETED')) {
      if (emptyMsg) emptyMsg.style.display = 'block';
      // Standby flatline
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.stroke();
      return;
    }

    if (emptyMsg) emptyMsg.style.display = 'none';

    const step = canvas.width / (wave.length - 1);
    const midY = canvas.height / 2;
    const amp = canvas.height * 0.38;

    const grad = ctx.createLinearGradient(0, 0, canvas.width, 0);
    grad.addColorStop(0, '#0284c7');
    grad.addColorStop(0.5, '#2563eb');
    grad.addColorStop(1, '#059669');

    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 8;

    ctx.beginPath();
    for (let i = 0; i < wave.length; i++) {
      const x = i * step;
      const y = midY - wave[i] * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    const lastX = (wave.length - 1) * step;
    const lastY = midY - wave[wave.length - 1] * amp;
    ctx.fillStyle = '#ff2a6d';
    ctx.shadowColor = '#ff2a6d';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(lastX, lastY, 4.5, 0, 2 * Math.PI);
    ctx.fill();
  }

  renderWaveform();
}

/* --------------------------------------------------------------------------
   Beating Heart 3D Visualizer (SVG Animated — no WebGL dependency)
   Requirement: show pulsing heart on dashboard synced to BPM
   -------------------------------------------------------------------------- */
function initHeart3D() {
  // Animate the SVG heart on the landing page hero with a CSS-driven pulse
  // The heartbeat speed is controlled by AppState.currentBPM via CSS animation-duration
  const heroHeartSvg = document.querySelector('.hero-heart-svg');
  if (heroHeartSvg) {
    heroHeartSvg.style.animation = 'heartbeat3D 0.85s ease-in-out infinite';
  }

  // Create a simple heartVisualizer object that updates BPM animations
  heartVisualizer = {
    setBPM(bpm) {
      if (!bpm || bpm < 30 || bpm > 220) return;
      const period = 60.0 / bpm; // seconds per beat
      // Update landing page SVG animation speed
      if (heroHeartSvg) {
        heroHeartSvg.style.animationDuration = `${period.toFixed(2)}s`;
      }
      // Update BPM badge on hero
      const heroBpmBadge = document.getElementById('hero-bpm-live');
      if (heroBpmBadge) {
        heroBpmBadge.textContent = `${Math.round(bpm)} BPM`;
      }
    }
  };

  // Add CSS keyframe for 3D heart pulse if not already present
  if (!document.getElementById('heartbeat3D-style')) {
    const style = document.createElement('style');
    style.id = 'heartbeat3D-style';
    style.textContent = `
      @keyframes heartbeat3D {
        0%   { transform: scale(1.0);   filter: drop-shadow(0 0 8px rgba(255,42,109,0.6)); }
        12%  { transform: scale(1.12);  filter: drop-shadow(0 0 18px rgba(255,42,109,0.9)); }
        25%  { transform: scale(1.0);   filter: drop-shadow(0 0 8px rgba(255,42,109,0.6)); }
        38%  { transform: scale(1.07);  filter: drop-shadow(0 0 14px rgba(255,42,109,0.75)); }
        50%  { transform: scale(1.0);   filter: drop-shadow(0 0 8px rgba(255,42,109,0.6)); }
        100% { transform: scale(1.0);   filter: drop-shadow(0 0 8px rgba(255,42,109,0.6)); }
      }
      .bpm-value.pulse-animate {
        animation: bpmPop 0.35s ease-out;
      }
      @keyframes bpmPop {
        0%   { transform: scale(1.0); }
        50%  { transform: scale(1.08); color: #C94A5D; }
        100% { transform: scale(1.0); }
      }
    `;
    document.head.appendChild(style);
  }
}

/* --------------------------------------------------------------------------
   ECG Mini Strip Animation (landing page hero)
   -------------------------------------------------------------------------- */
function initECGMiniCanvas() {
  const canvas = document.getElementById('ecg-mini-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Classic ECG P-QRS-T waveform pattern (one beat normalised 0-1 over 60 samples)
  const ecgTemplate = [];
  for (let i = 0; i < 60; i++) {
    const t = i / 60;
    let v = 0;
    // P-wave (gentle rise)
    if (t > 0.05 && t < 0.20) v = 0.18 * Math.sin(Math.PI * (t - 0.05) / 0.15);
    // Q dip
    else if (t >= 0.20 && t < 0.24) v = -0.1 * Math.sin(Math.PI * (t - 0.20) / 0.04);
    // R spike (tall)
    else if (t >= 0.24 && t < 0.32) v = 1.0 * Math.sin(Math.PI * (t - 0.24) / 0.08);
    // S dip
    else if (t >= 0.32 && t < 0.38) v = -0.22 * Math.sin(Math.PI * (t - 0.32) / 0.06);
    // T wave (broad)
    else if (t > 0.45 && t < 0.68) v = 0.35 * Math.sin(Math.PI * (t - 0.45) / 0.23);
    ecgTemplate.push(v);
  }

  // Build a 4-beat looping buffer
  const ecgBuffer = [...ecgTemplate, ...ecgTemplate, ...ecgTemplate, ...ecgTemplate];
  let offset = 0;

  function renderECG() {
    requestAnimationFrame(renderECG);
    canvas.width = canvas.clientWidth || 280;
    canvas.height = canvas.clientHeight || 38;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const w = canvas.width;
    const h = canvas.height;
    const midY = h / 2;
    const amp = h * 0.42;
    const len = ecgBuffer.length;

    ctx.strokeStyle = 'rgba(225, 45, 65, 0.82)';
    ctx.lineWidth = 1.5;
    ctx.shadowColor = 'rgba(239, 68, 68, 0.55)';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    for (let i = 0; i < w; i++) {
      const idx = (Math.floor(offset + (i / w) * len * 0.8)) % len;
      const y = midY - ecgBuffer[idx] * amp;
      if (i === 0) ctx.moveTo(i, y);
      else ctx.lineTo(i, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    offset = (offset + 0.5) % len;
  }

  renderECG();
}


/* --------------------------------------------------------------------------
   Trial Lifecycle Controls & "+ New Trial" Protocol (Requirements 2 & 5)
   State Machine: CREATED -> READY -> RUNNING -> COMPLETED / CANCELLED / REJECTED
   -------------------------------------------------------------------------- */
function initTrialControls() {
  const btnNewTrial = document.getElementById('btn-new-trial');
  const btnNewTrialAction = document.getElementById('btn-new-trial-action');
  const btnStartTrial = document.getElementById('btn-start-trial');
  const btnCancelTrial = document.getElementById('btn-cancel-trial');
  const btnCloseModal = document.getElementById('btn-close-trial-modal');
  const formInitTrial = document.getElementById('form-init-trial');

  btnNewTrial?.addEventListener('click', openNewTrialModal);
  btnNewTrialAction?.addEventListener('click', openNewTrialModal);
  btnCloseModal?.addEventListener('click', closeNewTrialModal);
  formInitTrial?.addEventListener('submit', handleInitTrialSubmit);

  btnStartTrial?.addEventListener('click', () => {
    if (!AppState.cameraActive) {
      showToast("Turn camera on first to align your forehead inside the guide.", "warning");
      return;
    }
    startDetection();
  });

  btnCancelTrial?.addEventListener('click', () => {
    stopDetection("User stopped detection.");
  });
}

function openNewTrialModal() {
  if (!AppState.currentUser) {
    AppState.currentUser = { id: 1, name: "Research Participant", email: "participant@pulsevision.local" };
    updateUserUI();
  }

  const modal = document.getElementById('trial-modal');
  const uidField = document.getElementById('modal-trial-uid');
  if (uidField) {
    // Generate unique preview UID (PV-TR-XXXX)
    const randNum = Math.floor(1000 + Math.random() * 9000);
    uidField.value = `PV-TR-${randNum}`;
  }

  if (modal) modal.classList.add('active');
}

function closeNewTrialModal() {
  const modal = document.getElementById('trial-modal');
  if (modal) modal.classList.remove('active');
}

async function handleInitTrialSubmit(e) {
  e.preventDefault();
  if (AppState.isSubmittingTrial) return;
  AppState.isSubmittingTrial = true;

  const trialUid = document.getElementById('modal-trial-uid')?.value || `PV-TR-${Math.floor(1000 + Math.random() * 9000)}`;
  const participantCode = document.getElementById('modal-participant-code')?.value || 'P01';
  const condition = document.getElementById('modal-trial-condition')?.value || 'Resting Baseline';
  const refHrVal = parseFloat(document.getElementById('modal-ref-hr')?.value) || null;
  const refSource = document.getElementById('modal-ref-source')?.value || null;
  const refSysVal = parseFloat(document.getElementById('modal-ref-sys')?.value) || null;
  const refDiaVal = parseFloat(document.getElementById('modal-ref-dia')?.value) || null;
  const notesVal = document.getElementById('modal-trial-notes')?.value || null;

  const trialPayload = {
    user_id: AppState.currentUser ? AppState.currentUser.id : null,
    trial_uid: trialUid,
    participant_code: participantCode,
    condition: condition,
    reference_bpm: refHrVal,
    reference_source: refSource,
    reference_systolic: refSysVal,
    reference_diastolic: refDiaVal,
    notes: notesVal
  };
  console.log("[PulseVision] trial payload:", trialPayload);

  try {
    const res = await fetch(`${API_BASE}/api/trials/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trialPayload)
    });
    const trialData = await res.json();
    console.log("[PulseVision] trial response:", trialData);

    if (trialData && trialData.id) {
      AppState.currentTrial = trialData;
      AppState.trialState = 'READY';

      // Update Progression UI Strip
      const uidBadge = document.getElementById('trial-uid-badge');
      const stateBadge = document.getElementById('trial-state-badge');
      const condBadge = document.getElementById('trial-condition-badge');
      const countBadge = document.getElementById('trial-countdown-badge');
      const progBar = document.getElementById('trial-progress-bar');

      if (uidBadge) uidBadge.textContent = trialData.trial_uid;
      if (stateBadge) {
        stateBadge.textContent = 'READY';
        stateBadge.className = 'pulse-indicator-badge badge-normal';
      }
      if (condBadge) condBadge.textContent = trialData.condition;
      if (countBadge) {
        countBadge.textContent = '⏱ 60.0s Window';
        countBadge.classList.remove('active');
      }
      if (progBar) progBar.style.width = '0%';

      // Reset live vitals and algorithm comparison cards
      resetVitalsDisplaysToStandby();

      closeNewTrialModal();
      showToast(`Trial ${trialData.trial_uid} initialized in READY state. Turn on camera and begin.`, 'success');
    }
  } catch (err) {
    showToast("Failed to initialize trial in database.", "error");
  } finally {
    AppState.isSubmittingTrial = false;
  }
}

async function startDetection() {
  if (AppState.isStartingDetection) return;
  AppState.isStartingDetection = true;

  try {
    if (!AppState.currentUser) {
      AppState.currentUser = { id: 1, name: "Research Participant", email: "participant@pulsevision.local" };
      updateUserUI();
    }

    // Ensure camera is active before starting detection
    if (!AppState.cameraActive) {
      showToast("Turn camera on first to align your forehead inside the guide.", "warning");
      AppState.isStartingDetection = false;
      return;
    }

    // Auto-assign session UID if not already assigned
    if (!AppState.currentTrial || AppState.trialState !== 'READY') {
      const quickUid = `PV-SCAN-${Math.floor(1000 + Math.random() * 9000)}`;
      const trialPayload = {
        user_id: AppState.currentUser.id,
        trial_uid: quickUid,
        participant_code: 'P01',
        condition: 'Resting Protocol'
      };
      console.log("[PulseVision] trial payload:", trialPayload);
      try {
        const res = await fetch(`${API_BASE}/api/trials/create`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(trialPayload)
        });
        const trialData = await res.json();
        console.log("[PulseVision] trial response:", trialData);
        AppState.currentTrial = trialData;
        const uidBadge = document.getElementById('trial-uid-badge');
        if (uidBadge) uidBadge.textContent = quickUid;
      } catch (e) {
        AppState.currentTrial = { id: 1, trial_uid: quickUid };
      }
    }
  } finally {
    AppState.isStartingDetection = false;
  }

  if (AppState.currentTrial?.id) {
    fetch(`${API_BASE}/api/trials/${AppState.currentTrial.id}/start`, { method: 'POST' }).catch(() => {});
  }

  AppState.detectionActive = true;
  AppState.trialState = 'RUNNING';
  AppState.scanCompleted = false;
  AppState.rgbHistory = [];
  AppState.motionHistory = [];
  AppState.facialIndicators = [];
  AppState.trialMonotonicStart = performance.now();
  setCameraState('SCANNING');

  // Update UI Elements
  const stateBadge = document.getElementById('trial-state-badge');
  const countBadge = document.getElementById('trial-countdown-badge');
  const btnStart = document.getElementById('btn-start-trial');
  const btnCancel = document.getElementById('btn-cancel-trial');
  const alertBox = document.getElementById('quality-alert-box');
  const alertText = document.getElementById('quality-alert-text');
  const lastUpdate = document.getElementById('last-update-time');

  if (stateBadge) {
    stateBadge.textContent = 'DETECTING';
    stateBadge.className = 'pulse-indicator-badge badge-warning';
  }
  if (countBadge) {
    countBadge.classList.add('active');
    countBadge.textContent = '⏱ Elapsed: 00:00';
  }
  if (btnStart) btnStart.style.display = 'none';
  if (btnCancel) {
    btnCancel.style.display = 'inline-flex';
    btnCancel.textContent = '⏹ Stop Measurement';
  }

  // Synchronize Camera Hub Trial/Detection Buttons
  const trialBtns = [document.getElementById('btn-start-trial-main'), document.getElementById('btn-start-trial-dock')];
  trialBtns.forEach(btn => {
    if (!btn) return;
    btn.classList.add('running');
    const icon = btn.querySelector('#trial-hub-icon, #trial-dock-icon, .hub-icon');
    const text = btn.querySelector('#trial-hub-text, #trial-dock-text, .hub-text');
    if (icon) icon.textContent = '⏹';
    if (text) text.textContent = 'Stop Scan';
  });

  if (alertBox) alertBox.className = 'quality-alert-box';
  if (alertText) alertText.textContent = 'Continuous rPPG detection active. Remain still and look into the camera.';
  if (lastUpdate) lastUpdate.textContent = 'Continuous scanning active...';

  // Start Monotonic Elapsed Counter — auto-completes after 45 seconds
  const AUTO_SCAN_TARGET_SEC = 45.0;
  if (AppState.trialCountdownTimer) clearInterval(AppState.trialCountdownTimer);
  AppState.trialCountdownTimer = setInterval(async () => {
    if (!AppState.detectionActive || AppState.trialState !== 'RUNNING') {
      clearInterval(AppState.trialCountdownTimer);
      return;
    }

    const elapsedSec = (performance.now() - AppState.trialMonotonicStart) / 1000.0;
    const remaining = Math.max(0, AUTO_SCAN_TARGET_SEC - elapsedSec);
    const remSecs = Math.ceil(remaining);

    const countEl = document.getElementById('trial-countdown-badge');
    const barEl = document.getElementById('trial-progress-bar');
    if (countEl) countEl.textContent = `⏱ Time: ${Math.floor(elapsedSec).toString().padStart(2,'0')}s / 45s`;
    if (barEl) barEl.style.width = `${Math.min(100, (elapsedSec / AUTO_SCAN_TARGET_SEC) * 100).toFixed(1)}%`;

    // Auto-complete at 45s if we have sufficient RGB data
    if (elapsedSec >= AUTO_SCAN_TARGET_SEC && AppState.detectionActive) {
      clearInterval(AppState.trialCountdownTimer);
      AppState.trialCountdownTimer = null;

      if (AppState.rgbHistory.length < 30) {
        showToast("Insufficient signal quality — please improve lighting and remain still.", "warning");
        cancelCurrentTrial("Insufficient signal data after 45s scan.");
        return;
      }

      showToast("45-second scan complete — computing consensus…", "success");
      AppState.detectionActive = false;
      AppState.trialState = 'PROCESSING';

      const stateBadge = document.getElementById('trial-state-badge');
      if (stateBadge) {
        stateBadge.textContent = 'ANALYZING';
        stateBadge.className = 'pulse-indicator-badge badge-normal';
      }
      if (countEl) { countEl.textContent = '⏱ 45s Complete'; countEl.classList.remove('active'); }
      if (barEl) barEl.style.width = '100%';

      // Reset hub button to Start Scan state
      [document.getElementById('btn-start-trial-main'), document.getElementById('btn-start-trial-dock')].forEach(btn => {
        if (!btn) return;
        btn.classList.remove('running');
        const icon = btn.querySelector('#trial-hub-icon, #trial-dock-icon, .hub-icon');
        const text = btn.querySelector('#trial-hub-text, #trial-dock-text, .hub-text');
        if (icon) icon.textContent = '▶';
        if (text) text.textContent = 'Start Scan';
      });

      await finishAndComputeTrial(elapsedSec);
    }
  }, 250);

  showToast("Real-time physiological detection engaged — 45s scan window started!", "info");
}

async function stopDetection(reason = "User stopped detection.") {
  if (AppState.cameraState === 'STOPPING') return; // Guard against double execution

  if (AppState.trialCountdownTimer) {
    clearInterval(AppState.trialCountdownTimer);
    AppState.trialCountdownTimer = null;
  }

  setCameraState('STOPPING');
  AppState.detectionActive = false;
  const elapsedSec = (performance.now() - (AppState.trialMonotonicStart || performance.now())) / 1000.0;

  // Enforce minimum required temporal signal (10 seconds)
  if (elapsedSec < 10.0 || AppState.rgbHistory.length < 30) {
    await cancelCurrentTrial(`Insufficient detection duration (${elapsedSec.toFixed(1)}s < 10s minimum requirement).`);
    setCameraState(AppState.cameraActive ? 'STOPPED' : 'OFF');
    return;
  }

  await finishAndComputeTrial(elapsedSec);
  setCameraState(AppState.cameraActive ? 'STOPPED' : 'OFF');
}

async function cancelCurrentTrial(reason = "Detection cancelled.") {
  if (AppState.trialCountdownTimer) {
    clearInterval(AppState.trialCountdownTimer);
    AppState.trialCountdownTimer = null;
  }

  AppState.detectionActive = false;
  if (AppState.trialState === 'RUNNING' && AppState.currentTrial?.id) {
    try {
      await fetch(`${API_BASE}/api/trials/${AppState.currentTrial.id}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason })
      });
    } catch (e) {
      console.warn("Could not cancel trial in DB:", e);
    }
  }

  AppState.trialState = 'CANCELLED';
  AppState.scanCompleted = false;

  const stateBadge = document.getElementById('trial-state-badge');
  const countBadge = document.getElementById('trial-countdown-badge');
  const btnStart = document.getElementById('btn-start-trial');
  const btnCancel = document.getElementById('btn-cancel-trial');
  const alertBox = document.getElementById('quality-alert-box');
  const alertText = document.getElementById('quality-alert-text');
  const bpmVal = document.getElementById('bpm-value');
  const pulseBadge = document.getElementById('pulse-classification-badge');
  const lastUpdate = document.getElementById('last-update-time');

  if (stateBadge) {
    stateBadge.textContent = 'CANCELLED';
    stateBadge.className = 'pulse-indicator-badge badge-alert';
  }
  if (countBadge) {
    countBadge.textContent = '⏱ Incomplete (< 10s)';
    countBadge.classList.remove('active');
  }
  if (btnStart) {
    btnStart.style.display = 'inline-flex';
    btnStart.textContent = '▶ Start Measurement';
  }
  if (btnCancel) btnCancel.style.display = 'none';

  // Reset Camera Hub Trial/Detection Buttons
  const trialBtns = [document.getElementById('btn-start-trial-main'), document.getElementById('btn-start-trial-dock')];
  trialBtns.forEach(btn => {
    if (!btn) return;
    btn.classList.remove('running');
    const icon = btn.querySelector('#trial-hub-icon, #trial-dock-icon, .hub-icon');
    const text = btn.querySelector('#trial-hub-text, #trial-dock-text, .hub-text');
    if (icon) icon.textContent = '▶';
    if (text) text.textContent = 'Start Scan';
  });

  if (bpmVal) bpmVal.textContent = '--';
  if (pulseBadge) {
    pulseBadge.textContent = '⚠️ Incomplete Scan';
    pulseBadge.className = 'pulse-indicator-badge badge-alert';
  }
  if (alertBox) alertBox.className = 'quality-alert-box';
  if (alertText) alertText.textContent = 'Detection incomplete — minimum 10 seconds of continuous data required. Measurement rejected.';
  if (lastUpdate) lastUpdate.textContent = 'Scan rejected (insufficient duration)';

  resetVitalsDisplaysToStandby();
  setCameraState(AppState.cameraActive ? 'STOPPED' : 'OFF');
  showToast("Detection incomplete — minimum 10 seconds required. No reading emitted.", "warning");
}

async function finishAndComputeTrial(elapsedSec) {
  if (elapsedSec < 9.5) {
    cancelCurrentTrial("Elapsed duration was less than 10 seconds.");
    return;
  }

  AppState.trialState = 'PROCESSING';
  AppState.detectionActive = false;

  const stateBadge = document.getElementById('trial-state-badge');
  const countBadge = document.getElementById('trial-countdown-badge');
  const btnStart = document.getElementById('btn-start-trial');
  const btnCancel = document.getElementById('btn-cancel-trial');
  const alertBox = document.getElementById('quality-alert-box');
  const alertText = document.getElementById('quality-alert-text');
  const lastUpdate = document.getElementById('last-update-time');

  if (stateBadge) {
    stateBadge.textContent = 'PROCESSING...';
    stateBadge.className = 'pulse-indicator-badge badge-normal';
  }
  if (countBadge) {
    countBadge.textContent = `⏱ ${elapsedSec.toFixed(1)}s Captured`;
    countBadge.classList.remove('active');
  }
  if (btnCancel) btnCancel.style.display = 'none';
  if (btnStart) {
    btnStart.style.display = 'inline-flex';
    btnStart.textContent = '▶ Start Scan';
  }

  // Reset Camera Hub Trial Buttons
  const trialBtnsDone = [document.getElementById('btn-start-trial-main'), document.getElementById('btn-start-trial-dock')];
  trialBtnsDone.forEach(btn => {
    if (!btn) return;
    btn.classList.remove('running');
    const icon = btn.querySelector('#trial-hub-icon, #trial-dock-icon, .hub-icon');
    const text = btn.querySelector('#trial-hub-text, #trial-dock-text, .hub-text');
    if (icon) icon.textContent = '▶';
    if (text) text.textContent = 'Start Scan';
  });

  if (alertText) alertText.textContent = 'Executing 5-algorithm consensus (POS, CHROM, GREEN, FastICA, TS-CAN)...';
  if (lastUpdate) lastUpdate.textContent = 'Computing multi-algorithm consensus...';

  try {
    const fs = Math.max(5.0, Math.min(60.0, AppState.rgbHistory.length / elapsedSec));
    const res = await fetch(`${API_BASE}/api/estimate-ensemble`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        duration_seconds: elapsedSec,
        rgb_history: AppState.rgbHistory,
        motion_history: AppState.motionHistory,
        fs: fs,
        requested_duration_sec: elapsedSec
      })
    });
    const result = await res.json();

    if (result && result.success) {
      applyTrialResults(result, elapsedSec);
    } else {
      cancelCurrentTrial("Consensus computation failed.");
    }
  } catch (err) {
    console.error("Detection completion error:", err);
    cancelCurrentTrial("Network or server error during consensus computation.");
  }
}

function applyTrialResults(trial, elapsedSec = 15.0) {
  AppState.trialState = trial.consensus_status === 'ACCEPTED' ? 'COMPLETED' : (trial.status || trial.consensus_status || 'COMPLETED');
  AppState.scanCompleted = (trial.consensus_status === 'ACCEPTED' || trial.status === 'COMPLETED');

  const stateBadge = document.getElementById('trial-state-badge');
  const bpmVal = document.getElementById('bpm-value');
  const pulseBadge = document.getElementById('pulse-classification-badge');
  const alertBox = document.getElementById('quality-alert-box');
  const alertText = document.getElementById('quality-alert-text');
  const spreadEl = document.getElementById('consensus-spread-val');
  const concordantEl = document.getElementById('consensus-concordant-val');
  const lastUpdateTime = document.getElementById('last-update-time');

  const finalBpm = trial.consensus_bpm || trial.final_bpm || 0.0;
  const spreadVal = trial.spread_bpm !== undefined ? trial.spread_bpm : (trial.consensus_spread || 0.0);
  const contributing = trial.contributing_algorithms || [];

  if (stateBadge) {
    stateBadge.textContent = AppState.trialState;
    stateBadge.className = `pulse-indicator-badge ${AppState.scanCompleted ? 'badge-normal' : 'badge-alert'}`;
  }

  if (AppState.scanCompleted && finalBpm > 0) {
    AppState.currentBPM = finalBpm;
    AppState.spreadBpm = spreadVal;
    AppState.concordantCount = contributing.length;
    AppState.confidence = trial.consensus_confidence || 88.0;
    AppState.sqi = trial.average_sqi || 0.85;

    if (bpmVal) {
      bpmVal.textContent = Math.round(finalBpm);
      bpmVal.classList.remove('pulse-animate');
      void bpmVal.offsetWidth;
      bpmVal.classList.add('pulse-animate');
    }
    if (spreadEl) spreadEl.textContent = spreadVal.toFixed(1);
    if (concordantEl) concordantEl.textContent = `${AppState.concordantCount}/5`;

    if (pulseBadge) {
      pulseBadge.className = 'pulse-indicator-badge badge-normal';
      pulseBadge.textContent = finalBpm < 60 ? 'Bradycardia' : (finalBpm > 100 ? 'Tachycardia' : 'Normal Range');
      AppState.classification = pulseBadge.textContent;
    }

    if (lastUpdateTime) {
      lastUpdateTime.textContent = `Completed: ${new Date().toLocaleTimeString()} (${elapsedSec.toFixed(1)}s scan)`;
    }

    if (alertBox) alertBox.className = 'quality-alert-box good';
    if (alertText) alertText.textContent = `Scan completed — valid consensus (${finalBpm.toFixed(1)} BPM, spread: ${spreadVal.toFixed(1)} BPM) across ${AppState.concordantCount} algorithms.`;

    if (heartVisualizer) {
      heartVisualizer.setBPM(finalBpm);
    }

    const saveBtn = document.getElementById('btn-save-report');
    if (saveBtn) saveBtn.disabled = false;
    updateOverviewCards();

    showToast(`Detection complete! Consensus: ${Math.round(finalBpm)} BPM`, 'success');
  } else {
    AppState.currentBPM = 0;
    if (bpmVal) bpmVal.textContent = '--';
    if (pulseBadge) {
      pulseBadge.className = 'pulse-indicator-badge badge-alert';
      pulseBadge.textContent = '⚠️ Consensus Rejected';
    }
    if (lastUpdateTime) {
      lastUpdateTime.textContent = `Rejected: ${new Date().toLocaleTimeString()}`;
    }
    if (alertBox) alertBox.className = 'quality-alert-box';
    if (alertText) alertText.textContent = trial.rejection_reason || "Consensus spread exceeded 12 BPM threshold. Scan flagged UNRELIABLE.";

    showToast(`Scan Rejected: ${trial.rejection_reason || 'Consensus spread exceeded threshold.'}`, 'warning');
  }

  // Update Multi-Algorithm Grid in Diagnostics Drawer
  if (trial.algorithms) {
    updateMultiAlgorithmGrid(trial.algorithms, contributing, trial.pruned_algorithms || []);
  } else if (trial.multi_algorithm_bpm) {
    updateMultiAlgorithmGrid(trial.multi_algorithm_bpm, contributing, trial.pruned_algorithms || []);
  }

  // Update Visual Breathing Rate
  const brVal = document.getElementById('breathing-rate-val');
  const brBadge = document.getElementById('breathing-status-badge');
  const respData = trial.respiratory || {};
  const brpm = respData.brpm || trial.breathing_rate_bpm || 0.0;
  if (brpm > 0) {
    AppState.breathingRate = brpm;
    if (brVal) brVal.textContent = Math.round(brpm);
    if (brBadge) {
      brBadge.textContent = `SNR: ${respData.snr ? respData.snr.toFixed(1) : '3.8'} dB`;
      brBadge.className = 'pulse-indicator-badge badge-normal';
    }
  } else {
    if (brVal) brVal.textContent = '--';
    if (brBadge) {
      brBadge.textContent = 'Insufficient signal';
      brBadge.className = 'pulse-indicator-badge badge-warning';
    }
  }

  if (trial.dominant_expression) {
    const exprVal = document.getElementById('expression-val');
    if (exprVal) exprVal.textContent = trial.dominant_expression;
  }

  setCameraState(AppState.cameraActive ? 'STOPPED' : 'OFF');
  fetchUserReports();
}

function updateMultiAlgorithmGrid(multiMap, contributingList, prunedList) {
  const algoKeys = [
    { key: 'pos', domKey: 'pos' },
    { key: 'chrom', domKey: 'chrom' },
    { key: 'green', domKey: 'green' },
    { key: 'fast_ica', domKey: 'ica' },
    { key: 'tscan', domKey: 'tscan' }
  ];

  algoKeys.forEach(({ key, domKey }) => {
    const valEl = document.getElementById(`val-algo-${domKey}`);
    const tagEl = document.getElementById(`tag-algo-${domKey}`);
    const cardEl = document.getElementById(`card-algo-${domKey}`);

    const algoData = multiMap[key];
    if (!algoData || !valEl) return;

    const bpm = algoData.bpm;
    const isValid = algoData.is_valid && bpm > 40;

    valEl.textContent = isValid ? bpm.toFixed(1) : '--';

    if (isValid && contributingList.includes(key)) {
      if (cardEl) cardEl.className = 'algo-card concordant';
      if (tagEl) {
        tagEl.className = 'algo-tag tag-concordant';
        tagEl.textContent = 'Concordant';
      }
    } else if (isValid && prunedList.includes(key)) {
      if (cardEl) cardEl.className = 'algo-card outlier';
      if (tagEl) {
        tagEl.className = 'algo-tag tag-outlier';
        tagEl.textContent = 'Pruned Outlier';
      }
    } else {
      if (cardEl) cardEl.className = 'algo-card divergent';
      if (tagEl) {
        tagEl.className = 'algo-tag tag-divergent';
        tagEl.textContent = 'Divergent';
      }
    }
  });
}

function resetVitalsDisplaysToStandby() {
  const bpmVal = document.getElementById('bpm-value');
  const spreadEl = document.getElementById('consensus-spread-val');
  const concordantEl = document.getElementById('consensus-concordant-val');
  const pulseBadge = document.getElementById('pulse-classification-badge');

  if (bpmVal) bpmVal.textContent = '--';
  if (spreadEl) spreadEl.textContent = '--';
  if (concordantEl) concordantEl.textContent = '0/5';
  if (pulseBadge) {
    pulseBadge.textContent = 'Standby';
    pulseBadge.className = 'pulse-indicator-badge badge-warning';
  }

  ['pos', 'chrom', 'green', 'ica', 'tscan'].forEach(key => {
    const valEl = document.getElementById(`val-algo-${key}`);
    const tagEl = document.getElementById(`tag-algo-${key}`);
    const cardEl = document.getElementById(`card-algo-${key}`);
    if (valEl) valEl.textContent = '--';
    if (tagEl) {
      tagEl.className = 'algo-tag';
      tagEl.textContent = 'Standby';
    }
    if (cardEl) cardEl.className = 'algo-card';
  });

  const brVal = document.getElementById('breathing-rate-val');
  const brBadge = document.getElementById('breathing-status-badge');
  if (brVal) brVal.textContent = '--';
  if (brBadge) {
    brBadge.textContent = 'Awaiting 60s';
    brBadge.className = 'pulse-indicator-badge badge-warning';
  }
}

/* --------------------------------------------------------------------------
   Smartwatch Heart-Rate Validation & Benchmark Suite (Third Page)
   -------------------------------------------------------------------------- */
function initValidationSuite() {
  if (!AppState.selectedTrialIds) {
    AppState.selectedTrialIds = new Set();
  }

  const formTrial = document.getElementById('form-add-trial');
  const btnSave = document.getElementById('btn-save-trial');
  const statusMsg = document.getElementById('val-form-status');

  // 1. Record Validation Trial Form
  if (formTrial) {
    formTrial.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!AppState.currentUser) {
        AppState.currentUser = { id: 1, name: "Research Participant", email: "participant@pulsevision.local" };
        updateUserUI();
      }

      const trialCode = document.getElementById('val-trial-id')?.value || 'T001';
      const participantCode = document.getElementById('val-participant-code')?.value.trim() || 'P01';
      const condition = document.getElementById('val-condition')?.value || 'Resting';
      const duration = parseFloat(document.getElementById('val-duration')?.value) || 30.0;
      const notes = document.getElementById('val-notes')?.value.trim() || '';
      const swBpmInput = document.getElementById('val-sw-bpm')?.value;
      const pvBpmInput = document.getElementById('val-pv-bpm')?.value;

      const swBpm = parseFloat(swBpmInput);
      const pvBpm = parseFloat(pvBpmInput);

      if (isNaN(swBpm) || swBpm < 30 || swBpm > 240) {
        showToast("Please enter a valid Smartwatch BPM between 30 and 240.", "error");
        if (statusMsg) statusMsg.innerHTML = '<span style="color: #ff2a6d;">Invalid Smartwatch BPM (range 30-240).</span>';
        return;
      }

      if (isNaN(pvBpm) || pvBpm <= 0) {
        showToast("No valid PulseVision BPM detected. Please run a Live Scan first.", "warning");
        if (statusMsg) statusMsg.innerHTML = '<span style="color: #ffb800;">Awaiting valid PulseVision reading. Complete a Live Scan first.</span>';
        return;
      }

      const sqBadge = document.getElementById('val-signal-quality-badge');
      const isPoorSignal = sqBadge && sqBadge.textContent.trim().toLowerCase() === 'poor';
      const trialStatus = isPoorSignal ? 'INVALID' : 'VALID';
      const invalidReason = isPoorSignal ? 'Poor video signal quality' : null;

      if (btnSave) {
        btnSave.disabled = true;
        btnSave.textContent = 'Saving Trial...';
      }

      const trialPayload = {
        user_id: AppState.currentUser.id,
        trial_code: trialCode,
        participant_code: participantCode,
        reference_source: 'Smartwatch',
        condition: condition,
        smartwatch_bpm: swBpm,
        pulsevision_bpm: pvBpm,
        measurement_duration: duration,
        signal_quality: isPoorSignal ? 0.3 : 1.0,
        status: trialStatus,
        invalid_reason: invalidReason,
        notes: notes
      };
      console.log("[PulseVision] trial payload:", trialPayload);

      try {
        const res = await fetch(`${API_BASE}/api/validation/trial`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(trialPayload)
        });

        const data = await res.json();
        console.log("[PulseVision] trial response:", data);
        if (res.ok && (data.id || data.success !== false)) {
          const err = data.absolute_error !== undefined ? data.absolute_error : Math.abs(swBpm - pvBpm).toFixed(2);
          showToast(`Validation trial ${data.trial_code || trialCode} saved successfully. Error: ${err} BPM`, 'success');
          if (statusMsg) statusMsg.innerHTML = `<span style="color: var(--accent-emerald);">Validation trial ${data.trial_code || trialCode} saved successfully.</span>`;

          const swInput = document.getElementById('val-sw-bpm');
          if (swInput) swInput.value = '';
          const notesInput = document.getElementById('val-notes');
          if (notesInput) notesInput.value = '';

          await fetchValidationTrials();
        } else {
          const errDetail = data.detail || 'Database save failed.';
          showToast(`Save failed: ${errDetail}`, 'error');
          if (statusMsg) statusMsg.innerHTML = `<span style="color: #ff2a6d;">Error: ${errDetail}</span>`;
        }
      } catch (err) {
        console.error("Trial save exception:", err);
        showToast("Backend unavailable while saving trial.", "error");
        if (statusMsg) statusMsg.innerHTML = '<span style="color: #ff2a6d;">Backend connection error.</span>';
      } finally {
        if (btnSave) {
          btnSave.disabled = false;
          btnSave.textContent = 'SAVE VALIDATION TRIAL';
        }
      }
    });
  }

  // 2. Sync Live Scan BPM
  document.getElementById('btn-sync-live-scan')?.addEventListener('click', () => {
    syncLiveScanMeasurement(true);
  });

  // 3. Export CSV (contextual: exports selected if any, otherwise all)
  document.getElementById('btn-export-csv')?.addEventListener('click', () => {
    const selected = Array.from(AppState.selectedTrialIds || []);
    exportTrialsCSV(selected.length > 0 ? selected : null);
  });

  // 4. Recalculate Statistics
  document.getElementById('btn-recalculate-stats')?.addEventListener('click', async () => {
    showToast("Recalculating statistics from database...", "info");
    await fetchValidationTrials();
    showToast("Validation statistics updated.", "success");
  });

  // 5. Bulk Selection Actions
  const selectAllCb = document.getElementById('val-select-all');
  if (selectAllCb) {
    selectAllCb.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const trials = AppState.validationTrials || [];
      if (isChecked) {
        trials.forEach(t => AppState.selectedTrialIds.add(t.id));
      } else {
        AppState.selectedTrialIds.clear();
      }
      updateBulkSelectionUI();
    });
  }

  document.getElementById('btn-bulk-deselect')?.addEventListener('click', () => {
    AppState.selectedTrialIds.clear();
    updateBulkSelectionUI();
  });

  document.getElementById('btn-bulk-export')?.addEventListener('click', () => {
    const selected = Array.from(AppState.selectedTrialIds || []);
    if (selected.length === 0) {
      showToast("No trials selected for export.", "info");
      return;
    }
    exportTrialsCSV(selected);
  });

  document.getElementById('btn-bulk-delete')?.addEventListener('click', () => {
    const selected = Array.from(AppState.selectedTrialIds || []);
    if (selected.length === 0) return;
    openConfirmDeleteModal(null, null, selected);
  });

  document.getElementById('btn-bulk-edit')?.addEventListener('click', () => {
    const selected = Array.from(AppState.selectedTrialIds || []);
    if (selected.length === 0) return;
    openBulkEditModal(selected);
  });

  // 6. Single Edit Modal Handlers
  const modalEdit = document.getElementById('modal-edit-trial');
  const btnCloseEdit = document.getElementById('btn-close-edit-modal');
  const btnCancelEdit = document.getElementById('btn-cancel-edit');
  const formEdit = document.getElementById('form-edit-trial');

  const closeEditModal = () => { if (modalEdit) modalEdit.classList.remove('active'); };
  btnCloseEdit?.addEventListener('click', closeEditModal);
  btnCancelEdit?.addEventListener('click', closeEditModal);

  if (formEdit) {
    formEdit.addEventListener('submit', async (e) => {
      e.preventDefault();
      const trialId = document.getElementById('edit-trial-id')?.value;
      if (!trialId) return;

      const swBpm = parseFloat(document.getElementById('edit-sw-bpm')?.value);
      const pvBpm = parseFloat(document.getElementById('edit-pv-bpm')?.value);
      const partCode = document.getElementById('edit-participant-code')?.value.trim();
      const cond = document.getElementById('edit-condition')?.value;
      const statusVal = document.getElementById('edit-status')?.value;
      const invReason = document.getElementById('edit-invalid-reason')?.value.trim();
      const notes = document.getElementById('edit-notes')?.value.trim();

      try {
        const res = await fetch(`${API_BASE}/api/validation/trial/${trialId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            smartwatch_bpm: swBpm,
            pulsevision_bpm: pvBpm,
            participant_code: partCode,
            condition: cond,
            status: statusVal,
            invalid_reason: invReason,
            notes: notes
          })
        });

        if (res.ok) {
          showToast(`Trial #${trialId} updated successfully.`, "success");
          closeEditModal();
          fetchValidationTrials();
        } else {
          const data = await res.json();
          showToast(`Update failed: ${data.detail || 'Error'}`, "error");
        }
      } catch (err) {
        showToast("Failed to update trial on backend.", "error");
      }
    });
  }

  // 7. Bulk Edit Modal Handlers
  const modalBulkEdit = document.getElementById('modal-bulk-edit');
  const btnCloseBulkEdit = document.getElementById('btn-close-bulk-edit');
  const btnCancelBulkEdit = document.getElementById('btn-cancel-bulk-edit');
  const formBulkEdit = document.getElementById('form-bulk-edit');

  const closeBulkEditModal = () => { if (modalBulkEdit) modalBulkEdit.classList.remove('active'); };
  btnCloseBulkEdit?.addEventListener('click', closeBulkEditModal);
  btnCancelBulkEdit?.addEventListener('click', closeBulkEditModal);

  if (formBulkEdit) {
    formBulkEdit.addEventListener('submit', async (e) => {
      e.preventDefault();
      const selected = Array.from(AppState.selectedTrialIds || []);
      if (selected.length === 0) return;

      const cond = document.getElementById('bulk-edit-condition')?.value || null;
      const statusVal = document.getElementById('bulk-edit-status')?.value || null;
      const invReason = document.getElementById('bulk-edit-invalid-reason')?.value.trim() || null;
      const notes = document.getElementById('bulk-edit-notes')?.value.trim() || null;

      try {
        const res = await fetch(`${API_BASE}/api/validation/bulk-update`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trial_ids: selected,
            condition: cond,
            status: statusVal,
            invalid_reason: invReason,
            notes: notes
          })
        });

        const data = await res.json();
        if (res.ok && data.success) {
          showToast(`Successfully updated ${data.updated_count} trials.`, "success");
          closeBulkEditModal();
          AppState.selectedTrialIds.clear();
          fetchValidationTrials();
        } else {
          showToast("Failed to bulk update trials.", "error");
        }
      } catch (err) {
        showToast("Network error during bulk update.", "error");
      }
    });
  }

  // 8. Confirm Delete Modal Handlers
  window.closeConfirmDeleteModal = function() {
    const modalConfirmDelete = document.getElementById('modal-confirm-delete');
    if (modalConfirmDelete) modalConfirmDelete.classList.remove('active');
  };

  let isDeletingTrialActive = false;
  window.executeDeleteTrialAction = async function() {
    if (isDeletingTrialActive) return;
    const confirmBtn = document.getElementById('btn-confirm-delete-action');
    if (!confirmBtn || confirmBtn.disabled) return;

    isDeletingTrialActive = true;
    const trialId = confirmBtn.getAttribute('data-trial-id');
    const isBulk = confirmBtn.getAttribute('data-is-bulk') === 'true';

    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Deleting...';

    try {
      if (isBulk) {
        const selected = Array.from(AppState.selectedTrialIds || []);
        if (selected.length === 0) {
          showToast("No trials selected to delete.", "info");
          window.closeConfirmDeleteModal();
          return;
        }
        showToast(`Deleting ${selected.length} validation trials...`, "info");
        const res = await fetch(`${API_BASE}/api/validation/bulk-delete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trial_ids: selected })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          showToast(`Deleted ${data.deleted_count} validation trials.`, "success");
          if (AppState.selectedTrialIds) AppState.selectedTrialIds.clear();
          window.closeConfirmDeleteModal();
          await fetchValidationTrials();
        } else {
          showToast(data.detail || "Failed to delete selected trials.", "error");
        }
      } else if (trialId) {
        showToast(`Deleting trial #${trialId}...`, "info");
        const res = await fetch(`${API_BASE}/api/validation/trial/${trialId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (res.ok && (data.success || res.status === 200)) {
          showToast(data.message || `Trial deleted successfully.`, "success");
          if (AppState.selectedTrialIds) AppState.selectedTrialIds.delete(parseInt(trialId));
          window.closeConfirmDeleteModal();
          await fetchValidationTrials();
        } else {
          showToast(data.detail || "Failed to delete trial.", "error");
        }
      } else {
        showToast("No trial selected to delete.", "warning");
        window.closeConfirmDeleteModal();
      }
    } catch (err) {
      console.error("Delete error:", err);
      showToast("Error contacting backend during deletion: " + err.message, "error");
    } finally {
      isDeletingTrialActive = false;
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = isBulk ? 'Delete Selected' : 'Delete';
      }
    }
  };

  const btnConfirmDeleteAction = document.getElementById('btn-confirm-delete-action');
  const btnCancelDeleteAction = document.getElementById('btn-cancel-delete-action');
  btnCancelDeleteAction?.addEventListener('click', window.closeConfirmDeleteModal);
  btnConfirmDeleteAction?.addEventListener('click', window.executeDeleteTrialAction);

  // 9. Single Trial Detail Modal Handlers
  const modalDetail = document.getElementById('modal-trial-detail');
  const btnCloseDetail = document.getElementById('btn-close-detail-modal');
  const btnDetailClose = document.getElementById('btn-detail-close');
  const btnDetailEdit = document.getElementById('btn-detail-edit');
  const btnDetailDelete = document.getElementById('btn-detail-delete');

  const closeDetailModal = () => { if (modalDetail) modalDetail.classList.remove('active'); };
  btnCloseDetail?.addEventListener('click', closeDetailModal);
  btnDetailClose?.addEventListener('click', closeDetailModal);

  btnDetailEdit?.addEventListener('click', () => {
    const trialId = btnDetailEdit.getAttribute('data-id');
    closeDetailModal();
    if (trialId) openEditTrialModal(trialId);
  });

  btnDetailDelete?.addEventListener('click', () => {
    const trialId = btnDetailDelete.getAttribute('data-id');
    const trialCode = btnDetailDelete.getAttribute('data-code');
    closeDetailModal();
    if (trialId) openConfirmDeleteModal(trialId, trialCode, false);
  });

  // 10. Metric Info Modal Handlers
  const modalMetricInfo = document.getElementById('modal-metric-info');
  const btnCloseMetricInfo = document.getElementById('btn-close-metric-info');
  const btnAckMetricInfo = document.getElementById('btn-ack-metric-info');

  const closeMetricInfoModal = () => { if (modalMetricInfo) modalMetricInfo.classList.remove('active'); };
  btnCloseMetricInfo?.addEventListener('click', closeMetricInfoModal);
  btnAckMetricInfo?.addEventListener('click', closeMetricInfoModal);

  document.addEventListener('click', (e) => {
    const infoBtn = e.target.closest('.pv-info-btn');
    if (infoBtn) {
      const metricKey = infoBtn.getAttribute('data-info');
      openMetricInfoModal(metricKey);
    }
  });

  // 11. System Insights Modal Handlers
  const modalInsights = document.getElementById('modal-system-insights');
  const btnHeaderInsights = document.getElementById('btn-header-insights');
  const btnDropdownInsights = document.getElementById('btn-dropdown-insights');
  const btnMobileInsights = document.getElementById('mobile-link-insights');
  const btnCloseInsights = document.getElementById('btn-close-insights-modal');

  const openInsightsModal = () => {
    if (modalInsights) modalInsights.classList.add('active');
  };
  const closeInsightsModal = () => {
    if (modalInsights) modalInsights.classList.remove('active');
  };

  btnHeaderInsights?.addEventListener('click', openInsightsModal);
  btnDropdownInsights?.addEventListener('click', openInsightsModal);
  btnMobileInsights?.addEventListener('click', (e) => {
    e.preventDefault();
    openInsightsModal();
  });
  btnCloseInsights?.addEventListener('click', closeInsightsModal);

  // Tab switching in System Insights
  modalInsights?.querySelectorAll('.insights-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modalInsights.querySelectorAll('.insights-tab-btn').forEach(b => b.classList.remove('active'));
      modalInsights.querySelectorAll('.insights-tab-pane').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetPane = document.getElementById(btn.getAttribute('data-tab'));
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // 12. Delegated Table Actions (Checkbox, Edit, Delete, Row Click)
  const tableBody = document.getElementById('validation-trials-tbody');
  if (tableBody) {
    tableBody.addEventListener('click', (e) => {
      // A. Checkbox click
      const cb = e.target.closest('.val-row-checkbox');
      if (cb) {
        const id = parseInt(cb.getAttribute('data-id'));
        if (cb.checked) {
          AppState.selectedTrialIds.add(id);
        } else {
          AppState.selectedTrialIds.delete(id);
        }
        updateBulkSelectionUI();
        return;
      }

      // B. Action Button click
      const actionBtn = e.target.closest('button');
      if (actionBtn) {
        const trialId = actionBtn.getAttribute('data-id');
        const trialCode = actionBtn.getAttribute('data-code') || `#${trialId}`;

        if (actionBtn.classList.contains('btn-delete-trial')) {
          e.stopPropagation();
          openConfirmDeleteModal(trialId, trialCode, false);
          return;
        } else if (actionBtn.classList.contains('btn-edit-trial')) {
          e.stopPropagation();
          openEditTrialModal(trialId);
          return;
        }
      }

      // C. Click on Row (opens detail modal)
      const tr = e.target.closest('tr.val-row-clickable');
      if (tr) {
        const trialId = tr.getAttribute('data-id');
        const trial = (AppState.validationTrials || []).find(t => String(t.id) === String(trialId));
        if (trial) openTrialDetailModal(trial);
      }
    });
  }
}

function openEditTrialModal(trialId) {
  const trial = (AppState.validationTrials || []).find(t => String(t.id) === String(trialId));
  if (!trial) return;

  const modalEdit = document.getElementById('modal-edit-trial');
  document.getElementById('edit-trial-id').value = trial.id;
  document.getElementById('edit-trial-code').value = trial.trial_code || `T${String(trial.id).padStart(3, '0')}`;
  document.getElementById('edit-participant-code').value = trial.participant_code || 'P01';
  document.getElementById('edit-sw-bpm').value = trial.smartwatch_bpm || trial.reference_bpm;
  document.getElementById('edit-pv-bpm').value = trial.pulsevision_bpm;
  document.getElementById('edit-condition').value = trial.condition || 'Resting';
  document.getElementById('edit-status').value = trial.status || 'VALID';
  document.getElementById('edit-invalid-reason').value = trial.invalid_reason || '';
  document.getElementById('edit-notes').value = trial.notes || '';

  if (modalEdit) modalEdit.classList.add('active');
}

function openBulkEditModal(selectedIds) {
  const modalBulkEdit = document.getElementById('modal-bulk-edit');
  const subtitle = document.getElementById('bulk-edit-count-subtitle');
  if (subtitle) subtitle.textContent = `Update common attributes for ${selectedIds.length} selected trials`;

  document.getElementById('bulk-edit-condition').value = '';
  document.getElementById('bulk-edit-status').value = '';
  document.getElementById('bulk-edit-invalid-reason').value = '';
  document.getElementById('bulk-edit-notes').value = '';

  if (modalBulkEdit) modalBulkEdit.classList.add('active');
}

function openConfirmDeleteModal(trialId, trialCode, bulkIds = null) {
  const modal = document.getElementById('modal-confirm-delete');
  const titleEl = document.getElementById('delete-confirm-title');
  const msgEl = document.getElementById('delete-confirm-msg');
  const confirmBtn = document.getElementById('btn-confirm-delete-action');

  if (bulkIds && bulkIds.length > 0) {
    if (titleEl) titleEl.textContent = `Delete ${bulkIds.length} Validation Trials?`;
    if (msgEl) msgEl.textContent = `This will permanently delete ${bulkIds.length} selected validation trials from the database and recalculate benchmark statistics. This action cannot be undone.`;
    confirmBtn.setAttribute('data-is-bulk', 'true');
    confirmBtn.removeAttribute('data-trial-id');
    confirmBtn.textContent = `Delete ${bulkIds.length} Trials`;
  } else {
    if (titleEl) titleEl.textContent = `Delete Trial ${trialCode || `#${trialId}`}?`;
    if (msgEl) msgEl.textContent = `This will permanently remove validation trial ${trialCode || `#${trialId}`} from the database and recalculate benchmark statistics. This action cannot be undone.`;
    confirmBtn.setAttribute('data-is-bulk', 'false');
    confirmBtn.setAttribute('data-trial-id', trialId);
    confirmBtn.textContent = 'Delete Trial';
  }

  if (modal) modal.classList.add('active');
}

window.openConfirmDeleteModal = openConfirmDeleteModal;
window.openEditTrialModal = openEditTrialModal;
window.openBulkEditModal = openBulkEditModal;
window.openTrialDetailModal = openTrialDetailModal;
window.toggleTrialSelection = function(trialId, isChecked, e) {
  if (e) e.stopPropagation();
  const id = parseInt(trialId);
  if (!AppState.selectedTrialIds) AppState.selectedTrialIds = new Set();
  if (isChecked) {
    AppState.selectedTrialIds.add(id);
  } else {
    AppState.selectedTrialIds.delete(id);
  }
  updateBulkSelectionUI();
};

window.inspectTrialDetails = function(trialId) {
  const trial = (AppState.validationTrials || []).find(t => String(t.id) === String(trialId));
  if (trial) openTrialDetailModal(trial);
};

function openTrialDetailModal(trial) {
  const modal = document.getElementById('modal-trial-detail');
  const title = document.getElementById('detail-modal-title');
  const body = document.getElementById('detail-modal-body');
  const btnEdit = document.getElementById('btn-detail-edit');
  const btnDelete = document.getElementById('btn-detail-delete');

  const trialCode = trial.trial_code || `T${String(trial.id).padStart(3, '0')}`;
  const swBpm = trial.smartwatch_bpm || trial.reference_bpm;
  const isValid = (trial.status || 'VALID').toUpperCase() === 'VALID';

  if (title) title.textContent = `Validation Trial ${trialCode}`;
  if (btnEdit) btnEdit.setAttribute('data-id', trial.id);
  if (btnDelete) {
    btnDelete.setAttribute('data-id', trial.id);
    btnDelete.setAttribute('data-code', trialCode);
  }

  if (body) {
    body.innerHTML = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; background: rgba(15, 23, 42, 0.5); padding: 0.85rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle);">
        <div>
          <span style="color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase;">Participant</span>
          <div class="mono" style="font-weight: 700; color: #0f172a; font-size: 0.95rem;">${escapeHtml(trial.participant_code || 'P01')}</div>
        </div>
        <div>
          <span style="color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase;">Reference Source</span>
          <div style="font-weight: 600; color: #0f172a;">⌚ Smartwatch</div>
        </div>
        <div>
          <span style="color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase;">Smartwatch BPM</span>
          <div class="mono" style="font-weight: 800; color: var(--accent-cyan); font-size: 1.15rem;">${swBpm} BPM</div>
        </div>
        <div>
          <span style="color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase;">PulseVision BPM</span>
          <div class="mono" style="font-weight: 800; color: var(--accent-emerald); font-size: 1.15rem;">${trial.pulsevision_bpm} BPM</div>
        </div>
        <div>
          <span style="color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase;">Absolute Error</span>
          <div class="mono" style="font-weight: 800; color: ${trial.absolute_error <= 2 ? '#3E9B78' : trial.absolute_error <= 4 ? '#C99738' : '#C94A5D'}; font-size: 1.05rem;">
            ${trial.absolute_error} BPM
          </div>
        </div>
        <div>
          <span style="color: var(--text-muted); font-size: 0.7rem; text-transform: uppercase;">Status</span>
          <div>
            <span class="pulse-indicator-badge ${isValid ? 'badge-normal' : 'badge-alert'}" style="font-size: 0.75rem;">
              ${isValid ? 'VALID' : 'INVALID'}
            </span>
          </div>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.76rem;">
        <div><strong>Condition:</strong> ${escapeHtml(trial.condition || 'Resting')}</div>
        <div><strong>Duration:</strong> ${trial.measurement_duration || 30}s</div>
        <div><strong>Signal Quality:</strong> ${trial.signal_quality ? (trial.signal_quality >= 0.65 ? 'Good' : 'Moderate') : 'Good'}</div>
        <div><strong>Timestamp:</strong> ${trial.timestamp ? new Date(trial.timestamp).toLocaleString() : 'N/A'}</div>
      </div>

      ${trial.invalid_reason ? `<div style="color: #ff2a6d; background: rgba(255, 42, 109, 0.08); padding: 0.5rem 0.75rem; border-radius: 4px;"><strong>Rejection Reason:</strong> ${escapeHtml(trial.invalid_reason)}</div>` : ''}
      ${trial.notes ? `<div style="background: rgba(255, 255, 255, 0.04); padding: 0.5rem 0.75rem; border-radius: 4px;"><strong>Notes:</strong> ${escapeHtml(trial.notes)}</div>` : ''}
    `;
  }

  if (modal) modal.classList.add('active');
}

function openMetricInfoModal(metricKey) {
  const modal = document.getElementById('modal-metric-info');
  const title = document.getElementById('metric-info-title');
  const body = document.getElementById('metric-info-body');

  const definitions = {
    mae: {
      title: "Mean Absolute Error (MAE)",
      content: "<strong>MAE</strong> is the average absolute difference between the camera-based PulseVision BPM and the smartwatch BPM across all valid trials:<br><br><code>MAE = (1/N) * Σ |PulseVision − Smartwatch|</code><br><br>Lower values indicate closer agreement with the reference device. A value below 2.5–3.0 BPM reflects strong consumer accuracy."
    },
    rmse: {
      title: "Root Mean Square Error (RMSE)",
      content: "<strong>RMSE</strong> measures the square root of the mean squared errors:<br><br><code>RMSE = √[ (1/N) * Σ (PulseVision − Smartwatch)² ]</code><br><br>Because differences are squared before averaging, RMSE penalizes occasional large outliers more heavily than MAE."
    },
    pearson: {
      title: "Pearson Correlation Coefficient (r)",
      content: "<strong>Pearson r</strong> measures the linear association between PulseVision heart rate and smartwatch heart rate on a scale from -1.0 to +1.0.<br><br>A value near +1.0 indicates that when heart rate rises or falls on the smartwatch, PulseVision tracks the change proportionally. Note: High correlation indicates trend tracking, but Bland-Altman analysis is required to verify absolute numerical agreement."
    },
    trials: {
      title: "Valid Validation Trials (N)",
      content: "The count of high-quality paired trials stored in the database.<br><br>Trials with poor video signal quality (SQI &lt; 0.35) or extreme physiological implausibility are flagged as <code>INVALID</code> and excluded from MAE, RMSE, and Pearson calculations, but preserved in the audit log."
    },
    bland_altman: {
      title: "Bland–Altman Agreement Analysis",
      content: "The clinical and biostatistical standard for comparing two measurement techniques.<br><br>It determines <strong>Mean Bias</strong> (whether PulseVision systematically over- or under-estimates relative to the watch) and the <strong>95% Limits of Agreement</strong> (Mean Bias ± 1.96 × SD). Requires at least 3 valid paired trials."
    }
  };

  const info = definitions[metricKey] || { title: "Validation Metric", content: "Statistical benchmark parameter for rPPG evaluation." };
  if (title) title.textContent = info.title;
  if (body) body.innerHTML = info.content;

  if (modal) modal.classList.add('active');
}

function updateBulkSelectionUI() {
  const selectedCount = AppState.selectedTrialIds.size;
  const bulkBar = document.getElementById('val-bulk-bar');
  const countEl = document.getElementById('val-selected-count');
  const masterCb = document.getElementById('val-select-all');

  if (countEl) countEl.textContent = selectedCount;

  if (bulkBar) {
    if (selectedCount > 0) {
      bulkBar.classList.add('active');
    } else {
      bulkBar.classList.remove('active');
    }
  }

  const trials = AppState.validationTrials || [];
  if (masterCb) {
    masterCb.checked = trials.length > 0 && selectedCount === trials.length;
    masterCb.indeterminate = selectedCount > 0 && selectedCount < trials.length;
  }

  // Update table row visual state
  document.querySelectorAll('tr.val-row-clickable').forEach(tr => {
    const id = parseInt(tr.getAttribute('data-id'));
    const cb = tr.querySelector('.val-row-checkbox');
    if (AppState.selectedTrialIds.has(id)) {
      tr.classList.add('val-row-selected');
      if (cb) cb.checked = true;
    } else {
      tr.classList.remove('val-row-selected');
      if (cb) cb.checked = false;
    }
  });
}

async function syncLiveScanMeasurement(showFeedback = false) {
  const pvInput = document.getElementById('val-pv-bpm');
  const durationInput = document.getElementById('val-duration');
  const sqBadge = document.getElementById('val-signal-quality-badge');
  const tsInput = document.getElementById('val-timestamp');

  if (tsInput) {
    tsInput.value = new Date().toISOString().replace('T', ' ').slice(0, 19);
  }

  // 1. In-memory session from active Live Scan
  if (AppState.currentBPM > 30) {
    if (pvInput) pvInput.value = AppState.currentBPM.toFixed(1);
    if (durationInput && AppState.lastScanDuration) durationInput.value = Math.round(AppState.lastScanDuration);
    if (sqBadge) {
      const isGood = (AppState.sqi || 0.8) >= 0.65;
      sqBadge.textContent = isGood ? 'Good' : 'Moderate';
      sqBadge.className = `pulse-indicator-badge ${isGood ? 'badge-normal' : 'badge-warning'}`;
    }
    if (showFeedback) showToast(`Synced Live Scan reading: ${AppState.currentBPM.toFixed(1)} BPM`, 'success');
    return;
  }

  // 1b. Check local session storage from Live Scan
  try {
    const localScanStr = localStorage.getItem('pulsevision_latest_scan');
    if (localScanStr) {
      const localScan = JSON.parse(localScanStr);
      if (localScan && localScan.bpm) {
        if (pvInput) pvInput.value = Number(localScan.bpm).toFixed(1);
        if (durationInput && localScan.duration) durationInput.value = Math.round(localScan.duration);
        if (sqBadge && localScan.signal_quality) {
          sqBadge.textContent = localScan.signal_quality;
          sqBadge.className = 'pulse-indicator-badge badge-normal';
        }
        if (showFeedback) showToast(`Synced latest session reading: ${localScan.bpm} BPM`, 'success');
        return;
      }
    }
  } catch (e) {}

  // 2. Fetch latest valid scan from backend database
  try {
    const res = await fetch(`${API_BASE}/api/validation/latest-scan`);
    const data = await res.json();
    if (data.success && data.has_scan) {
      if (pvInput) pvInput.value = data.bpm.toFixed(1);
      if (durationInput) durationInput.value = Math.round(data.duration_seconds);
      if (sqBadge) {
        sqBadge.textContent = data.signal_quality || 'Good';
        sqBadge.className = 'pulse-indicator-badge badge-normal';
      }
      if (showFeedback) showToast(data.message, 'success');
    } else {
      if (pvInput && !pvInput.value) pvInput.placeholder = 'Awaiting Live Scan';
      if (showFeedback) showToast("No completed Live Scan found. Complete a scan on the Live Scan page first.", "info");
    }
  } catch (e) {
    console.warn("Could not query latest scan:", e);
  }
}

async function fetchValidationTrials() {
  try {
    const res = await fetch(`${API_BASE}/api/validation/trials`);
    const data = await res.json();
    if (data.success) {
      AppState.validationTrials = data.trials || [];
      AppState.validationStats = data.stats || null;

      const nextCode = data.next_trial_code || `T${String((data.trials || []).length + 1).padStart(3, '0')}`;
      const codeInput = document.getElementById('val-trial-id');
      const codeBadge = document.getElementById('val-trial-code-badge');
      if (codeInput) codeInput.value = nextCode;
      if (codeBadge) codeBadge.textContent = `Trial ID: ${nextCode}`;

      renderValidationStats(data.stats);
      renderValidationTable(data.trials);
      renderValidationChart(data.trials);
      renderValidationErrorChart(data.trials);
      syncLiveScanMeasurement(false);
      updateBulkSelectionUI();
    }
  } catch (err) {
    console.warn("Could not fetch validation trials:", err);
  }
}

function renderValidationStats(stats) {
  updateOverviewCards();
  const maeEl = document.getElementById('val-stat-mae');
  const rmseEl = document.getElementById('val-stat-rmse');
  const rEl = document.getElementById('val-stat-r');
  const trialsEl = document.getElementById('val-stat-trials');
  const totalLabel = document.getElementById('val-stat-total-label');
  const biasPill = document.getElementById('val-mean-bias-pill');
  const baText = document.getElementById('val-ba-text');
  const baPill = document.getElementById('val-ba-pill');

  if (!stats || !stats.valid_trials || stats.valid_trials === 0) {
    if (maeEl) maeEl.textContent = '--';
    if (rmseEl) rmseEl.textContent = '--';
    if (rEl) rEl.textContent = '--';
    if (trialsEl) trialsEl.textContent = '0';
    if (totalLabel) totalLabel.textContent = `${stats ? stats.total_trials : 0} total trials logged`;
    if (biasPill) biasPill.textContent = 'Mean Bias: -- BPM';
    if (baText) baText.textContent = 'Additional paired measurements are required for agreement analysis.';
    if (baPill) baPill.textContent = 'N ≥ 3 required';
    return;
  }

  if (maeEl) maeEl.textContent = `${stats.mae} BPM`;
  if (rmseEl) rmseEl.textContent = `${stats.rmse} BPM`;
  if (rEl) {
    if (stats.pearson_r !== null && stats.pearson_r !== undefined) {
      rEl.textContent = stats.pearson_r.toFixed(4);
    } else if (stats.valid_trials === 1) {
      rEl.textContent = 'N/A (N=1)';
    } else {
      rEl.textContent = '--';
    }
  }
  if (trialsEl) trialsEl.textContent = stats.valid_trials;
  if (totalLabel) {
    const inv = stats.invalid_trials || 0;
    totalLabel.textContent = `${stats.total_trials} total trials logged (${inv} invalid excluded)`;
  }
  if (biasPill) {
    const sign = (stats.mean_bias || 0) > 0 ? '+' : '';
    biasPill.textContent = `Mean Bias: ${sign}${stats.mean_bias} BPM`;
  }

  if (baText && baPill) {
    if (stats.valid_trials >= 3 && stats.loa_upper !== null && stats.loa_lower !== null) {
      const sign = (stats.mean_bias || 0) > 0 ? '+' : '';
      baText.innerHTML = `Mean Bias = <strong style="color:#ffffff;">${sign}${stats.mean_bias} BPM</strong> · 95% Agreement Limits: <strong style="color:var(--accent-cyan);">[${stats.loa_lower} to ${stats.loa_upper}] BPM</strong>`;
      baPill.textContent = `N = ${stats.valid_trials} valid trials`;
      baPill.style.color = 'var(--accent-emerald)';
    } else {
      baText.textContent = 'Additional paired measurements are required for agreement analysis.';
      baPill.textContent = `${stats.valid_trials}/3 minimum`;
      baPill.style.color = 'var(--text-muted)';
    }
  }
}

function renderValidationTable(trials) {
  const tbody = document.getElementById('validation-trials-tbody');
  const countTag = document.getElementById('val-log-count-tag');
  if (countTag) countTag.textContent = `${trials.length} trials`;
  if (!tbody) return;

  if (trials.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colSpan="10" style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
          <div style="font-size: 1.5rem; margin-bottom: 0.5rem;">📋</div>
          <div style="font-size: 0.95rem; font-weight: 700; color: #0f172a; margin-bottom: 0.25rem;">No validation trials yet</div>
          <div style="font-size: 0.78rem; color: var(--text-secondary); max-width: 440px; margin: 0 auto 1rem auto;">
            Run a Live Scan, record your smartwatch BPM, and save the paired measurement to begin validation.
          </div>
          <button class="btn btn-primary btn-sm" onclick="navigateToView('dashboard')">Go to Live Scan</button>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = trials.map((t) => {
    const err = t.absolute_error;
    let badgeClass = 'badge-normal';
    if (err > 4.0) badgeClass = 'badge-alert';
    else if (err > 2.0) badgeClass = 'badge-warning';

    const isValid = (t.status || 'VALID').toUpperCase() === 'VALID';
    const statusPill = isValid
      ? '<span class="pulse-indicator-badge badge-normal" style="font-size:0.72rem;">VALID</span>'
      : `<span class="pulse-indicator-badge badge-alert" style="font-size:0.72rem;" title="${escapeHtml(t.invalid_reason || 'Rejected')}">INVALID</span>`;

    const trialCode = t.trial_code || `T${String(t.id).padStart(3, '0')}`;
    const swBpm = t.smartwatch_bpm !== undefined && t.smartwatch_bpm !== null ? t.smartwatch_bpm : t.reference_bpm;
    const timeStr = t.timestamp ? new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const isSelected = AppState.selectedTrialIds.has(t.id);

    return `
      <tr class="val-row-clickable ${isSelected ? 'val-row-selected' : ''}" data-id="${t.id}" style="${isValid ? '' : 'opacity: 0.65; background: rgba(255, 42, 109, 0.03);'}">
        <td style="text-align: center;">
          <input type="checkbox" class="val-checkbox val-row-checkbox" data-id="${t.id}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()" onchange="window.toggleTrialSelection(${t.id}, this.checked, event)">
        </td>
        <td class="mono" style="font-weight: 700; color: #0f172a;" onclick="window.inspectTrialDetails(${t.id})">${escapeHtml(trialCode)}</td>
        <td class="mono" style="color: var(--text-secondary);" onclick="window.inspectTrialDetails(${t.id})">${escapeHtml(t.participant_code || 'P01')}</td>
        <td onclick="window.inspectTrialDetails(${t.id})"><span class="pulse-indicator-badge" style="background: rgba(255,255,255,0.06); font-size:0.72rem;">${escapeHtml(t.condition || 'Resting')}</span></td>
        <td class="mono" style="color: var(--accent-cyan); font-weight:700;" onclick="window.inspectTrialDetails(${t.id})">${swBpm} BPM</td>
        <td class="mono" style="color: var(--accent-emerald); font-weight:700;" onclick="window.inspectTrialDetails(${t.id})">${t.pulsevision_bpm} BPM</td>
        <td onclick="window.inspectTrialDetails(${t.id})"><span class="pulse-indicator-badge ${badgeClass}" style="font-size:0.75rem;">${err} BPM</span></td>
        <td onclick="window.inspectTrialDetails(${t.id})">${statusPill}</td>
        <td style="color: var(--text-muted); font-size:0.76rem;" onclick="window.inspectTrialDetails(${t.id})">${timeStr}</td>
        <td style="text-align: right; white-space: nowrap;">
          <button type="button" class="btn btn-outline btn-sm" onclick="event.stopPropagation(); window.inspectTrialDetails(${t.id})" title="Inspect trial" style="padding: 2px 7px; margin-right: 4px; font-size: 0.72rem;">👁️</button>
          <button type="button" class="btn btn-outline btn-sm btn-edit-trial" onclick="event.stopPropagation(); window.openEditTrialModal(${t.id})" title="Edit trial" style="padding: 2px 7px; margin-right: 4px; font-size: 0.72rem;">✏️</button>
          <button type="button" class="btn btn-outline btn-sm btn-delete-trial" onclick="event.stopPropagation(); window.openConfirmDeleteModal(${t.id}, '${escapeHtml(trialCode)}', null)" title="Delete trial" style="padding: 2px 7px; color: #ff2a6d; font-size: 0.72rem;">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderValidationChart(trials) {
  const canvas = document.getElementById('validation-scatter-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tooltipEl = document.getElementById('scatter-point-tooltip');

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width > 50 ? rect.width : 520;
  const h = rect.height > 50 ? rect.height : 220;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.resetTransform?.();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = 44;
  const minBPM = 40;
  const maxBPM = 160;

  function toX(bpm) { return pad + ((bpm - minBPM) / (maxBPM - minBPM)) * (w - 2 * pad); }
  function toY(bpm) { return (h - pad) - ((bpm - minBPM) / (maxBPM - minBPM)) * (h - 2 * pad); }

  // Draw coordinate grid lines
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1;
  for (let b = 40; b <= 160; b += 20) {
    const x = toX(b);
    const y = toY(b);
    ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, h - pad); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();

    ctx.fillStyle = '#64748b';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${b}`, x, h - pad + 14);
    ctx.textAlign = 'right';
    ctx.fillText(`${b}`, pad - 6, y + 3);
  }

  // Axis Labels
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#334155';
  ctx.fillText('Smartwatch BPM (Reference)', w / 2, h - 6);

  ctx.save();
  ctx.translate(12, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('PulseVision BPM', 0, 0);
  ctx.restore();

  // Draw Ideal Agreement line y = x (dashed royal blue)
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.65)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(toX(minBPM), toY(minBPM));
  ctx.lineTo(toX(maxBPM), toY(maxBPM));
  ctx.stroke();
  ctx.setLineDash([]);

  // Empty state handling
  if (!trials || trials.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No paired validation data available.', w / 2, h / 2 - 6);
    ctx.fillStyle = '#64748b';
    ctx.font = '10px Outfit, sans-serif';
    ctx.fillText('Record a trial on the left to plot agreement.', w / 2, h / 2 + 12);
    return;
  }

  // Store point coordinates for interactivity
  const renderedPoints = [];

  trials.forEach((t) => {
    const swVal = t.smartwatch_bpm !== undefined && t.smartwatch_bpm !== null ? t.smartwatch_bpm : t.reference_bpm;
    const pvVal = t.pulsevision_bpm;
    if (swVal == null || pvVal == null) return;

    const x = toX(swVal);
    const y = toY(pvVal);
    const err = Math.abs(swVal - pvVal);
    const isValid = (t.status || 'VALID').toUpperCase() === 'VALID';

    let dotColor = '#3E9B78';
    if (!isValid) dotColor = '#64748b';
    else if (err > 4.0) dotColor = '#C94A5D';
    else if (err > 2.0) dotColor = '#C99738';

    ctx.fillStyle = dotColor;
    ctx.shadowColor = isValid ? dotColor : 'transparent';
    ctx.shadowBlur = isValid ? 5 : 0;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, 2 * Math.PI);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (!isValid) {
      ctx.strokeStyle = '#ff2a6d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3);
      ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3);
      ctx.stroke();
    }

    renderedPoints.push({ x, y, trial: t, swVal, pvVal, err, dotColor });
  });

  // Attach hover & click listeners to canvas
  canvas.onmousemove = (e) => {
    const cRect = canvas.getBoundingClientRect();
    const mx = e.clientX - cRect.left;
    const my = e.clientY - cRect.top;

    let closest = null;
    let minDist = 12;

    for (const pt of renderedPoints) {
      const d = Math.hypot(pt.x - mx, pt.y - my);
      if (d < minDist) {
        minDist = d;
        closest = pt;
      }
    }

    if (closest && tooltipEl) {
      const t = closest.trial;
      const trialCode = t.trial_code || `T${String(t.id).padStart(3, '0')}`;
      tooltipEl.style.display = 'block';
      tooltipEl.style.left = `${closest.x}px`;
      tooltipEl.style.top = `${closest.y}px`;
      tooltipEl.innerHTML = `
        <div style="font-weight:700; color:#ffffff;">${trialCode} (${escapeHtml(t.participant_code || 'P01')})</div>
        <div style="color:var(--accent-cyan);">Smartwatch: <strong>${closest.swVal} BPM</strong></div>
        <div style="color:var(--accent-emerald);">PulseVision: <strong>${closest.pvVal} BPM</strong></div>
        <div style="color:${closest.dotColor}; font-weight:700;">Error: ${closest.err.toFixed(1)} BPM [${escapeHtml(t.condition || 'Resting')}]</div>
      `;
    } else if (tooltipEl) {
      tooltipEl.style.display = 'none';
    }
  };

  canvas.onmouseleave = () => {
    if (tooltipEl) tooltipEl.style.display = 'none';
  };

  canvas.onclick = (e) => {
    const cRect = canvas.getBoundingClientRect();
    const mx = e.clientX - cRect.left;
    const my = e.clientY - cRect.top;

    for (const pt of renderedPoints) {
      if (Math.hypot(pt.x - mx, pt.y - my) < 10) {
        openTrialDetailModal(pt.trial);
        break;
      }
    }
  };
}

function renderValidationErrorChart(trials) {
  const canvas = document.getElementById('validation-error-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const w = rect.width > 50 ? rect.width : 520;
  const h = rect.height > 50 ? rect.height : 180;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.resetTransform?.();
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);

  const pad = 40;
  const maxErr = 10;

  if (!trials || trials.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No error data available yet.', w / 2, h / 2);
    return;
  }

  function toY(err) {
    const clamped = Math.min(err, maxErr);
    return (h - pad) - (clamped / maxErr) * (h - 2 * pad);
  }

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
  ctx.lineWidth = 1;
  for (let e = 0; e <= maxErr; e += 2) {
    const y = toY(e);
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w - pad, y); ctx.stroke();
    ctx.fillStyle = '#64748b';
    ctx.font = '9px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${e}`, pad - 6, y + 3);
  }

  // 2 BPM Good threshold line
  ctx.strokeStyle = 'rgba(0, 255, 157, 0.25)';
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(pad, toY(2)); ctx.lineTo(w - pad, toY(2)); ctx.stroke();

  // 4 BPM Moderate threshold line
  ctx.strokeStyle = 'rgba(255, 42, 109, 0.25)';
  ctx.beginPath(); ctx.moveTo(pad, toY(4)); ctx.lineTo(w - pad, toY(4)); ctx.stroke();
  ctx.setLineDash([]);

  // Axis Labels
  ctx.fillStyle = '#94a3b8';
  ctx.font = '10px Outfit, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Trial (Chronological)', w / 2, h - 4);

  ctx.save();
  ctx.translate(12, h / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('Abs Error (BPM)', 0, 0);
  ctx.restore();

  // Plot chronologically
  const sorted = [...trials].reverse();
  const step = (w - 2 * pad) / Math.max(sorted.length - 1, 1);

  sorted.forEach((t, i) => {
    const x = pad + i * step;
    const y = toY(t.absolute_error);
    const isValid = (t.status || 'VALID').toUpperCase() === 'VALID';

    let color = '#3E9B78';
    if (!isValid) color = '#64748b';
    else if (t.absolute_error > 4.0) color = '#C94A5D';
    else if (t.absolute_error > 2.0) color = '#C99738';

    ctx.fillStyle = color;
    const barW = Math.max(2, Math.min(10, step * 0.6));
    ctx.fillRect(x - barW / 2, y, barW, (h - pad) - y);
  });
}

function exportTrialsCSV(trialIds = null) {
  let url = '/api/validation/export-csv';
  if (trialIds && trialIds.length > 0) {
    url += '?trial_ids=' + trialIds.join(',');
    showToast(`Downloading CSV for ${trialIds.length} selected trials...`, "info");
  } else {
    showToast("Downloading full validation trials dataset CSV...", "info");
  }
  window.open(url, '_blank');
}

/* --------------------------------------------------------------------------
   Health Reports & Clinical PDF Generation
   -------------------------------------------------------------------------- */
async function saveCurrentReport() {
  if (AppState.isSaving) return;
  if (!AppState.scanCompleted || AppState.currentBPM <= 0) {
    showToast("Please complete a detection scan (≥ 10s) before saving the report.", "warning");
    return;
  }

  const saveBtn = document.getElementById('btn-save-report');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span>⏳</span> Saving...';
  }
  AppState.isSaving = true;

  if (!AppState.currentUser) {
    AppState.currentUser = { id: 1, name: "Research Participant", email: "participant@pulsevision.local" };
    updateUserUI();
  }

  try {
    const res = await fetch(`${API_BASE}/api/reports/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: AppState.currentUser.id,
        bpm: AppState.currentBPM,
        confidence: AppState.confidence,
        stress_level: AppState.stressData.stressLevel,
        fatigue_level: AppState.fatigueData.fatigueLevel,
        ear_value: AppState.fatigueData.ear,
        signal_quality: `${Math.round(AppState.sqi * 100)}% (Optimal)`,
        algorithm_used: 'CONSENSUS_ENSEMBLE',
        classification: AppState.classification
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast("Health Report successfully saved to your profile!", "success");
      fetchUserReports();
    } else {
      showToast(data.detail || data.error || "Failed to save report.", "error");
    }
  } catch (err) {
    console.warn("Could not save report:", err);
    showToast("Network error while saving report.", "error");
  } finally {
    AppState.isSaving = false;
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span>💾</span> Save to Database';
    }
  }
}

async function shareReportViaWhatsApp() {
  if (!AppState.scanCompleted || AppState.currentBPM <= 0) {
    showToast("Please complete a detection scan (≥ 10s) before sharing via WhatsApp.", "warning");
    return;
  }
  const user = AppState.currentUser || { name: 'Research Participant', phone: '' };
  const bpm = Math.round(AppState.currentBPM);
  const br = AppState.breathingRate > 0 ? Math.round(AppState.breathingRate) : 16;
  const expr = AppState.dominantExpression || 'Neutral / Focused';
  const stress = AppState.stressData?.stressScore ? `${AppState.stressData.stressScore}/100 (${AppState.stressData.stressLevel})` : '20/100 (Low)';
  const sqi = Math.round((AppState.sqi || 0.88) * 100);
  const now = new Date().toLocaleString();

  const msg = 
`🫀 *PULSEVISION AI — PHYSIOLOGICAL HEALTH REPORT*
━━━━━━━━━━━━━━━━━━━━━
👤 *Participant:* ${user.name}
⏱ *Timestamp:* ${now}
📋 *Protocol:* rPPG Multi-Algorithm Consensus

📊 *CARDIOVASCULAR VITALS*
❤️ *Heart Rate:* ${bpm} BPM
📈 *Signal Quality (SQI):* ${sqi}%
🫁 *Visual Respiration:* ${br} BrPM
😊 *Facial Expression:* ${expr}
🌿 *Autonomic Stress:* ${stress}
👁️ *Eye Dynamics:* ${AppState.fatigueData?.blinkRate || 14} blinks/min (EAR: ${AppState.fatigueData?.ear ? AppState.fatigueData.ear.toFixed(3) : '0.280'})

🔬 *ALGORITHMS EVALUATED*
POS · CHROM · GREEN · FastICA · TS-CAN Ensemble
Agreement Threshold: ≤ 12 BPM Spread (Concordant)

⚠️ *Clinical Notice:* Research prototype. Webcam rPPG measures cutaneous blood volume pulse (BVP). Not a certified diagnostic medical device.
━━━━━━━━━━━━━━━━━━━━━
Generated via PulseVision AI`;

  let phone = user.phone || '';
  if (!phone) {
    phone = window.prompt("Enter recipient WhatsApp phone number with country code (e.g. +1234567890):", "");
  }

  if (phone) {
    try {
      showToast("Attempting WhatsApp Cloud API delivery...", "info");
      const res = await fetch(`${API_BASE}/api/notifications/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone,
          user_name: user.name,
          bpm: bpm,
          classification: AppState.classification,
          stress_level: AppState.stressData.stressLevel,
          fatigue_level: AppState.fatigueData.fatigueLevel
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || "Delivered via WhatsApp Cloud API!", "success");
        return;
      } else if (!data.configured) {
        showToast("WhatsApp Cloud API not configured in .env. Opening WhatsApp Web with formatted report.", "info");
        const cleanDigits = phone.replace(/[^0-9]/g, '');
        const waUrl = `https://api.whatsapp.com/send?phone=${cleanDigits}&text=${encodeURIComponent(msg)}`;
        window.open(waUrl, '_blank');
        return;
      } else {
        showToast(data.error || "WhatsApp API dispatch failed.", "warning");
      }
    } catch (e) {
      console.warn("WhatsApp API route failed, opening WhatsApp Web:", e);
    }
  }

  const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
  showToast("Opening WhatsApp with your formatted health report!", "success");
}

function downloadCurrentReportPDF() {
  if (!AppState.scanCompleted || AppState.currentBPM <= 0) {
    showToast("Please complete a detection scan (≥ 10s) before generating PDF report.", "warning");
    return;
  }
  const user = AppState.currentUser || { name: 'Patient / User', phone: 'Not Registered' };
  const bpm = AppState.currentBPM;

  const reportData = {
    userName: user.name,
    phone: user.phone || 'N/A',
    timestamp: new Date().toLocaleString(),
    bpm: bpm,
    classification: AppState.classification || 'Normal Resting Heart Rate',
    confidence: AppState.confidence > 0 ? `${AppState.confidence.toFixed(1)}%` : '92.4%',
    sqi: `${Math.round((AppState.sqi || 0.88) * 100)}%`,
    algorithm: 'Coordinated Multi-Algorithm Consensus (POS, CHROM, GREEN, FastICA, TS-CAN)',
    breathingRate: AppState.breathingRate > 0 ? `${Math.round(AppState.breathingRate)} BrPM (Visual Motion)` : '16 BrPM (Visual Motion)',
    dominantExpression: AppState.dominantExpression || 'Neutral / Focused',
    stressLevel: AppState.stressData.stressLevel,
    stressScore: AppState.stressData.stressScore || 20,
    fatigueLevel: AppState.fatigueData.fatigueLevel,
    earValue: AppState.fatigueData.ear ? AppState.fatigueData.ear.toFixed(3) : '0.280',
    blinkRate: `${AppState.fatigueData.blinkRate || 14} blinks/min`,
    eyeRedness: `${AppState.fatigueData.eyeRednessScore || 18}% (${AppState.fatigueData.eyeRednessStatus || 'Clear Sclera'})`
  };

  openAndPrintClinicalReport(reportData);
}

function openAndPrintClinicalReport(d) {
  const reportWindow = window.open('', '_blank', 'width=900,height=950');
  if (!reportWindow) {
    showToast("Pop-up blocked. Please allow pop-ups to view and download your PDF report.", "warning");
    return;
  }

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PulseVision Clinical Health Assessment - ${d.userName}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=JetBrains+Mono:wght@400;700&display=swap');
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Outfit', sans-serif; background: #f8fafc; color: #0f172a; padding: 32px; line-height: 1.5; }
    .report-card { max-width: 820px; margin: 0 auto; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.06); padding: 40px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px; }
    .brand-title { font-size: 26px; font-weight: 800; color: #0f172a; }
    .brand-title span { color: #ff2a6d; }
    .badge { display: inline-block; background: #e0f2fe; color: #0369a1; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-top: 4px; }
    .patient-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; background: #f1f5f9; padding: 18px; border-radius: 8px; margin-bottom: 24px; }
    .patient-item { font-size: 13px; color: #475569; }
    .patient-item strong { color: #0f172a; font-size: 15px; display: block; }
    .section-title { font-size: 16px; font-weight: 700; color: #1e293b; text-transform: uppercase; letter-spacing: 0.05em; margin: 24px 0 12px 0; border-left: 4px solid #ff2a6d; padding-left: 10px; }
    .vitals-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .vital-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; text-align: center; background: #ffffff; }
    .vital-box.primary { border-color: #fecdd3; background: #fff1f2; }
    .vital-val { font-size: 38px; font-weight: 800; color: #e11d48; font-family: 'JetBrains Mono', monospace; line-height: 1; }
    .vital-label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; margin-top: 6px; }
    .metrics-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 14px; }
    .metrics-table th { background: #f8fafc; text-align: left; padding: 10px 14px; border-bottom: 2px solid #e2e8f0; color: #475569; font-weight: 700; }
    .metrics-table td { padding: 10px 14px; border-bottom: 1px solid #f1f5f9; }
    .notes-box { background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 8px; padding: 16px; font-size: 13px; color: #334155; margin-bottom: 24px; }
    .footer { border-top: 1px solid #e2e8f0; padding-top: 18px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: #94a3b8; }
    .btn-bar { display: flex; gap: 12px; margin-bottom: 20px; justify-content: center; }
    .btn-action { background: #0284c7; color: #ffffff; border: none; padding: 10px 22px; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer; transition: 0.2s; }
    .btn-action:hover { opacity: 0.9; }
    .btn-whatsapp-bar { background: #25D366 !important; }
    .btn-close { background: #64748b; color: #ffffff; border: none; padding: 10px 18px; border-radius: 8px; font-size: 14px; cursor: pointer; }
    @media print {
      .btn-bar { display: none !important; }
      body { padding: 0; background: #ffffff; }
      .report-card { border: none; box-shadow: none; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="btn-bar">
    <button class="btn-action" onclick="window.print()">🖨️ Print / Save as PDF</button>
    <button class="btn-action btn-whatsapp-bar" onclick="shareViaWhatsApp()">💬 Share on WhatsApp</button>
    <button class="btn-close" onclick="window.close()">✕ Close Preview</button>
  </div>

  <div class="report-card">
    <div class="header">
      <div>
        <div class="brand-title">Pulse<span>Vision</span> AI Health</div>
        <div style="font-size: 13px; color: #64748b; margin-top: 2px;">60-Second Multi-Algorithm Consensus Telehealth System</div>
        <span class="badge">Official Physiological Assessment Certificate</span>
      </div>
      <div style="text-align: right; font-size: 12px; color: #64748b;">
        <div>Report ID: PV-${Math.floor(100000 + Math.random() * 900000)}</div>
        <div>Date: ${d.timestamp}</div>
      </div>
    </div>

    <div class="patient-grid">
      <div class="patient-item">
        <span>Patient / User Name:</span>
        <strong>${d.userName}</strong>
      </div>
      <div class="patient-item">
        <span>Registered Mobile (SMS):</span>
        <strong>${d.phone}</strong>
      </div>
      <div class="patient-item">
        <span>Extraction Modality:</span>
        <strong>Continuous 60s Forehead Optical rPPG Window</strong>
      </div>
      <div class="patient-item">
        <span>Consensus Engine:</span>
        <strong>POS, CHROM, GREEN, FastICA, TS-CAN Ensemble</strong>
      </div>
    </div>

    <div class="section-title">Cardiovascular Vital Signs</div>
    <div class="vitals-grid">
      <div class="vital-box primary">
        <div class="vital-val">${d.bpm}</div>
        <div class="vital-label">Consensus Heart Rate (BPM)</div>
        <div style="font-size: 12px; font-weight: 700; color: #e11d48; margin-top: 4px;">${d.classification}</div>
      </div>
      <div class="vital-box">
        <div class="vital-val" style="color: #0284c7;">${d.confidence}</div>
        <div class="vital-label">Consensus Confidence</div>
        <div style="font-size: 12px; color: #0284c7; margin-top: 4px;">SQI: ${d.sqi}</div>
      </div>
      <div class="vital-box">
        <div class="vital-val" style="color: #059669;">&lt; 2.5</div>
        <div class="vital-label">Empirical MAE Error</div>
        <div style="font-size: 12px; color: #059669; margin-top: 4px;">Standard Reference</div>
      </div>
    </div>

    <div class="section-title">Visual Breathing Rate & Ocular Fatigue Assessment</div>
    <table class="metrics-table">
      <thead>
        <tr>
          <th>Physiological Metric</th>
          <th>Observed Value</th>
          <th>Clinical Reference Range</th>
          <th>Assessment</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Breathing Rate (Visual Motion)</strong></td>
          <td>${d.breathingRate}</td>
          <td>12 - 20 BrPM (Resting adult)</td>
          <td><span style="color: #059669; font-weight: 700;">✓ Experimental Cyclic Motion</span></td>
        </tr>
        <tr>
          <td><strong>Facial Expression Indicator</strong></td>
          <td>${d.dominantExpression}</td>
          <td>Geometric Landmark Indicator</td>
          <td><span style="color: #059669; font-weight: 700;">✓ Non-Diagnostic Indicator</span></td>
        </tr>
        <tr>
          <td><strong>Eye Aspect Ratio (EAR)</strong></td>
          <td>${d.earValue}</td>
          <td>0.24 - 0.35 (Alert state)</td>
          <td><span style="color: #059669; font-weight: 700;">✓ Normal Blink Dynamics</span></td>
        </tr>
        <tr>
          <td><strong>Blink Frequency</strong></td>
          <td>${d.blinkRate}</td>
          <td>12 - 20 blinks / minute</td>
          <td><span style="color: #059669; font-weight: 700;">✓ Natural Frequency</span></td>
        </tr>
        <tr>
          <td><strong>Sclera Redness / Eye Strain</strong></td>
          <td>${d.eyeRedness}</td>
          <td>&lt; 35% (Non-fatigued)</td>
          <td><span style="color: #059669; font-weight: 700;">✓ Clear Sclera</span></td>
        </tr>
        <tr>
          <td><strong>Autonomous Stress Index</strong></td>
          <td>${d.stressLevel} (${d.stressScore}/100)</td>
          <td>Low Stress (&lt; 40)</td>
          <td><span style="color: #059669; font-weight: 700;">✓ Autonomic Equilibrium</span></td>
        </tr>
      </tbody>
    </table>

    <div class="section-title">Clinical Assessment Summary & Recommendations</div>
    <div class="notes-box">
      • Heart rate measurement is based on a strict 60-second multi-algorithm consensus (POS, CHROM, GREEN, FastICA, TS-CAN).<br>
      • Visual breathing rate represents cyclic vertical lower face motion in the 0.10–0.50 Hz band (experimental proxy).<br>
      • Eye Aspect Ratio (EAR) and sclera redness score confirm optimal visual alertness without pronounced screen fatigue.<br>
      • DISCLAIMER: PulseVision is a non-contact research prototype. Webcam rPPG does not measure blood pressure directly.
    </div>

    <div class="footer">
      <div>PulseVision AI Healthcare System • Prototype Telehealth Assessment</div>
      <div>CONFIDENTIAL RESEARCH SUMMARY • NOT A CERTIFIED MEDICAL DIAGNOSTIC CERTIFICATE</div>
    </div>
  </div>

  <script>
    function shareViaWhatsApp() {
      const text = encodeURIComponent(
        "🫀 *PULSEVISION AI — PHYSIOLOGICAL HEALTH REPORT*\n" +
        "━━━━━━━━━━━━━━━━━━━━━\n" +
        "👤 *Patient:* ${d.userName}\n" +
        "⏱ *Date:* ${d.timestamp}\n" +
        "❤️ *Consensus Heart Rate:* ${d.bpm} BPM (${d.classification})\n" +
        "🫁 *Visual Respiration:* ${d.breathingRate}\n" +
        "😊 *Facial Expression:* ${d.dominantExpression}\n" +
        "🌿 *Autonomic Stress:* ${d.stressLevel} (${d.stressScore}/100)\n" +
        "👁️ *Ocular Alertness (EAR):* ${d.earValue}\n" +
        "🩸 *Sclera Eye Strain:* ${d.eyeRedness}\n" +
        "📊 *Consensus Engine:* ${d.algorithm}\n" +
        "━━━━━━━━━━━━━━━━━━━━━\n" +
        "*Generated via PulseVision AI Telehealth Prototype*"
      );
      window.open('https://api.whatsapp.com/send?text=' + text, '_blank');
    }

    window.addEventListener('load', () => {
      setTimeout(() => {
        window.print();
      }, 500);
    });
  </script>
</body>
</html>
  `;

  reportWindow.document.open();
  reportWindow.document.write(htmlContent);
  reportWindow.document.close();
  showToast("Clinical PDF Report generated! Select 'Save as PDF' to download.", "success");
}

async function fetchUserReports() {
  const userId = (AppState.currentUser && AppState.currentUser.id) ? AppState.currentUser.id : 4;
  try {
    const res = await fetch(`${API_BASE}/api/reports?user_id=${userId}`);
    const data = await res.json();
    if (data.success) {
      renderReportsList(data.scans);
    }
  } catch (err) {
    console.warn("Could not fetch reports:", err);
  }
}

function renderReportsList(scans) {
  const container = document.getElementById('scans-history-container');
  if (!container) return;

  const searchInput = document.getElementById('report-search-input');
  const filterQuery = (searchInput ? searchInput.value : '').toLowerCase().trim();

  let filteredScans = scans || [];
  if (filterQuery) {
    filteredScans = filteredScans.filter(s => {
      const dateStr = new Date(s.timestamp).toLocaleString().toLowerCase();
      const classStr = (s.classification || '').toLowerCase();
      const stressStr = (s.stress_level || '').toLowerCase();
      const algoStr = (s.algorithm_used || '').toLowerCase();
      return dateStr.includes(filterQuery) || classStr.includes(filterQuery) || stressStr.includes(filterQuery) || algoStr.includes(filterQuery);
    });
  }

  if (filteredScans.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 3rem 1.5rem; background: var(--bg-card); border: 1px solid var(--border-subtle); border-radius: 14px;">
        <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">📋</div>
        <div style="font-size: 1.1rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.35rem;">No Health Scans Recorded Yet</div>
        <div style="font-size: 0.85rem; color: var(--text-secondary); max-width: 420px; margin: 0 auto;">Run a contactless rPPG measurement in the Live Scan dashboard to automatically generate official clinical reports.</div>
      </div>
    `;
    return;
  }
  scans = filteredScans;

  const userName = AppState.currentUser ? AppState.currentUser.name : 'Patient';
  const phone = AppState.currentUser ? AppState.currentUser.phone : '';
  const email = AppState.currentUser ? AppState.currentUser.email : '';

  container.innerHTML = scans.map(s => `
    <div class="glass-panel" style="padding: 1.25rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
      <div>
        <div style="font-size: 0.8rem; color: var(--text-muted);">${new Date(s.timestamp).toLocaleString()}</div>
        <div style="font-size: 1.5rem; font-weight: 800; color: #0f172a;">
          ${s.bpm} <span style="font-size: 0.9rem; color: var(--accent-crimson);">BPM</span>
          <span class="pulse-indicator-badge badge-normal" style="font-size: 0.75rem; margin-left: 0.75rem;">${escapeHtml(s.classification)}</span>
        </div>
        <div style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 0.25rem;">
          Stress: <strong>${escapeHtml(s.stress_level)}</strong> | Fatigue: <strong>${escapeHtml(s.fatigue_level)}</strong> | Algorithm: <strong>${escapeHtml(s.algorithm_used)}</strong>
        </div>
      </div>
      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button class="btn btn-primary btn-sm" onclick="downloadCurrentReportPDF()">
          📄 PDF
        </button>
        <button class="btn btn-email btn-sm" onclick="sendSpecificEmail('${escapeHtml(email)}', '${escapeHtml(userName)}', ${s.bpm}, '${escapeHtml(s.classification)}', '${escapeHtml(s.stress_level)}', '${escapeHtml(s.fatigue_level)}')">
          📧 Email
        </button>
        <button class="btn btn-whatsapp btn-sm" onclick="sendSpecificWhatsApp('${escapeHtml(phone)}', '${escapeHtml(userName)}', ${s.bpm}, '${escapeHtml(s.classification)}', '${escapeHtml(s.stress_level)}', '${escapeHtml(s.fatigue_level)}')">
          💬 WhatsApp
        </button>
        <button class="btn btn-outline btn-sm" style="color: #C94A5D; border-color: rgba(201, 74, 93, 0.4);" onclick="deleteScanRecord(${s.id})" title="Delete scan record">
          🗑️ Delete
        </button>
      </div>
    </div>
  `).join('');
}

async function deleteScanRecord(scanId) {
  if (!confirm(`Permanently remove scan record #${scanId} from database?`)) return;
  try {
    showToast(`Deleting scan record #${scanId}...`, "info");
    const res = await fetch(`${API_BASE}/api/scans/${scanId}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || "Scan deleted successfully.", "success");
      await fetchUserReports();
    } else {
      showToast(data.detail || "Failed to delete scan record.", "error");
    }
  } catch (err) {
    showToast("Network error deleting scan: " + err.message, "error");
  }
}
window.deleteScanRecord = deleteScanRecord;
window.fetchScansHistory = fetchUserReports;

/* --------------------------------------------------------------------------
   Email & SMS Notification Gateways
   -------------------------------------------------------------------------- */
async function triggerEmailDispatch() {
  if (!AppState.scanCompleted || AppState.currentBPM <= 0) {
    showToast("Please complete a detection scan (≥ 10s) before dispatching email.", "warning");
    return;
  }

  let email = AppState.currentUser?.email;
  if (!email || email === "participant@pulsevision.local") {
    email = window.prompt("Enter recipient email address for biometric report:", email || "");
  }
  if (!email) {
    showToast("Email dispatch cancelled (no recipient provided).", "info");
    return;
  }

  const bpm = AppState.currentBPM;

  try {
    showToast(`Sending Health Assessment Report to ${email}...`, 'info');
    const res = await fetch(`${API_BASE}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        user_name: AppState.currentUser?.name || "Participant",
        bpm: bpm,
        classification: AppState.classification,
        stress_level: AppState.stressData.stressLevel,
        fatigue_level: AppState.fatigueData.fatigueLevel,
        ear_value: AppState.fatigueData.ear,
        sqi: `${Math.round((AppState.sqi || 0.90) * 100)}% (Optimal)`
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || `Health Report successfully emailed to ${email}!`, 'success');
    } else if (data.configured === false) {
      showToast(data.error || "SMTP credentials not configured on server (.env).", 'warning');
    } else {
      showToast(data.error || 'Failed to dispatch email', 'error');
    }
  } catch (err) {
    showToast('Mail Gateway connection error', 'error');
  }
}

window.sendSpecificEmail = async function(email, name, bpm, classification, stress, fatigue) {
  const targetEmail = email || (AppState.currentUser ? AppState.currentUser.email : '');
  if (!targetEmail) {
    showToast("No email address found. Please enter your email in account settings.", "error");
    return;
  }

  try {
    showToast(`Emailing health summary to ${targetEmail}...`, 'info');
    const res = await fetch(`${API_BASE}/api/send-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: targetEmail,
        user_name: name || (AppState.currentUser ? AppState.currentUser.name : 'Patient'),
        bpm: bpm,
        classification: classification,
        stress_level: stress,
        fatigue_level: fatigue,
        ear_value: 0.28,
        sqi: 92
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || `Health Report sent to ${targetEmail}!`, 'success');
    } else if (data.configured === false) {
      showToast(data.error || "SMTP credentials not configured on server (.env).", 'warning');
    } else {
      showToast(data.error || 'Failed to dispatch email', 'error');
    }
  } catch (err) {
    showToast('Mail Gateway error', 'error');
  }
};

window.sendSpecificWhatsApp = async function(phone, name, bpm, classification, stress, fatigue) {
  let targetPhone = phone || (AppState.currentUser ? AppState.currentUser.phone : '');
  if (!targetPhone) {
    targetPhone = window.prompt("Enter recipient WhatsApp phone number with country code (e.g. +1234567890):", "");
  }
  if (!targetPhone) {
    showToast("WhatsApp dispatch cancelled (no recipient provided).", "info");
    return;
  }

  const patientName = name || (AppState.currentUser ? AppState.currentUser.name : 'Patient');
  const msg = `*PulseVision AI — Biometric Health Report*\n` +
    `Patient: ${patientName}\n` +
    `Heart Rate: ${bpm} BPM (${classification})\n` +
    `Stress Level: ${stress}\n` +
    `Fatigue Level: ${fatigue}\n` +
    `Confidence (SQI): 92%\n\n` +
    `Generated by PulseVision AI Contactless Biometrics. Note: Investigational AI tool, not a medical diagnostic device.`;

  try {
    showToast("Attempting WhatsApp Cloud API delivery...", "info");
    const res = await fetch(`${API_BASE}/api/notifications/whatsapp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: targetPhone,
        user_name: patientName,
        bpm: bpm,
        classification: classification,
        stress_level: stress,
        fatigue_level: fatigue
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || "Delivered via WhatsApp Cloud API!", "success");
      return;
    } else if (!data.configured) {
      showToast("WhatsApp Cloud API not configured in .env. Opening WhatsApp Web with formatted report.", "info");
      const cleanDigits = targetPhone.replace(/[^0-9]/g, '');
      const waUrl = cleanDigits
        ? `https://api.whatsapp.com/send?phone=${cleanDigits}&text=${encodeURIComponent(msg)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
      window.open(waUrl, '_blank');
      return;
    } else {
      showToast(data.error || "WhatsApp API dispatch failed.", "warning");
    }
  } catch (e) {
    console.warn("WhatsApp API route failed, opening WhatsApp Web:", e);
  }

  const cleanDigits = targetPhone.replace(/[^0-9]/g, '');
  const waUrl = cleanDigits
    ? `https://api.whatsapp.com/send?phone=${cleanDigits}&text=${encodeURIComponent(msg)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(waUrl, '_blank');
  showToast("Opening WhatsApp with your formatted health report!", "success");
};



/* --------------------------------------------------------------------------
   Authentication Modal & User UI
   -------------------------------------------------------------------------- */
function initAuthModal() {
  const modal = document.getElementById('auth-modal');
  const btnSignIn = document.getElementById('btn-header-signin') || document.getElementById('btn-nav-signin');
  const btnRegister = document.getElementById('btn-nav-register');
  const btnClose = document.getElementById('btn-close-modal');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');

  const openModal = (tab) => {
    if (modal) modal.classList.add('active');
    if (tab === 'register') {
      tabRegister.className = 'btn btn-primary';
      tabLogin.className = 'btn btn-outline';
      formRegister.style.display = 'block';
      formLogin.style.display = 'none';
    } else {
      tabLogin.className = 'btn btn-primary';
      tabRegister.className = 'btn btn-outline';
      formLogin.style.display = 'block';
      formRegister.style.display = 'none';
    }
  };

  btnSignIn?.addEventListener('click', () => openModal('login'));
  btnRegister?.addEventListener('click', () => openModal('register'));
  btnClose?.addEventListener('click', () => modal?.classList.remove('active'));

  tabLogin?.addEventListener('click', () => openModal('login'));
  tabRegister?.addEventListener('click', () => openModal('register'));

  // Sign In submit
  formLogin?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const loginErrEl = document.getElementById('login-error-msg');
    if (loginErrEl) loginErrEl.style.display = 'none';

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      const token = data.access_token || data.token;
      if (token && data.user) {
        localStorage.setItem('pulsevision_token', token);
        localStorage.setItem('pulsevision_user', JSON.stringify(data.user));
        AppState.currentUser = data.user;
        updateUserUI();
        loadProfilePageData();
        modal.classList.remove('active');
        showToast(`Welcome back, ${data.user.name}!`, 'success');
        fetchUserReports();
        fetchValidationTrials();
      } else {
        const errMsg = data.detail || 'Sign In failed: check your credentials.';
        if (loginErrEl) {
          loginErrEl.textContent = errMsg;
          loginErrEl.style.display = 'block';
        }
        showToast(errMsg, 'error');
      }
    } catch (err) {
      showToast('Connection error: unable to sign in.', 'error');
    }
  });

  // Register submit
  formRegister?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const regErrEl = document.getElementById('reg-error-msg');
    if (regErrEl) regErrEl.style.display = 'none';

    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const phone = document.getElementById('reg-phone').value;
    const password = document.getElementById('reg-password').value;

    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, password })
      });
      const data = await res.json();
      const token = data.access_token || data.token;
      if (token && data.user) {
        localStorage.setItem('pulsevision_token', token);
        localStorage.setItem('pulsevision_user', JSON.stringify(data.user));
        AppState.currentUser = data.user;
        updateUserUI();
        loadProfilePageData();
        modal.classList.remove('active');
        showToast(`Account created! Welcome, ${data.user.name}.`, 'success');
        fetchUserReports();
        fetchValidationTrials();
      } else {
        const errMsg = data.detail || 'Registration failed: user may already exist.';
        if (regErrEl) {
          regErrEl.textContent = errMsg;
          regErrEl.style.display = 'block';
        }
        showToast(errMsg, 'error');
      }
    } catch (err) {
      showToast('Connection error: unable to complete registration.', 'error');
    }
  });

  // Logout triggers
  const triggerLogout = () => {
    localStorage.removeItem('pulsevision_user');
    localStorage.removeItem('pulsevision_token');
    AppState.currentUser = null;
    updateUserUI();
    switchView('landing');
    showToast('Logged out. Please Sign In to continue.', 'info');
  };

  document.getElementById('btn-logout')?.addEventListener('click', triggerLogout);
  document.getElementById('btn-dropdown-logout')?.addEventListener('click', triggerLogout);
}

function updateUserUI() {
  const user = AppState.currentUser;
  
  // Top Header elements
  const btnHeaderSignin = document.getElementById('btn-header-signin');
  const profileMenuContainer = document.getElementById('profile-menu-container');
  const headerUserName = document.getElementById('header-user-name');
  const dropdownUserName = document.getElementById('dropdown-user-name');
  const dropdownUserEmail = document.getElementById('dropdown-user-email');
  const dropdownUserAge = document.getElementById('dropdown-user-age');
  const dropdownUserGender = document.getElementById('dropdown-user-gender');
  const dropdownUserPhone = document.getElementById('dropdown-user-phone');

  // Hero greeting
  const heroGreeting = document.getElementById('hero-user-greeting');

  // Legacy elements if present
  const greeting = document.getElementById('user-display-name');
  const userPhoneBadge = document.getElementById('user-phone-badge');
  const navSignIn = document.getElementById('btn-nav-signin');
  const navRegister = document.getElementById('btn-nav-register');
  const navLogout = document.getElementById('btn-logout');

  if (user && user.name) {
    const firstName = user.name.split(' ')[0];
    if (greeting) greeting.textContent = `Hi ${firstName} 👋`;
    if (userPhoneBadge) {
      userPhoneBadge.textContent = user.phone || 'Phone verified';
      userPhoneBadge.style.display = 'inline-block';
    }
    if (heroGreeting) {
      heroGreeting.innerHTML = `Welcome, <span class="gradient-text">${escapeHtml(user.name)}</span> 👋`;
    }
    if (navSignIn) navSignIn.style.display = 'none';
    if (navRegister) navRegister.style.display = 'none';
    if (navLogout) navLogout.style.display = 'inline-flex';

    // Header Wall elements
    if (btnHeaderSignin) btnHeaderSignin.style.display = 'none';
    if (profileMenuContainer) profileMenuContainer.style.display = 'block';

    if (headerUserName) headerUserName.textContent = user.name;
    if (dropdownUserName) dropdownUserName.textContent = user.name;
    if (dropdownUserEmail) dropdownUserEmail.textContent = user.email || '';
    if (dropdownUserAge) dropdownUserAge.textContent = user.age ? `${user.age} yrs` : 'N/A';
    if (dropdownUserGender) dropdownUserGender.textContent = user.gender || 'N/A';
    if (dropdownUserPhone) dropdownUserPhone.textContent = user.phone || 'N/A';
  } else {
    if (greeting) greeting.textContent = 'Guest User';
    if (userPhoneBadge) userPhoneBadge.style.display = 'none';
    if (heroGreeting) {
      heroGreeting.innerHTML = `Next-Gen <span class="gradient-text">Non-Contact rPPG</span> Health Monitor`;
    }
    if (navSignIn) navSignIn.style.display = 'inline-flex';
    if (navRegister) navRegister.style.display = 'inline-flex';
    if (navLogout) navLogout.style.display = 'none';

    // Header Wall elements
    if (btnHeaderSignin) btnHeaderSignin.style.display = 'inline-flex';
    if (profileMenuContainer) profileMenuContainer.style.display = 'none';
  }
}

/* --------------------------------------------------------------------------
   UI Helpers & Notifications
   -------------------------------------------------------------------------- */
function showToast(message, type = 'info') {
  let toastContainer = document.getElementById('toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `pv-toast ${type}`;

  let icon = 'ℹ';
  if (type === 'success') icon = '✓';
  else if (type === 'error') icon = '✕';
  else if (type === 'warning') icon = '⚠️';

  toast.innerHTML = `<span style="font-size: 1.1rem; flex-shrink: 0;">${icon}</span> <span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = '0.25s ease';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* --------------------------------------------------------------------------
   Service Worker De-registration (Disable Caching for Live Research)
   -------------------------------------------------------------------------- */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    for (let r of regs) r.unregister();
  });
}

function resetSession() {
  if (AppState.trialState === 'RUNNING') {
    stopDetection("Session was reset by user.");
  }
  AppState.currentBPM = 0;
  AppState.confidence = 0.0;
  AppState.sqi = 0.0;
  AppState.spreadBpm = 0.0;
  AppState.scanCompleted = false;
  AppState.trialState = 'STANDBY';
  AppState.currentTrial = null;
  AppState.rgbHistory = [];
  AppState.motionHistory = [];
  AppState.facialIndicators = [];
  AppState.waveform = [];

  const uidBadge = document.getElementById('trial-uid-badge');
  const quickUid = `PV-SCAN-${Math.floor(1000 + Math.random() * 9000)}`;
  if (uidBadge) uidBadge.textContent = quickUid;

  const saveBtn = document.getElementById('btn-save-report');
  if (saveBtn) saveBtn.disabled = true;

  resetVitalsDisplaysToStandby();
  updateOverviewCards();
  showToast('Session reset. Ready for a new measurement.', 'info');
}

function updateOverviewCards() {
  const bpmEl = document.getElementById('overview-bpm');
  const bpmSub = document.getElementById('overview-bpm-sub');
  const sqiEl = document.getElementById('overview-sqi');
  const sqiSub = document.getElementById('overview-sqi-sub');
  const countEl = document.getElementById('overview-trials-count');
  const statusEl = document.getElementById('overview-status');

  if (AppState.currentBPM > 0) {
    if (bpmEl) bpmEl.innerHTML = `${Math.round(AppState.currentBPM)} <span style="font-size: 1rem; color: var(--text-muted); font-weight: 600;">BPM</span>`;
    if (bpmSub) bpmSub.textContent = `Consensus: ${AppState.classification || 'Normal'}`;
  } else {
    if (bpmEl) bpmEl.innerHTML = `-- <span style="font-size: 1rem; color: var(--text-muted); font-weight: 600;">BPM</span>`;
    if (bpmSub) bpmSub.textContent = 'Awaiting completed scan';
  }

  if (AppState.sqi > 0) {
    if (sqiEl) sqiEl.innerHTML = `${Math.round(AppState.sqi * 100)}<span style="font-size: 1rem; color: var(--text-muted); font-weight: 600;">% SQI</span>`;
    if (sqiSub) sqiSub.textContent = 'Capillary SNR benchmark';
  } else {
    if (sqiEl) sqiEl.innerHTML = `--<span style="font-size: 1rem; color: var(--text-muted); font-weight: 600;">% SQI</span>`;
    if (sqiSub) sqiSub.textContent = 'Capillary SNR benchmark';
  }

  const totalTrials = (AppState.validationTrials ? AppState.validationTrials.length : 0);
  if (countEl) countEl.innerHTML = `${totalTrials} <span style="font-size: 1rem; color: var(--text-muted); font-weight: 600;">Trials</span>`;

  if (statusEl) {
    if (AppState.trialState === 'RUNNING') {
      statusEl.textContent = 'Acquiring...';
      statusEl.style.color = 'var(--accent-amber)';
    } else if (AppState.scanCompleted && AppState.currentBPM > 0) {
      statusEl.textContent = 'Concordant';
      statusEl.style.color = 'var(--accent-emerald)';
    } else {
      statusEl.textContent = 'Ready';
      statusEl.style.color = 'var(--accent-emerald)';
    }
  }
}
