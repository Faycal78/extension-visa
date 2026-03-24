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
const dashboardRecordsSelect = document.getElementById("dashboard-records");
const loadRecordButton = document.getElementById("load-record-button");
const { createWorker } = globalThis.Tesseract;

const OCR_LANGUAGE_PATH = chrome.runtime.getURL("vendor/tessdata/4.0.0_best_int");
const OCR_CORE_PATH = chrome.runtime.getURL("vendor/tesseract-core");
const OCR_WORKER_PATH = chrome.runtime.getURL("vendor/tesseract/worker.min.js");
const BACKEND_URL_STORAGE_KEY = "visa-ocr-backend-url";
const DEFAULT_BACKEND_URL = "https://pv-provisa.com";
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
let dashboardRecords = [];

initializePopup();
captureButton.addEventListener("click", captureActiveTab);
pickButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", handleFilePick);
fillButton.addEventListener("click", autofillActiveTab);
syncButton.addEventListener("click", syncToBackend);
copyButton.addEventListener("click", copyTextResult);
languageSelect.addEventListener("change", handleLanguageChange);
backendUrlInput.addEventListener("change", persistBackendUrl);
backendUrlInput.addEventListener("change", loadDashboardRecords);
loadRecordButton.addEventListener("click", loadSelectedDashboardRecord);
dashboardRecordsSelect.addEventListener("change", () => {
  if (dashboardRecordsSelect.value) {
    loadSelectedDashboardRecord();
  }
});

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

  loadDashboardRecords();
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
    setBackendStatus("Envoi au dashboard web...");
    syncButton.disabled = true;

    const response = await fetch(buildSubmissionEndpoint(backendBaseUrl), {
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
    const dashboardUrl = result.dashboard_url || buildDashboardUrl(backendBaseUrl);
    setBackendStatus(`Envoye au backend. ID ${result.id}. Dashboard: ${dashboardUrl}`);
    await loadDashboardRecords();
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
    if (source.startsWith("data:")) {
      return dataUrlToBlob(source);
    }

    const response = await fetch(source);
    return response.blob();
  }

  throw new Error("Format d'image non pris en charge.");
}

function dataUrlToBlob(dataUrl) {
  const match = dataUrl.match(/^data:([^;,]+)?(?:;base64)?,(.*)$/);

  if (!match) {
    throw new Error("Image inline invalide.");
  }

  const mimeType = match[1] || "application/octet-stream";
  const encoded = match[2] || "";
  const isBase64 = dataUrl.includes(";base64,");
  const binary = isBase64 ? atob(encoded) : decodeURIComponent(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
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
  setBackendStatus("Entrez l'URL racine du dashboard web, puis utilisez `Envoyer au backend`.");
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
    ara: "arabe",
    "fra+eng": "francais + anglais",
    "fra+ara": "francais + arabe",
    "eng+ara": "anglais + arabe",
    "fra+eng+ara": "francais + anglais + arabe"
  };

  return labels[value] || value;
}

