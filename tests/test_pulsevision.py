import os
import sys
import unittest
import numpy as np
import torch

# Add backend directory to sys.path
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend"))

from database import (
    init_db, register_user, authenticate_user,
    save_validation_trial, get_validation_trials,
    save_scan_record, get_user_scans, log_sms, get_sms_logs
)
from rppg_engine import RPPGEngine
from fatigue_stress import FatigueAndStressAnalyzer
from model import load_or_create_model
from sms_service import validate_phone_number, format_health_sms

class TestPulseVisionSystem(unittest.TestCase):

    @classmethod
    def setUpClass(cls):
        init_db()

    def test_database_user_auth(self):
        test_email = "tester_unit@pulsevision.ai"
        reg = register_user("Unit Tester", test_email, "+15551234567", "securepass123")
        # Should succeed or report already registered
        self.assertTrue("success" in reg)

        auth = authenticate_user(test_email, "securepass123")
        self.assertTrue(auth["success"])
        self.assertEqual(auth["user"]["name"], "Unit Tester")

    def test_phone_number_validation(self):
        self.assertTrue(validate_phone_number("+15551234567"))
        self.assertTrue(validate_phone_number("9876543210"))
        self.assertTrue(validate_phone_number("+91 98765 43210"))
        self.assertFalse(validate_phone_number("abc-phone"))
        self.assertFalse(validate_phone_number("123")) # Too short

    def test_validation_trials_and_stats(self):
        trial = save_validation_trial(
            user_id=1,
            condition="Resting Condition",
            reference_bpm=74.0,
            pulsevision_bpm=73.0,
            algorithm="POS",
            signal_quality=0.92,
            trial_name="Unit Test Trial"
        )
        self.assertEqual(trial["absolute_error"], 1.0)

        trials = get_validation_trials(user_id=1)
        self.assertGreaterEqual(len(trials), 1)

    def test_rppg_algorithms_pos_and_chrom(self):
        engine = RPPGEngine(buffer_size=150, fps=30)
        # Create synthetic 72 BPM pulse signal (1.2 Hz)
        t = np.linspace(0, 5, 150)
        pulse = np.sin(2 * np.pi * 1.2 * t)
        
        # Simulated RGB
        rgb_data = []
        for i in range(150):
            r = 180.0 - 1.0 * pulse[i]
            g = 120.0 - 3.0 * pulse[i]
            b = 90.0 - 1.5 * pulse[i]
            rgb_data.append(np.array([r, g, b]))
            engine.add_frame_sample(np.array([r, g, b]))

        # Test POS
        pos_signal = engine.compute_pos(rgb_data)
        self.assertEqual(len(pos_signal), 150)

        # Test CHROM
        chrom_signal = engine.compute_chrom(rgb_data)
        self.assertEqual(len(chrom_signal), 150)

        # Test Butterworth Bandpass Filter
        filtered = engine.bandpass_filter(pos_signal)
        self.assertEqual(len(filtered), 150)

        # Test BPM Estimation
        stats = engine.estimate_bpm_and_sqi(filtered)
        self.assertTrue(stats["is_valid"])
        # Should be within 3 BPM of 72.0
        self.assertAlmostEqual(stats["bpm"], 72.0, delta=4.0)

    def test_fatigue_and_stress_engine(self):
        analyzer = FatigueAndStressAnalyzer()

        # Test open eye points (EAR ~0.30)
        open_eye = [[0, 10], [5, 5], [15, 5], [20, 10], [15, 15], [5, 15]]
        ear_open = analyzer.calculate_ear(open_eye)
        self.assertGreater(ear_open, 0.25)

        # Test closed eye points (EAR < 0.15)
        closed_eye = [[0, 10], [5, 9], [15, 9], [20, 10], [15, 11], [5, 11]]
        ear_closed = analyzer.calculate_ear(closed_eye)
        self.assertLess(ear_closed, 0.20)

        res = analyzer.process_landmarks(open_eye, open_eye, motion_delta=0.5, current_bpm=72.0)
        self.assertIn("fatigue_level", res)
        self.assertIn("stress_score", res)
        self.assertEqual(res["fatigue_level"], "Normal")

    def test_deep_learning_tscan_model(self):
        model_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend", "models", "rppg_tscan_best.pth")
        model = load_or_create_model(model_path)
        model.eval()

        dummy_input = torch.randn(2, 3, 150)
        with torch.no_grad():
            pulse, bpm = model(dummy_input)

        self.assertEqual(pulse.shape, (2, 150))
        self.assertEqual(bpm.shape, (2, 1))

    def test_sms_formatting(self):
        msg = format_health_sms("Alex", 74.0, "Normal Range", "Low (Relaxed)", "Normal")
        self.assertIn("PulseVision", msg)
        self.assertIn("74.0 BPM", msg)
        self.assertIn("Prototype only", msg)

if __name__ == "__main__":
    unittest.main(verbosity=2)
