# BUDDHI V0.1.0

Handwritten math recognition system. User draws equation on canvas → CNN recognizes symbols → expression parsed and solved → outputs LaTeX + computed answer.

## Stack
- Python, PyTorch
- tkinter canvas (NEW_draw.py)
- SymPy for expression solving (toSympy.py, parse_and_solve.py)

## Key Files
- NEW_models.py — CNN architecture
- NEW_train.py — training pipeline
- NEW_dataloader.py — data loading (270k dataset, 72 classes)
- NEW_draw.py — tkinter GUI canvas
- NEW_test.py — inference/testing
- parse_and_solve.py — expression parser
- toSympy.py — converts recognized symbols to SymPy expression
- model_param.py — model config
- bounding_box_cap.py — bounding box detection for multi-symbol input
- archives_81class/ — older 81 class model experiments
- NEW_save_states/ — saved model checkpoints

## Goal
Convert to Chrome extension (InkTeX)
- Replace tkinter canvas with HTML5 canvas
- Client-side inference via ONNX.js or TensorFlow.js
- Output: LaTeX string + computed answer
- No backend server needed