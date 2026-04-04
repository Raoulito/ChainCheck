"""Simple anomaly detection using mean + stddev (>2 sigma flagged)."""
import math
from decimal import Decimal


def detect_anomalies(
    values: list[Decimal],
    timestamps: list[int],
    sigma_threshold: float = 2.0,
) -> list[dict]:
    """Detect anomalous values that are > sigma_threshold standard deviations from mean.

    Returns list of {"index": int, "value": str, "timestamp": int, "z_score": float}.
    """
    if len(values) < 3:
        return []

    float_values = [float(v) for v in values]
    mean = sum(float_values) / len(float_values)
    variance = sum((x - mean) ** 2 for x in float_values) / len(float_values)
    stddev = math.sqrt(variance)

    if stddev == 0:
        return []

    anomalies = []
    for i, (val, ts) in enumerate(zip(float_values, timestamps)):
        z_score = abs(val - mean) / stddev
        if z_score > sigma_threshold:
            anomalies.append({
                "index": i,
                "value": str(values[i]),
                "timestamp": ts,
                "z_score": round(z_score, 2),
            })

    return anomalies
