"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSocket } from "../src/lib/socket";
import { clearActiveGame, saveActiveGame, saveRoomSession } from "../src/lib/storage";

export default function HomePage() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  const [error, setError] = useState("");

  const handleCreate = () => {
    setError("");
    setLoadingAction("create");

    const socket = getSocket();
    socket.emit("create-room", {}, (response) => {
      setLoadingAction("");

      if (!response?.ok) {
        setError(response?.error || "Failed to create room.");
        return;
      }

      clearActiveGame();
      saveRoomSession({
        roomCode: response.roomCode,
        playerId: response.playerId
      });

      router.push(`/waiting/${response.roomCode}`);
    });
  };

  const handleJoin = () => {
    const roomCode = joinCode.trim();
    setError("");

    if (!/^\d{4}$/.test(roomCode)) {
      setError("Please enter a valid 4-digit room code.");
      return;
    }

    setLoadingAction("join");
    const socket = getSocket();

    socket.emit("join-room", { roomCode }, (response) => {
      setLoadingAction("");

      if (!response?.ok) {
        setError(response?.error || "Failed to join room.");
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
            opponentImage: response.opponentImage
          });

          router.push(`/game/${response.roomCode}`);
          return;
        } catch (error) {
          console.error("Error saving active game:", error);
        }
      }

      router.push(`/waiting/${response.roomCode}`);
    });
  };

  return (
    <main className="page shell">
      <div className="card hero-card">
        <div className="pill">2026 EDITION NOW LIVE</div>
        <h1>Guess What I Am</h1>
        <p>
          A local 2-player guessing showdown. See your opponent&apos;s image and guess your own by
          asking smart questions.
        </p>

        <div className="actions-grid">
          <button
            className="btn btn-primary"
            onClick={handleCreate}
            disabled={loadingAction !== ""}
          >
            {loadingAction === "create" ? "Creating..." : "Create Game"}
          </button>

          <div className="join-group">
            <input
              className="input"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value.replace(/\D/g, "").slice(0, 4))}
              placeholder="Enter 4-digit room code"
              inputMode="numeric"
              maxLength={4}
            />
            <button
              className="btn btn-secondary"
              onClick={handleJoin}
              disabled={loadingAction !== ""}
            >
              {loadingAction === "join" ? "Joining..." : "Join Game"}
            </button>
          </div>
        </div>

        {error ? <p className="error-banner">{error}</p> : null}
      </div>
    </main>
  );
}
