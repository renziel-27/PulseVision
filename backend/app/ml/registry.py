from typing import Dict, Any, List
from app.ml.models.tscan_1d import TSCAN1DAdapter
from app.ml.models.tscan_2d import TSCAN2DAdapter
from app.ml.models.deepphys import DeepPhysAdapter

class MLRegistry:
    def __init__(self):
        self._models = {
            "tscan_1d": TSCAN1DAdapter(),
            "tscan_2d": TSCAN2DAdapter(),
            "deepphys": DeepPhysAdapter()
        }

    def get_model(self, model_key: str):
        return self._models.get(model_key.lower())

    def list_models(self) -> List[Dict[str, Any]]:
        result = []
        for k, m in self._models.items():
            result.append({
                "key": k,
                "name": m.name,
                "version": m.version,
                "status": "Ready (Trained Weights Loaded)" if m.is_loaded else "Not installed (Training Required)",
                "is_loaded": m.is_loaded
            })
        return result

    def get_status(self) -> Dict[str, Any]:
        return {
            "available_models": self.list_models(),
            "classical_algorithms": ["POS (Wang et al. 2017)", "CHROM (de Haan et al. 2013)", "GREEN channel"],
            "hardware": "Apple Silicon (MPS / CPU)"
        }

ml_registry = MLRegistry()
