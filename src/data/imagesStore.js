const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { IMAGES } = require("./images");

const DATA_DIR = path.join(process.cwd(), "data");
const EXCEL_PATH = path.join(DATA_DIR, "images.xlsx");
const SHEET_NAME = "Images";

function isValidUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function ensureExcelFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(EXCEL_PATH)) {
    return;
  }

  const seeded = IMAGES.map((item, index) => ({
    id: item.id || `img-${String(index + 1).padStart(3, "0")}`,
    label: String(item.label || `Image ${index + 1}`),
    url: String(item.url || ""),
    createdAt: new Date().toISOString()
  })).filter((item) => isValidUrl(item.url));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(seeded);
  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME);
  XLSX.writeFile(workbook, EXCEL_PATH);
}

function writeRows(rows) {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(workbook, worksheet, SHEET_NAME);
  XLSX.writeFile(workbook, EXCEL_PATH);
}

function readImages() {
  ensureExcelFile();

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheet = workbook.Sheets[SHEET_NAME] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    return [];
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  return rows
    .map((row, index) => ({
      id: String(row.id || `img-${String(index + 1).padStart(3, "0")}`),
      label: String(row.label || "Untitled Image").trim(),
      url: String(row.url || "").trim(),
      createdAt: String(row.createdAt || "")
    }))
    .filter((item) => item.label && isValidUrl(item.url));
}

function addImageToStore({ label, url }) {
  const normalizedLabel = String(label || "").trim();
  const normalizedUrl = String(url || "").trim();

  if (!normalizedLabel) {
    return { ok: false, error: "Label is required." };
  }

  if (!isValidUrl(normalizedUrl)) {
    return { ok: false, error: "A valid image URL is required." };
  }

  const images = readImages();
  const duplicate = images.find((item) => item.url.toLowerCase() === normalizedUrl.toLowerCase());

  if (duplicate) {
    return { ok: false, error: "This image URL already exists." };
  }

  const next = {
    id: `img-${Date.now()}`,
    label: normalizedLabel,
    url: normalizedUrl,
    createdAt: new Date().toISOString()
  };

  const updated = [...images, next];
  writeRows(updated);

  return { ok: true, item: next, count: updated.length };
}

module.exports = {
  EXCEL_PATH,
  readImages,
  addImageToStore,
  ensureExcelFile
};
