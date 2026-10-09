"""Ultralytics vehicle inference helpers for images and uploaded video clips."""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from threading import Lock
from typing import Any

CUSTOM_MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "best.pt"
DEFAULT_MODEL_NAME = "yolo11n.pt"
VEHICLE_LABELS = {"motorcycle", "car", "bus", "truck"}
INFERENCE_LOCK = Lock()


def configured_model_path(model_path: str | Path | None = None) -> tuple[str, bool]:
    """Choose an explicit model, configured model, custom model, or lightweight default."""
    if model_path is not None:
        return str(model_path), True

    environment_path = os.environ.get("TRAFFIC_MODEL_PATH")
    if environment_path:
        return environment_path, True
    if CUSTOM_MODEL_PATH.is_file():
        return str(CUSTOM_MODEL_PATH), True
    return DEFAULT_MODEL_NAME, False


@lru_cache(maxsize=2)
def _load_model(model_path: str):
    from ultralytics import YOLO

    return YOLO(model_path)


def detect_vehicles(
    image: Any,
    model_path: str | Path | None = None,
    confidence: float = 0.25,
) -> dict[str, Any]:
    """Run YOLO inference and return detected vehicle labels, boxes, and counts."""
    selected_path, is_custom = configured_model_path(model_path)
    if is_custom and not Path(selected_path).is_file():
        return {
            "success": False,
            "detections": [],
            "counts": {},
            "error": f"Model file not found: {selected_path}",
            "model": selected_path,
        }

    try:
        with INFERENCE_LOCK:
            model = _load_model(selected_path)
            predictions = model.predict(source=image, conf=confidence, verbose=False)
        counts: dict[str, int] = {}
        detections: list[dict[str, Any]] = []
        for prediction in predictions:
            if prediction.boxes is None:
                continue
            names = prediction.names
            for box in prediction.boxes:
                class_id = int(box.cls[0].item())
                label = str(names[class_id]).lower()
                if label in VEHICLE_LABELS:
                    counts[label] = counts.get(label, 0) + 1
                    coordinates = [round(float(value), 1) for value in box.xyxy[0].tolist()]
                    detections.append({
                        "class": label,
                        "confidence": round(float(box.conf[0].item()), 3),
                        "box": coordinates,
                    })
        return {
            "success": True,
            "detections": detections,
            "counts": counts,
            "error": None,
            "model": selected_path,
            "model_type": "custom" if is_custom else "pretrained",
        }
    except Exception as error:
        return {
            "success": False,
            "detections": [],
            "counts": {},
            "error": (
                f"Unable to run vehicle inference with '{selected_path}'. "
                "Check that Ultralytics is installed and the model weights are available. "
                f"Details: {error}"
            ),
            "model": selected_path,
        }


def process_video(video_path: str | Path, output_path: str | Path) -> dict[str, Any]:
    """Run inference on every frame and save a video annotated with real detections."""
    try:
        import cv2
    except ImportError:
        return {"success": False, "error": "OpenCV is unavailable. Install requirements.txt."}

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        capture.release()
        return {"success": False, "error": "The uploaded video could not be opened."}

    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    if width <= 0 or height <= 0:
        capture.release()
        return {"success": False, "error": "The uploaded video has invalid frame dimensions."}
    if not fps or fps <= 0:
        fps = 25.0

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    writer = cv2.VideoWriter(
        str(output_path), cv2.VideoWriter_fourcc(*"mp4v"), fps, (width, height)
    )
    if not writer.isOpened():
        capture.release()
        return {"success": False, "error": "OpenCV could not create the annotated MP4 output."}

    class_totals: dict[str, int] = {}
    frame_count = 0
    detection_total = 0
    peak_frame_count = 0

    try:
        while True:
            success, frame = capture.read()
            if not success:
                break
            result = detect_vehicles(frame)
            if not result["success"]:
                capture.release()
                writer.release()
                output_path.unlink(missing_ok=True)
                return {"success": False, "error": result["error"]}

            frame_detections = result["detections"]
            frame_vehicle_count = len(frame_detections)
            detection_total += frame_vehicle_count
            peak_frame_count = max(peak_frame_count, frame_vehicle_count)
            for label, count in result["counts"].items():
                class_totals[label] = class_totals.get(label, 0) + count

            for detection in frame_detections:
                x1, y1, x2, y2 = (int(value) for value in detection["box"])
                label = f"{detection['class']} {detection['confidence']:.2f}"
                cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 220, 255), 2)
                cv2.putText(
                    frame, label, (x1, max(18, y1 - 7)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 220, 255), 2,
                )
            cv2.putText(
                frame, f"Vehicles in frame: {frame_vehicle_count}", (12, 28),
                cv2.FONT_HERSHEY_SIMPLEX, 0.75, (255, 255, 255), 2,
            )
            writer.write(frame)
            frame_count += 1
    finally:
        capture.release()
        writer.release()

    if frame_count == 0:
        output_path.unlink(missing_ok=True)
        return {"success": False, "error": "No readable video frames were available for inference."}

    return {
        "success": True,
        "counts": class_totals,
        "vehicle_detections": detection_total,
        "average_vehicle_count": round(detection_total / frame_count, 2),
        "peak_vehicle_count": peak_frame_count,
        "frames_processed": frame_count,
        "output_path": str(output_path),
    }