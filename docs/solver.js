/**
 * solver.js
 *
 * Port of toSympy.py  (list_to_sympy)  and
 *          parse_and_solve.py (solver / evaluator).
 *
 * Symbol list format mirrors Python:
 *   - plain string  →  e.g. "5", "x", "+", "sin", "forward_slash", "log", "pi", …
 *   - two-element array  →  [modifier, value]
 *       modifier = "^" (superscript) or "_" (subscript)
 *       value    = the recognised class label for that character
 */

"use strict";

// ── list_to_sympy port ────────────────────────────────────────────────────────
/**
 * Convert an array of recognised symbol labels into a LaTeX string.
 * @param {Array} lst  Array of strings or [modifier, label] pairs.
 * @returns {string}   LaTeX string (without surrounding $ signs).
 */
function listToLatex(lst) {
  let expression = "";
  let modifying  = false;
  let restartIdx = -1;

  for (let idx = 0; idx < lst.length; idx++) {
    if (idx <= restartIdx) continue;

    const itm = lst[idx];

    if (Array.isArray(itm)) {
      // Superscript / subscript tuple: ['^', '2'] or ['_', '2']
      if (!modifying && lst[idx - 1] !== "log") {
        const modifier = itm[0];  // '^' or '_'
        let nextItems  = "";
        for (let ni = idx + 1; ni < lst.length; ni++) {
          if (Array.isArray(lst[ni])) nextItems += lst[ni][1];
          else break;
        }
        expression += `${modifier}{${itm[1]}${nextItems}}`;
        modifying = true;
      }
      if (idx === lst.length - 1) return expression;

    } else {
      // Plain symbol
      modifying = false;

      if (itm === "forward_slash") {
        // ── Fraction: \frac{prev}{next} ──────────────────────────────────────
        const prevIsClose = lst[idx - 1] === ")";

        let divideStartIdx;
        if (prevIsClose) {
          divideStartIdx = 0;
          for (let i = idx - 1; i >= 0; i--) {
            if (i === 0) { divideStartIdx = 0; break; }
            if (lst[i] === "(" && lst[i - 1] !== "(") { divideStartIdx = i + 1; break; }
          }
        } else {
          divideStartIdx = 0;
          for (let i = idx - 1; i >= 0; i--) {
            if (i === 0) { divideStartIdx = 0; break; }
            if (["+", "-", "*", "("].includes(lst[i])) { divideStartIdx = i + 1; break; }
          }
        }

        const dividePrevStr = prevIsClose
          ? listToLatex(lst.slice(divideStartIdx, idx - 1))
          : listToLatex(lst.slice(divideStartIdx, idx));

        const nextIsOpen = lst[idx + 1] === "(";
        let divideEndIdx;
        if (nextIsOpen) {
          divideEndIdx = lst.length - 1;
          for (let i = idx + 1; i < lst.length; i++) {
            if (i === lst.length - 1) { divideEndIdx = i; break; }
            if (lst[i] === ")" && lst[i + 1] !== ")") { divideEndIdx = i; break; }
          }
        } else {
          divideEndIdx = lst.length;
          for (let i = idx + 1; i < lst.length; i++) {
            if (i === lst.length - 1) { divideEndIdx = i + 1; break; }
            if (["+", "-", ")"].includes(lst[i])) { divideEndIdx = i + 1; break; }
          }
        }

        const dividePostStr = nextIsOpen
          ? listToLatex(lst.slice(idx + 2, divideEndIdx))
          : listToLatex(lst.slice(idx + 1, divideEndIdx));

        restartIdx = divideEndIdx;

        if (divideStartIdx === 0) {
          expression = "";
        } else {
          expression = prevIsClose
            ? expression.slice(0, divideStartIdx - 1)
            : expression.slice(0, divideStartIdx + 1);
        }

        expression += `\\frac{${dividePrevStr}}{${dividePostStr}}`;

        if (nextIsOpen && restartIdx === lst.length - 1) return expression;
        if (!nextIsOpen && restartIdx === lst.length)    return expression;

      } else if (itm === "log") {
        expression += "\\log";

      } else if (itm === "pi") {
        expression += "\\pi";

      } else if (itm === "sin" || itm === "cos" || itm === "tan") {
        expression += "\\" + itm;

      } else if (itm === "+" || itm === "-") {
        expression += itm;

      } else if (itm === "dot") {
        expression += "\\cdot";

      } else if (/^[0-9a-zA-Z]$/.test(itm)) {
        expression += itm;

      } else if (itm === "(" || itm === ")") {
        expression += itm;

      } else if (itm === "=") {
        expression += "=";
      }

      if (idx === lst.length - 1) return expression;
    }
  }
  return expression;
}


// ── LaTeX evaluator (math.js) ─────────────────────────────────────────────────

// Custom scope: redefine log as base-10 so that log(10) = 1, matching
// the conventional meaning of \log in mathematical notation.
const MATH_SCOPE = {
  log: (x) => math.log(x, 10),
};

/**
 * Numerically evaluate a LaTeX string using math.js.
 * Converts LaTeX → math.js expression string, then calls math.evaluate().
 * Returns the result as a string, or null if it cannot be evaluated.
 */
