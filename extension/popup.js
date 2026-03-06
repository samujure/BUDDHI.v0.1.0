/**
 * popup.js — InkTeX Chrome Extension
 *
 * Drawing:        replicates tkinter Paint from NEW_draw.py
 * Bounding boxes: replicates bounding_box_cap.py (squareBB) using canvas pixels
 * Preprocessing:  45×45 grayscale, normalised [-1, 1]  (matches training transform)
 * Inference:      ONNX Runtime Web (ort.min.js)
 * Output:         KaTeX rendered LaTeX + evaluated answer
 */

"use strict";

// ── Constants ─────────────────────────────────────────────────────────────────
const CANVAS_W     = 720;
const CANVAS_H     = 320;
const MODEL_PATH   = chrome.runtime.getURL("model/model.onnx");
const CLASSES_PATH = chrome.runtime.getURL("model/classes.json");
const IMG_SIZE     = 45;         // model input spatial size
const X_MARGIN     = 40;         // pixel tolerance for equals / dot merging
const MIN_SIDE     = 8;          // minimum bounding-box side to keep (noise filter)
const SUP_SCALE    = 0.72;       // symbol is superscript if centerY < 0.72 * referenceTop
const SUB_SCALE    = 0.90;       // symbol is subscript  if centerY > 0.90 * (refTop+refSide)

// ── Global state ──────────────────────────────────────────────────────────────
let ortSession    = null;   // InferenceSession
let classes       = [];     // class labels in dataset order
let varDict       = {};     // stored variable→value assignments

// ── DOM refs ──────────────────────────────────────────────────────────────────
const canvas      = document.getElementById("draw-canvas");
const ctx         = canvas.getContext("2d");
const btnPen      = document.getElementById("btn-pen");
const btnEraser   = document.getElementById("btn-eraser");
const btnUndo     = document.getElementById("btn-undo");
const btnClear    = document.getElementById("btn-clear");
const btnPredict  = document.getElementById("btn-predict");
const penSize     = document.getElementById("pen-size");
const statusEl    = document.getElementById("status");
const latexRender = document.getElementById("latex-render");
const answerEl    = document.getElementById("answer-value");
const latexRaw    = document.getElementById("latex-raw");
const btnCopy     = document.getElementById("btn-copy");

// ── Canvas setup ──────────────────────────────────────────────────────────────
canvas.width  = CANVAS_W;
canvas.height = CANVAS_H;
clearCanvas();

// ── Drawing state ─────────────────────────────────────────────────────────────
let eraserOn      = false;
let isDrawing     = false;
let oldX          = null;
let oldY          = null;
const strokes     = [];
let currentStroke = [];

function getPos(e) {
  const rect = canvas.getBoundingClientRect();
  if (e.touches) {
    return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
  }
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function paint(e) {
  e.preventDefault();
  const { x, y } = getPos(e);
  const color = eraserOn ? "#ffffff" : "#000000";
  const width = eraserOn ? parseInt(penSize.value) * 3 : parseInt(penSize.value);

  ctx.lineCap  = "round";
  ctx.lineJoin = "round";

  if (oldX !== null && oldY !== null) {
    ctx.beginPath();
    ctx.moveTo(oldX, oldY);
    ctx.lineTo(x, y);
    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    ctx.stroke();
    currentStroke.push({ x1: oldX, y1: oldY, x2: x, y2: y, color, width });
  } else {
    // Single tap / first point of a new stroke — draw a dot so it's visible
    ctx.beginPath();
    ctx.arc(x, y, width / 2, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    currentStroke.push({ x1: x, y1: y, x2: x, y2: y, color, width });
  }

  oldX = x;
  oldY = y;
}

function resetDrag() {
  if (currentStroke.length) strokes.push(currentStroke);
  currentStroke = [];
  oldX = null;
  oldY = null;
}

canvas.addEventListener("mousedown",  (e) => { isDrawing = true;  canvas.classList.add("drawing");    currentStroke = []; paint(e); });
canvas.addEventListener("mousemove",  (e) => { if (isDrawing) paint(e); });
canvas.addEventListener("mouseup",    (e) => { isDrawing = false; canvas.classList.remove("drawing"); resetDrag(); });
canvas.addEventListener("mouseleave", (e) => { isDrawing = false; canvas.classList.remove("drawing"); resetDrag(); });
canvas.addEventListener("touchstart", (e) => { isDrawing = true;  canvas.classList.add("drawing");    currentStroke = []; paint(e); }, { passive: false });
canvas.addEventListener("touchmove",  (e) => { if (isDrawing) paint(e); },                                                             { passive: false });
canvas.addEventListener("touchend",   (e) => { isDrawing = false; canvas.classList.remove("drawing"); resetDrag(); });

// ── Toolbar buttons ───────────────────────────────────────────────────────────
btnPen.addEventListener("click", () => {
  eraserOn = false;
  btnPen.classList.add("active");
  btnEraser.classList.remove("active");
});

btnEraser.addEventListener("click", () => {
  eraserOn = true;
  btnEraser.classList.add("active");
  btnPen.classList.remove("active");
});

btnUndo.addEventListener("click", undo);
btnCopy.addEventListener("click", () => {
  const text = latexRaw.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const prev = btnCopy.textContent;
    btnCopy.textContent = "Copied!";
    setTimeout(() => { btnCopy.textContent = prev; }, 1200);
  });
});
btnClear.addEventListener("click", () => { strokes.length = 0; clearCanvas(); });
btnPredict.addEventListener("click", predict);

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "z") { e.preventDefault(); undo(); }
});

