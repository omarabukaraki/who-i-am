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
  const answer = searchParams.get("answer") || "غير معروف";
  const guess = searchParams.get("guess") || "لا يوجد تخمين";

  const heading = useMemo(() => (status === "win" ? "لقد فزت!" : "لقد خسرت!"), [status]);

  const handlePlayAgain = () => {
    clearActiveGame();
    clearRoomSession();
    router.push("/");
  };

  return (
    <main className="page shell">
      <div className="card result-card">
        <p className="label">الغرفة {roomCode}</p>
        <h1 className={status === "win" ? "win-text" : "lose-text"}>{heading}</h1>
        <p className="subtle">الإجابة الصحيحة: {answer}</p>
        <p className="subtle">تخمينك: {guess}</p>

        <button className="btn btn-primary" onClick={handlePlayAgain}>
          العب مرة أخرى
        </button>
      </div>
    </main>
  );
}
