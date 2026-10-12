const search = document.querySelector("#project-search");
const suggestions = document.querySelector("#project-suggestions");
const voteButton = document.querySelector("#vote-button");
const voteError = document.querySelector("#vote-error");
const voteForm = document.querySelector("#vote-form");
const votedState = document.querySelector("#voted-state");
const voterIdKey = "cantus-domus-voter-id";
const maxProjectNameLength = 48;

let projects = [];
let activeSuggestion = -1;
let allowRepeatVotes = true;

function newVoterId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function setSuggestionsOpen(open) {
  suggestions.classList.toggle("hidden", !open);
  search.setAttribute("aria-expanded", String(open));
}

function canonicalizeInput(value) {
  return value.trim().replace(/\s+/g, " ").toLocaleUpperCase("de-DE").slice(0, maxProjectNameLength);
}

function updateVoteButton() {
  voteButton.disabled = !search.value.trim();
}

function renderSuggestions(query = "") {
  const normalizedQuery = canonicalizeInput(query);
  const matches = projects.filter((project) => !normalizedQuery || project.name.includes(normalizedQuery));
  suggestions.replaceChildren();
  activeSuggestion = -1;

  for (const project of matches) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "suggestion-option";
    option.setAttribute("role", "option");
    option.textContent = project.name;
    option.addEventListener("pointerdown", (event) => event.preventDefault());
    option.addEventListener("click", () => {
      search.value = project.name;
      setSuggestionsOpen(false);
      updateVoteButton();
    });
    suggestions.append(option);
  }

  if (matches.length === 0) {
    const empty = document.createElement("p");
    empty.className = "suggestions-empty";
    empty.textContent = "Neuer Vorschlag — mit deiner Stimme hinzufügen.";
    suggestions.append(empty);
  }
  setSuggestionsOpen(true);
}

function updateSuggestions(latestSuggestions) {
  projects = latestSuggestions;
  if (!suggestions.classList.contains("hidden")) renderSuggestions(search.value);
}

async function loadPageData() {
  try {
    const [configResponse, projectsResponse] = await Promise.all([
      fetch("/api/config"),
      fetch("/api/projects"),
    ]);
    const config = await configResponse.json();
    const data = await projectsResponse.json();
    if (!configResponse.ok) throw new Error(config.error || "Die Abstimmungseinstellungen konnten nicht geladen werden.");
    if (!projectsResponse.ok) throw new Error(data.error || "Die Vorschläge konnten nicht geladen werden.");

    allowRepeatVotes = config.allowRepeatVotes === true;
    document.querySelector("#vote-mode-notice").classList.toggle("hidden", !allowRepeatVotes);
    document.querySelector("#privacy-note").textContent = allowRepeatVotes
      ? "Testmodus aktiv: Mehrfachstimmen sind erlaubt."
      : "Eine Stimme pro Browser. Keine Anmeldung nötig.";
    updateSuggestions(data.projects);
    restoreSavedBallot();
  } catch (error) {
    voteError.textContent = error.message;
    search.disabled = true;
    voteButton.disabled = true;
  }
}

search.addEventListener("focus", () => renderSuggestions(search.value));
search.addEventListener("input", () => {
  const start = search.selectionStart;
  const end = search.selectionEnd;
  const uppercase = search.value.toLocaleUpperCase("de-DE").slice(0, maxProjectNameLength);
  if (search.value !== uppercase) {
    search.value = uppercase;
    search.setSelectionRange(Math.min(start, uppercase.length), Math.min(end, uppercase.length));
  }
  updateVoteButton();
  renderSuggestions(search.value);
});

search.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const options = [...suggestions.querySelectorAll(".suggestion-option")];
    if (!options.length) return;
    const direction = event.key === "ArrowDown" ? 1 : -1;
    activeSuggestion = (activeSuggestion + direction + options.length) % options.length;
    options.forEach((option, index) => {
      option.classList.toggle("active", index === activeSuggestion);
      option.setAttribute("aria-selected", String(index === activeSuggestion));
    });
    options[activeSuggestion].scrollIntoView({ block: "nearest" });
  } else if (event.key === "Enter" && activeSuggestion >= 0) {
    event.preventDefault();
    suggestions.querySelectorAll(".suggestion-option")[activeSuggestion]?.click();
  } else if (event.key === "Escape") {
    setSuggestionsOpen(false);
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-wrap")) setSuggestionsOpen(false);
});

voteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = canonicalizeInput(search.value);
  if (!name) {
    voteError.textContent = "Gib einen Projekt-Namen ein.";
    return;
  }

  voteError.textContent = "";
  voteButton.disabled = true;
  voteButton.classList.add("loading");
  try {
    const voterId = allowRepeatVotes ? newVoterId() : localStorage.getItem(voterIdKey) || newVoterId();
    const response = await fetch("/api/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, voterId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Deine Stimme konnte nicht gespeichert werden.");
    if (!allowRepeatVotes) localStorage.setItem(voterIdKey, voterId);

    document.querySelector("#voted-project").textContent = `Deine Stimme zählt für ${name}.`;
    document.querySelector("#voted-state strong").textContent = allowRepeatVotes
      ? "Stimme gespeichert — weiter testen!"
      : "Danke für deine Stimme!";
    votedState.classList.remove("hidden");
    if (allowRepeatVotes) {
      search.value = "";
      updateVoteButton();
      setSuggestionsOpen(false);
    } else {
      voteForm.classList.add("hidden");
    }
  } catch (error) {
    voteError.textContent = error.message;
    updateVoteButton();
  } finally {
    voteButton.classList.remove("loading");
  }
});

function restoreSavedBallot() {
  if (allowRepeatVotes) {
    voteForm.classList.remove("hidden");
    return;
  }
  try {
    const savedBallot = localStorage.getItem(voterIdKey);
    if (savedBallot) {
      voteForm.classList.add("hidden");
      document.querySelector("#voted-state strong").textContent = "Danke für deine Stimme!";
      document.querySelector("#voted-project").textContent = "Deine Stimme wurde bereits abgegeben.";
      votedState.classList.remove("hidden");
    }
  } catch (error) {
    console.error("Der gespeicherte Abstimmungsstatus konnte nicht gelesen werden.", error);
  }
}

const liveUpdates = io();
liveUpdates.on("suggestions", updateSuggestions);
liveUpdates.on("connect_error", (error) => {
  console.error("Die Live-Vorschläge konnten nicht verbunden werden.", error);
});

loadPageData();
