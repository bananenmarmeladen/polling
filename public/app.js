const $ = (selector) => document.querySelector(selector);

const views = {
  welcome: $("#welcome-view"),
  host: $("#host-view"),
  audience: $("#audience-view"),
};

let currentRoom = null;
let selectedOption = null;
let eventSource = null;
let toastTimer;

function showView(name) {
  Object.entries(views).forEach(([viewName, element]) => {
    element.classList.toggle("hidden", viewName !== name);
  });
}

function toast(message) {
  const element = $("#toast");
  element.textContent = message;
  element.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove("visible"), 2600);
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  if (options.admin) {
    const key = sessionStorage.getItem("pulse-host-key");
    if (key) headers.set("Authorization", `Bearer ${key}`);
  }
  const response = await fetch(url, { ...options, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Something went wrong. Please try again.");
  return body;
}

function newVoterId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

async function openHost() {
  showView("host");
  const unlocked = Boolean(sessionStorage.getItem("pulse-host-key"));
  $("#host-key-prompt").classList.toggle("hidden", unlocked);
  $("#host-studio").classList.toggle("hidden", !unlocked);
  if (unlocked) {
    $("#host-live-panel").classList.toggle("has-room", Boolean(currentRoom));
    if (!currentRoom) {
      try {
        const { room } = await api("/api/rooms", { admin: true });
        if (room) setRoom(room);
      } catch (error) {
        sessionStorage.removeItem("pulse-host-key");
        $("#host-studio").classList.add("hidden");
        $("#host-key-prompt").classList.remove("hidden");
        $("#host-key-error").textContent = error.message;
      }
    }
  }
}

function setRoom(room) {
  currentRoom = room;
  if (eventSource) eventSource.close();
  eventSource = new EventSource(`/api/rooms/${encodeURIComponent(room.code)}/events`);
  eventSource.onmessage = (event) => {
    const latest = JSON.parse(event.data);
    if (currentRoom?.code !== latest.code) return;
    currentRoom = latest;
    renderHostRoom(latest);
    renderAudienceRoom(latest);
  };
  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      $("#audience-error").textContent = "The live connection was interrupted. Refresh to reconnect.";
    }
  };
  renderHostRoom(room);
  renderAudienceRoom(room);
}

function renderResults(container, room, audience = false) {
  const list = container;
  list.replaceChildren();
  room.options.forEach((option, index) => {
    const count = room.counts[index] || 0;
    const percent = room.totalVotes ? Math.round((count / room.totalVotes) * 100) : 0;
    const row = document.createElement("div");
    row.className = `result-row${audience ? " audience-result-row" : ""}`;
    const label = document.createElement("div");
    label.className = "result-label";
    const name = document.createElement("span");
    name.textContent = option;
    const stat = document.createElement("span");
    stat.className = "result-stat";
    stat.textContent = `${percent}%`;
    label.append(name, stat);
    const track = document.createElement("div");
    track.className = "result-track";
    const fill = document.createElement("i");
    fill.style.width = `${percent}%`;
    track.append(fill);
    const countLabel = document.createElement("span");
    countLabel.className = "result-votes";
    countLabel.textContent = `${count} ${count === 1 ? "vote" : "votes"}`;
    row.append(label, track, countLabel);
    list.append(row);
  });
}

function renderHostRoom(room) {
  $("#host-empty-state").classList.add("hidden");
  $("#host-live-content").classList.remove("hidden");
  $("#host-live-panel").classList.add("has-room");
  $("#host-live-title").textContent = room.title;
  $("#host-live-question").textContent = room.question;
  $("#room-code").textContent = room.code;
  $("#room-status").textContent = room.status === "open" ? "VOTING OPEN" : "VOTING CLOSED";
  $("#room-status").classList.toggle("closed", room.status !== "open");
  $("#vote-count").textContent = `${room.totalVotes} ${room.totalVotes === 1 ? "vote" : "votes"}`;
  $("#close-poll-button").textContent = room.status === "open" ? "Close voting" : "Reopen voting";
  renderResults($("#host-results"), room);
}

function renderAudienceRoom(room) {
  if (!views.audience.classList.contains("hidden")) {
    $("#join-prompt").classList.add("hidden");
    $("#audience-poll").classList.remove("hidden");
  }
  const key = `pulse-voted-${room.code}`;
  const votedRound = Number(localStorage.getItem(key) || 0);
  const alreadyVoted = votedRound === room.round;
  $("#audience-title").textContent = room.title;
  $("#audience-question").textContent = room.question;
  $("#audience-status").textContent = room.status === "open" ? "LIVE" : "CLOSED";
  $("#audience-status").classList.toggle("closed", room.status !== "open");
  $("#audience-instruction").textContent = room.status !== "open"
    ? "Voting has closed. Here’s what the room thinks."
    : alreadyVoted
      ? "Your answer is in. Here’s how the room is responding."
      : "Choose the answer that feels right to you.";
  $("#submit-vote").classList.toggle("hidden", room.status !== "open" || alreadyVoted);
  $("#audience-results").classList.toggle("hidden", room.status === "open" && !alreadyVoted);
  $("#audience-vote-count").textContent = `${room.totalVotes} ${room.totalVotes === 1 ? "vote" : "votes"}`;
  renderResults($("#audience-results-list"), room, true);

  const options = $("#audience-options");
  options.replaceChildren();
  room.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "audience-option";
    button.disabled = room.status !== "open" || alreadyVoted;
    button.setAttribute("aria-pressed", String(selectedOption === index));
    const text = document.createElement("span");
    text.textContent = option;
    const marker = document.createElement("i");
    marker.setAttribute("aria-hidden", "true");
    button.append(text, marker);
    button.addEventListener("click", () => {
      selectedOption = index;
      options.querySelectorAll(".audience-option").forEach((candidate, candidateIndex) => {
        candidate.setAttribute("aria-pressed", String(candidateIndex === selectedOption));
      });
    });
    options.append(button);
  });
}

