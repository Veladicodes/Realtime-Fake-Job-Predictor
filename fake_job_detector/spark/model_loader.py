"""Utilities for loading and using the trained fraud model artifacts."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Tuple

import joblib
from scipy.sparse import csr_matrix, hstack


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_PATH = PROJECT_ROOT / "ml" / "saved_model" / "fraud_model.pkl"
DEFAULT_TFIDF_PATH = PROJECT_ROOT / "ml" / "saved_model" / "tfidf.pkl"


def _resolve_path(path_value: str | Path) -> Path:
    """Resolve relative paths against project root and return absolute path."""
    path = Path(path_value)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    return path.resolve()


@lru_cache(maxsize=1)
def load_model_and_vectorizer(
    model_path: str | Path = DEFAULT_MODEL_PATH,
    tfidf_path: str | Path = DEFAULT_TFIDF_PATH,
) -> Tuple[Any, Any]:
    """Load model and TF-IDF artifacts once per Python process."""
    resolved_model_path = _resolve_path(model_path)
    resolved_tfidf_path = _resolve_path(tfidf_path)

    if not resolved_model_path.exists():
        raise FileNotFoundError(f"Model file not found: {resolved_model_path}")
    if not resolved_tfidf_path.exists():
        raise FileNotFoundError(f"TF-IDF file not found: {resolved_tfidf_path}")

    model = joblib.load(resolved_model_path)
    tfidf = joblib.load(resolved_tfidf_path)
    return model, tfidf


def build_feature_vector(text: str, model: Any, tfidf: Any):
    """Build an inference-ready feature vector aligned to model input shape."""
    clean_text = (text or "").strip().lower()
    base_vector = tfidf.transform([clean_text])

    expected_features = getattr(model, "n_features_in_", None)
    if expected_features is None or expected_features == base_vector.shape[1]:
        return base_vector

    # Training pipeline may include 3 engineered numeric features.
    if expected_features == base_vector.shape[1] + 3:
        has_company_profile = 1 if clean_text else 0
        has_salary_range = 1 if any(ch.isdigit() for ch in clean_text) else 0
        text_length = float(len(clean_text))
        extra_features = csr_matrix(
            [[has_company_profile, has_salary_range, text_length]],
            dtype="float64",
        )
        return hstack([base_vector, extra_features], format="csr")

    # Generic fallback for shape mismatches: pad or truncate to expected size.
    if expected_features > base_vector.shape[1]:
        pad_width = expected_features - base_vector.shape[1]
        padding = csr_matrix((1, pad_width), dtype="float64")
        return hstack([base_vector, padding], format="csr")

    return base_vector[:, :expected_features]


def predict_job(text: str):
    """
    Predict fraud class from a raw text input.

    Returns:
        tuple[int, float]: (prediction, confidence)
    """
    if text is None or not str(text).strip():
        return 0, 0.0

    try:
        model, tfidf = load_model_and_vectorizer()
        vector = build_feature_vector(str(text), model, tfidf)

        pred = int(model.predict(vector)[0])
        confidence = 0.0
        if hasattr(model, "predict_proba"):
            probs = model.predict_proba(vector)[0]
            classes = list(getattr(model, "classes_", []))
            if classes and pred in classes:
                confidence = float(probs[classes.index(pred)])
            else:
                confidence = float(max(probs))

        return pred, confidence
    except Exception:
        return 0, 0.0


def load_spark_model(model_path: str | Path = DEFAULT_MODEL_PATH):
    """Compatibility helper to load only model artifact."""
    model, _ = load_model_and_vectorizer(model_path=model_path)
    return model