function undo() {
  if (!strokes.length) return;
  strokes.pop();
  clearCanvas();
  ctx.lineCap  = "round";
  ctx.lineJoin = "round";
  for (const stroke of strokes) {
    for (const seg of stroke) {
      if (seg.x1 === seg.x2 && seg.y1 === seg.y2) {
        // Dot segment
        ctx.beginPath();
        ctx.arc(seg.x1, seg.y1, seg.width / 2, 0, Math.PI * 2);
        ctx.fillStyle = seg.color;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.strokeStyle = seg.color;
        ctx.lineWidth   = seg.width;
        ctx.stroke();
      }
    }
  }
}

function clearCanvas() {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}

// ── Initialisation ─────────────────────────────────────────────────────────────
async function init() {
  setStatus("Loading model…");
  btnPredict.disabled = true;

  try {
    if (!window.ort) throw new Error("ort is not loaded — make sure lib/ort.min.js is present.");

    // Tell ORT exactly where its WASM binaries live inside this extension.
    // Without this, ORT tries to fetch from a relative URL which fails in MV3.
    const libUrl = chrome.runtime.getURL("lib/");
    window.ort.env.wasm.wasmPaths = libUrl;

    // Load class labels
    const resp = await fetch(CLASSES_PATH);
    classes = await resp.json();

    // Create ONNX inference session
    ortSession = await window.ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ["wasm"],
    });

    setStatus("Ready");
    btnPredict.disabled = false;
  } catch (err) {
    setStatus("Error: " + err.message);
    console.error(err);
  }
}

function setStatus(msg) { statusEl.textContent = msg; }

// ── Predict pipeline ──────────────────────────────────────────────────────────
async function predict() {
  if (!ortSession) { setStatus("Model not loaded"); return; }

  setStatus("Detecting symbols…");
  btnPredict.disabled = true;

  try {
    const imageData = ctx.getImageData(0, 0, CANVAS_W, CANVAS_H);
    const boxes     = findBoundingBoxes(imageData, CANVAS_W, CANVAS_H);

    if (boxes.length === 0) {
      setStatus("Nothing drawn");
      btnPredict.disabled = false;
      return;
    }

    setStatus(`Running inference on ${boxes.length} symbol(s)…`);

    // Build sympyList (mirrors Python logic in NEW_draw.py run_inference)
    const sympyList = [];
    let refTop  = null;   // "normal" baseline top-y
    let refSide = null;   // "normal" baseline side

    // Largest box is the reference for super/subscript detection
    const largestSide = Math.max(...boxes.map((b) => b.s));
    const largestBox  = boxes.find((b) => b.s === largestSide);
    refTop  = largestBox.y;
    refSide = largestBox.s;

    for (let i = 0; i < boxes.length; i++) {
      const box    = boxes[i];
      const tensor = preprocessBox(imageData, box, CANVAS_W);
      const label  = await runInference(tensor);

      if (i === 0) {
        sympyList.push(label);
        // Update reference to first normal-sized symbol
        if (Math.abs(box.s - largestSide) < 30) {
          refTop  = box.y;
          refSide = box.s;
        }
      } else {
        const centerY = box.y + box.s / 2;
        if (centerY < SUP_SCALE * refTop) {
          sympyList.push(["^", label]);
        } else if (centerY > SUB_SCALE * (refTop + refSide)) {
          sympyList.push(["_", label]);
        } else {
          sympyList.push(label);
          if (Math.abs(box.s - largestSide) < 30) {
            refTop  = box.y;
            refSide = box.s;
          }
        }
      }
    }

    console.log("sympyList:", sympyList);

    // Convert to LaTeX and evaluate
    const { latex, answer } = processSymbolList(sympyList, varDict);

    renderOutput(latex, answer);
    setStatus("Done");
  } catch (err) {
    setStatus("Error: " + err.message);
    console.error(err);
  }

  btnPredict.disabled = false;
}

