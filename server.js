const path = require("path");
const http = require("http");
const express = require("express");
const next = require("next");
const { Server } = require("socket.io");
const {
  addCategoryToStore,
  addImageToStore,
  ensureExcelFile,
  readCategories,
  readImages,
  resetExcelData
} = require("./src/data/imagesStore");

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
const ADMIN_AUTH_COOKIE = "whoiam_admin_auth";
const ADMIN_USERNAME = "admin";

const rooms = new Map();

function getAdminPassword() {
  return String(process.env.ADMIN_KEY || "").trim();
}

function parseCookies(cookieHeader) {
  const source = String(cookieHeader || "");

  return source.split(";").reduce((accumulator, item) => {
    const [rawKey, ...rawValue] = item.trim().split("=");
    if (!rawKey) {
      return accumulator;
    }

    accumulator[rawKey] = decodeURIComponent(rawValue.join("="));
    return accumulator;
  }, {});
}

function isAdminAuthenticated(req) {
  const adminPassword = getAdminPassword();
  if (!adminPassword) {
    return false;
  }

  const cookies = parseCookies(req.headers.cookie);
  const cookieValue = String(cookies[ADMIN_AUTH_COOKIE] || "");
  if (cookieValue && cookieValue === adminPassword) {
    return true;
  }

  const incomingAdminKey = String(req.headers["x-admin-key"] || "").trim();
  return Boolean(incomingAdminKey && incomingAdminKey === adminPassword);
}

function ensureAdminAuth(req, res) {
  if (isAdminAuthenticated(req)) {
    return true;
  }

  res.status(401).json({ ok: false, error: "غير مصرح. يرجى تسجيل الدخول كمسؤول." });
  return false;
}

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

function pickTwoDistinctImagesByCategory() {
  const images = readImages();

  const imagesByCategory = images.reduce((accumulator, image) => {
    const category = String(image.category || "").trim();
    if (!category) {
      return accumulator;
    }

    if (!accumulator.has(category)) {
      accumulator.set(category, []);
    }

    accumulator.get(category).push(image);
    return accumulator;
  }, new Map());

  const validCategories = Array.from(imagesByCategory.entries()).filter(
    ([, categoryImages]) => categoryImages.length >= 2
  );

  if (!validCategories.length) {
    throw new Error("يلزم وجود صورتين على الأقل داخل نفس الفئة لبدء اللعبة.");
  }

  const selectedCategoryIndex = Math.floor(Math.random() * validCategories.length);
  const [category, categoryImages] = validCategories[selectedCategoryIndex];

  const firstIndex = Math.floor(Math.random() * categoryImages.length);
  let secondIndex = Math.floor(Math.random() * categoryImages.length);

  while (secondIndex === firstIndex) {
    secondIndex = Math.floor(Math.random() * categoryImages.length);
  }

  return {
    category,
    firstImage: categoryImages[firstIndex],
    secondImage: categoryImages[secondIndex]
  };
}

