const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const ADMIN_KEY = process.env.PULSE_ADMIN_KEY || crypto.randomBytes(24).toString("base64url");
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, "data"));
const DATA_FILE = path.join(DATA_DIR, "polls.json");
const publicDir = path.join(__dirname, "public");
const clients = new Map();
let writeQueue = Promise.resolve();
let rooms = {};

async function loadRooms() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const saved = JSON.parse(await fs.readFile(DATA_FILE, "utf8"));
    rooms = saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

function persistRooms() {
  const snapshot = JSON.stringify(rooms);
  writeQueue = writeQueue.then(async () => {
    const temporaryFile = `${DATA_FILE}.tmp`;
    await fs.writeFile(temporaryFile, snapshot, { mode: 0o600 });
    await fs.rename(temporaryFile, DATA_FILE);
  });
  return writeQueue;
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function publicRoom(room) {
  const votes = room.votes || {};
  const counts = room.options.map((_, index) => Object.values(votes).filter((choice) => choice === index).length);
  return {
    code: room.code,
    title: room.title,
    question: room.question,
    options: room.options,
    status: room.status,
    round: room.round || 1,
    createdAt: room.createdAt,
    counts,
    totalVotes: Object.keys(votes).length,
  };
}

function publishRoom(room) {
  const listeners = clients.get(room.code);
  if (!listeners) return;
  const message = `data: ${JSON.stringify(publicRoom(room))}\n\n`;
  for (const response of listeners) response.write(message);
}

function unauthorized(response) {
  sendJson(response, 401, { error: "Enter the host key to manage polls." });
}

function isAuthorized(request) {
  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Bearer ")) return false;
  const suppliedKey = Buffer.from(authorization.slice(7));
  const expectedKey = Buffer.from(ADMIN_KEY);
  return suppliedKey.length === expectedKey.length && crypto.timingSafeEqual(suppliedKey, expectedKey);
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 10_000) throw Object.assign(new Error("Request body is too large."), { status: 413 });
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON."), { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw Object.assign(new Error("Request body must be a JSON object."), { status: 400 });
  }
  return parsed;
}

function cleanText(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

async function handleApi(request, response, url) {
  const parts = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/api/health") {
    return sendJson(response, 200, { ok: true });
  }

  if (request.method === "GET" && url.pathname === "/api/rooms") {
    if (!isAuthorized(request)) return unauthorized(response);
    const latestRoom = Object.values(rooms).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    return sendJson(response, 200, { room: latestRoom ? publicRoom(latestRoom) : null });
  }

  if (request.method === "POST" && url.pathname === "/api/rooms") {
    if (!isAuthorized(request)) return unauthorized(response);
    const body = await readJson(request);
    const title = cleanText(body.title, 60);
    const question = cleanText(body.question, 160);
    const options = Array.isArray(body.options)
      ? body.options.map((option) => cleanText(option, 60)).filter(Boolean)
      : [];
    if (!title || !question || options.length < 2 || options.length > 8) {
      return sendJson(response, 400, { error: "Add a title, a question, and between two and eight answer options." });
    }

    let code;
    do {
      code = crypto.randomBytes(3).toString("hex").toUpperCase();
    } while (rooms[code]);
    const room = {
      code,
      title,
      question,
      options,
      status: "open",
      round: 1,
      votes: {},
      createdAt: new Date().toISOString(),
    };
    rooms[code] = room;
    await persistRooms();
    publishRoom(room);
    return sendJson(response, 201, publicRoom(room));
  }

  if (parts[0] !== "api" || parts[1] !== "rooms" || !parts[2]) {
    return sendJson(response, 404, { error: "Not found." });
  }

  const room = rooms[parts[2].toUpperCase()];
  if (!room) return sendJson(response, 404, { error: "This poll could not be found." });

  if (request.method === "GET" && parts.length === 3) {
    return sendJson(response, 200, publicRoom(room));
  }

  if (request.method === "GET" && parts[3] === "events") {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    response.write(`data: ${JSON.stringify(publicRoom(room))}\n\n`);
    if (!clients.has(room.code)) clients.set(room.code, new Set());
    clients.get(room.code).add(response);
    response.on("close", () => clients.get(room.code)?.delete(response));
    return;
  }

  if (request.method === "POST" && parts[3] === "votes") {
    const body = await readJson(request);
    if (room.status !== "open") return sendJson(response, 409, { error: "Voting is closed." });
    if (!Number.isInteger(body.option) || body.option < 0 || body.option >= room.options.length) {
      return sendJson(response, 400, { error: "Choose a valid answer option." });
    }
    if (typeof body.voterId !== "string" || !/^[a-f0-9-]{20,64}$/i.test(body.voterId)) {
      return sendJson(response, 400, { error: "A valid voter ID is required." });
    }
    if (room.votes[body.voterId] !== undefined) {
      return sendJson(response, 409, { error: "This browser has already voted in this poll." });
    }
    room.votes[body.voterId] = body.option;
    await persistRooms();
    publishRoom(room);
    return sendJson(response, 201, publicRoom(room));
  }

  if (request.method === "PATCH" && parts[3] === "control") {
    if (!isAuthorized(request)) return unauthorized(response);
    const body = await readJson(request);
    if (body.action === "close" && room.status === "open") {
      room.status = "closed";
    } else if (body.action === "reopen" && room.status === "closed") {
      room.status = "open";
    } else if (body.action === "reset") {
      room.votes = {};
      room.status = "open";
      room.round = (room.round || 1) + 1;
    } else {
      return sendJson(response, 400, { error: "Choose close, reopen, or reset." });
    }
    await persistRooms();
    publishRoom(room);
    return sendJson(response, 200, publicRoom(room));
  }

  return sendJson(response, 404, { error: "Not found." });
}

async function serveStatic(request, response, url) {
  const requestedPath = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const filePath = path.resolve(publicDir, `.${requestedPath}`);
  if (!filePath.startsWith(`${publicDir}${path.sep}`)) return sendJson(response, 404, { error: "Not found." });
  try {
    const content = await fs.readFile(filePath);
    const types = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
    response.writeHead(200, {
      "Content-Type": types[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    });
    response.end(content);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "EISDIR") return sendJson(response, 404, { error: "Not found." });
    throw error;
  }
}

const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) {
      await handleApi(request, response, url);
    } else {
      await serveStatic(request, response, url);
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendJson(response, error.status || 500, { error: error.status ? error.message : "The server could not complete this request." });
    else response.end();
  }
});

loadRooms().then(() => {
  server.listen(PORT, HOST, () => {
    console.log(`Pulse is ready at http://localhost:${PORT}`);
    if (process.env.PULSE_ADMIN_KEY) {
      console.log("Host key: configured with PULSE_ADMIN_KEY.");
    } else {
      console.log(`Generated host key: ${ADMIN_KEY}`);
      console.log("Set PULSE_ADMIN_KEY to keep the same key across restarts.");
    }
  });
}).catch((error) => {
  console.error("Could not load poll data:", error);
  process.exitCode = 1;
});