// ── Bounding-box detection ────────────────────────────────────────────────────
/**
 * Port of bounding_box_cap.py squareBB.
 * Uses connected-component analysis on the canvas ImageData.
 * Returns an array of square bounding boxes { x, y, s } sorted left→right.
 */
function findBoundingBoxes(imageData, W, H) {
  const data    = imageData.data;   // Uint8ClampedArray, RGBA
  const visited = new Uint8Array(W * H);

  function isBlack(px, py) {
    const i = (py * W + px) * 4;
    // Average of RGB (image is greyscale)
    return (data[i] + data[i + 1] + data[i + 2]) / 3 < 200;
  }

  // 1. Connected components (stack-based DFS to avoid call-stack overflow)
  const components = [];
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const idx = py * W + px;
      if (!visited[idx] && isBlack(px, py)) {
        let minX = px, maxX = px, minY = py, maxY = py;
        const stack = [idx];
        visited[idx] = 1;

        while (stack.length > 0) {
          const cur = stack.pop();
          const cx  = cur % W;
          const cy  = (cur / W) | 0;
          if (cx < minX) minX = cx;
          if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy;
          if (cy > maxY) maxY = cy;

          // 4-connected neighbours
          const neighbours = [
            cy > 0     ? cur - W : -1,
            cy < H - 1 ? cur + W : -1,
            cx > 0     ? cur - 1 : -1,
            cx < W - 1 ? cur + 1 : -1,
          ];
          for (const n of neighbours) {
            if (n >= 0 && !visited[n] && isBlack(n % W, (n / W) | 0)) {
              visited[n] = 1;
              stack.push(n);
            }
          }
        }

        const w = maxX - minX + 1;
        const h = maxY - minY + 1;
        if (Math.max(w, h) >= MIN_SIDE) {
          components.push({ minX, minY, maxX, maxY, w, h });
        }
      }
    }
  }

  if (components.length === 0) return [];

  // 2. Convert each component to a square bounding box
  let squares = components.map((c) => {
    const s = Math.max(c.w, c.h);
    // Centre the shorter axis
    const x = c.minX - ((c.h > c.w) ? (c.h - c.w) >> 1 : 0);
    const y = c.minY - ((c.w > c.h) ? (c.w - c.h) >> 1 : 0);
    return { x, y, s, valid: true };
  });

  // 3. Classify horizontal lines (candidates for minus / equals)
  const hLines = [];
  const dots   = [];
  for (let i = 0; i < components.length; i++) {
    const c = components[i];
    if (c.h < 30) {
      if (c.w > c.h * 2) hLines.push(i);
      else               dots.push(i);
    }
  }

  // 4. Merge pairs of horizontal lines into an equals sign
  //    (two hLines whose x-coordinates are within X_MARGIN)
  const usedH = new Set();
  for (let a = 0; a < hLines.length; a++) {
    if (usedH.has(a)) continue;
    for (let b = a + 1; b < hLines.length; b++) {
      if (usedH.has(b)) continue;
      const ia = hLines[a], ib = hLines[b];
      if (Math.abs(squares[ia].x - squares[ib].x) < X_MARGIN) {
        // Merge into one (keep ia, remove ib)
        squares[ia].y = (squares[ia].y + squares[ib].y) >> 1;
        squares[ib].valid = false;
        usedH.add(a);
        usedH.add(b);
        break;
      }
    }
  }

  // 5. Attach dots (i, j, …) upward to the nearest matching base letter
  for (const di of dots) {
    const { x: dx, y: dy } = squares[di];
    let bestDist = Infinity;
    let bestJ    = -1;
    for (let j = 0; j < squares.length; j++) {
      if (j === di || !squares[j].valid) continue;
      const sq = squares[j];
      const centerXdiff = Math.abs(sq.x + sq.s / 2 - (dx + squares[di].s / 2));
      if (centerXdiff < X_MARGIN && sq.y > dy && sq.y - dy < bestDist) {
        bestDist = sq.y - dy;
        bestJ    = j;
      }
    }
    if (bestJ >= 0) {
      // Extend the base symbol upward to include the dot
      const base = squares[bestJ];
      const gap  = base.y - dy;
      base.s    += gap;
      base.x    -= gap >> 1;
      base.y     = dy;
      squares[di].valid = false;
    }
  }

  // 6. Filter invalid and sort by x (left → right)
  const finalBoxes = squares
    .filter((sq) => sq.valid)
    .sort((a, b) => a.x - b.x);

  return finalBoxes;
}

