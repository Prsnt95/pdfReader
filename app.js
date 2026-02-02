const pdfjsLib = window["pdfjs-dist/build/pdf"];

pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

const fileInput = document.getElementById("fileInput");
const wordEl = document.getElementById("word");
const playButton = document.getElementById("playButton");
const resetButton = document.getElementById("resetButton");
const speedInput = document.getElementById("speedInput");
const speedValue = document.getElementById("speedValue");
const progressText = document.getElementById("progressText");
const statusText = document.getElementById("statusText");
const themeButton = document.getElementById("themeButton");
const themeLabel = document.getElementById("themeLabel");

let words = [];
let currentIndex = 0;
let isPlaying = false;
let timerId = null;
let wpm = Number(speedInput.value);

function updateSpeedLabel() {
  speedValue.textContent = `${wpm} wpm`;
}

function updateProgress() {
  const total = words.length;
  const shown = Math.min(currentIndex, total);
  progressText.textContent = `${shown} / ${total}`;
}

function setStatus(text) {
  statusText.textContent = text;
}

function renderWord(text) {
  wordEl.textContent = text || "";
}

function stopPlayback() {
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }
  isPlaying = false;
  playButton.textContent = "Start";
}

function scheduleNext() {
  if (!isPlaying) {
    return;
  }
  const delay = Math.max(1, Math.round(60000 / wpm));
  timerId = setTimeout(() => {
    showNextWord();
    scheduleNext();
  }, delay);
}

function showNextWord() {
  if (currentIndex >= words.length) {
    stopPlayback();
    setStatus("Done");
    return;
  }

  renderWord(words[currentIndex]);
  currentIndex += 1;
  updateProgress();
}

function startPlayback() {
  if (!words.length) {
    return;
  }
  if (currentIndex >= words.length) {
    currentIndex = 0;
    updateProgress();
  }

  isPlaying = true;
  playButton.textContent = "Pause";
  setStatus("Playing");
  scheduleNext();
}

function togglePlayback() {
  if (!isPlaying) {
    startPlayback();
    return;
  }

  stopPlayback();
  setStatus("Paused");
}

function resetReader() {
  stopPlayback();
  currentIndex = 0;
  updateProgress();
  renderWord("Ready");
  setStatus("Ready");
}

async function extractWordsFromPdf(file) {
  setStatus("Loading PDF...");
  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  let textChunks = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(" ");
    if (pageText.trim()) {
      textChunks.push(pageText);
    }
  }

  return textChunks
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

fileInput.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  stopPlayback();
  renderWord("Parsing...");
  playButton.disabled = true;
  resetButton.disabled = true;

  try {
    words = await extractWordsFromPdf(file);
    currentIndex = 0;
    updateProgress();
    renderWord(words.length ? "Ready" : "No text found");
    setStatus(words.length ? "Ready" : "Empty");
    playButton.disabled = words.length === 0;
    resetButton.disabled = words.length === 0;
  } catch (error) {
    renderWord("Failed to read PDF");
    setStatus("Error");
    playButton.disabled = true;
    resetButton.disabled = true;
    // eslint-disable-next-line no-console
    console.error(error);
  }
});

playButton.addEventListener("click", togglePlayback);
resetButton.addEventListener("click", resetReader);

speedInput.addEventListener("input", (event) => {
  wpm = Number(event.target.value);
  updateSpeedLabel();
  if (isPlaying) {
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
    scheduleNext();
  }
});

function toggleTheme() {
  const root = document.documentElement;
  const isLight = root.dataset.theme === "light";
  root.dataset.theme = isLight ? "dark" : "light";
  themeLabel.textContent = root.dataset.theme === "light" ? "Light" : "Dark";
}

themeButton.addEventListener("click", toggleTheme);

updateSpeedLabel();
updateProgress();
setStatus("Idle");
