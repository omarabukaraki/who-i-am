"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "../src/lib/socket";
import { clearActiveGame, saveActiveGame, saveRoomSession } from "../src/lib/storage";

export default function HomePage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [error, setError] = useState("");
  const [availableCategories, setAvailableCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const loadCategories = async () => {
      setCategoriesLoading(true);

      try {
        const response = await fetch("/api/categories", {
          cache: "no-store"
        });

        const payload = await response.json();

        if (!mounted || !payload?.ok) {
          return;
        }

        const categories = Array.isArray(payload.items)
          ? payload.items
              .map((item) => {
                if (typeof item === "string") {
                  return item.trim();
                }

                if (item && typeof item === "object") {
                  return String(item.name || "").trim();
                }

                return "";
              })
              .filter(Boolean)
          : [];

        setAvailableCategories(categories);
        setSelectedCategories(categories);
      } catch (fetchError) {
        if (!mounted) {
          return;
        }

        setAvailableCategories([]);
        setSelectedCategories([]);
      } finally {
        if (mounted) {
          setCategoriesLoading(false);
        }
      }
    };

    loadCategories();

    return () => {
      mounted = false;
    };
  }, []);

  const toggleCategory = (category) => {
    setSelectedCategories((previous) => {
      if (previous.includes(category)) {
        return previous.filter((item) => item !== category);
      }

      return [...previous, category];
    });
  };

  const handleCreate = () => {
    setError("");

    if (!selectedCategories.length) {
      setError("يرجى اختيار فئة واحدة على الأقل قبل إنشاء اللعبة.");
      return;
    }

    setLoadingAction("create");

    const socket = getSocket();
    socket.emit("create-room", { categories: selectedCategories }, (response) => {
      setLoadingAction("");

      if (!response?.ok) {
        setError(response?.error || "تعذّر إنشاء الغرفة.");
        return;
      }

      clearActiveGame();
      saveRoomSession({
        roomCode: response.roomCode,
        playerId: response.playerId,
        selectedCategories
      });

      router.push(`/waiting/${response.roomCode}`);
    });
  };

  const handleJoin = () => {
    const roomCode = joinCode.trim();
    setError("");

    if (!/^\d{4}$/.test(roomCode)) {
      setError("يرجى إدخال رمز غرفة صحيح مكوّن من 4 أرقام.");
      return;
    }

    setLoadingAction("join");
    const socket = getSocket();

    socket.emit("join-room", { roomCode }, (response) => {
      setLoadingAction("");

      if (!response?.ok) {
        setError(response?.error || "تعذّر الانضمام إلى الغرفة.");
        return;
      }

      clearActiveGame();
      saveRoomSession({
        roomCode: response.roomCode,
        playerId: response.playerId
      });

      if (response.gameStarted && response.opponentImage) {
        try {
          saveActiveGame({
            roomCode: response.roomCode,
            category: response.category || null,
            opponentImage: response.opponentImage
          });

          router.push(`/game/${response.roomCode}`);
          return;
        } catch (error) {
          console.error("خطأ أثناء حفظ بيانات اللعبة:", error);
        }
      }

      router.push(`/waiting/${response.roomCode}`);
    });
  };

  return (
    <main className="page shell">
      <div className="card hero-card">
        <img className="brand-logo" src="/images/logo.png" alt="شعار خمّن من أنا" />
        <div className="pill">نسخة 2026 متاحة الآن</div>
        <h1>خمّن من أنا</h1>
        <p>تحدّي تخمين محلي بين لاعبين. شاهد صورة خصمك وحاول معرفة صورتك أنت عبر طرح أسئلة ذكية.</p>

        <div className="category-selector">
          <p className="label">الفئات (يختارها منشئ الغرفة فقط)</p>

          {categoriesLoading ? (
            <p className="subtle">جارٍ تحميل الفئات...</p>
          ) : availableCategories.length ? (
            <div className="category-options">
              {availableCategories.map((category) => (
                <label className="category-option" key={category}>
                  <input
                    type="checkbox"
                    checked={selectedCategories.includes(category)}
                    onChange={() => toggleCategory(category)}
                    disabled={loadingAction !== ""}
                  />
                  <span>{category}</span>
                </label>
              ))}
            </div>
          ) : (
            <p className="subtle">لا توجد فئات متاحة حالياً.</p>
          )}
        </div>

        <div className="actions-grid">
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={loadingAction !== ""}
          >
            {loadingAction === "create" ? "جارٍ الإنشاء..." : "إنشاء لعبة"}
          </button>

          <div className="join-group">
            <input
              className="input"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="أدخل رمز غرفة من 4 أرقام"
              inputMode="numeric"
              maxLength={4}
            />
            <button
              className="btn btn-secondary"
              onClick={handleJoin}
              disabled={loadingAction !== ""}
            >
              {loadingAction === "join" ? "جارٍ الانضمام..." : "انضمام للعبة"}
            </button>
          </div>
        </div>

        {error ? <p className="error-banner">{error}</p> : null}
      </div>
    </main>
  );
}