// ── Preprocessing ─────────────────────────────────────────────────────────────
/**
 * Crop the square region defined by box from imageData, resize to 45×45,
 * convert to grayscale, and normalise to [-1, 1].
 * Returns a Float32Array of length 45*45.
 *
 * Mirrors the Python transform:
 *   Grayscale → ToTensor (÷255) → Normalize(mean=0.5, std=0.5)  →  2*x - 1
 */
function preprocessBox(imageData, box, W) {
  // Draw the cropped region into an off-screen canvas, then resize
  const src = document.createElement("canvas");
  src.width  = box.s;
  src.height = box.s;
  const srcCtx = src.getContext("2d");

  // Copy pixel region
  const cropData = srcCtx.createImageData(box.s, box.s);
  const srcData  = imageData.data;
  for (let row = 0; row < box.s; row++) {
    for (let col = 0; col < box.s; col++) {
      const srcPx  = ((box.y + row) * W + (box.x + col)) * 4;
      const dstPx  = (row * box.s + col) * 4;
      // Clamp source coordinates
      const srcX = Math.min(Math.max(box.x + col, 0), W - 1);
      const srcY = Math.min(Math.max(box.y + row, 0), imageData.height - 1);
      const clampedSrc = (srcY * W + srcX) * 4;
      cropData.data[dstPx]     = srcData[clampedSrc];
      cropData.data[dstPx + 1] = srcData[clampedSrc + 1];
      cropData.data[dstPx + 2] = srcData[clampedSrc + 2];
      cropData.data[dstPx + 3] = 255;
    }
  }
  srcCtx.putImageData(cropData, 0, 0);

  // Resize to 45×45 using a second canvas
  const dst = document.createElement("canvas");
  dst.width  = IMG_SIZE;
  dst.height = IMG_SIZE;
  const dstCtx = dst.getContext("2d");
  dstCtx.drawImage(src, 0, 0, IMG_SIZE, IMG_SIZE);

  const resized = dstCtx.getImageData(0, 0, IMG_SIZE, IMG_SIZE);
  const tensor  = new Float32Array(IMG_SIZE * IMG_SIZE);

  for (let i = 0; i < IMG_SIZE * IMG_SIZE; i++) {
    // Greyscale: average R,G,B
    const r   = resized.data[i * 4];
    const g   = resized.data[i * 4 + 1];
    const b   = resized.data[i * 4 + 2];
    const grey = (r + g + b) / 3 / 255;   // [0, 1]
    tensor[i]  = grey * 2 - 1;            // normalize to [-1, 1]
  }

  return tensor;
}

// ── ONNX inference ────────────────────────────────────────────────────────────
async function runInference(floatData) {
  // Shape: [1, 1, 45, 45]
  const tensor  = new window.ort.Tensor("float32", floatData, [1, 1, IMG_SIZE, IMG_SIZE]);
  const feeds   = { input: tensor };
  const results = await ortSession.run(feeds);
  const logits  = results.output.data;   // Float32Array of length 72

  // Softmax
  const maxLogit = Math.max(...logits);
  const exps     = Array.from(logits).map((v) => Math.exp(v - maxLogit));
  const sumExp   = exps.reduce((a, b) => a + b, 0);
  const probs    = exps.map((v) => v / sumExp);

  const maxIdx   = probs.indexOf(Math.max(...probs));
  const label    = classes[maxIdx] || `class_${maxIdx}`;

  console.log(`Predicted: ${label} (${(probs[maxIdx] * 100).toFixed(1)}%)`);
  return label;
}

// ── Output rendering ──────────────────────────────────────────────────────────
function renderOutput(latex, answer) {
  if (window.katex) {
    try {
      katex.render(latex, latexRender, { throwOnError: false, displayMode: true });
    } catch (_) {
      latexRender.textContent = latex;
    }
  } else {
    latexRender.textContent = latex;
  }

  answerEl.textContent    = answer !== null ? answer : "—";
  latexRaw.textContent    = latex;
}

// ── Boot ──────────────────────────────────────────────────────────────────────
init();
