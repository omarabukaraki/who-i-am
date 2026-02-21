const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const { IMAGES } = require("./images");

const DATA_DIR = path.join(process.cwd(), "data");
const EXCEL_PATH = path.join(DATA_DIR, "images.xlsx");
const IMAGES_SHEET = "Images";
const CATEGORIES_SHEET = "Categories";
const DEFAULT_CATEGORY = "عام";

function normalizeCategory(value) {
  return String(value || "").trim();
}

function isValidUrl(value) {
  try {
    const parsed = new URL(String(value || ""));
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function seedCategories() {
  const unique = new Set();

  IMAGES.forEach((item) => {
    const category = normalizeCategory(item.category);
    if (category) {
      unique.add(category);
    }
  });

  unique.add(DEFAULT_CATEGORY);

  return Array.from(unique).map((name, index) => ({
    id: `cat-${String(index + 1).padStart(3, "0")}`,
    name,
    createdAt: new Date().toISOString()
  }));
}

function seedImages() {
  return IMAGES.map((item, index) => ({
    id: item.id || `img-${String(index + 1).padStart(3, "0")}`,
    label: String(item.label || `صورة ${index + 1}`).trim(),
    category: normalizeCategory(item.category) || DEFAULT_CATEGORY,
    url: String(item.url || "").trim(),
    createdAt: new Date().toISOString()
  })).filter((item) => item.label && isValidUrl(item.url));
}

function writeWorkbook({ images, categories }) {
  const workbook = XLSX.utils.book_new();
  const imagesSheet = XLSX.utils.json_to_sheet(images);
  const categoriesSheet = XLSX.utils.json_to_sheet(categories);

  XLSX.utils.book_append_sheet(workbook, imagesSheet, IMAGES_SHEET);
  XLSX.utils.book_append_sheet(workbook, categoriesSheet, CATEGORIES_SHEET);
  XLSX.writeFile(workbook, EXCEL_PATH);
}

function readSheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function readWorkbook() {
  return XLSX.readFile(EXCEL_PATH);
}

function ensureWorkbookStructure() {
  const workbook = readWorkbook();
  const imageRows = readSheetRows(workbook, IMAGES_SHEET);
  const fallbackImageRows = imageRows.length
    ? imageRows
    : readSheetRows(workbook, workbook.SheetNames[0]);
  const categoryRows = readSheetRows(workbook, CATEGORIES_SHEET);

  const normalizedImages = fallbackImageRows
    .map((row, index) => ({
      id: String(row.id || `img-${String(index + 1).padStart(3, "0")}`),
      label: String(row.label || "صورة بدون اسم").trim(),
      category: normalizeCategory(row.category) || DEFAULT_CATEGORY,
      url: String(row.url || "").trim(),
      createdAt: String(row.createdAt || "")
    }))
    .filter((item) => item.label && isValidUrl(item.url));

  const categoryNames = new Set();

  categoryRows.forEach((row) => {
    const name = normalizeCategory(row.name);
    if (name) {
      categoryNames.add(name);
    }
  });

  normalizedImages.forEach((item) => {
    if (item.category) {
      categoryNames.add(item.category);
    }
  });

  categoryNames.add(DEFAULT_CATEGORY);

  const normalizedCategories = Array.from(categoryNames).map((name, index) => ({
    id: `cat-${String(index + 1).padStart(3, "0")}`,
    name,
    createdAt: new Date().toISOString()
  }));

  writeWorkbook({
    images: normalizedImages,
    categories: normalizedCategories
  });
}

function ensureExcelFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(EXCEL_PATH)) {
    writeWorkbook({
      images: seedImages(),
      categories: seedCategories()
    });
    return;
  }

  ensureWorkbookStructure();
}

function readCategories() {
  ensureExcelFile();

  const workbook = readWorkbook();
  const rows = readSheetRows(workbook, CATEGORIES_SHEET);

  return rows
    .map((row, index) => ({
      id: String(row.id || `cat-${String(index + 1).padStart(3, "0")}`),
      name: normalizeCategory(row.name),
      createdAt: String(row.createdAt || "")
    }))
    .filter((item) => item.name);
}

function readImages() {
  ensureExcelFile();

  const workbook = readWorkbook();
  const rows = readSheetRows(workbook, IMAGES_SHEET);

  return rows
    .map((row, index) => ({
      id: String(row.id || `img-${String(index + 1).padStart(3, "0")}`),
      label: String(row.label || "صورة بدون اسم").trim(),
      category: normalizeCategory(row.category) || DEFAULT_CATEGORY,
      url: String(row.url || "").trim(),
      createdAt: String(row.createdAt || "")
    }))
    .filter((item) => item.label && isValidUrl(item.url));
}

function addCategoryToStore(name) {
  const normalizedName = normalizeCategory(name);
  if (!normalizedName) {
    return { ok: false, error: "اسم الفئة مطلوب." };
  }

  const categories = readCategories();
  const exists = categories.find(
    (item) => item.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase()
  );

  if (exists) {
    return { ok: false, error: "هذه الفئة موجودة بالفعل." };
  }

  const next = {
    id: `cat-${Date.now()}`,
    name: normalizedName,
    createdAt: new Date().toISOString()
  };

  const images = readImages();
  const updatedCategories = [...categories, next];

  writeWorkbook({
    images,
    categories: updatedCategories
  });

  return { ok: true, item: next, count: updatedCategories.length };
}

function addImageToStore({ label, url, category }) {
  const normalizedLabel = String(label || "").trim();
  const normalizedUrl = String(url || "").trim();
  const normalizedCategory = normalizeCategory(category);

  if (!normalizedLabel) {
    return { ok: false, error: "اسم الصورة مطلوب." };
  }

  if (!isValidUrl(normalizedUrl)) {
    return { ok: false, error: "رابط صورة صالح مطلوب." };
  }

  if (!normalizedCategory) {
    return { ok: false, error: "الفئة مطلوبة." };
  }

  const categories = readCategories();
  const categoryExists = categories.some((item) => item.name === normalizedCategory);

  if (!categoryExists) {
    return { ok: false, error: "الفئة غير موجودة. أضفها أولاً." };
  }

  const images = readImages();
  const duplicate = images.find((item) => item.url.toLowerCase() === normalizedUrl.toLowerCase());

  if (duplicate) {
    return { ok: false, error: "رابط الصورة هذا موجود بالفعل." };
  }

  const next = {
    id: `img-${Date.now()}`,
    label: normalizedLabel,
    category: normalizedCategory,
    url: normalizedUrl,
    createdAt: new Date().toISOString()
  };

  const updated = [...images, next];
  writeWorkbook({ images: updated, categories });

  return { ok: true, item: next, count: updated.length };
}

function resetExcelData() {
  ensureExcelFile();

  const categories = seedCategories();
  const images = seedImages();

  writeWorkbook({ images, categories });

  return {
    ok: true,
    message: "تمت إعادة ضبط البيانات بنجاح.",
    categoriesCount: categories.length,
    imagesCount: images.length
  };
}

module.exports = {
  EXCEL_PATH,
  readCategories,
  addCategoryToStore,
  readImages,
  addImageToStore,
  resetExcelData,
  ensureExcelFile
};
