const search = document.querySelector("#project-search");
const suggestions = document.querySelector("#project-suggestions");
const voteButton = document.querySelector("#vote-button");
const voteError = document.querySelector("#vote-error");
const voteForm = document.querySelector("#vote-form");
const votedState = document.querySelector("#voted-state");
const ballotKey = "cantus-domus-project-ballot";
const voterIdKey = "cantus-domus-voter-id";

let projects = [];
let selectedProject = null;
let activeSuggestion = -1;

function newVoterId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;
}

function setSuggestionsOpen(open) {
  suggestions.classList.toggle("hidden", !open);
  search.setAttribute("aria-expanded", String(open));
}

function chooseProject(project) {
  selectedProject = project;
  search.value = project.name;
  setSuggestionsOpen(false);
  voteButton.disabled = false;
  voteError.textContent = "";
}

function renderSuggestions(query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase("de");
  const matches = projects
    .filter((project) => !normalizedQuery || project.name.toLocaleLowerCase("de").includes(normalizedQuery));
  suggestions.replaceChildren();
  activeSuggestion = -1;

  for (const project of matches) {
    const option = document.createElement("button");
    option.type = "button";
    option.className = "suggestion-option";
    option.setAttribute("role", "option");
    option.textContent = project.name;
    option.addEventListener("pointerdown", (event) => event.preventDefault());
    option.addEventListener("click", () => chooseProject(project));
    suggestions.append(option);
  }

  if (matches.length === 0) {
    const empty = document.createElement("p");
    empty.className = "suggestions-empty";
    empty.textContent = "Kein passendes Projekt gefunden.";
    suggestions.append(empty);
  }
  setSuggestionsOpen(true);
}

function moveSuggestion(direction) {
  const options = [...suggestions.querySelectorAll(".suggestion-option")];
  if (options.length === 0) return;
  activeSuggestion = (activeSuggestion + direction + options.length) % options.length;
  options.forEach((option, index) => {
    option.classList.toggle("active", index === activeSuggestion);
    option.setAttribute("aria-selected", String(index === activeSuggestion));
  });
  options[activeSuggestion].scrollIntoView({ block: "nearest" });
}

async function loadProjects() {
  try {
    const response = await fetch("/api/projects");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Die Projektliste konnte nicht geladen werden.");
    projects = data.projects;
    document.querySelector(".intro-copy .section-kicker").textContent = `${data.totalProjects} IDEEN · EINE STIMME`;
  } catch (error) {
    voteError.textContent = error.message;
    search.disabled = true;
    voteButton.disabled = true;
  }
}

search.addEventListener("focus", () => renderSuggestions(search.value));
search.addEventListener("input", () => {
  selectedProject = null;
  voteButton.disabled = true;
  renderSuggestions(search.value);
});

search.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveSuggestion(1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    moveSuggestion(-1);
  } else if (event.key === "Enter" && activeSuggestion >= 0) {
    event.preventDefault();
    const option = suggestions.querySelectorAll(".suggestion-option")[activeSuggestion];
    const project = projects.find((candidate) => candidate.name === option?.textContent);
    if (project) chooseProject(project);
  } else if (event.key === "Escape") {
    setSuggestionsOpen(false);
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-wrap")) setSuggestionsOpen(false);
});

voteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedProject) {
    voteError.textContent = "Bitte wähle ein Projekt aus der Vorschlagsliste.";
    return;
  }

  voteError.textContent = "";
  voteButton.disabled = true;
  voteButton.classList.add("loading");
  try {
    const voterId = localStorage.getItem(voterIdKey) || newVoterId();
    const response = await fetch("/api/votes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: selectedProject.id, voterId }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Deine Stimme konnte nicht gespeichert werden.");
    localStorage.setItem(voterIdKey, voterId);
    localStorage.setItem(ballotKey, JSON.stringify({ projectId: selectedProject.id, projectName: selectedProject.name }));
    document.querySelector("#voted-project").textContent = `Deine Stimme zählt für ${selectedProject.name}.`;
    voteForm.classList.add("hidden");
    votedState.classList.remove("hidden");
  } catch (error) {
    voteError.textContent = error.message;
    voteButton.disabled = false;
  } finally {
    voteButton.classList.remove("loading");
  }
});

try {
  const savedBallot = JSON.parse(localStorage.getItem(ballotKey) || "null");
  if (savedBallot) {
    document.querySelector("#voted-project").textContent = `Deine Stimme zählt für ${savedBallot.projectName}.`;
    voteForm.classList.add("hidden");
    votedState.classList.remove("hidden");
  }
} catch (error) {
  console.error("Gespeicherte Stimmabgabe konnte nicht gelesen werden.", error);
}

loadProjects();
