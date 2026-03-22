import { cpSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, "..");

const copies = [
  [
    "node_modules/tesseract.js/dist/tesseract.min.js",
    "vendor/tesseract/tesseract.min.js"
  ],
  [
    "node_modules/tesseract.js/dist/tesseract.esm.min.js",
    "vendor/tesseract/tesseract.esm.min.js"
  ],
  [
    "node_modules/tesseract.js/dist/worker.min.js",
    "vendor/tesseract/worker.min.js"
  ],
  [
    "node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js",
    "vendor/tesseract-core/tesseract-core-lstm.wasm.js"
  ],
  [
    "node_modules/tesseract.js-core/tesseract-core-lstm.wasm",
    "vendor/tesseract-core/tesseract-core-lstm.wasm"
  ],
  [
    "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js",
    "vendor/tesseract-core/tesseract-core-simd-lstm.wasm.js"
  ],
  [
    "node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm",
    "vendor/tesseract-core/tesseract-core-simd-lstm.wasm"
  ],
  [
    "node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js",
    "vendor/tesseract-core/tesseract-core-relaxedsimd-lstm.wasm.js"
  ],
  [
    "node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm",
    "vendor/tesseract-core/tesseract-core-relaxedsimd-lstm.wasm"
  ],
  [
    "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
    "vendor/tessdata/4.0.0_best_int/eng.traineddata.gz"
  ],
  [
    "node_modules/@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz",
    "vendor/tessdata/4.0.0_best_int/fra.traineddata.gz"
  ]
];

for (const [from, to] of copies) {
  const source = resolve(projectRoot, from);
  const target = resolve(projectRoot, to);

  mkdirSync(dirname(target), { recursive: true });
  cpSync(source, target);
}

console.log("OCR assets synced to vendor/.");
