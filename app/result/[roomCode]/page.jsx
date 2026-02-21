"use client";

import { useMemo } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { clearActiveGame, clearRoomSession } from "../../../src/lib/storage";

export default function ResultPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const roomCode = String(params.roomCode || "");

  const status = searchParams.get("status") === "win" ? "win" : "lose";
  const answer = searchParams.get("answer") || "Unknown";
  const guess = searchParams.get("guess") || "No guess";

  const heading = useMemo(() => (status === "win" ? "You Win!" : "You Lose!"), [status]);

  const handlePlayAgain = () => {
    clearActiveGame();
    clearRoomSession();
    router.push("/");
  };

  return (
    <main className="page shell">
      <div className="card result-card">
        <p className="label">ROOM {roomCode}</p>
        <h1 className={status === "win" ? "win-text" : "lose-text"}>{heading}</h1>
        <p className="subtle">Correct answer: {answer}</p>
        <p className="subtle">Your guess: {guess}</p>

        <button className="btn btn-primary" onClick={handlePlayAgain}>
          Play Again
        </button>
      </div>
    </main>
  );
}
