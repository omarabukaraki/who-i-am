const fs = require("fs");
const path = require("path");
const XLSX = require("xlsx");
const Database = require("better-sqlite3");
const { IMAGES } = require("./images");

const DEFAULT_CATEGORY = "عام";
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(process.cwd(), "data");
const DB_PATH = process.env.DATA_DB_PATH
  ? path.resolve(process.env.DATA_DB_PATH)
  : path.join(DATA_DIR, "images.sqlite");
const EXCEL_PATH = path.join(DATA_DIR, "images.xlsx");
const IMAGES_SHEET = "Images";
const CATEGORIES_SHEET = "Categories";

let dbInstance = null;

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

function readSheetRows(workbook, sheetName) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

function getDb() {
  if (dbInstance) {
    return dbInstance;
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  dbInstance = new Database(DB_PATH);
  dbInstance.pragma("journal_mode = WAL");

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS images (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      category TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      FOREIGN KEY (category) REFERENCES categories(name) ON UPDATE CASCADE ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_images_category ON images(category);
  `);

  return dbInstance;
}

function migrateFromExcelIfNeeded() {
  const db = getDb();
  const categoryCount = db.prepare("SELECT COUNT(*) AS count FROM categories").get().count;
  const imageCount = db.prepare("SELECT COUNT(*) AS count FROM images").get().count;

  if (categoryCount > 0 || imageCount > 0) {
    return;
  }

  if (!fs.existsSync(EXCEL_PATH)) {
    return;
  }

  try {
    const workbook = XLSX.readFile(EXCEL_PATH);
    const imageRows = readSheetRows(workbook, IMAGES_SHEET);
    const fallbackImageRows = imageRows.length
      ? imageRows
      : readSheetRows(workbook, workbook.SheetNames[0]);
    const categoryRows = readSheetRows(workbook, CATEGORIES_SHEET);

    const parsedImages = fallbackImageRows
      .map((row, index) => ({
        id: String(row.id || `img-${String(index + 1).padStart(3, "0")}`),
        label: String(row.label || "صورة بدون اسم").trim(),
        category: normalizeCategory(row.category) || DEFAULT_CATEGORY,
        url: String(row.url || "").trim(),
        createdAt: String(row.createdAt || new Date().toISOString())
      }))
      .filter((item) => item.label && isValidUrl(item.url));

    const categoryNames = new Set();

    categoryRows.forEach((row) => {
      const name = normalizeCategory(row.name);
      if (name) {
        categoryNames.add(name);
      }
    });

    parsedImages.forEach((item) => {
      if (item.category) {
        categoryNames.add(item.category);
      }
    });

    categoryNames.add(DEFAULT_CATEGORY);

    const parsedCategories = Array.from(categoryNames).map((name, index) => ({
      id: `cat-${String(index + 1).padStart(3, "0")}`,
      name,
      createdAt: new Date().toISOString()
    }));

    const transaction = db.transaction(() => {
      const insertCategory = db.prepare(
        "INSERT OR IGNORE INTO categories (id, name, createdAt) VALUES (?, ?, ?)"
      );
      const insertImage = db.prepare(
        "INSERT OR IGNORE INTO images (id, label, category, url, createdAt) VALUES (?, ?, ?, ?, ?)"
      );

      parsedCategories.forEach((item) => {
        insertCategory.run(item.id, item.name, item.createdAt);
      });

      parsedImages.forEach((item) => {
        insertCategory.run(`cat-${Date.now()}-${item.id}`, item.category, item.createdAt);
        insertImage.run(item.id, item.label, item.category, item.url, item.createdAt);
      });
    });

    transaction();
  } catch {
  }
}

function seedDatabaseIfEmpty() {
  const db = getDb();

  const categoryCount = db.prepare("SELECT COUNT(*) AS count FROM categories").get().count;
  const imageCount = db.prepare("SELECT COUNT(*) AS count FROM images").get().count;

  if (categoryCount > 0 || imageCount > 0) {
    return;
  }

  const categories = seedCategories();
  const images = seedImages();

  const transaction = db.transaction(() => {
    const insertCategory = db.prepare(
      "INSERT OR IGNORE INTO categories (id, name, createdAt) VALUES (?, ?, ?)"
    );
    const insertImage = db.prepare(
      "INSERT OR IGNORE INTO images (id, label, category, url, createdAt) VALUES (?, ?, ?, ?, ?)"
    );

    categories.forEach((item) => {
      insertCategory.run(item.id, item.name, item.createdAt);
    });

    images.forEach((item) => {
      insertCategory.run(`cat-${Date.now()}-${item.id}`, item.category, item.createdAt);
      insertImage.run(item.id, item.label, item.category, item.url, item.createdAt);
    });
  });

  transaction();
}

function ensureExcelFile() {
  getDb();
  migrateFromExcelIfNeeded();
  seedDatabaseIfEmpty();
}

function readCategories() {
  ensureExcelFile();

  const db = getDb();
  return db
    .prepare("SELECT id, name, createdAt FROM categories ORDER BY datetime(createdAt), id")
    .all()
    .map((item) => ({
      id: String(item.id || ""),
      name: normalizeCategory(item.name),
      createdAt: String(item.createdAt || "")
    }))
    .filter((item) => item.name);
}

function readImages() {
  ensureExcelFile();

  const db = getDb();
  return db
    .prepare("SELECT id, label, category, url, createdAt FROM images ORDER BY datetime(createdAt), id")
    .all()
    .map((item) => ({
      id: String(item.id || ""),
      label: String(item.label || "صورة بدون اسم").trim(),
      category: normalizeCategory(item.category) || DEFAULT_CATEGORY,
      url: String(item.url || "").trim(),
      createdAt: String(item.createdAt || "")
    }))
    .filter((item) => item.label && isValidUrl(item.url));
}

function addCategoryToStore(name) {
  const normalizedName = normalizeCategory(name);
  if (!normalizedName) {
    return { ok: false, error: "اسم الفئة مطلوب." };
  }

  ensureExcelFile();
  const db = getDb();

  const exists = db
    .prepare("SELECT id FROM categories WHERE lower(name) = lower(?) LIMIT 1")
    .get(normalizedName);

  if (exists) {
    return { ok: false, error: "هذه الفئة موجودة بالفعل." };
  }

  const next = {
    id: `cat-${Date.now()}`,
    name: normalizedName,
    createdAt: new Date().toISOString()
  };

  db.prepare("INSERT INTO categories (id, name, createdAt) VALUES (?, ?, ?)").run(
    next.id,
    next.name,
    next.createdAt
  );

  const count = db.prepare("SELECT COUNT(*) AS count FROM categories").get().count;
  return { ok: true, item: next, count };
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

  ensureExcelFile();
  const db = getDb();

  const categoryRow = db
    .prepare("SELECT name FROM categories WHERE lower(name) = lower(?) LIMIT 1")
    .get(normalizedCategory);

  if (!categoryRow) {
    return { ok: false, error: "الفئة غير موجودة. أضفها أولاً." };
  }

  const duplicate = db
    .prepare("SELECT id FROM images WHERE lower(url) = lower(?) LIMIT 1")
    .get(normalizedUrl);

  if (duplicate) {
    return { ok: false, error: "رابط الصورة هذا موجود بالفعل." };
  }

  const next = {
    id: `img-${Date.now()}`,
    label: normalizedLabel,
    category: String(categoryRow.name),
    url: normalizedUrl,
    createdAt: new Date().toISOString()
  };

  db.prepare("INSERT INTO images (id, label, category, url, createdAt) VALUES (?, ?, ?, ?, ?)")
    .run(next.id, next.label, next.category, next.url, next.createdAt);

  const count = db.prepare("SELECT COUNT(*) AS count FROM images").get().count;
  return { ok: true, item: next, count };
}

function resetExcelData() {
  ensureExcelFile();
  const db = getDb();

  const categories = seedCategories();
  const images = seedImages();

  const transaction = db.transaction(() => {
    db.prepare("DELETE FROM images").run();
    db.prepare("DELETE FROM categories").run();

    const insertCategory = db.prepare(
      "INSERT INTO categories (id, name, createdAt) VALUES (?, ?, ?)"
    );
    const insertImage = db.prepare(
      "INSERT INTO images (id, label, category, url, createdAt) VALUES (?, ?, ?, ?, ?)"
    );

    categories.forEach((item) => {
      insertCategory.run(item.id, item.name, item.createdAt);
    });

    images.forEach((item) => {
      insertCategory.run(`cat-${Date.now()}-${item.id}`, item.category, item.createdAt);
      insertImage.run(item.id, item.label, item.category, item.url, item.createdAt);
    });
  });

  transaction();

  return {
    ok: true,
    message: "تمت إعادة ضبط البيانات بنجاح.",
    categoriesCount: categories.length,
    imagesCount: images.length
  };
}

module.exports = {
  DB_PATH,
  EXCEL_PATH,
  readCategories,
  addCategoryToStore,
  readImages,
  addImageToStore,
  resetExcelData,
  ensureExcelFile
};
