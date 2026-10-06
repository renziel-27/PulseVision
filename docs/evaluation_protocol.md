# PulseVision Empirical Evaluation & Clinical Benchmarking Protocol

## 1. Experimental Methodology

PulseVision provides an empirical validation suite to evaluate remote photoplethysmography accuracy against independently obtained reference instruments (e.g. FDA-cleared finger pulse oximeters, clinical vital signs monitors, ECG Holter sensors).

### 1.1 Synchronization & Manual Entry Protocol
1. The researcher or participant measures reference heart rate using an independent instrument (e.g., pulse oximeter).
2. PulseVision completes a contactless webcam rPPG scan session.
3. The reference BPM ($BPM_{\text{ref}}$), participant code, reference source, and PulseVision BPM ($BPM_{\text{est}}$) are recorded into the `validation_trials` database table.
4. Evaluation metrics are calculated only from actual paired measurements. If no reference data exists, the suite explicitly displays "Insufficient reference data". Zero synthetic reference readings are ever generated.

---

## 2. Statistical Metrics & Accuracy Formulations

### 2.1 Mean Absolute Error (MAE)
Quantifies average magnitude of errors without considering their direction:
$$\text{MAE} = \frac{1}{N} \sum_{i=1}^{N} \left| BPM_{\text{est}, i} - BPM_{\text{ref}, i} \right|$$
*Target*: $\text{MAE} \le 3.5\text{ BPM}$ in resting conditions.

### 2.2 Root Mean Square Error (RMSE)
Penalizes larger outliers more heavily than MAE:
$$\text{RMSE} = \sqrt{\frac{1}{N} \sum_{i=1}^{N} \left( BPM_{\text{est}, i} - BPM_{\text{ref}, i} \right)^2}$$
*Target*: $\text{RMSE} \le 5.0\text{ BPM}$.

### 2.3 Pearson Correlation Coefficient ($r$)
Measures linear association between contactless and reference measurements:
$$r = \frac{\sum_{i=1}^N (x_i - \bar{x})(y_i - \bar{y})}{\sqrt{\sum_{i=1}^N (x_i - \bar{x})^2} \sqrt{\sum_{i=1}^N (y_i - \bar{y})^2}}$$
where $x = BPM_{\text{ref}}$ and $y = BPM_{\text{est}}$.
*Target*: $r \ge 0.85$.

### 2.4 Bland-Altman Agreement Analysis
- **Mean Difference (Bias)**: $\bar{d} = \frac{1}{N} \sum (y_i - x_i)$.
- **Standard Deviation of Difference**: $s_d = \sqrt{\frac{1}{N-1}\sum (d_i - \bar{d})^2}$.
- **95% Limits of Agreement (LoA)**: $[\bar{d} - 1.96 s_d, \; \bar{d} + 1.96 s_d]$.

---

## 3. Failure Taxonomy & Guardrails

PulseVision strictly enforces a **Zero-Fabrication Policy**: when optical conditions fail quality thresholds, the system rejects the measurement and provides a diagnostic explanation.

| Rejection Code | Trigger Condition | Diagnostic Remediation |
|---|---|---|
| `LOW_LIGHTING` | Grayscale mean $< 40$ | Increase ambient room light or face a window/lamp. |
| `OVEREXPOSURE` | Grayscale mean $> 220$ | Avoid direct backlighting and harsh overhead glare. |
| `MOTION_ARTIFACTS` | Frame RMS displacement $> 25.0$ | Keep head stationary during 30s capture period. |
| `FACE_OUT_OF_BOUNDS` | Face width $< 10\%$ or $> 85\%$ frame | Sit 0.5m to 1.0m from webcam, centered in guide. |
| `LOW_SNR_SQI` | SNR $< -6.0\text{ dB}$ or $\text{SQI} < 0.25$ | Reduce facial talking/movement; check for skin occlusion. |
