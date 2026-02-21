"use client";

const ROOM_KEY = "guess-game-room";
const GAME_KEY = "guess-game-active";

export function saveRoomSession(session) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(ROOM_KEY, JSON.stringify(session));
}

export function getRoomSession() {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.sessionStorage.getItem(ROOM_KEY);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function clearRoomSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(ROOM_KEY);
}

export function saveActiveGame(payload) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(GAME_KEY, JSON.stringify(payload));
}

export function getActiveGame() {
  if (typeof window === "undefined") {
    return null;
  }

  const value = window.sessionStorage.getItem(GAME_KEY);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function clearActiveGame() {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(GAME_KEY);
}
