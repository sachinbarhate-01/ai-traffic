"""Configurable density thresholds and software-only signal timing."""

from __future__ import annotations

from typing import Literal

Density = Literal["LOW", "MEDIUM", "HIGH"]


def assess_density(
    vehicle_count: float,
    low_max: float = 5,
    medium_max: float = 15,
) -> Density:
    """Classify an average sampled-frame vehicle count."""
    if low_max < 0 or medium_max < low_max:
        raise ValueError("Density thresholds must satisfy 0 <= low_max <= medium_max.")
    if vehicle_count <= low_max:
        return "LOW"
    if vehicle_count <= medium_max:
        return "MEDIUM"
    return "HIGH"


def density_thresholds_from_env() -> tuple[float, float]:
    """Read optional density cutoffs from environment variables."""
    import os

    try:
        low_max = float(os.environ.get("TRAFFIC_DENSITY_LOW_MAX", "5"))
        medium_max = float(os.environ.get("TRAFFIC_DENSITY_MEDIUM_MAX", "15"))
    except ValueError as error:
        raise ValueError("Traffic density thresholds must be numeric.") from error
    if low_max < 0 or medium_max < low_max:
        raise ValueError("Density thresholds must satisfy 0 <= low_max <= medium_max.")
    return low_max, medium_max


def signal_timing(density: Density) -> dict[str, int | str]:
    """Return illustrative green/red durations; these are not a real controller."""
    green_seconds = {"LOW": 20, "MEDIUM": 35, "HIGH": 50}[density]
    return {
        "green_seconds": green_seconds,
        "red_seconds": 70 - green_seconds,
        "label": "Prototype simulation only",
    }