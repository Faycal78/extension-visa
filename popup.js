const tabTitle = document.getElementById("tab-title");
const tabUrl = document.getElementById("tab-url");
const languageSelect = document.getElementById("language-select");
const statusEl = document.getElementById("status");
const progressBar = document.getElementById("progress-bar");
const resultEl = document.getElementById("result");
const previewImage = document.getElementById("preview-image");
const previewPlaceholder = document.getElementById("preview-placeholder");
const captureButton = document.getElementById("capture-button");
const pickButton = document.getElementById("pick-button");
const copyButton = document.getElementById("copy-button");
const fileInput = document.getElementById("file-input");
const { createWorker } = globalThis.Tesseract;

const OCR_LANGUAGE_PATH = chrome.runtime.getURL("vendor/tessdata/4.0.0_best_int");
const OCR_CORE_PATH = chrome.runtime.getURL("vendor/tesseract-core");
const OCR_WORKER_PATH = chrome.runtime.getURL("vendor/tesseract/worker.min.js");
const OCR_MAX_IMAGE_SIDE = 1600;
const OCR_CAPTURE_QUALITY = 82;
const OCR_DOCUMENT_MODE = {
  tessedit_pageseg_mode: "6",
  preserve_interword_spaces: "1"
};

let latestText = "";
let activePreviewUrl = "";
let workerPromise = null;
let activeWorkerLanguage = "";
let isBusy = false;

initializePopup();
captureButton.addEventListener("click", captureActiveTab);
pickButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", handleFilePick);
copyButton.addEventListener("click", copyTextResult);
languageSelect.addEventListener("change", handleLanguageChange);

async function initializePopup() {
  resetResult();
  updateProgress(0);

  try {
    const tab = await getActiveTab();

    if (!tab) {
      tabTitle.textContent = "Aucun onglet actif detecte.";
      return;
    }

    tabTitle.textContent = tab.title || "Sans titre";
    tabUrl.textContent = tab.url || "";
  } catch {
    tabTitle.textContent = "Impossible de lire l'onglet actif.";
  }

  warmupWorker();
}

async function captureActiveTab() {
  if (isBusy) {
    return;
  }

  try {
    const imageDataUrl = await chrome.tabs.captureVisibleTab(undefined, {
      format: "jpeg",
      quality: OCR_CAPTURE_QUALITY
    });

    setPreview(imageDataUrl);
    await runOcr(imageDataUrl, "Capture de l'onglet");
  } catch (error) {
    handleError(error, "Impossible de capturer l'onglet actif.");
  }
}

async function handleFilePick(event) {
  const [file] = event.target.files || [];
  fileInput.value = "";

  if (!file || isBusy) {
    return;
  }

  const previewUrl = URL.createObjectURL(file);
  setPreview(previewUrl, true);
  await runOcr(file, `Image locale : ${file.name}`);
}

async function runOcr(source, label) {
  setBusy(true);
  resetResult();
  setStatus(`Preparation OCR pour ${label}...`);
  updateProgress(3);

  try {
    const [worker, preparedSource] = await Promise.all([
      getWorker(languageSelect.value),
      prepareImageForOcr(source)
    ]);
    const { data } = await worker.recognize(preparedSource, OCR_DOCUMENT_MODE);
    const text = (data?.text || "").trim();

    latestText = text;
    resultEl.textContent = text || "Aucun texte detecte.";
    resultEl.classList.toggle("empty", !text);
    copyButton.disabled = !text;
    setStatus(text ? "OCR termine." : "OCR termine, mais aucun texte n'a ete detecte.");
    updateProgress(100);
  } catch (error) {
    handleError(error, "Echec de l'OCR local.");
  } finally {
    setBusy(false);
  }
}

async function handleLanguageChange() {
  if (isBusy) {
    return;
  }

  updateProgress(0);
  setStatus(`Mode ${humanizeLanguage(languageSelect.value)} selectionne.`);
  warmupWorker();
}

async function getWorker(langs) {
  if (!workerPromise) {
    activeWorkerLanguage = langs;
    workerPromise = createWorker(langs, 1, {
      langPath: OCR_LANGUAGE_PATH,
      corePath: OCR_CORE_PATH,
      workerPath: OCR_WORKER_PATH,
      workerBlobURL: false,
      logger: updateProgressFromWorker
    });

    try {
      return await workerPromise;
    } catch (error) {
      workerPromise = null;
      activeWorkerLanguage = "";
      throw error;
    }
  }

  const worker = await workerPromise;

  if (activeWorkerLanguage !== langs) {
    setStatus(`Chargement du modele ${humanizeLanguage(langs)}...`);
    updateProgress(8);
    await worker.reinitialize(langs, 1);
    activeWorkerLanguage = langs;
  }

  return worker;
}

