"""Flask dashboard for a software-only traffic management prototype."""

from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, jsonify, render_template, request, url_for
from werkzeug.utils import secure_filename

from utils.emergency_corridor import EmergencyCorridor
from utils.traffic_density import assess_density, signal_timing
from utils.vehicle_detection import process_video

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "videos" / "uploads"
ALLOWED_EXTENSIONS = {"mp4", "avi"}
MAX_UPLOAD_BYTES = 100 * 1024 * 1024

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_BYTES
app.config["UPLOAD_FOLDER"] = str(UPLOAD_DIR)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

corridor = EmergencyCorridor()


def allowed_file(filename: str) -> bool:
	return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


@app.get("/")
def home():
	return render_template("index.html")


@app.post("/api/upload")
def upload_video():
	uploaded_file = request.files.get("video")
	if uploaded_file is None or not uploaded_file.filename:
		return jsonify(success=False, error="Choose a video file to upload."), 400
	if not allowed_file(uploaded_file.filename):
		return jsonify(success=False, error="Only MP4 and AVI video files are supported."), 400

	safe_name = secure_filename(uploaded_file.filename)
	if not safe_name:
		return jsonify(success=False, error="The filename is not valid."), 400

	UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
	destination = UPLOAD_DIR / safe_name
	if destination.exists():
		destination = UPLOAD_DIR / f"{destination.stem}_{os.urandom(4).hex()}{destination.suffix}"
	uploaded_file.save(destination)
	return jsonify(
		success=True,
		filename=destination.name,
		message="Upload complete. Run processing to request actual model inference.",
		process_url=url_for("process_video_route", filename=destination.name),
	)


@app.post("/api/process/<path:filename>")
def process_video_route(filename: str):
	safe_name = secure_filename(filename)
	if not safe_name or safe_name != filename or not allowed_file(safe_name):
		return jsonify(success=False, error="Invalid video filename."), 400

	video_path = UPLOAD_DIR / safe_name
	if not video_path.is_file():
		return jsonify(success=False, error="Uploaded video was not found."), 404

	result = process_video(video_path)
	if not result["success"]:
		return jsonify(success=False, error=result["error"]), 503

	density = assess_density(result["average_vehicle_count"])
	return jsonify(
		success=True,
		filename=safe_name,
		detections=result["detections"],
		vehicle_count=result["average_vehicle_count"],
		peak_vehicle_count=result["peak_vehicle_count"],
		sampled_frames=result["sampled_frames"],
		density=density,
		signal=signal_timing(density),
		message="Vehicle counts are based on sampled frames and actual model inference.",
		ambulance_detection="Unavailable: this prototype does not infer ambulances yet.",
	)


@app.get("/api/corridor")
def corridor_status():
	return jsonify(corridor.status())


@app.post("/api/corridor/simulate")
def simulate_emergency():
	data = request.get_json(silent=True) or {}
	direction = data.get("direction", "north")
	try:
		return jsonify(corridor.start_simulation(direction))
	except ValueError as error:
		return jsonify(success=False, error=str(error)), 400


@app.post("/api/corridor/end")
def end_emergency_simulation():
	return jsonify(corridor.end_simulation())


@app.errorhandler(413)
def upload_too_large(_error):
	return jsonify(success=False, error="Video exceeds the 100 MB upload limit."), 413


if __name__ == "__main__":
	app.run(debug=os.environ.get("FLASK_DEBUG", "0") == "1")