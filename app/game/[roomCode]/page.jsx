"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "../../../src/lib/socket";
import {
  clearActiveGame,
  clearRoomSession,
  getActiveGame,
  getRoomSession
} from "../../../src/lib/storage";

export default function GamePage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = String(params.roomCode || "");

  const [guess, setGuess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [opponentImage, setOpponentImage] = useState(null);
  const [challengeCategory, setChallengeCategory] = useState("");

  const imageSrc = useMemo(() => {
    if (opponentImage?.url) {
      return opponentImage.url;
    }

    if (!opponentImage?.filename) {
      return "";
    }

    return `/images/${opponentImage.filename}`;
  }, [opponentImage]);

  useEffect(() => {
    const roomSession = getRoomSession();
    const activeGame = getActiveGame();

    if (
      !roomSession ||
      roomSession.roomCode !== roomCode ||
      !activeGame ||
      !activeGame.opponentImage
    ) {
      router.replace("/");
      return;
    }

    setOpponentImage(activeGame.opponentImage);
  setChallengeCategory(String(activeGame.category || ""));

    const socket = getSocket();

    const handleGameFinished = (payload) => {
      const status = payload?.result === "win" ? "win" : "lose";
      const answer = encodeURIComponent(payload?.answer || "");
      const attempted = encodeURIComponent(payload?.guess || "");
      router.push(`/result/${roomCode}?status=${status}&answer=${answer}&guess=${attempted}`);
    };

    const handleRoomClosed = (payload) => {
      clearActiveGame();
      clearRoomSession();
      setError(payload?.message || "انتهت الغرفة.");
      setTimeout(() => router.replace("/"), 1200);
    };

    socket.on("game-finished", handleGameFinished);
    socket.on("room-closed", handleRoomClosed);

    return () => {
      socket.off("game-finished", handleGameFinished);
      socket.off("room-closed", handleRoomClosed);
    };
  }, [roomCode, router]);

  const submitGuess = () => {
    setError("");
    const normalized = guess.trim();

    if (!normalized) {
      setError("يرجى كتابة تخمينك قبل الإرسال.");
      return;
    }

    setSubmitting(true);
    const socket = getSocket();

    socket.emit("submit-guess", { roomCode, guess: normalized }, (response) => {
      setSubmitting(false);

      if (!response?.ok) {
        setError(response?.error || "تعذّر إرسال التخمين.");
      }
    });
  };

  return (
    <main className="page shell game-shell">
      <div className="room-chip">الغرفة {roomCode}</div>

      <div className="card game-card">
        <h1>صورة خصمك</h1>
        {challengeCategory ? <p className="subtle">فئة التحدّي: {challengeCategory}</p> : null}

        {imageSrc ? (
          <img className="opponent-image" src={imageSrc} alt="صورة تلميح الخصم" />
        ) : (
          <div className="image-placeholder">جارٍ تحميل الصورة...</div>
        )}

        <div className="guess-panel">
          <input
            className="input"
            value={guess}
            onChange={(event) => setGuess(event.target.value)}
            placeholder="اكتب تخمينك"
            maxLength={80}
          />
          <button className="btn btn-primary" onClick={submitGuess} disabled={submitting}>
            {submitting ? "جارٍ التحقق..." : "تخمين"}
          </button>
        </div>

        {error ? <p className="error-banner">{error}</p> : null}
      </div>
    </main>
  );
}
