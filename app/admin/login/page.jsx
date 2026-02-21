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

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const verifySession = async () => {
      try {
        const response = await fetch("/api/admin/session", { cache: "no-store" });
        const payload = await parseApiPayload(response);

        if (response.ok && payload?.ok && payload?.authenticated) {
          router.replace("/admin");
          return;
        }
      } catch (error) {
        console.log(error);
      } finally {
        setChecking(false);
      }
    };

    verifySession();
  }, [router]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");

    if (username.trim().toLowerCase() !== "admin") {
      setError("اسم المستخدم يجب أن يكون admin.");
      return;
    }

    if (!password.trim()) {
      setError("كلمة المرور مطلوبة.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          username: "admin",
          password
        })
      });

      const payload = await parseApiPayload(response);

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "تعذّر تسجيل الدخول.");
      }

      router.replace("/admin");
    } catch (requestError) {
      setError(requestError.message || "تعذّر تسجيل الدخول.");
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) {
    return (
      <main className="page shell admin-shell">
        <div className="card admin-card">
          <p className="subtle">جارٍ التحقق من الجلسة...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="page shell admin-shell">
      <div className="card admin-card">
        <h1>تسجيل دخول الإدارة</h1>

        <form className="admin-form" onSubmit={handleSubmit}>
          <input
            className="input"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="اسم المستخدم"
            autoComplete="username"
          />
          <input
            className="input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="كلمة المرور من ADMIN_PASSWORD"
            type="password"
            autoComplete="current-password"
          />
          <button className="btn btn-primary" disabled={submitting} type="submit">
            {submitting ? "جارٍ تسجيل الدخول..." : "دخول"}
          </button>
        </form>

        {error ? <p className="error-banner">{error}</p> : null}
      </div>
    </main>
  );
}