async function warmupWorker() {
  try {
    setStatus(`Prechargement ${humanizeLanguage(languageSelect.value)}...`);
    updateProgress(5);
    await getWorker(languageSelect.value);
    setStatus(`Moteur pret en ${humanizeLanguage(languageSelect.value)}.`);
    updateProgress(0);
  } catch {
    setStatus("Moteur OCR non precharge.");
    updateProgress(0);
  }
}

async function copyTextResult() {
  if (!latestText) {
    return;
  }

  try {
    await navigator.clipboard.writeText(latestText);
    setStatus("Texte copie dans le presse-papiers.");
  } catch {
    setStatus("Impossible de copier automatiquement le texte.");
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  return tab;
}

function updateProgressFromWorker(message) {
  if (!message) {
    return;
  }

  const percent = Math.max(5, Math.round((message.progress || 0) * 100));
  updateProgress(percent);

  const labels = {
    loading: "Chargement du moteur OCR...",
    "loading tesseract core": "Chargement du moteur OCR...",
    "loading language traineddata": "Chargement des langues locales...",
    initializing: `Initialisation ${humanizeLanguage(languageSelect.value)}...`,
    recognizing: "Analyse du document...",
    "recognizing text": "Reconnaissance du texte..."
  };

  setStatus(labels[message.status] || "OCR en cours...");
}

function updateProgress(percent) {
  progressBar.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

async function prepareImageForOcr(source) {
  setStatus("Optimisation de l'image pour l'OCR...");
  updateProgress(12);

  const blob = await sourceToBlob(source);
  const drawable = await loadDrawable(blob);
  const scale = Math.min(1, OCR_MAX_IMAGE_SIDE / Math.max(drawable.width, drawable.height));
  const width = Math.max(1, Math.round(drawable.width * scale));
  const height = Math.max(1, Math.round(drawable.height * scale));
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { alpha: false });

  if (!context) {
    drawable.dispose();
    return blob;
  }

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.filter = "grayscale(1) contrast(1.18)";
  context.drawImage(drawable.node, 0, 0, width, height);
  context.filter = "none";
  drawable.dispose();

  return canvasToBlob(canvas);
}

async function sourceToBlob(source) {
  if (source instanceof Blob) {
    return source;
  }

  if (typeof source === "string") {
    const response = await fetch(source);
    return response.blob();
  }

  throw new Error("Format d'image non pris en charge.");
}

async function loadDrawable(blob) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(blob);

    return {
      node: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      dispose: () => bitmap.close()
    };
  }

  const objectUrl = URL.createObjectURL(blob);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Impossible de charger l'image."));
    img.src = objectUrl;
  });

  return {
    node: image,
    width: image.naturalWidth,
    height: image.naturalHeight,
    dispose: () => URL.revokeObjectURL(objectUrl)
  };
}

async function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }

        reject(new Error("Impossible de preparer l'image pour l'OCR."));
      },
      "image/jpeg",
      0.86
    );
  });
}

function setPreview(source, revokePrevious = false) {
  if (revokePrevious && activePreviewUrl) {
    URL.revokeObjectURL(activePreviewUrl);
  }

  if (typeof source === "string" && source.startsWith("blob:")) {
    activePreviewUrl = source;
  } else if (activePreviewUrl) {
    URL.revokeObjectURL(activePreviewUrl);
    activePreviewUrl = "";
  }

  previewImage.src = typeof source === "string" ? source : "";
  previewImage.hidden = false;
  previewPlaceholder.hidden = true;
}

function setStatus(message) {
  statusEl.textContent = message;
}

function setBusy(value) {
  isBusy = value;
  captureButton.disabled = value;
  pickButton.disabled = value;
  languageSelect.disabled = value;
}

function resetResult() {
  latestText = "";
  copyButton.disabled = true;
  resultEl.textContent = "Aucun resultat pour le moment.";
  resultEl.classList.add("empty");
}

function handleError(error, fallbackMessage) {
  const message = error instanceof Error ? error.message : fallbackMessage;
  resultEl.textContent = message || fallbackMessage;
  resultEl.classList.remove("empty");
  setStatus(fallbackMessage);
  updateProgress(0);
}

function humanizeLanguage(value) {
  const labels = {
    fra: "francais",
    eng: "anglais",
    "fra+eng": "francais + anglais"
  };

  return labels[value] || value;
}
