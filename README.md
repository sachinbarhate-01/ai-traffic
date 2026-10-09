# AI Traffic Management with Emergency Green Corridor

A beginner-friendly Flask prototype for vehicle detection, traffic-density estimation, adaptive signal timing, and a software-only emergency green-corridor simulation. No physical traffic infrastructure is controlled.

## Features

- Upload MP4 or AVI clips (maximum 100 MB) and run sampled-frame vehicle inference.
- Use a custom Ultralytics model at `models/best.pt` when available; otherwise use the standard pretrained `yolov8n.pt` vehicle classes.
- Estimate LOW, MEDIUM, or HIGH density from actual sampled detections and show prototype signal timing.
- Demonstrate an emergency priority state with a direction selector. This control is simulation only and does not detect an ambulance.
- The dashboard accepts video uploads from mobile browsers. Webcam/live-camera processing is a TODO and is not presented as implemented.

## Project Structure

```text
ai-traffic/
|-- app.py
|-- requirements.txt
|-- models/                 # Place your separately trained best.pt here
|-- templates/index.html
|-- static/css/style.css
|-- static/js/script.js
|-- utils/
|   |-- vehicle_detection.py
|   |-- traffic_density.py
|   `-- emergency_corridor.py
|-- videos/                 # Runtime uploads; ignored by Git
`-- colab/README.md          # Google Colab training guide
```

## Local Setup

Python 3.10 or newer is recommended. From the project folder:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
python app.py
```

Then open http://127.0.0.1:5000. On macOS/Linux, activate with `source .venv/bin/activate` and use `python3` if needed.

The application does not download datasets or train a model. Ultralytics may retrieve its small pretrained `yolov8n.pt` weights the first time fallback inference is requested, if those weights are not cached. To prevent network/model access, configure and provide a local model and use an offline environment; inference will otherwise return a clear error.

## Model Setup

Train the custom model in Google Colab using the guide in [colab/README.md](colab/README.md). Download the resulting `best.pt` and place it at `models/best.pt`. See [models/README.md](models/README.md). Set `TRAFFIC_MODEL_PATH` to use a different local model path.

The custom model's class names must match the labels used in its dataset. Standard COCO-pretrained YOLO weights do not provide reliable ambulance detection. This starter reports ambulance inference as unavailable; it must not be interpreted as detecting an ambulance. The emergency control is a clearly labelled, manually started demo simulation only.

## Prototype Limits and TODOs

- Vehicle counts summarize a limited set of evenly sampled frames; they are not a live traffic measurement.
- Webcam/live-camera capture and ambulance inference/verification are TODOs.
- Signal durations and corridor state are demonstrations, not validated traffic-control logic.
- Do not connect this prototype to real roads, signal controllers, or emergency dispatch systems.
- Uploaded clips are stored under `videos/uploads/`; remove them when no longer needed.

## GitHub Push

The repository already exists locally; these commands do not initialize it or create a commit automatically:

```powershell
git status
git add .
git commit -m "Create AI traffic management prototype"
git push -u origin main
```

Review `git status` before staging. Large model weights, datasets, uploaded videos, secrets, and virtual environments are excluded by `.gitignore`.