function evaluateLatex(latex) {
  try {
    const expr = latexToMathJs(latex);
    const result = math.evaluate(expr, MATH_SCOPE);
    const num = typeof result === "number" ? result : result.toNumber ? result.toNumber() : null;
    if (num === null || !isFinite(num)) return null;
    return String(parseFloat(num.toPrecision(4)));
  } catch (_) {
    return null;
  }
}

// Map LaTeX trig/log commands to math.js function names.
const TRIG_MAP = { sin: "sin", cos: "cos", tan: "tan", log: "log" };

/**
 * Convert a LaTeX string to a math.js-compatible expression string.
 *   \sin → sin    \cos → cos    \tan → tan    \log → log (base-10 via MATH_SCOPE)
 *   \pi  → pi     \cdot → *     \frac{a}{b} → (a/b)
 *   ^  stays as ^ (math.js supports it natively)
 *
 * Trig functions are processed first so that \sin\pi → sin(pi), not sinpi.
 * Each \fn is matched against its argument (braces, parens, \cmd, digits,
 * or a single letter) and wrapped with explicit parentheses before any
 * further substitution happens.
 */
function latexToMathJs(latex) {
  let s = latex.trim().replace(/^\$|\$$/g, "").trim();

  // ── Step 1: trig/log with argument — must run before \pi etc. are replaced ─
  const fnPat = /\\(sin|cos|tan|log)/;
  // \fn{expr}  →  fn(expr)
  s = s.replace(/\\(sin|cos|tan|log)\{([^{}]*)\}/g,
      (_, fn, arg) => `${TRIG_MAP[fn]}(${arg})`);
  // \fn(  →  fn(   [explicit parens already present]
  s = s.replace(/\\(sin|cos|tan|log)\(/g,
      (_, fn) => `${TRIG_MAP[fn]}(`);
  // \fn\cmd  →  fn(\cmd)   [e.g. \sin\pi → sin(\pi)]
  s = s.replace(/\\(sin|cos|tan|log)(\\[a-zA-Z]+)/g,
      (_, fn, cmd) => `${TRIG_MAP[fn]}(${cmd})`);
  // \fn digits  →  fn(digits)
  s = s.replace(/\\(sin|cos|tan|log)(\d+(?:\.\d*)?)/g,
      (_, fn, arg) => `${TRIG_MAP[fn]}(${arg})`);
  // \fn letter  →  fn(letter)   [single variable, e.g. \sinx]
  s = s.replace(/\\(sin|cos|tan|log)([a-zA-Z])/g,
      (_, fn, letter) => `${TRIG_MAP[fn]}(${letter})`);
  // bare \fn  →  fn   [fallback: no recognisable argument follows]
  s = s.replace(/\\(sin|cos|tan|log)/g,
      (_, fn) => TRIG_MAP[fn]);

  // ── Step 2: \frac{a}{b} → (a/b) — innermost braces first ──────────────────
  let safety = 0;
  while (s.includes("\\frac") && safety++ < 20) {
    s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/,
        (_, num, den) => `(${num}/${den})`);
  }

  // ── Step 3: a^{b} → a^b ────────────────────────────────────────────────────
  s = s.replace(/\^\{([^{}]*)\}/g, "^$1");

  // ── Step 4: remaining LaTeX atoms ──────────────────────────────────────────
  s = s.replace(/\\pi/g,   "pi");
  s = s.replace(/\\cdot/g, "*");

  // Remove any remaining LaTeX grouping braces
  s = s.replace(/[{}]/g, "");

  // Implied multiplication: digit followed by ( or letter
  s = s.replace(/(\d)(\()/g,       "$1*$2");
  s = s.replace(/(\d)([a-zA-Z])/g, "$1*$2");

  // Strip any remaining backslashes
  s = s.replace(/\\/g, "");

  return s;
}


// ── Variable store + full solver pipeline ─────────────────────────────────────
/**
 * Given the raw symbol list (same format as Python sympyList), build the LaTeX
 * string and compute the answer.
 *
 * @param {Array}  sympyList   Array of symbol labels / [modifier, label] pairs.
 * @param {Object} varDict     e.g. { "x": "5" }  (string key → latex-string value)
 * @returns {{ latex: string, answer: string|null }}
 */
function processSymbolList(sympyList, varDict) {
  varDict = varDict || {};

  const equalsIdx = sympyList.findIndex((s) => s === "=");

  if (equalsIdx === -1) {
    // No equals — just render and evaluate
    const latex  = listToLatex(sympyList);
    const answer = evaluateLatex(latex);
    return { latex, answer };
  }

  const left  = sympyList.slice(0, equalsIdx);
  const right  = sympyList.slice(equalsIdx + 1);

  const latexLeft  = listToLatex(left);
  const latexRight = right.length === 0 ? null : listToLatex(right);

  if (latexRight === null) {
    // Nothing on right side — solve the left side numerically
    let latex = latexLeft;
    // Substitute stored variables
    for (const [k, v] of Object.entries(varDict)) {
      latex = latex.replaceAll(k, v);
    }
    const answer = evaluateLatex(latex);
    return { latex: `${latexLeft}=`, answer };
  }

  // Both sides present
  if (left.length === 1 && typeof left[0] === "string") {
    // Variable assignment: x = 5
    varDict[latexLeft] = latexRight;
  }

  return {
    latex: `${latexLeft}=${latexRight}`,
    answer: evaluateLatex(latexRight),
  };
}
