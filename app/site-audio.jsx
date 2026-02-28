"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

export default function SiteAudio() {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith("/admin");
  const audioRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  //
  useEffect(() => {
    if (isAdminRoute) {
      setIsPlaying(false);
      return;
    }

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleEnded = () => setIsPlaying(false);

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handleEnded);

    const tryPlay = async () => {
      try {
        await audio.play();
      } catch {
        const resumeOnFirstInteraction = async () => {
          try {
            await audio.play();
          } catch {}

          window.removeEventListener("pointerdown", resumeOnFirstInteraction);
          window.removeEventListener("keydown", resumeOnFirstInteraction);
        };

        window.addEventListener("pointerdown", resumeOnFirstInteraction, { once: true });
        window.addEventListener("keydown", resumeOnFirstInteraction, { once: true });
      }
    };

    audio.currentTime = 0;
    audio.muted = isMuted;
    tryPlay();

    return () => {
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [isAdminRoute]);

  if (isAdminRoute) {
    return null;
  }

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);

    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.muted = nextMuted;

    if (!nextMuted && audio.paused) {
      audio.play().catch(() => {});
    }
  };

  return (
    <>
      <audio ref={audioRef} src="/space.mp3" preload="auto" />
      <button
        type="button"
        className={`btn btn-secondary sound-toggle ${isPlaying && !isMuted ? "sound-toggle-playing" : ""}`}
        onClick={handleToggleMute}
        aria-label={isMuted ? "إلغاء كتم الصوت" : "كتم الصوت"}
      >
        {isMuted ? "🔇 تشغيل الصوت" : "🔊 كتم الصوت"}
      </button>
    </>
  );
}
