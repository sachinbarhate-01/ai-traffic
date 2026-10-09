# AI Traffic Management with Emergency Green Corridor

A beginner-friendly Flask prototype for vehicle detection, traffic-density estimation, adaptive signal timing, and a software-only emergency green-corridor simulation. No physical traffic infrastructure is controlled.

## Features

- Upload MP4, AVI, or MOV clips (maximum 100 MB by default) and run YOLO inference on every decoded video frame.
- Connect an Android phone through a compatible USB webcam app/camera bridge, select its OpenCV camera index, and run live inference with annotated frames.
- Use the lightweight pretrained Ultralytics `yolo11n.pt` model by default, or configure a custom model at `models/best.pt`.
- Filter detections to car, motorcycle, bus, and truck; return actual counts and generate an annotated video with bounding boxes and confidence labels.
- Estimate LOW, MEDIUM, or HIGH density from average detections per frame and show prototype signal timing.
- Demonstrate an emergency priority state with a direction selector. This control is simulation only and does not detect an ambulance.
- The dashboard has exactly two video input modes: laptop file upload and Android USB webcam bridge.

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
If port 5000 is already in use, set `$env:PORT = "5001"` before `python app.py` and open http://127.0.0.1:5001.

The application does not download datasets or train a model. Ultralytics may retrieve the pretrained `yolo11n.pt` weights the first time inference is requested, if they are not cached. If model loading or inference fails, processing returns a clear error and does not report detection results.

## USB Mobile Camera

A USB cable alone does not expose an Android phone as a Windows webcam. Install and run a compatible Android USB webcam app and its required Windows camera bridge/driver, connect the phone, and verify that Windows/OpenCV can see the virtual camera. Then select the matching OpenCV index in PowerShell before launching Flask:

```powershell
$env:TRAFFIC_CAMERA_INDEX = "0"
python app.py
```

Try another index such as `1` if the bridge appears as a different device. The app opens the camera with `cv2.VideoCapture(camera_index)`, permits only one active capture, and releases it when stopped or if the stream fails. Live camera frames use the same YOLO detection and density functions as uploaded video. The virtual signal timing is a software-only plan.

The upload cap can be changed before startup, for example `$env:TRAFFIC_MAX_UPLOAD_MB = "200"`. Density cutoffs remain configurable with `TRAFFIC_DENSITY_LOW_MAX` and `TRAFFIC_DENSITY_MEDIUM_MAX`.

## Model Setup

Train the custom model in Google Colab using the guide in [colab/README.md](colab/README.md). Download the resulting `best.pt` and place it at `models/best.pt`. See [models/README.md](models/README.md). Set `TRAFFIC_MODEL_PATH` to use another local model path. To adjust density thresholds in PowerShell, set `TRAFFIC_DENSITY_LOW_MAX` and `TRAFFIC_DENSITY_MEDIUM_MAX` before starting Flask; defaults are 5 and 15 detections per frame.

The custom model's class names must match the labels used in its dataset. Standard COCO-pretrained YOLO weights do not provide reliable ambulance detection. This starter reports ambulance inference as unavailable; it must not be interpreted as detecting an ambulance. The emergency control is a clearly labelled, manually started demo simulation only.

## Prototype Limits and TODOs

- Counts are detection instances across processed frames, not unique tracked vehicles; the same vehicle may count once per frame.
- Ambulance inference/verification is not implemented. Standard pretrained weights are not treated as ambulance detection.
- Signal durations and corridor state are demonstrations, not validated traffic-control logic.
- Do not connect this prototype to real roads, signal controllers, or emergency dispatch systems.
- Uploaded clips are stored under `videos/uploads/`; remove them when no longer needed.

## Tests

Run the focused pipeline tests from the project root:

```powershell
python -m unittest discover -s tests -v
```

To manually test the two dashboard inputs, run `python app.py` and open http://127.0.0.1:5000. For Option 1, select an MP4, AVI, or MOV clip, click **Upload Video**, then **Process Video**. For Option 2, connect a phone webcam bridge, set `$env:TRAFFIC_CAMERA_INDEX = "0"` (or the detected index), then click **Start USB Live Video** and **Stop USB Live Video**. The USB test requires a phone webcam bridge that Windows exposes as a camera device.

## GitHub Push

The repository already exists locally; these commands do not initialize it or create a commit automatically:

```powershell
git status
git add .
git commit -m "Create AI traffic management prototype"
git push -u origin main
```

Review `git status` before staging. Large model weights, datasets, uploaded videos, secrets, and virtual environments are excluded by `.gitignore`.