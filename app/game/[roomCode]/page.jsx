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
      setError(payload?.message || "Room ended.");
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
      setError("Please type your guess before submitting.");
      return;
    }

    setSubmitting(true);
    const socket = getSocket();

    socket.emit("submit-guess", { roomCode, guess: normalized }, (response) => {
      setSubmitting(false);

      if (!response?.ok) {
        setError(response?.error || "Failed to submit guess.");
      }
    });
  };

  return (
    <main className="page shell game-shell">
      <div className="room-chip">Room {roomCode}</div>

      <div className="card game-card">
        <h1>Your Opponent Image</h1>

        {imageSrc ? (
          <img className="opponent-image" src={imageSrc} alt="Opponent visual clue" />
        ) : (
          <div className="image-placeholder">Loading image...</div>
        )}

        <div className="guess-panel">
          <input
            className="input"
            value={guess}
            onChange={(event) => setGuess(event.target.value)}
            placeholder="Type your guess"
            maxLength={80}
          />
          <button className="btn btn-primary" onClick={submitGuess} disabled={submitting}>
            {submitting ? "Checking..." : "Guess"}
          </button>
        </div>

        {error ? <p className="error-banner">{error}</p> : null}
      </div>
    </main>
  );
}