function cleanupRoom(io, roomCode, reason = "تم إغلاق الغرفة.") {
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
  const {
    category,
    firstImage: imageOne,
    secondImage: imageTwo
  } = pickTwoDistinctImagesByCategory();

  room.game = {
    startedAt: Date.now(),
    finished: false,
    category,
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
    cleanupRoom(io, roomCode, "مشكلة في اتصال أحد اللاعبين. يرجى إنشاء غرفة جديدة.");
    return null;
  }

  socketOne.emit("game-started", {
    roomCode,
    category,
    opponentImage: room.game.assignments[playerOne].opponentImage
  });

  socketTwo.emit("game-started", {
    roomCode,
    category,
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

    expressApp.use("/admin", (req, res, nextFn) => {
      if (req.path === "/login" || req.path.startsWith("/login/")) {
        nextFn();
        return;
      }

      if (isAdminAuthenticated(req)) {
        nextFn();
        return;
      }

      res.redirect("/admin/login");
    });

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
            error: "تعذّر إنشاء الغرفة. يرجى المحاولة مرة أخرى."
          });
        }
      });

      socket.on("join-room", ({ roomCode }, callback) => {
        try {
          const normalizedCode = String(roomCode || "").trim();
          const room = rooms.get(normalizedCode);

          if (!/^\d{4}$/.test(normalizedCode)) {
            callback?.({ ok: false, error: "أدخل رمز غرفة صحيح مكوّن من 4 أرقام." });
            return;
          }

          if (!room) {
            callback?.({ ok: false, error: "الغرفة غير موجودة." });
            return;
          }

          if (room.players.length >= 2) {
            callback?.({ ok: false, error: "الغرفة ممتلئة." });
            return;
          }

          room.players.push(socket.id);
          socket.join(normalizedCode);

          let gameStarted = false;
          let opponentImage = null;
          let category = null;

          if (room.players.length === 2) {
            let game;

            try {
              game = startGame(io, normalizedCode);
            } catch (error) {
              room.players = room.players.filter((playerId) => playerId !== socket.id);
              socket.leave(normalizedCode);

              callback?.({
                ok: false,
                error: "لا يمكن بدء اللعبة. أضف صورتين على الأقل داخل نفس الفئة من لوحة الإدارة."
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
              category = room.game?.category || null;
            }
          }

          callback?.({
            ok: true,
            roomCode: normalizedCode,
            playerId: socket.id,
            gameStarted,
            category,
            opponentImage
          });

          io.to(normalizedCode).emit("room-state", {
            roomCode: normalizedCode,
            playerCount: room.players.length,
            maxPlayers: 2
          });
        } catch (error) {
          callback?.({ ok: false, error: "تعذّر الانضمام إلى الغرفة." });
        }
      });

      socket.on("submit-guess", ({ roomCode, guess }, callback) => {
        try {
          const normalizedCode = String(roomCode || "").trim();
          const room = rooms.get(normalizedCode);

          if (!room || !room.game) {
            callback?.({ ok: false, error: "اللعبة غير نشطة حالياً." });
            return;
          }

          if (room.game.finished) {
            callback?.({ ok: false, error: "انتهت اللعبة بالفعل." });
            return;
          }

          const assignment = room.game.assignments[socket.id];
          if (!assignment) {
            callback?.({ ok: false, error: "أنت لست ضمن هذه الغرفة." });
            return;
          }

          const normalizedGuess = normalizeGuess(guess);
          if (!normalizedGuess) {
            callback?.({ ok: false, error: "يرجى إدخال تخمين." });
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
            guessedBy: "أنت"
          });

          const opponentPlayerId = room.players.find((playerId) => playerId !== socket.id);
          if (opponentPlayerId) {
            const opponentSocket = io.sockets.sockets.get(opponentPlayerId);
            opponentSocket?.emit("game-finished", {
              result: opponentPlayerResult,
              answer,
              guess: trimmedGuess,
              guessedBy: "الخصم"
            });
          }

          callback?.({ ok: true });
        } catch (error) {
          callback?.({ ok: false, error: "فشل إرسال التخمين. يرجى المحاولة مرة أخرى." });
        }
      });

      socket.on("sync-room", ({ roomCode }, callback) => {
        try {
          const normalizedCode = String(roomCode || "").trim();
          const room = rooms.get(normalizedCode);

          if (!room) {
            callback?.({ ok: false, error: "الغرفة غير موجودة." });
            return;
          }

          if (!room.players.includes(socket.id)) {
            callback?.({ ok: false, error: "أنت لست ضمن هذه الغرفة." });
            return;
          }

          const assignment = room.game?.assignments?.[socket.id] || null;

          callback?.({
            ok: true,
            roomCode: normalizedCode,
            playerCount: room.players.length,
            maxPlayers: 2,
            category: room.game?.category || null,
            gameStarted: Boolean(assignment?.opponentImage),
            opponentImage: assignment?.opponentImage || null
          });
        } catch (error) {
          callback?.({ ok: false, error: "تعذّرت مزامنة حالة الغرفة." });
        }
      });

      socket.on("leave-room", ({ roomCode }) => {
        const normalizedCode = String(roomCode || "").trim();
        const room = rooms.get(normalizedCode);
        if (!room) {
          return;
        }

        cleanupRoom(io, normalizedCode, "غادر أحد اللاعبين الغرفة.");
      });

      socket.on("disconnect", () => {
        for (const [roomCode, room] of rooms.entries()) {
          if (room.players.includes(socket.id)) {
            cleanupRoom(io, roomCode, "انقطع اتصال أحد اللاعبين.");
            break;
          }
        }
      });
    });

    expressApp.get("/health", (_, res) => {
      res.json({ ok: true });
    });

    expressApp.post("/api/admin/login", (req, res) => {
      const adminPassword = getAdminPassword();

      if (!adminPassword) {
        res.status(500).json({ ok: false, error: "يرجى ضبط ADMIN_PASSWORD في ملف البيئة." });
        return;
      }

      const username = String(req.body?.username || "").trim();
      const password = String(req.body?.password || "");

      if (username !== ADMIN_USERNAME || password !== adminPassword) {
        res.status(401).json({ ok: false, error: "بيانات الدخول غير صحيحة." });
        return;
      }

      res.cookie(ADMIN_AUTH_COOKIE, encodeURIComponent(adminPassword), {
        httpOnly: true,
        sameSite: "lax",
        secure: !dev,
        maxAge: 1000 * 60 * 60 * 8,
        path: "/"
      });

      res.json({ ok: true, username: ADMIN_USERNAME });
    });

    expressApp.post("/api/admin/logout", (_req, res) => {
      res.clearCookie(ADMIN_AUTH_COOKIE, {
        httpOnly: true,
        sameSite: "lax",
        secure: !dev,
        path: "/"
      });

      res.json({ ok: true });
    });

    expressApp.get("/api/admin/session", (req, res) => {
      const adminPassword = getAdminPassword();

      if (!adminPassword) {
        res
          .status(500)
          .json({ ok: false, authenticated: false, error: "يرجى ضبط ADMIN_PASSWORD." });
        return;
      }

      const authenticated = isAdminAuthenticated(req);
      res.json({ ok: true, authenticated, username: authenticated ? ADMIN_USERNAME : null });
    });

    expressApp.get("/api/admin/images", (req, res) => {
      try {
        if (!ensureAdminAuth(req, res)) {
          return;
        }

        const images = readImages();
        res.json({ ok: true, count: images.length, items: images });
      } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: "تعذّر تحميل الصور." });
      }
    });

    expressApp.post("/api/admin/images", (req, res) => {
      try {
        if (!ensureAdminAuth(req, res)) {
          return;
        }

        const result = addImageToStore({
          label: req.body?.label,
          url: req.body?.url,
          category: req.body?.category
        });

        if (!result.ok) {
          res.status(400).json({ ok: false, error: result.error });
          return;
        }

        res.status(201).json(result);
      } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: "تعذّر حفظ الصورة." });
      }
    });

    expressApp.get("/api/admin/categories", (req, res) => {
      try {
        if (!ensureAdminAuth(req, res)) {
          return;
        }

        const categories = readCategories();
        res.json({ ok: true, count: categories.length, items: categories });
      } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: "تعذّر تحميل الفئات." });
      }
    });

    expressApp.post("/api/admin/categories", (req, res) => {
      try {
        if (!ensureAdminAuth(req, res)) {
          return;
        }

        const result = addCategoryToStore(req.body?.name);
        if (!result.ok) {
          res.status(400).json({ ok: false, error: result.error });
          return;
        }

        res.status(201).json(result);
      } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: "تعذّر حفظ الفئة." });
      }
    });

    expressApp.post("/api/admin/reset", (req, res) => {
      try {
        if (!ensureAdminAuth(req, res)) {
          return;
        }

        const result = resetExcelData();
        res.status(200).json(result);
      } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, error: "تعذّرت إعادة ضبط بيانات قاعدة البيانات." });
      }
    });

    expressApp.all("*", (req, res) => handle(req, res));

    expressApp.use((err, req, res, nextFn) => {
      console.error(err);
      res.status(500).json({ error: "خطأ داخلي في الخادم." });
      nextFn();
    });

    server.listen(port, () => {
      console.log(`> الخادم يعمل على ${appUrl}`);
    });
  })
  .catch((error) => {
    console.error("تعذّر تشغيل الخادم", error);
    process.exit(1);
  });
