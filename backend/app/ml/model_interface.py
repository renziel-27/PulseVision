from abc import ABC, abstractmethod
import numpy as np

class RPPGModelAdapter(ABC):
    """Abstract Base Class for all rPPG model adapters."""

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    @abstractmethod
    def version(self) -> str:
        pass

    @property
    @abstractmethod
    def is_loaded(self) -> bool:
        pass

    @abstractmethod
    def predict(self, input_data, fs: float = 30.0) -> dict:
        """
        Executes model inference.
        Returns dict containing:
        - bpm: estimated heart rate (float)
        - waveform: pulse signal list
        - confidence: confidence score (float)
        - latency_ms: processing latency (float)
        """
        pass
