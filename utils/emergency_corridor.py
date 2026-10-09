"""A small state machine for explicitly simulated emergency priority."""

from __future__ import annotations

VALID_DIRECTIONS = {"north", "south", "east", "west"}


class EmergencyCorridor:
    """Track normal traffic and a user-started, non-detection demo simulation."""

    def __init__(self) -> None:
        self._active = False
        self._direction: str | None = None

    def status(self) -> dict[str, object]:
        if self._active:
            return {
                "mode": "simulated_emergency",
                "active": True,
                "simulated": True,
                "ambulance_detected": False,
                "direction": self._direction,
                "signal_priority": self._direction,
                "message": "Demo simulation active; no ambulance was detected.",
            }
        return {
            "mode": "normal",
            "active": False,
            "simulated": False,
            "ambulance_detected": False,
            "direction": None,
            "signal_priority": None,
            "message": "Normal traffic mode. Ambulance detection is unavailable.",
        }

    def start_simulation(self, direction: str) -> dict[str, object]:
        normalized = str(direction).lower()
        if normalized not in VALID_DIRECTIONS:
            raise ValueError("Direction must be north, south, east, or west.")
        self._active = True
        self._direction = normalized
        return {"success": True, **self.status()}

    def end_simulation(self) -> dict[str, object]:
        self._active = False
        self._direction = None
        return {"success": True, **self.status()}