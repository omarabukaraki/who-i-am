"use client";

import { useEffect, useState } from "react";

export default function AdminPage() {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");
  const [adminKey, setAdminKey] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadImages = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/admin/images", { cache: "no-store" });
      const payload = await response.json();

      if (!payload?.ok) {
        throw new Error(payload?.error || "Failed to load images.");
      }

      setItems(payload.items || []);
    } catch (requestError) {
      setError(requestError.message || "Failed to load images.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadImages();
  }, []);

  const addImage = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!label.trim() || !url.trim()) {
      setError("Label and image link are required.");
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/admin/images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(adminKey.trim() ? { "x-admin-key": adminKey.trim() } : {})
        },
        body: JSON.stringify({
          label: label.trim(),
          url: url.trim()
        })
      });

      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Failed to add image.");
      }

      setLabel("");
      setUrl("");
      setSuccess("Image link added to Excel successfully.");
      await loadImages();
    } catch (requestError) {
      setError(requestError.message || "Failed to save image.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="page shell admin-shell">
      <div className="card admin-card">
        <h1>Admin Dashboard</h1>
        <p className="subtle">
          Add image links for the game. Data is saved to Excel at data/images.xlsx.
        </p>

        <form className="admin-form" onSubmit={addImage}>
          <input
            className="input"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Image label (answer text)"
            maxLength={80}
          />
          <input
            className="input"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Image URL (https://...)"
            type="url"
          />
          <input
            className="input"
            value={adminKey}
            onChange={(event) => setAdminKey(event.target.value)}
            placeholder="Admin key (optional, if ADMIN_KEY is set)"
            type="password"
          />
          <button className="btn btn-primary" disabled={saving} type="submit">
            {saving ? "Saving..." : "Add Image"}
          </button>
        </form>

        {error ? <p className="error-banner">{error}</p> : null}
        {success ? <p className="success-banner">{success}</p> : null}

        <div className="admin-list-wrap">
          <div className="admin-list-head">
            <span className="label">Saved Image Links</span>
            <button
              className="btn btn-secondary refresh-btn"
              onClick={loadImages}
              disabled={loading}
            >
              Refresh
            </button>
          </div>

          {loading ? (
            <p className="subtle">Loading...</p>
          ) : (
            <ul className="admin-list">
              {items.map((item) => (
                <li key={item.id} className="admin-item">
                  <div>
                    <p className="admin-item-label">{item.label}</p>
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
