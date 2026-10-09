# Model Weights

Train the ambulance-capable custom YOLO model separately in Google Colab (see [colab/README.md](../colab/README.md)). After training, download `best.pt` from the run's `weights` folder and place it directly in this directory:

```text
models/best.pt
```

Model weights are intentionally excluded from Git. Without this file, standard vehicle inference falls back to Ultralytics' pretrained `yolov8n.pt` model. That fallback is not an ambulance detector. The current prototype does not run ambulance inference, even when a custom file is present; connecting validated ambulance inference to corridor control remains a TODO.