function hydrateBackendUrl() {
  const savedUrl = localStorage.getItem(BACKEND_URL_STORAGE_KEY);
  backendUrlInput.value = savedUrl || DEFAULT_BACKEND_URL;
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

async function loadDashboardRecords() {
  const backendBaseUrl = normalizeBackendUrl(backendUrlInput.value) || DEFAULT_BACKEND_URL;
  const endpoint = buildSubmissionEndpoint(backendBaseUrl);

  try {
    dashboardRecordsSelect.disabled = true;
    loadRecordButton.disabled = true;

    const response = await fetch(endpoint, {
      headers: { Accept: "application/json" }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const result = await response.json();
    dashboardRecords = Array.isArray(result.items) ? result.items : [];
    renderDashboardRecords();
    setBackendStatus(`Dashboard connecte. ${dashboardRecords.length} fiche(s) chargee(s).`);
    if (dashboardRecords.length) {
      dashboardRecordsSelect.value = String(dashboardRecords[0].id);
      loadSelectedDashboardRecord();
    }
  } catch (error) {
    dashboardRecords = [];
    renderDashboardRecords();
    const message = error instanceof Error ? error.message : "Erreur reseau.";
    setBackendStatus(`Connexion dashboard impossible: ${message}`);
  } finally {
    dashboardRecordsSelect.disabled = false;
    loadRecordButton.disabled = !dashboardRecords.length;
  }
}

function renderDashboardRecords() {
  dashboardRecordsSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = dashboardRecords.length
    ? "Choisir une fiche enregistree"
    : "Aucune fiche disponible";
  dashboardRecordsSelect.appendChild(placeholder);

  dashboardRecords.forEach((record) => {
    const option = document.createElement("option");
    option.value = String(record.id);
    option.textContent = `#${record.id} | ${record.full_name || "Sans nom"} | ${record.passport_number || "Sans passeport"} | ${record.created_at || ""}`;
    dashboardRecordsSelect.appendChild(option);
  });
}

function loadSelectedDashboardRecord() {
  const selectedId = dashboardRecordsSelect.value;
  const record = dashboardRecords.find((item) => String(item.id) === selectedId);

  if (!record) {
    setBackendStatus("Selectionnez une fiche du dashboard.");
    return;
  }

  const extracted = normalizeRecordToPassportData(record);
  latestText = record.raw_text || "";
  latestPassportData = extracted;
  resultEl.textContent = latestText || "Fiche chargee depuis le dashboard.";
  resultEl.classList.toggle("empty", !latestText);
  renderPassportData(extracted);
  copyButton.disabled = !latestText;
  fillButton.disabled = !hasPassportAutofillData(extracted);
  syncButton.disabled = !hasPassportAutofillData(extracted);
  setBackendStatus(`Fiche ${record.id} chargee depuis le dashboard.`);
  setStatus("Fiche dashboard prete pour le pre-remplissage.");
}

function normalizeRecordToPassportData(record) {
  const extracted = record.extracted_data && typeof record.extracted_data === "object" ? record.extracted_data : {};
  const birthDate = extracted.birthDate || record.birth_date || "";
  const expiryDate = extracted.expiryDate || record.expiry_date || "";
  const sex = extracted.sex || record.sex || "";
  const title = extracted.title || record.title || inferTitleFromSex(sex);
  const surname = extracted.surname || record.surname || "";
  const givenNames = extracted.givenNames || record.given_names || "";

  return {
    surname,
    givenNames,
    fullName: extracted.fullName || record.full_name || [givenNames, surname].filter(Boolean).join(" ").trim(),
    title,
    passportNumber: extracted.passportNumber || record.passport_number || "",
    nationality: extracted.nationality || record.nationality || "",
    issuingCountry: extracted.issuingCountry || record.issuing_country || "",
    birthDate,
    expiryDate,
    sex,
    mobilePhone: extracted.mobilePhone || record.mobile_phone || "",
    email: extracted.email || record.email || "",
    emailConfirm: extracted.emailConfirm || extracted.email || record.email || "",
    departureDate: extracted.departureDate || "",
    visaStayDuration: extracted.visaStayDuration || "short_stay_visa",
    travelPurpose: extracted.travelPurpose || "",
    typeVisa: extracted.typeVisa || "",
    visaVariation: extracted.visaVariation || "",
    visaChecklist: extracted.visaChecklist || "",
    visaFileVariation: extracted.visaFileVariation || "",
    nbTravellers: extracted.nbTravellers || record.nb_travellers || "1",
    formula: extracted.formula || record.formula || "standard",
    birthDay: extractDatePart(birthDate, "day"),
    birthMonth: extractDatePart(birthDate, "month"),
    birthYear: extractDatePart(birthDate, "year"),
    expiryDay: extractDatePart(expiryDate, "day"),
    expiryMonth: extractDatePart(expiryDate, "month"),
    expiryYear: extractDatePart(expiryDate, "year"),
    departureDay: extractDatePart(extracted.departureDate || "", "day"),
    departureMonth: extractDatePart(extracted.departureDate || "", "month"),
    departureYear: extractDatePart(extracted.departureDate || "", "year")
  };
}

function buildSubmissionEndpoint(baseUrl) {
  if (/passport-submissions(?:\.php)?$/.test(baseUrl)) {
    return baseUrl;
  }

  return `${baseUrl}/api/passport-submissions.php`;
}

function buildDashboardUrl(baseUrl) {
  if (/\/dashboard$/.test(baseUrl)) {
    return baseUrl;
  }

  return `${baseUrl}/dashboard`;
}

function extractPassportData(text) {
  const mrzData = extractMrzPassportData(text);
  const fallbackData = extractPassportFallbackData(text);
  const arabicData = extractPassportArabicData(text);
  const data = {
    surname: coalesceValue(mrzData.surname, fallbackData.surname, arabicData.surname),
    givenNames: coalesceValue(mrzData.givenNames, fallbackData.givenNames, arabicData.givenNames),
    passportNumber: coalesceValue(mrzData.passportNumber, fallbackData.passportNumber),
    nationality: coalesceValue(fallbackData.nationality, mrzData.nationality, arabicData.nationality),
    issuingCountry: coalesceValue(fallbackData.issuingCountry, mrzData.issuingCountry, arabicData.issuingCountry),
    birthDate: coalesceValue(mrzData.birthDate, fallbackData.birthDate, arabicData.birthDate),
    expiryDate: coalesceValue(mrzData.expiryDate, fallbackData.expiryDate),
    sex: coalesceValue(mrzData.sex, fallbackData.sex, arabicData.sex),
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
  data.mobilePhone = "";
  data.email = "";
  data.emailConfirm = "";
  data.departureDate = "";
  data.departureDay = "";
  data.departureMonth = "";
  data.departureYear = "";
  data.visaStayDuration = "short_stay_visa";
  data.travelPurpose = "";
  data.typeVisa = "";
  data.visaVariation = "";
  data.visaChecklist = "";
  data.visaFileVariation = "";
  data.nbTravellers = "1";
  data.formula = "standard";

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

function extractPassportArabicData(text) {
  const normalizedText = normalizeArabicDigits(String(text || "")).replace(/\r/g, "");

  return {
    surname: cleanArabicTextCapture(
      capturePattern(normalizedText, [
        /(?:اللقب|اسم\s+العائلة|النسب)\s*[:\-]?\s*([\p{Script=Arabic}\s]{2,40})/u
      ])
    ),
    givenNames: cleanArabicTextCapture(
      capturePattern(normalizedText, [
        /(?:الاسم(?:\s+الشخصي)?|الاسم\s+الكامل|الاسماء\s+الشخصية)\s*[:\-]?\s*([\p{Script=Arabic}\s]{2,60})/u
      ])
    ),
    nationality: cleanArabicTextCapture(
      capturePattern(normalizedText, [
        /(?:الجنسية)\s*[:\-]?\s*([\p{Script=Arabic}\s]{2,30})/u
      ])
    ),
    issuingCountry: cleanArabicTextCapture(
      capturePattern(normalizedText, [
        /(?:بلد\s+الإصدار|بلد\s+الاصدار|دولة\s+الإصدار|دولة\s+الاصدار)\s*[:\-]?\s*([\p{Script=Arabic}\s]{2,30})/u
      ])
    ),
    birthDate: normalizeLooseDate(
      capturePattern(normalizedText, [
        /(?:تاريخ\s+الميلاد|تاريخ\s+الازدياد)\s*[:\-]?\s*([0-3]?\d[\/.\- ][01]?\d[\/.\- ](?:19|20)?\d{2})/u
      ])
    ),
    sex: normalizeSex(
      capturePattern(normalizedText, [
        /(?:الجنس)\s*[:\-]?\s*([MF])/u,
        /(?:الجنس)\s*[:\-]?\s*(ذكر|انثى|أنثى)/u
      ])
        .replace("ذكر", "M")
        .replace("انثى", "F")
        .replace("أنثى", "F")
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
    ["Telephone", data.mobilePhone],
    ["Email", data.email],
    ["Date de depart", formatDisplayDate(data.departureDate)],
    ["Type de visa", data.visaStayDuration],
    ["Projet", data.travelPurpose],
    ["Motif principal", data.typeVisa],
    ["Variation visa", data.visaVariation],
    ["Situation demandeur", data.visaChecklist],
    ["Categorie demandeur", data.visaFileVariation],
    ["Sexe", data.sex],
    ["Nombre de demandeurs", data.nbTravellers],
    ["Formule", data.formula]
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
      data.mobilePhone ||
      data.email ||
      data.departureDate ||
      data.visaStayDuration ||
      data.travelPurpose ||
      data.typeVisa ||
      data.visaVariation ||
      data.visaChecklist ||
      data.visaFileVariation ||
      data.sex ||
      data.nbTravellers ||
      data.formula
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
    mobilePhone: data.mobilePhone || "",
    email: data.email || "",
    emailConfirm: data.emailConfirm || data.email || "",
    departureDate: data.departureDate || "",
    departureDateDisplay: formatDisplayDate(data.departureDate),
    departureDay: data.departureDay || "",
    departureMonth: data.departureMonth || "",
    departureYear: data.departureYear || "",
    visaStayDuration: data.visaStayDuration || "",
    travelPurpose: data.travelPurpose || "",
    typeVisa: data.typeVisa || "",
    visaVariation: data.visaVariation || "",
    visaChecklist: data.visaChecklist || "",
    visaFileVariation: data.visaFileVariation || "",
    sex: data.sex || "",
    nbTravellers: data.nbTravellers || "1",
    formula: data.formula || "standard"
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

  const capagoResult = fillCapagoKnownLayout();
  capagoResult.usedElements.forEach((element) => used.add(element));
  filledCount += capagoResult.filledCount;
  filledKeys.push(...capagoResult.filledKeys);

  filledCount += fillGroupedDateFields(
    passportData.birthDay,
    passportData.birthMonth,
    passportData.birthYear,
    ["date de naissance", "date of birth", "naissance", "dob"],
    "birth"
  );

  filledCount += fillGroupedDateFields(
    passportData.expiryDay,
    passportData.expiryMonth,
    passportData.expiryYear,
    ["date d expiration", "date of expiry", "expiration", "expiry", "expire"],
    "expiry"
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
      key: "nbTravellers",
      value: passportData.nbTravellers,
      matcher: (text, element) =>
        element instanceof HTMLInputElement &&
        hasAny(text, ["nombre de demandeurs", "nb travellers", "nb_travellers", "travellers", "demandeurs"])
    },
    {
      key: "formula",
      value: passportData.formula,
      matcher: (text, element) =>
        element instanceof HTMLInputElement &&
        element.type === "radio" &&
        hasAny(text, ["demande standard", "service premium", "formula", "premium", "standard"])
    },
    {
      key: "mobilePhone",
      value: passportData.mobilePhone,
      matcher: (text, element) =>
        element instanceof HTMLInputElement &&
        hasAny(text, ["telephone", "telephone mobile", "phone", "mobile"])
    },
    {
      key: "email",
      value: passportData.email,
      matcher: (text, element) =>
        element instanceof HTMLInputElement &&
        hasAny(text, ["email", "e mail"]) &&
        !hasAny(text, ["confirmation", "confirm"])
    },
    {
      key: "emailConfirm",
      value: passportData.emailConfirm,
      matcher: (text, element) =>
        element instanceof HTMLInputElement &&
        hasAny(text, ["confirmation de l email", "confirm email", "email confirm"])
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
    },
    {
      key: "visaStayDuration",
      value: passportData.visaStayDuration,
      matcher: (text, element) =>
        element instanceof HTMLSelectElement &&
        hasAny(text, ["type de visa demande", "visa stay duration", "duree de sejour"])
    },
    {
      key: "travelPurpose",
      value: passportData.travelPurpose,
      matcher: (text, element) =>
        element instanceof HTMLSelectElement &&
        hasAny(text, ["votre projet", "travel purpose"])
    },
    {
      key: "typeVisa",
      value: passportData.typeVisa,
      matcher: (text, element) =>
        element instanceof HTMLSelectElement &&
        hasAny(text, ["motif principal du sejour", "type visa", "motif principal"])
    },
    {
      key: "visaVariation",
      value: passportData.visaVariation,
      matcher: (text, element) =>
        element instanceof HTMLSelectElement &&
        hasAny(text, ["variation de visa", "variation visa", "precision1"])
    },
    {
      key: "visaChecklist",
      value: passportData.visaChecklist,
      matcher: (text, element) =>
        element instanceof HTMLSelectElement &&
        hasAny(text, ["situation du demandeur", "situation demandeur", "precision2"])
    },
    {
      key: "visaFileVariation",
      value: passportData.visaFileVariation,
      matcher: (text, element) =>
        element instanceof HTMLSelectElement &&
        hasAny(text, ["categorie du demandeur", "visa file variation"])
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

      const fieldText = getSearchText(element);
      const containerText = getContainerSearchText(element);
      const searchText = `${fieldText} ${containerText}`.trim();

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
    if (element instanceof HTMLInputElement && element.type === "radio") {
      return assignRadioValue(element, key, value);
    }

    if (element instanceof HTMLSelectElement) {
      return assignSelectValue(element, key, value);
    }

    if (element instanceof HTMLInputElement && element.type === "date") {
      element.value = normalizeDateValue(value);
      element.setAttribute("value", element.value);
      dispatchFieldEvents(element);
      return Boolean(element.value);
    }

    setNativeFieldValue(element, String(value));
    element.focus();
    element.setAttribute("value", String(value));
    dispatchFieldEvents(element);
    return true;
  }

  function assignRadioValue(element, key, value) {
    const target = pickRadioTarget(element, key, value);
    if (!target) {
      return false;
    }

    target.checked = true;
    target.setAttribute("checked", "checked");
    dispatchFieldEvents(target);
    target.click();
    return target.checked;
  }

  function pickRadioTarget(element, key, value) {
    const candidates = Array.from(
      document.querySelectorAll(`input[type="radio"][name="${CSS.escape(element.name || "")}"]`)
    );
    const wanted = normalizedOptionCandidates(key, value);

    return candidates.find((candidate) => {
      const radioText = `${candidate.value} ${candidate.id} ${getLabelText(candidate)}`.trim();
      const normalizedText = normalized(radioText);
      return wanted.some((entry) => normalizedText.includes(entry));
    }) || null;
  }

  function assignSelectValue(element, key, value) {
    const option = pickSelectOption(element, key, value);
    if (!option) {
      return false;
    }

    Array.from(element.options).forEach((entry) => {
      entry.selected = false;
    });

    option.selected = true;
    element.selectedIndex = Array.from(element.options).indexOf(option);
    element.value = option.value;
    syncSelectricUi(element, option);
    dispatchSelectEvents(element);
    return element.value === option.value || element.selectedIndex >= 0;
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
    const normalizedValue = normalized(value);
    const candidates = [normalizedValue];

    if (key === "title") {
      if (["mr", "m", "monsieur", "sir"].includes(normalizedValue)) {
        candidates.push("m", "mr", "monsieur", "sir");
      }

      if (
        ["ms", "mrs", "miss", "madame", "mme", "mademoiselle", "mlle"].includes(normalizedValue)
      ) {
        candidates.push("ms", "mrs", "miss", "madame", "mme", "mademoiselle", "mlle");
      }
    }

    if (key === "sex") {
      if (normalizedValue === "m") {
        candidates.push("male", "masculin", "homme");
      } else if (normalizedValue === "f") {
        candidates.push("female", "feminin", "femme");
      }
    }

    if (key === "formula") {
      if (normalizedValue === "standard") {
        candidates.push("standard", "demande standard");
      }
      if (normalizedValue === "premium") {
        candidates.push("premium", "service premium");
      }
    }

    if (key === "visaStayDuration") {
      if (normalizedValue.includes("long")) {
        candidates.push("long_stay_visa", "long sejour", "long stay");
      }
      if (normalizedValue.includes("short") || normalizedValue.includes("court")) {
        candidates.push("short_stay_visa", "court sejour", "short stay");
      }
      if (normalizedValue.includes("transit")) {
        candidates.push("transit_visa", "airport transit", "transit");
      }
    }

    if (key === "travelPurpose") {
      if (normalizedValue.includes("etablissement") || normalizedValue === "establishment") {
        candidates.push("establishment", "etablissement familial ou prive", "etablissement_familial_prive");
      }
      if (normalizedValue.includes("medical") || normalizedValue === "medical") {
        candidates.push("medical", "raisons medicales", "raisons_medicales");
      }
      if (normalizedValue.includes("tourisme") || normalizedValue === "tourism") {
        candidates.push("tourism", "tourisme");
      }
      if (
        normalizedValue.includes("travailler") ||
        normalizedValue.includes("business") ||
        normalizedValue === "business"
      ) {
        candidates.push("business", "travailler");
      }
      if (normalizedValue.includes("visite") || normalizedValue === "family") {
        candidates.push("family", "visite familiale ou privee", "visite_familiale_privee");
      }
      if (
        normalizedValue.includes("etudes") ||
        normalizedValue.includes("etudiant") ||
        normalizedValue === "study"
      ) {
        candidates.push("study", "etudes", "etudiant", "etudes");
      }
      if (normalizedValue.includes("installation familiale") || normalizedValue.includes("majeur")) {
        candidates.push(
          "family",
          "installation_familiale_privee_majeur",
          "installation familiale ou privee (majeur)",
          "installation familiale ou privee majeur"
        );
      }
      if (normalizedValue.includes("mineur")) {
        candidates.push(
          "family_minor",
          "installation_familiale_privee_mineur",
          "installation familiale ou privee (mineur)",
          "installation familiale ou privee mineur"
        );
      }
      if (normalizedValue.includes("stage")) {
        candidates.push("placement", "stage_salarie", "stage salarie");
      }
      if (normalizedValue.includes("travailler") || normalizedValue === "work") {
        candidates.push("work", "travailler");
      }
      if (normalizedValue.includes("retour")) {
        candidates.push("return", "visa_de_retour", "visa de retour");
      }
      if (normalizedValue.includes("visiteur") || normalizedValue === "visitor") {
        candidates.push("visitor", "visiteur", "visiteur");
      }
      if (normalizedValue.includes("etudes") || normalizedValue.includes("etudiant") || normalizedValue === "study") {
        candidates.push("study", "etudes", "etudiant");
      }
      if (normalizedValue.includes("airport transit")) {
        candidates.push("transit", "airport transit", "airport_transit", "transit");
      }
    }

    if (key === "typeVisa") {
      const knownTypeVisas = [
        ["013-BA3B8", "Ascendant a charge de Francais ou de son conjoint etranger"],
        ["013-BC73C", "Conjoint de francais"],
        ["013-9ACB7", "Conjoint de scientifique / chercheur"],
        ["013-179001", "Enfant majeur a charge de francais"],
        ["013-9CF63", "Enfant mineur de Francais"],
        ["013-11725B", "Famille de ressortissant UE/EEE/Suisse"],
        ["013-B9DF8", "Parent d'enfant francais mineur"],
        ["013-1176AB", "Soins medicaux"],
        ["013-1C5AE5", "Tourisme / Visite privee"],
        ["013-145AB4", "Embauche ou detachement de salarie"],
        ["017-D6EC9", "Employe au service d'un etranger ou d'un francais"],
        ["013-D37EE", "Manifestation culturelle, artistique, scientifique, sportive y compris mission ponctuelle"],
        ["013-377E4", "Mannequin"],
        ["013-1501C0", "Marin"],
        ["20241025-A210", "Mission officielle diplomate et membre d'une organisation internationale sur passeport ordinaire"],
        ["013-3137B", "Scientifique / Chercheur"],
        ["013-F59A2", "Stage salarie"],
        ["013-DAFD0", "Voyage professionnel"],
        ["013-6059B", "En vue de mariage avec un ressortissant francais"],
        ["013-8B572", "Membres d'une congregation religieuse relevant du Formulaire Unique"],
        ["013-E0806", "Visite familiale"],
        ["013-113581", "Visite familiale / enfant ou parent etranger de Francais ou de son conjoint"],
        ["013-B3FFD", "Visite privee / conjoint de francais"],
        ["013-1FDF5", "Visite privee / famille de UE/EEE/Suisse"],
        ["013-124AEA", "Etudiant / Etudiant-Concours"],
        ["013-36697", "Stage etudiant"],
        ["017-335A8", "Adoption de mineur"],
        ["013-16172C", "Enfant mineur (- de 18 ans) de refugie, de beneficiaire de la protection subsidiaire ou d'apatride"],
        ["017-1F6082", "Enfant mineur de beneficiaire de l'accord franco-russe"],
        ["017-20D9A", "Enfant mineur de scientifique / chercheur"],
        ["024-131BCA", "Famille accompagnante beneficiaire passeport talent (Mineur)"],
        ["017-568F2", "Frere mineur, soeur mineure de refugie, de beneficiaire de la protection subsidiaire ou d'apatride"],
        ["013-19BD3", "Regroupement familial (Enfant mineur, dont enfant mineur de conjoint etranger de Francais)"],
        ["013-128EF4", "Ascendant non a charge"],
        ["017-E7A42", "Conjoint de beneficiaire de l'accord franco-russe"],
        ["013-9AE03", "Conjoint ou concubin de refugie, de beneficiaire de la protection subsidiaire ou d'apatride"],
        ["013-56469", "Enfant majeur (19 ans au plus) de refugie, de beneficiaire de la protection subsidiaire ou d'apatride"],
        ["013-FE9E", "Enfant majeur a charge de scientifique / chercheur"],
        ["024-1C8D5A", "Famille accompagnante beneficiaire passeport talent (Majeur)"],
        ["013-59959", "Pere/Mere de refugie, de beneficiaire de la protection subsidiaire ou d'apatride"],
        ["013-165103", "Regroupement familial"],
        ["013-CA581", "Titulaire d'une rente d'accident du travail ou de maladie professionnelle, versee par un Organisme francais"],
        ["013-B8022", "Ayant-droit titulaire d'une rente d'accident du travail ou de maladie professionnelle, versee par un Organisme francais"],
        ["013-1757AD", "Visiteur majeur"],
        ["013-EC4BA", "Visiteur mineur"],
        ["013-5DFA3", "Embauche ou detachement de salarie"],
        ["013-32DE2", "Entrepreneur (artisan, industriel ou commercant)"],
        ["013-132BBA", "Exercice d'une activite artistique / culturelle"],
        ["013-FC764", "Exercice d'une activite scientifique / recherche"],
        ["013-27918", "Profession liberale ou independante"],
        ["017-3755C", "Etudiant"],
        ["013-98892", "Mineur scolarise (primaire, secondaire ou superieur), sejour individuel"],
        ["017-1377D6", "Mineur scolarise (primaire, secondaire ou superieur), sejour organise par un organisme specialise"],
        ["013-143096", "Stage etudiant"],
        ["013-199E9F", "Stage professionnel salarie"],
        ["013-E58E6", "Visa de retour"],
        ["180713-EU_Family_Visa", "Transit Aeroportuaire"]
      ];

      for (const [id, label] of knownTypeVisas) {
        const normalizedId = normalizeText(id);
        const normalizedLabel = normalizeText(label);
        if (
          normalizedValue === normalizedId ||
          normalizedValue === normalizedLabel ||
          normalizedLabel.includes(normalizedValue) ||
          normalizedValue.includes(normalizedLabel)
        ) {
          candidates.push(id, label);
        }
      }
    }

    if (key === "visaFileVariation") {
      if (normalizedValue.includes("circulation")) {
        candidates.push("circulation", "circulation");
      }
      if (normalizedValue.includes("primo")) {
        candidates.push("primo_demand", "primo-demande", "primo demande");
      }
      if (normalizedValue.includes("renewal") || normalizedValue.includes("renouvellement") || normalizedValue.includes("voyageur frequent")) {
        candidates.push(
          "renewal",
          "renouvellement",
          "voyageur frequent (renouvellement)",
          "voyageur frequent renouvellement"
        );
      }
      if (normalizedValue.includes("organisation professionnelle") || normalizedValue.includes("ordre professionnel") || normalizedValue.includes("prof org")) {
        candidates.push(
          "prof_org",
          "membre d'une organisation professionnelle",
          "membre d un ordre professionnel",
          "organisation professionnelle"
        );
      }
    }

    if (/day$/i.test(key)) {
      candidates.push(...buildDayCandidates(value));
    }

    if (/month$/i.test(key)) {
      candidates.push(...buildMonthCandidates(value));
    }

    if (/year$/i.test(key)) {
      candidates.push(String(Number(value || 0)));
    }

    return [...new Set(candidates.filter(Boolean))];
  }

  function fillCapagoKnownLayout() {
    if (!/capago\.eu$/i.test(window.location.hostname)) {
      return { filledCount: 0, filledKeys: [], usedElements: [] };
    }

    const section = findCapagoApplicantSection();
    if (!section) {
      return { filledCount: 0, filledKeys: [], usedElements: [] };
    }

    const localUsed = [];
    const localKeys = [];
    let localCount = 0;

    const visibleSelects = Array.from(section.querySelectorAll("select")).filter(isVisibleElement);
    const visibleInputs = Array.from(section.querySelectorAll("input, textarea"))
      .filter(isVisibleElement)
      .filter((element) => {
        if (!(element instanceof HTMLInputElement)) {
          return true;
        }

        const blockedTypes = new Set(["hidden", "file", "password", "submit", "button", "reset", "image", "checkbox", "radio"]);
        return !blockedTypes.has(element.type);
      });

    const titleSelect =
      section.querySelector('.field-wrapper[data-input="title"] select') ||
      pickFieldInSection(section, "select", ["titre", "civilite"]) ||
      visibleSelects[0] ||
      null;
    const surnameInput = pickFieldInSection(section, "input", ["nom de famille"]) || visibleInputs[0] || null;
    const givenNamesInput = pickFieldInSection(section, "input", ["prenom"]) || visibleInputs[1] || null;
    const passportInput =
      pickFieldInSection(section, "input", ["numero du passeport", "numero passeport"]) ||
      visibleInputs.find((element) => {
        const context = getElementTextContext(element);
        return context.includes("passeport");
      }) ||
      visibleInputs[5] ||
      null;
    const travellersInput =
      section.querySelector('#nb_travellers, input[name="nb_travellers"]') ||
      pickFieldInSection(section, "input", ["nombre de demandeurs", "nb travellers", "demandeurs"]) ||
      null;
    const phoneInput = section.querySelector("#phone_traveller_1, input[name='phone_traveller_1']");
    const emailInput = section.querySelector("#email_traveller_1, input[name='email_traveller_1']");
    const emailConfirmInput = section.querySelector("#email_confirm_traveller_1, input[name='email_confirm_traveller_1']");
    const birthSelects =
      pickCapagoBirthSelects(section) ||
      pickDateSelectsInSection(section, ["date de naissance", "naissance"]) ||
      visibleSelects.slice(1, 4);
    const departureSelects = pickCapagoDepartureSelects(section);
    const visaStayDurationSelect = section.querySelector("#visa_stay_duration_traveller_1");
    const travelPurposeSelect = section.querySelector("#travel_purpose_traveller_1");
    const typeVisaSelect = section.querySelector("#type_visa_traveller_1");
    const visaVariationSelect = section.querySelector("#precision1_traveller_1");
    const visaChecklistSelect = section.querySelector("#precision2_traveller_1");
    const visaFileVariationSelect = section.querySelector("#visa_file_variation_traveller_1");
    const standardRadio = section.querySelector('input[type="radio"][name="formula"][value="standard"]');
    const premiumRadio = section.querySelector('input[type="radio"][name="formula"][value="premium"]');

    localCount += assignIfPresent(titleSelect, "title", passportData.title, "title");
    localCount += assignIfPresent(surnameInput, "surname", passportData.surname, "surname");
    localCount += assignIfPresent(givenNamesInput, "givenNames", passportData.givenNames, "givenNames");
    localCount += assignIfPresent(passportInput, "passportNumber", passportData.passportNumber, "passportNumber");
    localCount += assignIfPresent(phoneInput, "mobilePhone", passportData.mobilePhone, "mobilePhone");
    localCount += assignIfPresent(emailInput, "email", passportData.email, "email");
    localCount += assignIfPresent(emailConfirmInput, "emailConfirm", passportData.emailConfirm || passportData.email, "emailConfirm");
    localCount += assignIfPresent(travellersInput, "nbTravellers", passportData.nbTravellers, "nbTravellers");
    localCount += assignIfPresent(
      passportData.formula === "premium" ? premiumRadio : standardRadio,
      "formula",
      passportData.formula,
      "formula"
    );
    localCount += assignIfPresent(visaStayDurationSelect, "visaStayDuration", passportData.visaStayDuration, "visaStayDuration");
    localCount += assignIfPresent(travelPurposeSelect, "travelPurpose", passportData.travelPurpose, "travelPurpose");
    localCount += assignIfPresent(typeVisaSelect, "typeVisa", passportData.typeVisa, "typeVisa");
    localCount += assignIfPresent(visaVariationSelect, "visaVariation", passportData.visaVariation, "visaVariation");
    localCount += assignIfPresent(visaChecklistSelect, "visaChecklist", passportData.visaChecklist, "visaChecklist");
    localCount += assignIfPresent(visaFileVariationSelect, "visaFileVariation", passportData.visaFileVariation, "visaFileVariation");
    scheduleDependentSelectRetries();

    if (birthSelects?.length >= 3 && passportData.birthDay && passportData.birthMonth && passportData.birthYear) {
      const dateValues = [passportData.birthDay, passportData.birthMonth, passportData.birthYear];
      const dateKeys = ["birthDay", "birthMonth", "birthYear"];

      birthSelects.slice(0, 3).forEach((element, index) => {
        if (assignIfPresent(element, dateKeys[index], dateValues[index], "birthDateGroup")) {
          localCount += 1;
        }
      });
    }

    if (departureSelects?.length >= 3 && passportData.departureDay && passportData.departureMonth && passportData.departureYear) {
      const dateValues = [passportData.departureDay, passportData.departureMonth, passportData.departureYear];
      const dateKeys = ["departureDay", "departureMonth", "departureYear"];

      departureSelects.slice(0, 3).forEach((element, index) => {
        if (assignIfPresent(element, dateKeys[index], dateValues[index], "departureDateGroup")) {
          localCount += 1;
        }
      });
    }

    return {
      filledCount: localCount,
      filledKeys: [...new Set(localKeys)],
      usedElements: localUsed
    };

    function assignIfPresent(element, key, value, filledKey) {
      if (!element || !value) {
        return 0;
      }

      if (!applyValue(element, key, value)) {
        return 0;
      }

      localUsed.push(element);
      localKeys.push(filledKey);
      return 1;
    }

    function scheduleDependentSelectRetries() {
      const dependentFields = [
        [() => section.querySelector("#travel_purpose_traveller_1"), "travelPurpose", passportData.travelPurpose],
        [() => section.querySelector("#type_visa_traveller_1"), "typeVisa", passportData.typeVisa],
        [() => section.querySelector("#precision1_traveller_1"), "visaVariation", passportData.visaVariation],
        [() => section.querySelector("#precision2_traveller_1"), "visaChecklist", passportData.visaChecklist],
        [() => section.querySelector("#visa_file_variation_traveller_1"), "visaFileVariation", passportData.visaFileVariation]
      ].filter(([, , value]) => Boolean(value));

      if (!dependentFields.length) {
        return;
      }

      [250, 800, 1600, 2800, 4200].forEach((delay) => {
        window.setTimeout(() => {
          dependentFields.forEach(([getElement, key, value]) => {
            const element = getElement();
            if (!element) {
              return;
            }

            applyValue(element, key, value);
          });
        }, delay);
      });
    }
  }

  function findCapagoApplicantSection() {
    const headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6, div, p, span"));
    const marker = headings.find((element) =>
      normalized(element.textContent || "").includes("demandeur 1 interlocuteur principal")
    );

    if (!marker) {
      return null;
    }

    let current = marker.parentElement;
    while (current && current !== document.body) {
      const inputCount = current.querySelectorAll("input, select, textarea").length;
      if (inputCount >= 8) {
        return current;
      }
      current = current.parentElement;
    }

    return marker.parentElement;
  }

  function pickFieldInSection(section, selector, keywords) {
    const fields = Array.from(section.querySelectorAll(selector)).filter((element) => !element.disabled && !element.readOnly);

    return fields.find((element) => hasAny(getElementTextContext(element), keywords)) || null;
  }

  function pickDateSelectsInSection(section, keywords) {
    const selects = Array.from(section.querySelectorAll("select")).filter(isVisibleElement);
    let bestRun = null;

    for (let index = 0; index <= selects.length - 3; index += 1) {
      const run = selects.slice(index, index + 3);
      const context = normalized(run.map((element) => getElementTextContext(element)).join(" "));

      if (!hasAny(context, keywords)) {
        continue;
      }

      bestRun = run;
      break;
    }

    return bestRun;
  }

  function pickCapagoBirthSelects(section) {
    const birthWrapper = section.querySelector('.field-wrapper[data-input="birth"]');
    if (!birthWrapper) {
      return null;
    }

    const daySelect = birthWrapper.querySelector("select.day");
    const monthSelect = birthWrapper.querySelector("select.month");
    const yearSelect = birthWrapper.querySelector("select.year");

    if (!(daySelect && monthSelect && yearSelect)) {
      return null;
    }

    return [daySelect, monthSelect, yearSelect];
  }

  function pickCapagoDepartureSelects(section) {
    const departureWrapper = section.querySelector('.field-wrapper[data-input="departure_date"]');
    if (!departureWrapper) {
      return null;
    }

    const daySelect = departureWrapper.querySelector("select.day");
    const monthSelect = departureWrapper.querySelector("select.month");
    const yearSelect = departureWrapper.querySelector("select.year");

    if (!(daySelect && monthSelect && yearSelect)) {
      return null;
    }

    return [daySelect, monthSelect, yearSelect];
  }

  function getElementTextContext(element) {
    let current = element;

    while (current && current !== document.body) {
      const fieldCount = current.querySelectorAll("input, select, textarea").length;
      const text = normalized(current.innerText || current.textContent || "");

      if (fieldCount >= 1 && fieldCount <= 4 && text) {
        return text;
      }

      current = current.parentElement;
    }

    return getContainerSearchText(element);
  }

  function isVisibleElement(element) {
    if (!element) {
      return false;
    }

    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }

    return element.offsetParent !== null || style.position === "fixed";
  }

  function syncSelectricUi(element, option) {
    const wrapper = element.closest(".selectric-wrapper");
    if (!wrapper) {
      return;
    }

    const label = wrapper.querySelector(".selectric .label");
    if (label) {
      label.textContent = option.textContent || option.value || "";
    }

    const optionIndex = Array.from(element.options).indexOf(option);
    wrapper.querySelectorAll(".selectric-items li").forEach((item) => {
      item.classList.remove("selected");
    });

    const activeItem = wrapper.querySelector(`.selectric-items li[data-index="${optionIndex}"]`);
    if (activeItem) {
      activeItem.classList.add("selected");
    }

    const maybeJQuery = window.jQuery || window.$;
    if (typeof maybeJQuery === "function") {
      try {
        maybeJQuery(element).trigger("change");
        if (typeof maybeJQuery(element).selectric === "function") {
          maybeJQuery(element).selectric("refresh");
        }
      } catch {}
    }
  }

  function buildDayCandidates(value) {
    const numericValue = Number(value);
    if (!numericValue) {
      return [];
    }

    return [String(numericValue), String(numericValue).padStart(2, "0"), `${numericValue}.`];
  }

  function buildMonthCandidates(value) {
    const numericValue = Number(value);
    if (!numericValue || numericValue < 1 || numericValue > 12) {
      return [];
    }

    const monthNames = {
      1: ["janvier", "january", "jan"],
      2: ["fevrier", "february", "feb"],
      3: ["mars", "march", "mar"],
      4: ["avril", "april", "apr"],
      5: ["mai", "may"],
      6: ["juin", "june", "jun"],
      7: ["juillet", "july", "jul"],
      8: ["aout", "august", "aug"],
      9: ["septembre", "september", "sep", "sept"],
      10: ["octobre", "october", "oct"],
      11: ["novembre", "november", "nov"],
      12: ["decembre", "december", "dec"]
    };

    return [String(numericValue), String(numericValue).padStart(2, "0"), `${numericValue}.`, ...(monthNames[numericValue] || [])];
  }

  function fillGroupedDateFields(day, month, year, keywords, groupKeyPrefix) {
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
    const keys = [`${groupKeyPrefix}Day`, `${groupKeyPrefix}Month`, `${groupKeyPrefix}Year`];
    let count = 0;

    ordered.forEach((element, index) => {
      if (applyValue(element, keys[index], values[index])) {
        used.add(element);
        count += 1;
      }
    });

    if (count) {
      filledKeys.push(`${groupKeyPrefix}DateGroup`);
    }

    return count;
  }

  function getFieldGroupRoot(element) {
    let current = element.parentElement;

    while (current && current !== document.body) {
      const fields = current.querySelectorAll("select, input");
      if (fields.length >= 3) {
        return current;
      }
      current = current.parentElement;
    }

    return element.parentElement || document.body;
  }

  function getContainerSearchText(element) {
    const root = getFieldGroupRoot(element);

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
    element.dispatchEvent(new Event("focus", { bubbles: true }));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function setNativeFieldValue(element, value) {
    const prototype =
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

    if (descriptor?.set) {
      descriptor.set.call(element, value);
      return;
    }

    element.value = value;
  }

  function dispatchSelectEvents(element) {
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    element.dispatchEvent(new Event("focus", { bubbles: true }));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
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

function cleanArabicTextCapture(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeArabicDigits(value) {
  const easternArabicDigits = {
    "٠": "0",
    "١": "1",
    "٢": "2",
    "٣": "3",
    "٤": "4",
    "٥": "5",
    "٦": "6",
    "٧": "7",
    "٨": "8",
    "٩": "9",
    "۰": "0",
    "۱": "1",
    "۲": "2",
    "۳": "3",
    "۴": "4",
    "۵": "5",
    "۶": "6",
    "۷": "7",
    "۸": "8",
    "۹": "9"
  };

  return String(value || "").replace(/[٠-٩۰-۹]/g, (digit) => easternArabicDigits[digit] || digit);
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
    return "Ms";
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
