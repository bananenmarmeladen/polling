const connectionStatus = document.querySelector("#connection-status");
const voteTotal = document.querySelector("#total-votes");
const chartCanvas = document.querySelector("#results-chart");
const resultsError = document.querySelector("#results-error");

const valueLabels = {
  id: "valueLabels",
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    const bars = chart.getDatasetMeta(0).data;
    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.font = '600 13px "Domus", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    bars.forEach((bar, index) => {
      const count = chart.data.datasets[0].data[index];
      if (count > 0) ctx.fillText(String(count), bar.x, bar.y - 7);
    });
    ctx.restore();
  },
};

let chart;

function buildChart() {
  if (typeof Chart === "undefined") {
    resultsError.textContent = "Das Diagramm konnte nicht geladen werden. Bitte lade die Seite neu.";
    return null;
  }
  return new Chart(chartCanvas, {
    type: "bar",
    data: {
      labels: [],
      datasets: [{
        label: "Stimmen",
        data: [],
        backgroundColor(context) {
          const { chart: currentChart } = context;
          const { ctx, chartArea } = currentChart;
          if (!chartArea) return "#53c6cb";
          const gradient = ctx.createLinearGradient(0, chartArea.bottom, 0, chartArea.top);
          gradient.addColorStop(0, "#2a8eb3");
          gradient.addColorStop(1, "#70d6d2");
          return gradient;
        },
        borderRadius: 5,
        borderSkipped: false,
        maxBarThickness: 48,
        minBarLength: 3,
      }],
    },
    plugins: [valueLabels],
    options: {
      maintainAspectRatio: false,
      animation: { duration: 450 },
      layout: { padding: { top: 28, left: 6, right: 10, bottom: 3 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#f8fbfd",
          titleColor: "#07507a",
          bodyColor: "#07507a",
          borderColor: "#9fd7db",
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: { label: (context) => `${context.raw} ${context.raw === 1 ? "Stimme" : "Stimmen"}` },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { color: "#36526a" },
          ticks: {
            color: "#d5e2eb",
            autoSkip: false,
            minRotation: 50,
            maxRotation: 65,
            padding: 9,
            font: { family: "Domus, sans-serif", size: 11 },
          },
        },
        y: {
          beginAtZero: true,
          suggestedMax: 1,
          border: { display: false },
          grid: { color: "rgba(181, 208, 222, .14)", drawTicks: false },
          ticks: {
            color: "#a8bdcb",
            precision: 0,
            padding: 10,
            font: { family: "Domus, sans-serif", size: 11 },
          },
        },
      },
    },
  });
}

function updateResults(results) {
  if (!chart) return;
  const ranking = Array.isArray(results.top20) ? results.top20.slice(0, 20) : [];
  chart.data.labels = ranking.map((project) => project.name);
  chart.data.datasets[0].data = ranking.map((project) => project.votes);
  chart.update();
  voteTotal.textContent = Number(results.totalVotes || 0).toLocaleString("de-DE");
  resultsError.textContent = "";
  document.title = `${voteTotal.textContent} Stimmen — Cantus Domus`;
}

function setConnection(connected) {
  connectionStatus.classList.toggle("connected", connected);
  connectionStatus.innerHTML = connected
    ? "<i></i> LIVE AKTUALISIERT"
    : "<i></i> VERBINDUNG WIRD HERGESTELLT";
}

chart = buildChart();
const socket = io();
socket.on("connect", () => setConnection(true));
socket.on("disconnect", () => setConnection(false));
socket.on("connect_error", () => {
  setConnection(false);
  resultsError.textContent = "Die Live-Verbindung ist unterbrochen. Es wird erneut verbunden.";
});
socket.on("results", updateResults);

document.querySelector("#fullscreen-button").addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch (error) {
    resultsError.textContent = `Vollbild konnte nicht aktiviert werden: ${error.message}`;
  }
});
