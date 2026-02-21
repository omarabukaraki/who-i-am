"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getSocket } from "../../../src/lib/socket";
import {
  clearActiveGame,
  clearRoomSession,
  getRoomSession,
  saveActiveGame
} from "../../../src/lib/storage";

export default function WaitingRoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomCode = String(params.roomCode || "");

  const [playerCount, setPlayerCount] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    const session = getRoomSession();

    if (!session || session.roomCode !== roomCode) {
      router.replace("/");
      return;
    }

    clearActiveGame();
    const socket = getSocket();

    const handleRoomState = (payload) => {
      if (payload?.roomCode === roomCode) {
        setPlayerCount(payload.playerCount || 1);
      }
    };

    const handleGameStarted = (payload) => {
      if (!payload?.opponentImage || payload?.roomCode !== roomCode) {
        return;
      }

      saveActiveGame({
        roomCode,
        opponentImage: payload.opponentImage
      });

      router.push(`/game/${roomCode}`);
    };

    const handleRoomClosed = (payload) => {
      clearActiveGame();
      clearRoomSession();
      setError(payload?.message || "Room was closed.");

      setTimeout(() => {
        router.replace("/");
      }, 1200);
    };

    socket.on("room-state", handleRoomState);
    socket.on("game-started", handleGameStarted);
    socket.on("room-closed", handleRoomClosed);

    socket.emit("sync-room", { roomCode }, (response) => {
      if (!response?.ok) {
        clearActiveGame();
        clearRoomSession();
        setError(response?.error || "Unable to sync room state.");

        setTimeout(() => {
          router.replace("/");
        }, 1200);
        return;
      }

      setPlayerCount(response.playerCount || 1);

      if (response.gameStarted && response.opponentImage) {
        saveActiveGame({
          roomCode,
          opponentImage: response.opponentImage
        });

        router.replace(`/game/${roomCode}`);
      }
    });

    return () => {
      socket.off("room-state", handleRoomState);
      socket.off("game-started", handleGameStarted);
      socket.off("room-closed", handleRoomClosed);
    };
  }, [roomCode, router]);

  return (
    <main className="page shell">
      <div className="card waiting-card">
        <p className="label">GAME ROOM CODE</p>
        <h1 className="room-code">{roomCode}</h1>

        <div className="loader-wrap">
          <span className="loader-dot" />
        </div>

        <p className="status-text">Waiting for second player...</p>
        <p className="subtle">Share this room code with your friend to start the game.</p>

        <div className="progress-row">
          <span>PLAYERS</span>
          <span>{playerCount}/2</span>
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${(playerCount / 2) * 100}%` }} />
        </div>

        {error ? <p className="error-banner">{error}</p> : null}
      </div>
    </main>
  );
}
