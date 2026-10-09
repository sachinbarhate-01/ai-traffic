# Train the Custom YOLO Model in Google Colab

Training is intended to happen in Google Colab, not on the local laptop. The Flask app does not train models, fetch datasets, or download training data. Open a Colab notebook, install Ultralytics there, and upload or mount your labelled dataset.

## Dataset Layout

YOLO detection data should use matching image and label filenames and normalized bounding boxes:

```text
traffic_dataset/
|-- images/
|   |-- train/
|   `-- val/
`-- labels/
    |-- train/
    `-- val/
```

Each label text file contains one object per line in `class_id x_center y_center width height` format. Coordinates are normalized to the image dimensions. Include diverse, correctly labelled ambulance images in both training and validation data; every ambulance must have a bounding box. Add other vehicle classes if desired.

Create `data.yaml` with paths and class names that exactly match the dataset's numeric class IDs:

```yaml
path: /content/traffic_dataset
train: images/train
val: images/val
names:
  0: ambulance
  1: car
  2: bus
  3: truck
  4: motorcycle
```

Change the mapping to match your actual labels. If your dataset has only ambulance class labels, use just that class. Do not reuse this example mapping unless the annotation IDs really match it. Check label quality and class balance before training.

## Example Colab Commands

```python
!pip install "ultralytics>=8.3,<9.0"
from ultralytics import YOLO

model = YOLO("yolov8n.pt")
model.train(data="/content/data.yaml", epochs=50, imgsz=640, batch=16)
```

Tune epochs, image size, batch size, and model size to the dataset and available Colab GPU. Review validation metrics and inspect predictions before using the model. `best.pt` is written to a run folder similar to `/content/runs/detect/train/weights/best.pt`.

## Download the Weights

```python
from google.colab import files
files.download("/content/runs/detect/train/weights/best.pt")
```

Place the downloaded file at `models/best.pt` in this project. The app's standard pretrained fallback is intended for common vehicle classes and must not be treated as ambulance detection. A trained ambulance model alone is not enough to safely control signals; validation, false-positive handling, and explicit operator safeguards are needed before even a realistic prototype integration.