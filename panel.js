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
const fillButton = document.getElementById("fill-button");
const syncButton = document.getElementById("sync-button");
const copyButton = document.getElementById("copy-button");
const fileInput = document.getElementById("file-input");
const fieldsResultEl = document.getElementById("fields-result");
const backendUrlInput = document.getElementById("backend-url");
const backendStatusEl = document.getElementById("backend-status");
const { createWorker } = globalThis.Tesseract;

const OCR_LANGUAGE_PATH = chrome.runtime.getURL("vendor/tessdata/4.0.0_best_int");
const OCR_CORE_PATH = chrome.runtime.getURL("vendor/tesseract-core");
const OCR_WORKER_PATH = chrome.runtime.getURL("vendor/tesseract/worker.min.js");
const BACKEND_URL_STORAGE_KEY = "visa-ocr-backend-url";
const OCR_MAX_IMAGE_SIDE = 1600;
const OCR_CAPTURE_QUALITY = 82;
const OCR_DOCUMENT_MODE = {
  tessedit_pageseg_mode: "6",
  preserve_interword_spaces: "1"
};

let latestText = "";
let latestPassportData = null;
let activePreviewUrl = "";
let workerPromise = null;
let activeWorkerLanguage = "";
let isBusy = false;

initializePopup();
captureButton.addEventListener("click", captureActiveTab);
pickButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", handleFilePick);
fillButton.addEventListener("click", autofillActiveTab);
syncButton.addEventListener("click", syncToBackend);
copyButton.addEventListener("click", copyTextResult);
languageSelect.addEventListener("change", handleLanguageChange);
backendUrlInput.addEventListener("change", persistBackendUrl);

