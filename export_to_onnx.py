"""
Export CNN_9 model (CNNmodel21Epoch15.pt) to ONNX format for use in the InkTeX Chrome extension.

Usage:
    python export_to_onnx.py

Outputs:
    extension/model/model.onnx   -- ONNX model file
    extension/model/classes.json -- class index → label mapping

Requirements:
    pip install torch onnx
"""

import sys
import io
import torch
import json
import os

from NEW_models import CNN_9

# Force UTF-8 stdout so PyTorch's emoji log messages don't crash on Windows cp1252
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ── configuration ─────────────────────────────────────────────────────────────
DATA_DIR   = "data/extracted_images_new"
MODEL_PATH = "NEW_save_states/CNNmodel21Epoch15.pt"
OUT_DIR    = "extension/model"
OPSET      = 11
# ──────────────────────────────────────────────────────────────────────────────

os.makedirs(OUT_DIR, exist_ok=True)

# 1. Load model
model = CNN_9()
model.load_state_dict(
    torch.load(MODEL_PATH, map_location="cpu", weights_only=True)
)
model.eval()
print(f"Loaded model from {MODEL_PATH}")

# 2. Capture class labels in the exact order the dataset uses (os.listdir order)
#    This must match the label_dict built in MathSymbolDataset._load_data().
classes = os.listdir(DATA_DIR)
classes_path = os.path.join(OUT_DIR, "classes.json")
with open(classes_path, "w") as f:
    json.dump(classes, f, indent=2)
print(f"Saved {len(classes)} class labels to {classes_path}")

# 3. Export to ONNX
#    Input shape: [batch, 1, 45, 45]  (grayscale 45×45, normalised to [-1, 1])
dummy_input = torch.randn(1, 1, 45, 45)
onnx_path   = os.path.join(OUT_DIR, "model.onnx")

torch.onnx.export(
    model,
    dummy_input,
    onnx_path,
    export_params=True,
    opset_version=OPSET,
    do_constant_folding=True,
    input_names=["input"],
    output_names=["output"],
    dynamic_axes={"input": {0: "batch_size"}, "output": {0: "batch_size"}},
    dynamo=False,   # use legacy TorchScript exporter (stable, no onnxscript needed)
)
print(f"Exported ONNX model to {onnx_path}")
print("\nDone. Copy extension/ into your Chrome extension directory.")
print("Also download ort.min.js from the onnxruntime-web npm package")
print("and place it at extension/lib/ort.min.js")
print("Download katex.min.js + katex.min.css and place under extension/lib/katex/")
