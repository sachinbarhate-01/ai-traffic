"""Exclusive OpenCV camera capture and live vehicle-analysis streaming."""

from __future__ import annotations

import os
from threading import Lock
from typing import Any, Callable

from utils.traffic_density import assess_density, density_thresholds_from_env, signal_timing
from utils.vehicle_detection import detect_vehicles


class LiveCameraManager:
    """Own at most one camera capture and publish YOLO-annotated MJPEG frames."""

    def __init__(self, capture_factory: Callable[[int], Any] | None = None) -> None:
        self._capture_factory = capture_factory
        self._capture_lock = Lock()
        self._stream_lock = Lock()
        self._state_lock = Lock()
        self._capture: Any = None
        self._active = False
        self._state: dict[str, Any] = {
            "active": False,
            "connected": False,
            "status": "stopped",
            "camera_index": None,
            "message": "USB camera is stopped.",
            "error": None,
            "frame_vehicle_count": None,
            "counts": {},
            "density": None,
            "signal": None,
        }

    def status(self) -> dict[str, Any]:
        with self._state_lock:
            return dict(self._state)

    def _update_state(self, **updates: Any) -> None:
        with self._state_lock:
            self._state.update(updates)

    def start(self) -> dict[str, Any]:
        with self._capture_lock:
            if self._active:
                return {
                    **self.status(),
                    "success": False,
                    "error": "USB live capture is already running.",
                }

            try:
                camera_index = int(os.environ.get("TRAFFIC_CAMERA_INDEX", "0"))
            except ValueError:
                message = "TRAFFIC_CAMERA_INDEX must be a whole number such as 0 or 1."
                self._update_state(
                    active=False, connected=False, status="error", message=message, error=message
                )
                return {**self.status(), "success": False, "error": message}

            try:
                if self._capture_factory is None:
                    import cv2

                    capture = cv2.VideoCapture(camera_index)
                else:
                    capture = self._capture_factory(camera_index)
                if not capture.isOpened():
                    capture.release()
                    message = (
                        f"USB camera device {camera_index} is unavailable. Connect the phone "
                        "through a USB webcam app/camera bridge, then check the device index."
                    )
                    self._update_state(
                        active=False,
                        connected=False,
                        status="unavailable",
                        camera_index=camera_index,
                        message=message,
                        error=message,
                    )
                    return {**self.status(), "success": False, "error": message}
            except Exception as error:
                message = f"Could not open USB camera device {camera_index}: {error}"
                self._update_state(
                    active=False,
                    connected=False,
                    status="unavailable",
                    camera_index=camera_index,
                    message=message,
                    error=message,
                )
                return {**self.status(), "success": False, "error": message}

            self._capture = capture
            self._active = True
            self._update_state(
                active=True,
                connected=True,
                status="connecting",
                camera_index=camera_index,
                message=f"Connected to OpenCV camera device {camera_index}; waiting for frames.",
                error=None,
                frame_vehicle_count=None,
                counts={},
                density=None,
                signal=None,
            )
            return {**self.status(), "success": True}

    def stop(self) -> dict[str, Any]:
        self._release_capture()
        self._update_state(
            active=False,
            connected=False,
            status="stopped",
            message="USB live video stopped; camera resource released.",
            error=None,
            frame_vehicle_count=None,
            counts={},
            density=None,
            signal=None,
        )
        return {**self.status(), "success": True}

    def _release_capture(self) -> None:
        with self._capture_lock:
            self._active = False
            capture = self._capture
            self._capture = None
            if capture is not None:
                capture.release()

    def claim_stream(self) -> bool:
        return self._stream_lock.acquire(blocking=False)

    def release_stream(self) -> None:
        if self._stream_lock.locked():
            self._stream_lock.release()

    def _fail_stream(self, message: str) -> None:
        self._release_capture()
        self._update_state(
            active=False,
            connected=False,
            status="error",
            message=message,
            error=message,
        )

    def stream_frames(self):
        """Yield MJPEG parts containing frames annotated by actual model inference."""
        try:
            import cv2
        except ImportError:
            self._fail_stream("OpenCV is unavailable. Install the project requirements.")
            self.release_stream()
            return

        try:
            while True:
                with self._capture_lock:
                    capture = self._capture if self._active else None
                    if capture is None:
                        break
                    success, frame = capture.read()

                if not success:
                    self._fail_stream(
                        "The USB camera stopped returning frames. Check its connection and restart live video."
                    )
                    break

                result = detect_vehicles(frame)
                if not result["success"]:
                    self._fail_stream(result["error"])
                    break

                detections = result["detections"]
                frame_count = len(detections)
                for detection in detections:
                    x1, y1, x2, y2 = (int(value) for value in detection["box"])
                    label = f"{detection['class']} {detection['confidence']:.2f}"
                    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 220, 255), 2)
                    cv2.putText(
                        frame,
                        label,
                        (x1, max(18, y1 - 7)),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        0.55,
                        (0, 220, 255),
                        2,
                    )
                cv2.putText(
                    frame,
                    f"Vehicles in frame: {frame_count}",
                    (12, 28),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.75,
                    (255, 255, 255),
                    2,
                )

                try:
                    low_max, medium_max = density_thresholds_from_env()
                    density = assess_density(frame_count, low_max, medium_max)
                except ValueError as error:
                    self._fail_stream(str(error))
                    break
                signal = signal_timing(density)
                with self._capture_lock:
                    if not self._active or self._capture is None:
                        break
                    camera_index = self.status()["camera_index"]
                    self._update_state(
                        status="streaming",
                        message=f"Live inference active on camera {camera_index}.",
                        frame_vehicle_count=frame_count,
                        counts=result["counts"],
                        density=density,
                        signal=signal,
                        error=None,
                    )

                encoded, buffer = cv2.imencode(".jpg", frame)
                if not encoded:
                    self._fail_stream("OpenCV could not encode the annotated camera frame.")
                    break
                yield (
                    b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
                    + buffer.tobytes()
                    + b"\r\n"
                )
        finally:
            if self.status()["active"]:
                self.stop()
            self.release_stream()