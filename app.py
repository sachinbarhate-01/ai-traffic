import os
from pathlib import Path
from uuid import uuid4

from flask import Flask, jsonify, render_template, request, send_from_directory
from werkzeug.utils import secure_filename

from utils.emergency_corridor import EmergencyCorridor
from utils.traffic_density import assess_density, density_thresholds_from_env
from utils.vehicle_detection import process_video

app = Flask(__name__)
PROJECT_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = PROJECT_DIR / "videos" / "uploads"
PROCESSED_DIR = PROJECT_DIR / "videos" / "processed"
ALLOWED_EXTENSIONS = {"mp4", "avi"}
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
corridor = EmergencyCorridor()


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@app.get("/")
def home():
    return render_template("index.html")


@app.post("/api/upload")
def upload_video():
    uploaded_file = request.files.get("video")
    if uploaded_file is None or not uploaded_file.filename:
        return jsonify(success=False, error="Select a video before uploading."), 400
    if not allowed_file(uploaded_file.filename):
        return jsonify(success=False, error="Only MP4 and AVI video files are supported."), 400

    safe_name = secure_filename(uploaded_file.filename)
    if not safe_name:
        return jsonify(success=False, error="The video filename is invalid."), 400
    unique_name = f"{uuid4().hex}_{safe_name}"
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    uploaded_file.save(UPLOAD_DIR / unique_name)
    return jsonify(
        success=True,
        filename=unique_name,
        status="uploaded",
        message="Upload complete. Start processing to run YOLO inference.",
    )


@app.post("/api/process")
def process_uploaded_video():
    data = request.get_json(silent=True) or {}
    filename = data.get("filename", "")
    safe_name = secure_filename(filename)
    if not safe_name or safe_name != filename or not allowed_file(safe_name):
        return jsonify(success=False, error="Invalid uploaded video filename."), 400

    source_path = UPLOAD_DIR / safe_name
    if not source_path.is_file():
        return jsonify(success=False, error="Uploaded video was not found. Upload it again."), 404

    output_name = f"{Path(safe_name).stem}_annotated_{uuid4().hex[:8]}.mp4"
    output_path = PROCESSED_DIR / output_name
    try:
        result = process_video(source_path, output_path)
    except Exception as error:
        output_path.unlink(missing_ok=True)
        return jsonify(success=False, error=f"Video processing failed: {error}"), 500
    if not result["success"]:
        return jsonify(success=False, error=result["error"]), 503

    try:
        low_max, medium_max = density_thresholds_from_env()
        density = assess_density(
            result["average_vehicle_count"], low_max=low_max, medium_max=medium_max
        )
    except ValueError as error:
        output_path.unlink(missing_ok=True)
        return jsonify(success=False, error=str(error)), 500

    return jsonify(
        success=True,
        status="completed",
        message="Inference completed on every decoded frame.",
        counts=result["counts"],
        vehicle_detections=result["vehicle_detections"],
        average_vehicle_count=result["average_vehicle_count"],
        peak_vehicle_count=result["peak_vehicle_count"],
        frames_processed=result["frames_processed"],
        density=density,
        density_thresholds={"low_max": low_max, "medium_max": medium_max},
        annotated_video_url=f"/processed/{output_name}",
    )


@app.get("/processed/<path:filename>")
def get_processed_video(filename):
    safe_name = secure_filename(filename)
    if not safe_name or safe_name != filename:
        return jsonify(success=False, error="Invalid processed video filename."), 400
    return send_from_directory(PROCESSED_DIR, safe_name, mimetype="video/mp4")


@app.get("/api/corridor")
def corridor_status():
    return jsonify(corridor.status())


@app.post("/api/corridor/simulate")
def simulate_corridor():
    data = request.get_json(silent=True) or {}
    try:
        return jsonify(corridor.start_simulation(data.get("direction", "north")))
    except ValueError as error:
        return jsonify(success=False, error=str(error)), 400


@app.post("/api/corridor/end")
def end_corridor_simulation():
    return jsonify(corridor.end_simulation())


@app.errorhandler(413)
def upload_too_large(_error):
    return jsonify(success=False, error="Video exceeds the 100 MB upload limit."), 413


if __name__ == "__main__":
    app.run(debug=os.environ.get("FLASK_DEBUG", "0") == "1")