import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

import app as flask_app
from utils.traffic_density import assess_density
from utils.vehicle_detection import detect_vehicles, process_video


class Scalar:
    def __init__(self, value):
        self.value = value

    def item(self):
        return self.value


class Coordinates(list):
    def tolist(self):
        return list(self)


class FakeBox:
    cls = [Scalar(2)]
    conf = [Scalar(0.91)]
    xyxy = [Coordinates([10, 12, 48, 52])]


class FakePrediction:
    names = {0: "person", 2: "car"}
    boxes = [FakeBox()]


class FakeModel:
    def predict(self, source, **_kwargs):
        return [FakePrediction()]


class TrafficPipelineTests(unittest.TestCase):
    def test_density_threshold_boundaries(self):
        self.assertEqual(assess_density(5), "LOW")
        self.assertEqual(assess_density(6), "MEDIUM")
        self.assertEqual(assess_density(15), "MEDIUM")
        self.assertEqual(assess_density(16), "HIGH")

    def test_detector_returns_class_box_and_confidence(self):
        with patch("utils.vehicle_detection._load_model", return_value=FakeModel()):
            result = detect_vehicles(np.zeros((64, 64, 3), dtype=np.uint8))
        self.assertTrue(result["success"])
        self.assertEqual(result["counts"], {"car": 1})
        self.assertEqual(result["detections"][0]["box"], [10.0, 12.0, 48.0, 52.0])
        self.assertEqual(result["detections"][0]["confidence"], 0.91)

    def test_video_processes_every_frame_and_writes_annotated_output(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            input_path = Path(temporary_directory) / "input.mp4"
            output_path = Path(temporary_directory) / "annotated.mp4"
            writer = cv2.VideoWriter(
                str(input_path), cv2.VideoWriter_fourcc(*"mp4v"), 5, (64, 64)
            )
            self.assertTrue(writer.isOpened(), "OpenCV could not create the test input clip")
            for _ in range(3):
                writer.write(np.zeros((64, 64, 3), dtype=np.uint8))
            writer.release()

            with patch("utils.vehicle_detection._load_model", return_value=FakeModel()):
                result = process_video(input_path, output_path)

            self.assertTrue(result["success"], result.get("error"))
            self.assertEqual(result["frames_processed"], 3)
            self.assertEqual(result["counts"], {"car": 3})
            self.assertEqual(result["vehicle_detections"], 3)
            self.assertTrue(output_path.is_file())

    def test_upload_validation_and_processing_response(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            upload_directory = Path(temporary_directory) / "uploads"
            processed_directory = Path(temporary_directory) / "processed"
            old_upload_directory = flask_app.UPLOAD_DIR
            old_processed_directory = flask_app.PROCESSED_DIR
            flask_app.UPLOAD_DIR = upload_directory
            flask_app.PROCESSED_DIR = processed_directory
            flask_app.app.testing = True
            client = flask_app.app.test_client()
            self.addCleanup(setattr, flask_app, "UPLOAD_DIR", old_upload_directory)
            self.addCleanup(setattr, flask_app, "PROCESSED_DIR", old_processed_directory)
            self.assertEqual(client.get("/").status_code, 200)

            rejected = client.post(
                "/api/upload",
                data={"video": (io.BytesIO(b"video"), "traffic.mov")},
                content_type="multipart/form-data",
            )
            self.assertEqual(rejected.status_code, 400)

            uploaded = client.post(
                "/api/upload",
                data={"video": (io.BytesIO(b"video"), "traffic.mp4")},
                content_type="multipart/form-data",
            )
            self.assertEqual(uploaded.status_code, 200)
            filename = uploaded.get_json()["filename"]
            self.assertTrue((upload_directory / filename).is_file())

            inference_result = {
                "success": True,
                "counts": {"car": 2},
                "vehicle_detections": 2,
                "average_vehicle_count": 1.0,
                "peak_vehicle_count": 1,
                "frames_processed": 2,
            }
            with patch("app.process_video", return_value=inference_result):
                processed = client.post("/api/process", json={"filename": filename})
            self.assertEqual(processed.status_code, 200)
            self.assertEqual(processed.get_json()["density"], "LOW")
            self.assertEqual(processed.get_json()["frames_processed"], 2)

            with patch(
                "app.process_video",
                return_value={"success": False, "error": "Model weights unavailable."},
            ):
                failed = client.post("/api/process", json={"filename": filename})
            self.assertEqual(failed.status_code, 503)
            self.assertFalse(failed.get_json()["success"])
            self.assertNotIn("vehicle_detections", failed.get_json())


if __name__ == "__main__":
    unittest.main()