"use client";

import { io } from "socket.io-client";

let socket;

export function getSocket() {
  if (!socket) {
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || window.location.origin;

    socket = io(socketUrl, {
      autoConnect: true,
      transports: ["websocket"]
    });
  }

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
