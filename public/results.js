const canvas = document.querySelector("#word-cloud");
const colors = [
  "#155E63", "#0F766E", "#1D4E89", "#245C8C", "#256D3A", "#3D6B42",
  "#426B73", "#355B80", "#456B3F", "#1F6B5C", "#294A70", "#32765D",
];
let words = [];
let renderFrame = 0;

function colorForWord(word) {
  let hash = 0;
  for (const character of word) hash = (hash * 31 + character.codePointAt(0)) | 0;
  return colors[(hash >>> 0) % colors.length];
}

function drawWordCloud() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const cloudWidth = Math.round(width * 0.92);
  const cloudHeight = Math.round(height * 0.8);
  canvas.width = Math.round(cloudWidth * pixelRatio);
  canvas.height = Math.round(cloudHeight * pixelRatio);
  canvas.style.width = `${cloudWidth}px`;
  canvas.style.height = `${cloudHeight}px`;
  if (!words.length) {
    canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  if (typeof window.WordCloud !== "function") {
    console.error("Die Wortwolken-Bibliothek konnte nicht geladen werden.");
    return;
  }
  WordCloud.stop();
  if (!WordCloud.isSupported) {
    console.error("Dieser Browser unterstützt die Live-Wortwolke nicht.");
    return;
  }

  const averageLength = words.reduce((total, word) => total + word.name.length, 0) / words.length;
  const densityFont = Math.sqrt((cloudWidth * cloudHeight * 0.5) / (words.length * averageLength * 0.68 * 1.2));
  const minFont = Math.max(3, Math.min(18, densityFont * 0.72));
  const maxFont = Math.min(cloudWidth * 0.1, cloudHeight * 0.18, 100);
  const gridScale = words.length > 300 ? 1 : pixelRatio;
  const list = words.map(({ name, votes }) => {
    const fontSize = words.length === 1
      ? maxFont
      : Math.min(maxFont, minFont + densityFont * 0.3 * Math.log2(votes));
    return [name, fontSize];
  });

  WordCloud(canvas, {
    list,
    fontFamily: 'Domus, "Avenir Next", sans-serif',
    fontWeight: "700",
    color: colorForWord,
    backgroundColor: "#ffffff",
    clearCanvas: true,
    gridSize: Math.max(4, Math.round(Math.min(cloudWidth, cloudHeight) / Math.max(160, Math.sqrt(words.length) * 12))) * gridScale,
    weightFactor: (fontSize) => fontSize * pixelRatio,
    minSize: pixelRatio,
    shuffle: false,
    rotateRatio: 0,
    shape: "circle",
    ellipticity: 0.8,
    shrinkToFit: true,
  });
}

function setWords(results) {
  words = Array.isArray(results.words) ? results.words : [];
  document.title = words.length
    ? `${words.length} Konzertideen — Cantus Domus`
    : "Wortwolke — Cantus Domus";
  drawWordCloud();
}

function resize() {
  scheduleRender();
}

function scheduleRender() {
  cancelAnimationFrame(renderFrame);
  renderFrame = requestAnimationFrame(drawWordCloud);
}

const liveUpdates = io();
liveUpdates.on("results", (results) => {
  setWords(results);
  scheduleRender();
});
liveUpdates.on("connect_error", (error) => {
  console.error("Die Wortwolke konnte keine Live-Verbindung herstellen.", error);
});
window.addEventListener("resize", resize, { passive: true });
document.fonts.ready.then(scheduleRender);

fetch("/api/results")
  .then(async (response) => {
    const results = await response.json();
    if (!response.ok) throw new Error(results.error || "Ergebnisse konnten nicht geladen werden.");
    setWords(results);
    scheduleRender();
  })
  .catch((error) => console.error("Die Ergebnisse konnten nicht geladen werden.", error));
