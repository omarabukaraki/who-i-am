"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

async function parseApiPayload(response) {
  const rawText = await response.text();

  try {
    return rawText ? JSON.parse(rawText) : {};
  } catch {
    return {
      ok: false,
      error: "الخادم أعاد استجابة غير صالحة. تأكد أن التطبيق يعمل عبر npm run dev ثم أعد المحاولة."
    };
  }
}

export default function AdminPage() {
  const router = useRouter();
  const [categoryName, setCategoryName] = useState("");
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("");
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authChecking, setAuthChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingCategory, setSavingCategory] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleUnauthorized = (response) => {
    if (response.status === 401) {
      router.replace("/admin/login");
      return true;
    }

    return false;
  };

  const checkSession = async () => {
    const response = await fetch("/api/admin/session", { cache: "no-store" });
    const payload = await parseApiPayload(response);

    if (!response.ok || !payload?.ok || !payload?.authenticated) {
      router.replace("/admin/login");
      return false;
    }

    return true;
  };

  const loadCategories = async () => {
    const response = await fetch("/api/admin/categories", { cache: "no-store" });
    if (handleUnauthorized(response)) {
      return;
    }

    const payload = await parseApiPayload(response);

    if (!payload?.ok) {
      throw new Error(payload?.error || "تعذّر تحميل الفئات.");
    }

    const nextCategories = payload.items || [];
    setCategories(nextCategories);

    setSelectedCategory((previousValue) => {
      if (previousValue && nextCategories.some((item) => item.name === previousValue)) {
        return previousValue;
      }

      return nextCategories[0]?.name || "";
    });
  };

  const loadImages = async () => {
    const response = await fetch("/api/admin/images", { cache: "no-store" });
    if (handleUnauthorized(response)) {
      return;
    }

    const payload = await parseApiPayload(response);

    if (!payload?.ok) {
      throw new Error(payload?.error || "تعذّر تحميل الصور.");
    }

    setItems(payload.items || []);
  };

  const loadAll = async () => {
    setLoading(true);
    setError("");

    try {
      await Promise.all([loadCategories(), loadImages()]);
    } catch (requestError) {
      setError(requestError.message || "تعذّر تحميل البيانات.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initialize = async () => {
      setAuthChecking(true);
      const ok = await checkSession();
      setAuthChecking(false);

      if (!ok) {
        return;
      }

      await loadAll();
    };

    initialize();
  }, [router]);

  const addCategory = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!categoryName.trim()) {
      setError("اسم الفئة مطلوب.");
      return;
    }

    setSavingCategory(true);

    try {
      const response = await fetch("/api/admin/categories", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: categoryName.trim()
        })
      });

      if (handleUnauthorized(response)) {
        return;
      }

      const payload = await parseApiPayload(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "تعذّرت إضافة الفئة.");
      }

      setCategoryName("");
      setSuccess("تمت إضافة الفئة بنجاح.");
      await loadAll();
    } catch (requestError) {
      setError(requestError.message || "تعذّر حفظ الفئة.");
    } finally {
      setSavingCategory(false);
    }
  };

  const addImage = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!selectedCategory.trim() || !label.trim() || !url.trim()) {
      setError("الفئة واسم الصورة ورابطها مطلوبة.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/admin/images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          category: selectedCategory,
          label: label.trim(),
          url: url.trim()
        })
      });

      if (handleUnauthorized(response)) {
        return;
      }

      const payload = await parseApiPayload(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "تعذّرت إضافة الصورة.");
      }

      setLabel("");
      setUrl("");
      setSuccess("تمت إضافة رابط الصورة إلى قاعدة البيانات بنجاح.");
      await loadAll();
    } catch (requestError) {
      setError(requestError.message || "تعذّر حفظ الصورة.");
    } finally {
      setSaving(false);
    }
  };

  const resetExcel = async () => {
    setError("");
    setSuccess("");
    setResetting(true);

    try {
      const response = await fetch("/api/admin/reset", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });

      if (handleUnauthorized(response)) {
        return;
      }

      const payload = await parseApiPayload(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "تعذّرت إعادة ضبط البيانات.");
      }

      setSuccess(payload.message || "تمت إعادة ضبط بيانات بنجاح.");
      await loadAll();
    } catch (requestError) {
      setError(requestError.message || "تعذّرت إعادة ضبط البيانات.");
    } finally {
      setResetting(false);
    }
  };

  const logout = async () => {
    setLoggingOut(true);

    try {
      await fetch("/api/admin/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        }
      });
    } finally {
      setLoggingOut(false);
      router.replace("/admin/login");
    }
  };

  if (authChecking) {
    return (
      <main className="page shell admin-shell">
        <div className="card admin-card">
          <p className="subtle">جارٍ التحقق من جلسة الإدارة...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page shell admin-shell">
      <div className="card admin-card">
        <h1>لوحة الإدارة</h1>
        <p className="subtle">
          أضف روابط الصور للعبة. يتم حفظ البيانات في قاعدة البيانات المحلية.
        </p>
        <button className="btn btn-secondary" onClick={logout} disabled={loggingOut}>
          {loggingOut ? "جارٍ تسجيل الخروج..." : "تسجيل الخروج"}
        </button>

        <form className="admin-form" onSubmit={addCategory}>
          <input
            className="input"
            value={categoryName}
            onChange={(event) => setCategoryName(event.target.value)}
            placeholder="اسم الفئة الجديدة"
            maxLength={60}
          />
          <button className="btn btn-secondary" disabled={savingCategory} type="submit">
            {savingCategory ? "جارٍ الحفظ..." : "إضافة فئة"}
          </button>
        </form>

        <form className="admin-form" onSubmit={addImage}>
          <select
            className="input"
            value={selectedCategory}
            onChange={(event) => setSelectedCategory(event.target.value)}
          >
            {categories.map((item) => (
              <option key={item.id} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
          <input
            className="input"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="اسم الصورة (نص الإجابة)"
            maxLength={80}
          />
          <input
            className="input"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="رابط الصورة (https://...)"
            type="url"
          />
          <button className="btn btn-primary" disabled={saving} type="submit">
            {saving ? "جارٍ الحفظ..." : "إضافة صورة"}
          </button>
        </form>

        {error ? <p className="error-banner">{error}</p> : null}
        {success ? <p className="success-banner">{success}</p> : null}

        <button className="btn btn-secondary" onClick={resetExcel} disabled={resetting}>
          {resetting ? "جارٍ إعادة الضبط..." : "إعادة ضبط البيانات"}
        </button>

        <div className="admin-list-wrap">
          <div className="admin-list-head">
            <span className="label">روابط الصور المحفوظة</span>
            <button
              className="btn btn-secondary refresh-btn"
              onClick={loadAll}
              disabled={loading}
            >
              تحديث
            </button>
          </div>

          {loading ? (
            <p className="subtle">جارٍ التحميل...</p>
          ) : (
            <ul className="admin-list">
              {items.map((item) => (
                <li key={item.id} className="admin-item">
                  <div>
                    <p className="admin-item-label">{item.label}</p>
                    <p className="subtle">الفئة: {item.category || "عام"}</p>
                    <a href={item.url} target="_blank" rel="noreferrer" className="admin-item-url">
                      {item.url}
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