async function enterRoom(code) {
  $("#join-error").textContent = "";
  try {
    const room = await api(`/api/rooms/${encodeURIComponent(code.toUpperCase())}`);
    selectedOption = null;
    history.replaceState(null, "", `/?room=${encodeURIComponent(room.code)}`);
    showView("audience");
    setRoom(room);
  } catch (error) {
    $("#join-error").textContent = error.message;
  }
}

$("#create-first-poll").addEventListener("click", openHost);
$("#host-key-button").addEventListener("click", openHost);
$("#join-poll").addEventListener("click", () => {
  showView("audience");
  $("#join-prompt").classList.remove("hidden");
  $("#audience-poll").classList.add("hidden");
  $("#room-code-input").focus();
});
document.querySelectorAll("[data-home]").forEach((button) => button.addEventListener("click", () => showView("welcome")));

$("#host-key-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const key = $("#host-key-input").value.trim();
  if (!key) return;
  $("#host-key-error").textContent = "";
  try {
    const response = await fetch("/api/rooms", { headers: { Authorization: `Bearer ${key}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not verify the host key.");
    sessionStorage.setItem("pulse-host-key", key);
    $("#host-key-prompt").classList.add("hidden");
    $("#host-studio").classList.remove("hidden");
    if (result.room) setRoom(result.room);
  } catch (error) {
    $("#host-key-error").textContent = error.message;
  }
});

$("#create-poll-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);
  const options = String(form.get("options")).split("\n").map((option) => option.trim()).filter(Boolean);
  const error = $("#create-error");
  error.textContent = "";
  if (options.length < 2 || options.length > 8) {
    error.textContent = "Add between two and eight answer options, one per line.";
    return;
  }
  try {
    const room = await api("/api/rooms", {
      method: "POST",
      admin: true,
      body: JSON.stringify({
        title: form.get("title"),
        question: form.get("question"),
        options,
      }),
    });
    formElement.reset();
    setRoom(room);
    toast("Your room is live. Invite your audience!");
  } catch (requestError) {
    error.textContent = requestError.message;
  }
});

$("#room-code-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const code = $("#room-code-input").value.trim();
  if (code) enterRoom(code);
});

$("#submit-vote").addEventListener("click", async () => {
  if (!currentRoom || selectedOption === null) {
    $("#audience-error").textContent = "Choose an answer before you vote.";
    return;
  }
  const voterKey = `pulse-voter-${currentRoom.code}`;
  const voterId = localStorage.getItem(voterKey) || newVoterId();
  localStorage.setItem(voterKey, voterId);
  $("#audience-error").textContent = "";
  try {
    const result = await api(`/api/rooms/${encodeURIComponent(currentRoom.code)}/votes`, {
      method: "POST",
      body: JSON.stringify({ option: selectedOption, voterId }),
    });
    localStorage.setItem(`pulse-voted-${currentRoom.code}`, String(result.round));
    setRoom(result);
  } catch (error) {
    $("#audience-error").textContent = error.message;
  }
});

$("#close-poll-button").addEventListener("click", async () => {
  if (!currentRoom) return;
  const action = currentRoom.status === "open" ? "close" : "reopen";
  try {
    const room = await api(`/api/rooms/${encodeURIComponent(currentRoom.code)}/control`, {
      method: "PATCH",
      admin: true,
      body: JSON.stringify({ action }),
    });
    setRoom(room);
  } catch (error) {
    toast(error.message);
  }
});

$("#reset-poll-button").addEventListener("click", async () => {
  if (!currentRoom || !window.confirm("Clear all votes and reopen this poll?")) return;
  try {
    const room = await api(`/api/rooms/${encodeURIComponent(currentRoom.code)}/control`, {
      method: "PATCH",
      admin: true,
      body: JSON.stringify({ action: "reset" }),
    });
    setRoom(room);
    toast("Votes cleared. The poll is open again.");
  } catch (error) {
    toast(error.message);
  }
});

$("#copy-link-button").addEventListener("click", async () => {
  if (!currentRoom) return;
  const invite = new URL(`/?room=${encodeURIComponent(currentRoom.code)}`, window.location.origin).href;
  try {
    await navigator.clipboard.writeText(invite);
    toast("Invite link copied.");
  } catch {
    window.prompt("Copy this invite link:", invite);
  }
});

const initialCode = new URLSearchParams(window.location.search).get("room");
if (initialCode) {
  showView("audience");
  $("#room-code-input").value = initialCode;
  enterRoom(initialCode);
}
