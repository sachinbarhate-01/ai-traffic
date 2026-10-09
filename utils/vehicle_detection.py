"""Ultralytics vehicle inference helpers for images and uploaded video clips."""

from __future__ import annotations

import math
import os
from functools import lru_cache
from pathlib import Path
from typing import Any

CUSTOM_MODEL_PATH = Path(__file__).resolve().parents[1] / "models" / "best.pt"
FALLBACK_MODEL_NAME = "yolov8n.pt"
VEHICLE_LABELS = {"bicycle", "motorcycle", "car", "bus", "truck"}
MAX_SAMPLED_FRAMES = 120


def configured_model_path(model_path: str | Path | None = None) -> tuple[str, bool]:
    """Choose the configured custom model or the standard pretrained fallback."""
    if model_path is not None:
        return str(model_path), True

    environment_path = os.environ.get("TRAFFIC_MODEL_PATH")
    if environment_path:
        return environment_path, True
    if CUSTOM_MODEL_PATH.is_file():
        return str(CUSTOM_MODEL_PATH), True
    return FALLBACK_MODEL_NAME, False


@lru_cache(maxsize=2)
def _load_model(model_path: str):
    from ultralytics import YOLO

    return YOLO(model_path)


def detect_vehicles(
    image: Any,
    model_path: str | Path | None = None,
    confidence: float = 0.25,
) -> dict[str, Any]:
    """Run inference and return only recognized vehicle classes and counts."""
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
        model = _load_model(selected_path)
        predictions = model.predict(source=image, conf=confidence, verbose=False)
        counts: dict[str, int] = {}
        for prediction in predictions:
            if prediction.boxes is None:
                continue
            names = prediction.names
            for class_id in prediction.boxes.cls.int().tolist():
                label = str(names[int(class_id)]).lower()
                if label in VEHICLE_LABELS:
                    counts[label] = counts.get(label, 0) + 1

        detections = [{"class": label, "count": count} for label, count in sorted(counts.items())]
        return {
            "success": True,
            "detections": detections,
            "counts": counts,
            "error": None,
            "model": selected_path,
            "model_type": "custom" if is_custom else "pretrained_fallback",
        }
    except Exception as error:
        return {
            "success": False,
            "detections": [],
            "counts": {},
            "error": f"Vehicle inference failed: {error}",
            "model": selected_path,
        }


def process_video(video_path: str | Path) -> dict[str, Any]:
    """Sample a bounded number of frames and summarize actual model detections."""
    try:
        import cv2
    except ImportError:
        return {"success": False, "error": "OpenCV is unavailable. Install requirements.txt."}

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        capture.release()
        return {"success": False, "error": "The uploaded video could not be opened."}

    frame_total = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    stride = max(1, math.ceil(frame_total / MAX_SAMPLED_FRAMES)) if frame_total > 0 else 10
    per_frame_totals: list[int] = []
    per_class_totals: dict[str, int] = {}
    frame_index = 0
    inference_error = None

    try:
        while len(per_frame_totals) < MAX_SAMPLED_FRAMES:
            success, frame = capture.read()
            if not success:
                break
            if frame_index % stride == 0:
                result = detect_vehicles(frame)
                if not result["success"]:
                    inference_error = result["error"]
                    break
                frame_counts = result["counts"]
                per_frame_totals.append(sum(frame_counts.values()))
                for label, count in frame_counts.items():
                    per_class_totals[label] = per_class_totals.get(label, 0) + count
            frame_index += 1
    finally:
        capture.release()

    if inference_error:
        return {"success": False, "error": inference_error}
    if not per_frame_totals:
        return {"success": False, "error": "No readable video frames were available for inference."}

    sample_count = len(per_frame_totals)
    class_averages = [
        {"class": label, "count": round(total / sample_count, 2)}
        for label, total in sorted(per_class_totals.items())
    ]
    return {
        "success": True,
        "detections": class_averages,
        "average_vehicle_count": round(sum(per_frame_totals) / sample_count, 2),
        "peak_vehicle_count": max(per_frame_totals),
        "sampled_frames": sample_count,
    }