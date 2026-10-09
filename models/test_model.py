
from pathlib import Path
from ultralytics import YOLO

project = Path(__file__).resolve().parent

# Your current nested folder structure
model_path = project / "models" / "best.pt"

print("Checking:", model_path)
print("Is file:", model_path.is_file())
print("Is directory:", model_path.is_dir())

if model_path.is_file():
    model = YOLO(str(model_path))
    print("Model loaded successfully!")
    print("Classes:", model.names)

elif model_path.is_dir():
    print("This path is a folder, not a .pt model file.")
    print("Find the original best.pt file from the training output.")

else:
    print("Model path not found.")