async function initializePopup() {
  resetResult();
  updateProgress(0);
  hydrateBackendUrl();

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
    const passportData = extractPassportData(text);

    latestText = text;
    latestPassportData = passportData;
    resultEl.textContent = text || "Aucun texte detecte.";
    resultEl.classList.toggle("empty", !text);
    renderPassportData(passportData);
    copyButton.disabled = !text;
    fillButton.disabled = !hasPassportAutofillData(passportData);
    syncButton.disabled = !hasPassportAutofillData(passportData);
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

async function autofillActiveTab() {
  if (!hasPassportAutofillData(latestPassportData)) {
    setStatus("Aucune donnee passeport exploitable a injecter.");
    return;
  }

  try {
    const tab = await getActiveTab();

    if (!tab?.id || !tab.url) {
      throw new Error("Aucun onglet actif exploitable.");
    }

    if (/^(chrome|edge):\/\//.test(tab.url)) {
      throw new Error("Le navigateur interdit le remplissage sur les pages internes.");
    }

    setStatus("Injection des champs dans le site actif...");

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fillPassportFieldsOnPage,
      args: [buildAutofillPayload(latestPassportData)]
    });

    if (!result?.filledCount) {
      setStatus("Aucun champ correspondant n'a ete trouve sur la page.");
      return;
    }

    setStatus(`${result.filledCount} champ(s) remplis sur le site.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Impossible de remplir le site.";
    setStatus(message);
  }
}

async function syncToBackend() {
  if (!hasPassportAutofillData(latestPassportData)) {
    setBackendStatus("Aucune donnee a envoyer au backend.");
    return;
  }

  const backendBaseUrl = normalizeBackendUrl(backendUrlInput.value);
  persistBackendUrl();

  if (!backendBaseUrl) {
    setBackendStatus("URL backend invalide.");
    return;
  }

  const tab = await getActiveTab();
  const payload = {
    source_url: tab?.url || "",
    source_label: tab?.title || "",
    raw_text: latestText,
    extracted_data: buildAutofillPayload(latestPassportData)
  };

  try {
    setBackendStatus("Envoi au backend Laravel...");
    syncButton.disabled = true;

    const response = await fetch(`${backendBaseUrl}/api/passport-submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `HTTP ${response.status}`);
    }

    const result = await response.json();
    const dashboardUrl = result.dashboard_url || `${backendBaseUrl}/`;
    setBackendStatus(`Envoye au backend. ID ${result.id}. Dashboard: ${dashboardUrl}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur reseau.";
    setBackendStatus(`Echec de synchronisation: ${message}`);
  } finally {
    syncButton.disabled = !hasPassportAutofillData(latestPassportData);
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

function setBackendStatus(message) {
  backendStatusEl.textContent = message;
}

function setBusy(value) {
  isBusy = value;
  captureButton.disabled = value;
  pickButton.disabled = value;
  fillButton.disabled = value || !hasPassportAutofillData(latestPassportData);
  syncButton.disabled = value || !hasPassportAutofillData(latestPassportData);
  languageSelect.disabled = value;
  backendUrlInput.disabled = value;
}

function resetResult() {
  latestText = "";
  latestPassportData = null;
  copyButton.disabled = true;
  fillButton.disabled = true;
  syncButton.disabled = true;
  resultEl.textContent = "Aucun resultat pour le moment.";
  resultEl.classList.add("empty");
  fieldsResultEl.textContent = "Aucun champ detecte pour le moment.";
  fieldsResultEl.classList.add("empty");
  setBackendStatus("Le backend doit etre lance localement avec `php artisan serve`.");
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

function hydrateBackendUrl() {
  const savedUrl = localStorage.getItem(BACKEND_URL_STORAGE_KEY);
  if (savedUrl) {
    backendUrlInput.value = savedUrl;
  }
}

function persistBackendUrl() {
  const value = normalizeBackendUrl(backendUrlInput.value);
  if (!value) {
    return;
  }

  backendUrlInput.value = value;
  localStorage.setItem(BACKEND_URL_STORAGE_KEY, value);
}

function normalizeBackendUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function extractPassportData(text) {
  const mrzData = extractMrzPassportData(text);
  const fallbackData = extractPassportFallbackData(text);
  const data = {
    surname: coalesceValue(mrzData.surname, fallbackData.surname),
    givenNames: coalesceValue(mrzData.givenNames, fallbackData.givenNames),
    passportNumber: coalesceValue(mrzData.passportNumber, fallbackData.passportNumber),
    nationality: coalesceValue(fallbackData.nationality, mrzData.nationality),
    issuingCountry: coalesceValue(fallbackData.issuingCountry, mrzData.issuingCountry),
    birthDate: coalesceValue(mrzData.birthDate, fallbackData.birthDate),
    expiryDate: coalesceValue(mrzData.expiryDate, fallbackData.expiryDate),
    sex: coalesceValue(mrzData.sex, fallbackData.sex),
    mrzLines: mrzData.mrzLines
  };

  data.fullName = [data.givenNames, data.surname].filter(Boolean).join(" ").trim();
  data.title = inferTitleFromSex(data.sex);
  data.birthDay = extractDatePart(data.birthDate, "day");
  data.birthMonth = extractDatePart(data.birthDate, "month");
  data.birthYear = extractDatePart(data.birthDate, "year");
  data.expiryDay = extractDatePart(data.expiryDate, "day");
  data.expiryMonth = extractDatePart(data.expiryDate, "month");
  data.expiryYear = extractDatePart(data.expiryDate, "year");

  return data;
}

function extractMrzPassportData(text) {
  const lines = text
    .toUpperCase()
    .replace(/[«‹]/g, "<")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, "").replace(/[^A-Z0-9<]/g, ""))
    .filter((line) => line.length >= 30);

  for (let index = 0; index < lines.length - 1; index += 1) {
    const line1 = lines[index];
    const line2 = lines[index + 1];

    if (!line1.startsWith("P<") || line2.length < 30) {
      continue;
    }

    const paddedLine1 = line1.padEnd(44, "<").slice(0, 44);
    const paddedLine2 = line2.padEnd(44, "<").slice(0, 44);
    const namesPart = paddedLine1.slice(5);
    const [surnamePart = "", givenNamesPart = ""] = namesPart.split("<<");

    return {
      surname: cleanMrzName(surnamePart),
      givenNames: cleanMrzName(givenNamesPart),
      issuingCountry: cleanCountryCode(paddedLine1.slice(2, 5)),
      passportNumber: cleanMrzDocumentNumber(paddedLine2.slice(0, 9)),
      nationality: cleanCountryCode(paddedLine2.slice(10, 13)),
      birthDate: parseMrzDate(paddedLine2.slice(13, 19), "birth"),
      sex: normalizeSex(paddedLine2.slice(20, 21)),
      expiryDate: parseMrzDate(paddedLine2.slice(21, 27), "expiry"),
      mrzLines: [paddedLine1, paddedLine2]
    };
  }

  return {};
}

function extractPassportFallbackData(text) {
  const compactText = text.replace(/\r/g, "");
  const uppercaseText = compactText.toUpperCase();

  return {
    surname: cleanTextCapture(
      capturePattern(uppercaseText, [
        /(?:SURNAME|NOM)\s*[:\-]?\s*([A-Z][A-Z\s'<-]{2,40})/,
        /(?:LAST\s+NAME|FAMILY\s+NAME)\s*[:\-]?\s*([A-Z][A-Z\s'<-]{2,40})/
      ])
    ),
    givenNames: cleanTextCapture(
      capturePattern(uppercaseText, [
        /(?:GIVEN\s+NAMES?|FIRST\s+NAMES?|PRENOMS?|PRENOM)\s*[:\-]?\s*([A-Z][A-Z\s'<-]{2,50})/
      ])
    ),
    passportNumber: cleanMrzDocumentNumber(
      capturePattern(uppercaseText, [
        /(?:PASSPORT|DOCUMENT|TRAVEL\s+DOCUMENT)\s*(?:NO|NUMBER|N|NUMERO)?\s*[:\-]?\s*([A-Z0-9]{6,12})/
      ])
    ),
    nationality: cleanTextCapture(
      capturePattern(uppercaseText, [
        /(?:NATIONALITY|NATIONALITE)\s*[:\-]?\s*([A-Z][A-Z\s'-]{2,30})/
      ])
    ),
    issuingCountry: cleanTextCapture(
      capturePattern(uppercaseText, [
        /(?:ISSUING\s+COUNTRY|PAYS\s+DE\s+DELIVRANCE|PAYS\s+EMETTEUR)\s*[:\-]?\s*([A-Z][A-Z\s'-]{2,30})/
      ])
    ),
    birthDate: normalizeLooseDate(
      capturePattern(uppercaseText, [
        /(?:DATE\s+OF\s+BIRTH|BIRTH|NAISSANCE)\s*[:\-]?\s*([0-3]?\d[\/.\- ][01]?\d[\/.\- ](?:19|20)?\d{2})/
      ])
    ),
    expiryDate: normalizeLooseDate(
      capturePattern(uppercaseText, [
        /(?:DATE\s+OF\s+EXPIRY|EXPIRY|EXPIRATION|EXPIRE\s+LE)\s*[:\-]?\s*([0-3]?\d[\/.\- ][01]?\d[\/.\- ](?:19|20)?\d{2})/
      ])
    ),
    sex: normalizeSex(
      capturePattern(uppercaseText, [
        /(?:SEX|SEXE)\s*[:\-]?\s*([MFX])/
      ])
    )
  };
}

function renderPassportData(data) {
  const rows = [
    ["Nom", data.surname],
    ["Prenoms", data.givenNames],
    ["Nom complet", data.fullName],
    ["Civilite", data.title],
    ["Numero de passeport", data.passportNumber],
    ["Nationalite", data.nationality],
    ["Pays emetteur", data.issuingCountry],
    ["Date de naissance", formatDisplayDate(data.birthDate)],
    ["Date d'expiration", formatDisplayDate(data.expiryDate)],
    ["Sexe", data.sex]
  ].filter(([, value]) => value);

  if (!rows.length) {
    fieldsResultEl.textContent = "Aucun champ detecte pour le moment.";
    fieldsResultEl.classList.add("empty");
    return;
  }

  fieldsResultEl.textContent = rows
    .map(([label, value]) => `${label} : ${value}`)
    .join("\n");
  fieldsResultEl.classList.remove("empty");
}

function hasPassportAutofillData(data) {
  if (!data) {
    return false;
  }

  return Boolean(
    data.surname ||
      data.givenNames ||
      data.passportNumber ||
      data.birthDate ||
      data.expiryDate ||
      data.sex
  );
}

function buildAutofillPayload(data) {
  return {
    surname: data.surname || "",
    givenNames: data.givenNames || "",
    fullName: data.fullName || "",
    title: data.title || "",
    passportNumber: data.passportNumber || "",
    nationality: data.nationality || "",
    issuingCountry: data.issuingCountry || "",
    birthDate: data.birthDate || "",
    birthDateDisplay: formatDisplayDate(data.birthDate),
    birthDay: data.birthDay || "",
    birthMonth: data.birthMonth || "",
    birthYear: data.birthYear || "",
    expiryDate: data.expiryDate || "",
    expiryDateDisplay: formatDisplayDate(data.expiryDate),
    expiryDay: data.expiryDay || "",
    expiryMonth: data.expiryMonth || "",
    expiryYear: data.expiryYear || "",
    sex: data.sex || ""
  };
}

function fillPassportFieldsOnPage(passportData) {
  const normalized = (value) =>
    String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();

  const getLabelText = (element) => {
    const labels = [];

    if (element.labels) {
      labels.push(...Array.from(element.labels).map((label) => label.innerText || label.textContent || ""));
    }

    if (element.id) {
      const explicit = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (explicit) {
        labels.push(explicit.innerText || explicit.textContent || "");
      }
    }

    const closestLabel = element.closest("label");
    if (closestLabel) {
      labels.push(closestLabel.innerText || closestLabel.textContent || "");
    }

    return labels.join(" ");
  };

  const getSearchText = (element) =>
    normalized(
      [
        element.name,
        element.id,
        element.placeholder,
        element.getAttribute("aria-label"),
        element.getAttribute("autocomplete"),
        element.getAttribute("data-testid"),
        getLabelText(element)
      ]
        .filter(Boolean)
        .join(" ")
    );

  const hasAny = (value, words) => words.some((word) => value.includes(word));
  const elements = Array.from(document.querySelectorAll("input, select, textarea")).filter((element) => {
    if (element.disabled || element.readOnly) {
      return false;
    }

    if (element instanceof HTMLInputElement) {
      const blockedTypes = new Set(["hidden", "file", "password", "submit", "button", "reset", "image"]);
      if (blockedTypes.has(element.type)) {
        return false;
      }
    }

    return true;
  });
  const used = new Set();
  let filledCount = 0;
  const filledKeys = [];

  filledCount += fillGroupedDateFields(
    passportData.birthDay,
    passportData.birthMonth,
    passportData.birthYear,
    ["date de naissance", "date of birth", "naissance", "dob"],
    "birthDateGroup"
  );

  const specs = [
    {
      key: "title",
      value: passportData.title,
      matcher: (text, element) =>
        element instanceof HTMLSelectElement &&
        hasAny(text, ["titre", "civilite", "title", "salutation"])
    },
    {
      key: "surname",
      value: passportData.surname,
      matcher: (text) => hasAny(text, ["surname", "last name", "family name", "nom"])
    },
    {
      key: "givenNames",
      value: passportData.givenNames,
      matcher: (text) => hasAny(text, ["given name", "given names", "first name", "first names", "prenom", "prenoms"])
    },
    {
      key: "fullName",
      value: passportData.fullName,
      matcher: (text) =>
        hasAny(text, ["full name", "complete name", "nom complet", "applicant name", "name as in passport"])
    },
    {
      key: "passportNumber",
      value: passportData.passportNumber,
      matcher: (text) =>
        hasAny(text, [
          "passport number",
          "passport no",
          "passport",
          "document number",
          "travel document number",
          "numero passeport",
          "numero de passeport",
          "passeport"
        ])
    },
    {
      key: "nationality",
      value: passportData.nationality,
      matcher: (text) => hasAny(text, ["nationality", "nationalite", "citizenship"])
    },
    {
      key: "issuingCountry",
      value: passportData.issuingCountry,
      matcher: (text) => hasAny(text, ["issuing country", "country of issue", "pays emetteur", "pays de delivrance"])
    },
    {
      key: "sex",
      value: passportData.sex,
      matcher: (text) => hasAny(text, ["sex", "gender", "sexe"])
    },
    {
      key: "birthDate",
      value: passportData.birthDate,
      matcher: (text, element) =>
        element.type === "date" && hasAny(text, ["birth", "naissance", "date of birth", "dob"])
    },
    {
      key: "expiryDate",
      value: passportData.expiryDate,
      matcher: (text, element) =>
        element.type === "date" && hasAny(text, ["expiry", "expiration", "expire", "date of expiry"])
    },
    {
      key: "birthDateDisplay",
      value: passportData.birthDateDisplay,
      matcher: (text, element) =>
        element.type !== "date" &&
        hasAny(text, ["birth", "naissance", "date of birth", "dob"]) &&
        !hasAny(text, ["day", "month", "year", "jour", "mois", "annee"])
    },
    {
      key: "expiryDateDisplay",
      value: passportData.expiryDateDisplay,
      matcher: (text, element) =>
        element.type !== "date" &&
        hasAny(text, ["expiry", "expiration", "expire", "date of expiry"]) &&
        !hasAny(text, ["day", "month", "year", "jour", "mois", "annee"])
    },
    {
      key: "birthDay",
      value: passportData.birthDay,
      matcher: (text) => hasAny(text, ["birth", "naissance", "dob"]) && hasAny(text, ["day", "jour"])
    },
    {
      key: "birthMonth",
      value: passportData.birthMonth,
      matcher: (text) => hasAny(text, ["birth", "naissance", "dob"]) && hasAny(text, ["month", "mois"])
    },
    {
      key: "birthYear",
      value: passportData.birthYear,
      matcher: (text) => hasAny(text, ["birth", "naissance", "dob"]) && hasAny(text, ["year", "annee"])
    },
    {
      key: "expiryDay",
      value: passportData.expiryDay,
      matcher: (text) => hasAny(text, ["expiry", "expiration", "expire"]) && hasAny(text, ["day", "jour"])
    },
    {
      key: "expiryMonth",
      value: passportData.expiryMonth,
      matcher: (text) => hasAny(text, ["expiry", "expiration", "expire"]) && hasAny(text, ["month", "mois"])
    },
    {
      key: "expiryYear",
      value: passportData.expiryYear,
      matcher: (text) => hasAny(text, ["expiry", "expiration", "expire"]) && hasAny(text, ["year", "annee"])
    }
  ];

  for (const spec of specs) {
    if (!spec.value) {
      continue;
    }

    const match = pickBestElement(spec);
    if (!match) {
      continue;
    }

    if (applyValue(match, spec.key, spec.value)) {
      used.add(match);
      filledCount += 1;
      filledKeys.push(spec.key);
    }
  }

  return { filledCount, filledKeys };

  function pickBestElement(spec) {
    let bestElement = null;
    let bestScore = 0;

    for (const element of elements) {
      if (used.has(element)) {
        continue;
      }

      const searchText = getSearchText(element);
      if (!searchText || !spec.matcher(searchText, element)) {
        continue;
      }

      let score = searchText.length ? 1 : 0;
      if (element instanceof HTMLSelectElement) {
        score += spec.key === "sex" || spec.key === "nationality" || spec.key === "issuingCountry" || spec.key === "title" ? 3 : 1;
      }
      if (element.type === "date") {
        score += spec.key === "birthDate" || spec.key === "expiryDate" ? 3 : 0;
      }
      if (!element.value) {
        score += 2;
      }
      if (searchText.includes(spec.key.toLowerCase())) {
        score += 2;
      }

      if (score > bestScore) {
        bestScore = score;
        bestElement = element;
      }
    }

    return bestElement;
  }

  function applyValue(element, key, value) {
    if (element instanceof HTMLSelectElement) {
      return assignSelectValue(element, key, value);
    }

    if (element instanceof HTMLInputElement && element.type === "date") {
      element.value = normalizeDateValue(value);
      dispatchFieldEvents(element);
      return Boolean(element.value);
    }

    element.focus();
    element.value = String(value);
    dispatchFieldEvents(element);
    return true;
  }

  function assignSelectValue(element, key, value) {
    const option = pickSelectOption(element, key, value);
    if (!option) {
      return false;
    }

    element.value = option.value;
    dispatchFieldEvents(element);
    return true;
  }

  function pickSelectOption(element, key, value) {
    const wanted = normalizedOptionCandidates(key, value);

    return Array.from(element.options).find((option) => {
      const optionValue = normalized(option.value);
      const optionText = normalized(option.textContent || "");

      return wanted.some((candidate) => optionValue === candidate || optionText === candidate || optionText.includes(candidate));
    });
  }

  function normalizedOptionCandidates(key, value) {
    const candidates = [normalized(value)];

    if (key === "title") {
      if (normalized(value) === "mr") {
        candidates.push("m", "mr", "m.", "monsieur", "sir");
      } else if (normalized(value) === "mrs") {
        candidates.push("mme", "mrs", "mrs.", "madame", "ms", "miss");
      }
    }

    if (key === "sex") {
      if (normalized(value) === "m") {
        candidates.push("male", "masculin", "homme");
      } else if (normalized(value) === "f") {
        candidates.push("female", "feminin", "femme");
      }
    }

    return candidates.filter(Boolean);
  }

  function fillGroupedDateFields(day, month, year, keywords, groupKey) {
    if (!(day && month && year)) {
      return 0;
    }

    const candidates = Array.from(document.querySelectorAll("select, input")).filter((element) => {
      if (used.has(element) || element.disabled || element.readOnly) {
        return false;
      }

      const text = getContainerSearchText(element);
      return hasAny(text, keywords);
    });

    const groups = new Map();

    for (const element of candidates) {
      const root = getFieldGroupRoot(element);
      const list = groups.get(root) || [];
      list.push(element);
      groups.set(root, list);
    }

    let bestGroup = null;
    let bestScore = 0;

    for (const [root, groupElements] of groups.entries()) {
      const score = groupElements.filter((element) => !element.value).length + groupElements.length;
      if (groupElements.length >= 3 && score > bestScore) {
        bestGroup = { root, elements: groupElements };
        bestScore = score;
      }
    }

    if (!bestGroup) {
      return 0;
    }

    const ordered = orderDateFields(bestGroup.elements).slice(0, 3);
    const values = [day, month, year];
    let count = 0;

    ordered.forEach((element, index) => {
      if (applyValue(element, groupKey, values[index])) {
        used.add(element);
        count += 1;
      }
    });

    if (count) {
      filledKeys.push(groupKey);
    }

    return count;
  }

  function getFieldGroupRoot(element) {
    return (
      element.closest("[data-testid], .form-group, .field, .input-group, .row, .col, .mb-3, .mb-2, .mb-4") ||
      element.parentElement ||
      document.body
    );
  }

  function getContainerSearchText(element) {
    const root =
      element.closest("[data-testid], .form-group, .field, .input-group, .row, .col, .mb-3, .mb-2, .mb-4") ||
      element.parentElement ||
      element;

    return normalized(root.innerText || root.textContent || "");
  }

  function orderDateFields(groupElements) {
    const typeRank = (element) => {
      const text = getSearchText(element);
      if (hasAny(text, ["day", "jour"])) {
        return 0;
      }
      if (hasAny(text, ["month", "mois"])) {
        return 1;
      }
      if (hasAny(text, ["year", "annee"])) {
        return 2;
      }
      return 10;
    };

    return [...groupElements].sort((left, right) => {
      const rankDiff = typeRank(left) - typeRank(right);
      if (rankDiff !== 0) {
        return rankDiff;
      }

      const position = left.compareDocumentPosition(right);
      if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
        return -1;
      }
      if (position & Node.DOCUMENT_POSITION_PRECEDING) {
        return 1;
      }
      return 0;
    });
  }

  function normalizeDateValue(value) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return value;
    }

    return "";
  }

  function dispatchFieldEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }
}

function coalesceValue(...values) {
  return values.find((value) => value && String(value).trim()) || "";
}

function cleanMrzName(value) {
  return String(value || "")
    .replace(/</g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMrzDocumentNumber(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/O/g, "0")
    .replace(/I/g, "1")
    .replace(/</g, "")
    .replace(/[^A-Z0-9]/g, "")
    .trim();
}

function cleanCountryCode(value) {
  return String(value || "")
    .replace(/</g, "")
    .trim();
}

function parseMrzDate(value, kind) {
  const cleaned = String(value || "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1")
    .replace(/S/g, "5")
    .replace(/B/g, "8")
    .replace(/G/g, "6")
    .replace(/[^0-9]/g, "");

  if (!/^\d{6}$/.test(cleaned)) {
    return "";
  }

  const yy = Number(cleaned.slice(0, 2));
  const month = cleaned.slice(2, 4);
  const day = cleaned.slice(4, 6);
  const currentYear = new Date().getFullYear();
  const currentShortYear = currentYear % 100;
  let year = 2000 + yy;

  if (kind === "birth" && yy > currentShortYear) {
    year = 1900 + yy;
  }

  if (kind === "expiry" && year < currentYear - 5) {
    year += 100;
  }

  return `${year}-${month}-${day}`;
}

function capturePattern(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return "";
}

function cleanTextCapture(value) {
  return String(value || "")
    .replace(/</g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLooseDate(value) {
  const match = String(value || "")
    .trim()
    .match(/^([0-3]?\d)[\/.\- ]([01]?\d)[\/.\- ]((?:19|20)?\d{2})$/);

  if (!match) {
    return "";
  }

  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  let year = match[3];

  if (year.length === 2) {
    year = Number(year) > 50 ? `19${year}` : `20${year}`;
  }

  return `${year}-${month}-${day}`;
}

function normalizeSex(value) {
  const cleaned = String(value || "").trim().toUpperCase();

  if (cleaned === "M") {
    return "M";
  }

  if (cleaned === "F") {
    return "F";
  }

  return "";
}

function inferTitleFromSex(value) {
  if (value === "M") {
    return "Mr";
  }

  if (value === "F") {
    return "Mrs";
  }

  return "";
}

function formatDisplayDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return "";
  }

  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function extractDatePart(value, part) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) {
    return "";
  }

  const [year, month, day] = value.split("-");

  if (part === "year") {
    return year;
  }

  if (part === "month") {
    return month;
  }

  return day;
}
