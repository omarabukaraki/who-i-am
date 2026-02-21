const path = require("path");
const http = require("http");
const express = require("express");
const next = require("next");
const { Server } = require("socket.io");
const { addImageToStore, ensureExcelFile, readImages } = require("./src/data/imagesStore");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const appUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${port}`;

const socketCorsOrigin = process.env.SOCKET_CORS_ORIGIN
  ? process.env.SOCKET_CORS_ORIGIN.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  : [appUrl];

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

const rooms = new Map();

function normalizeGuess(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function generateRoomCode() {
  let code;
  do {
    code = String(Math.floor(1000 + Math.random() * 9000));
  } while (rooms.has(code));
  return code;
}

function pickTwoDistinctImages() {
  const images = readImages();

  if (images.length < 2) {
    throw new Error("At least 2 images are required to start a game.");
  }

  const firstIndex = Math.floor(Math.random() * images.length);
  let secondIndex = Math.floor(Math.random() * images.length);

  while (secondIndex === firstIndex) {
    secondIndex = Math.floor(Math.random() * images.length);
  }

  return [images[firstIndex], images[secondIndex]];
}

function cleanupRoom(io, roomCode, reason = "Room closed.") {
  const room = rooms.get(roomCode);
  if (!room) {
    return;
  }

  room.players.forEach((playerId) => {
    const socket = io.sockets.sockets.get(playerId);
    if (socket) {
      socket.leave(roomCode);
      socket.emit("room-closed", { message: reason });
    }
  });

  rooms.delete(roomCode);
}

function startGame(io, roomCode) {
  const room = rooms.get(roomCode);
  if (!room || room.players.length !== 2) {
    return null;
  }

  const [playerOne, playerTwo] = room.players;
  const [imageOne, imageTwo] = pickTwoDistinctImages();

  room.game = {
    startedAt: Date.now(),
    finished: false,
    assignments: {
      [playerOne]: {
        ownImage: imageOne,
        opponentImage: imageTwo
      },
      [playerTwo]: {
        ownImage: imageTwo,
        opponentImage: imageOne
      }
    }
  };

  const socketOne = io.sockets.sockets.get(playerOne);
  const socketTwo = io.sockets.sockets.get(playerTwo);

  if (!socketOne || !socketTwo) {
    cleanupRoom(io, roomCode, "Player connection issue. Please create a new room.");
    return null;
  }

  socketOne.emit("game-started", {
    roomCode,
    opponentImage: room.game.assignments[playerOne].opponentImage
  });

  socketTwo.emit("game-started", {
    roomCode,
    opponentImage: room.game.assignments[playerTwo].opponentImage
  });

  return room.game;
}

app
  .prepare()
  .then(() => {
    ensureExcelFile();

    const expressApp = express();
    const server = http.createServer(expressApp);

    expressApp.use(express.json({ limit: "1mb" }));

    const io = new Server(server, {
      cors: {
        origin: socketCorsOrigin,
        methods: ["GET", "POST"]
      }
    });

    io.on("connection", (socket) => {
      socket.on("create-room", (_, callback) => {
        try {
          const roomCode = generateRoomCode();

          rooms.set(roomCode, {
            code: roomCode,
            players: [socket.id],
            game: null,
            createdAt: Date.now()
          });

          socket.join(roomCode);

          callback?.({
            ok: true,
            roomCode,
            playerId: socket.id
          });

          io.to(roomCode).emit("room-state", {
            roomCode,
            playerCount: 1,
            maxPlayers: 2
          });
        } catch (error) {
          callback?.({
            ok: false,
            error: "Unable to create room. Please try again."
          });
        }
      });

      socket.on("join-room", ({ roomCode }, callback) => {
        try {
          const normalizedCode = String(roomCode || "").trim();
          const room = rooms.get(normalizedCode);

          if (!/^\d{4}$/.test(normalizedCode)) {
            callback?.({ ok: false, error: "Enter a valid 4-digit room code." });
            return;
          }

          if (!room) {
            callback?.({ ok: false, error: "Room not found." });
            return;
          }

          if (room.players.length >= 2) {
            callback?.({ ok: false, error: "Room is full." });
            return;
          }

          room.players.push(socket.id);
          socket.join(normalizedCode);

          let gameStarted = false;
          let opponentImage = null;

          if (room.players.length === 2) {
            let game;

            try {
              game = startGame(io, normalizedCode);
            } catch (error) {
              room.players = room.players.filter((playerId) => playerId !== socket.id);
              socket.leave(normalizedCode);

              callback?.({
                ok: false,
                error: "Game cannot start. Add at least 2 image links from admin dashboard."
              });

              io.to(normalizedCode).emit("room-state", {
                roomCode: normalizedCode,
                playerCount: room.players.length,
                maxPlayers: 2
              });

              return;
            }

            const assignment = game?.assignments?.[socket.id];
            if (assignment?.opponentImage) {
              gameStarted = true;
              opponentImage = assignment.opponentImage;
            }
          }

          callback?.({
            ok: true,
            roomCode: normalizedCode,
            playerId: socket.id,
            gameStarted,
            opponentImage
          });

          io.to(normalizedCode).emit("room-state", {
            roomCode: normalizedCode,
            playerCount: room.players.length,
            maxPlayers: 2
          });
        } catch (error) {
          callback?.({ ok: false, error: "Unable to join room." });
        }
      });

      socket.on("submit-guess", ({ roomCode, guess }, callback) => {
        try {
          const normalizedCode = String(roomCode || "").trim();
          const room = rooms.get(normalizedCode);

          if (!room || !room.game) {
            callback?.({ ok: false, error: "Game is not active." });
            return;
          }

          if (room.game.finished) {
            callback?.({ ok: false, error: "Game already finished." });
            return;
          }

          const assignment = room.game.assignments[socket.id];
          if (!assignment) {
            callback?.({ ok: false, error: "You are not part of this room." });
            return;
          }

          const normalizedGuess = normalizeGuess(guess);
          if (!normalizedGuess) {
            callback?.({ ok: false, error: "Please enter a guess." });
            return;
          }

          const answer = assignment.ownImage.label;
          const isCorrect = normalizedGuess === normalizeGuess(answer);
          const trimmedGuess = String(guess || "").trim();

          room.game.finished = true;

          const currentPlayerResult = isCorrect ? "win" : "lose";
          const opponentPlayerResult = isCorrect ? "lose" : "win";

          socket.emit("game-finished", {
            result: currentPlayerResult,
            answer,
            guess: trimmedGuess,
            guessedBy: "you"
          });

          const opponentPlayerId = room.players.find((playerId) => playerId !== socket.id);
          if (opponentPlayerId) {
            const opponentSocket = io.sockets.sockets.get(opponentPlayerId);
            opponentSocket?.emit("game-finished", {
              result: opponentPlayerResult,
              answer,
              guess: trimmedGuess,
              guessedBy: "opponent"
            });
          }

          callback?.({ ok: true });
        } catch (error) {
          callback?.({ ok: false, error: "Guess failed. Please try again." });
        }
      });

      socket.on("sync-room", ({ roomCode }, callback) => {
        try {
          const normalizedCode = String(roomCode || "").trim();
          const room = rooms.get(normalizedCode);

          if (!room) {
            callback?.({ ok: false, error: "Room not found." });
            return;
          }

          if (!room.players.includes(socket.id)) {
            callback?.({ ok: false, error: "You are not part of this room." });
            return;
          }

          const assignment = room.game?.assignments?.[socket.id] || null;

          callback?.({
            ok: true,
            roomCode: normalizedCode,
            playerCount: room.players.length,
            maxPlayers: 2,
            gameStarted: Boolean(assignment?.opponentImage),
            opponentImage: assignment?.opponentImage || null
          });
        } catch (error) {
          callback?.({ ok: false, error: "Unable to sync room state." });
        }
      });

      socket.on("leave-room", ({ roomCode }) => {
        const normalizedCode = String(roomCode || "").trim();
        const room = rooms.get(normalizedCode);
        if (!room) {
          return;
        }

        cleanupRoom(io, normalizedCode, "A player left the room.");
      });

      socket.on("disconnect", () => {
        for (const [roomCode, room] of rooms.entries()) {
          if (room.players.includes(socket.id)) {
            cleanupRoom(io, roomCode, "A player disconnected.");
            break;
          }
        }
      });
    });

    expressApp.get("/health", (_, res) => {
      res.json({ ok: true });
    });

    expressApp.get("/api/admin/images", (_, res) => {
      try {
        const images = readImages();
        res.json({ ok: true, count: images.length, items: images });
      } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: "Failed to load images." });
      }
    });

    expressApp.post("/api/admin/images", (req, res) => {
      try {
        const requiredAdminKey = process.env.ADMIN_KEY;

        if (requiredAdminKey) {
          const incomingAdminKey = String(req.headers["x-admin-key"] || "");
          if (!incomingAdminKey || incomingAdminKey !== requiredAdminKey) {
            res.status(401).json({ ok: false, error: "Unauthorized admin key." });
            return;
          }
        }

        const result = addImageToStore({
          label: req.body?.label,
          url: req.body?.url
        });

        if (!result.ok) {
          res.status(400).json({ ok: false, error: result.error });
          return;
        }

        res.status(201).json(result);
      } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: "Failed to save image." });
      }
    });

    expressApp.all("*", (req, res) => handle(req, res));

    expressApp.use((err, req, res, nextFn) => {
      console.error(err);
      res.status(500).json({ error: "Internal server error." });
      nextFn();
    });

    server.listen(port, () => {
      console.log(`> Server ready on ${appUrl}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start server", error);
    process.exit(1);
  });
