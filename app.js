const pdfjsLib = window['pdfjs-dist/build/pdf'];

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const fileInput = document.getElementById('fileInput');
const wordEl = document.getElementById('word');
const playButton = document.getElementById('playButton');
const resetButton = document.getElementById('resetButton');
const speedInput = document.getElementById('speedInput');
const speedValue = document.getElementById('speedValue');
const colorInput = document.getElementById('colorInput');
const bgColorInput = document.getElementById('bgColorInput');
const sizeInput = document.getElementById('sizeInput');
const sizeValue = document.getElementById('sizeValue');
const multiWordToggle = document.getElementById('multiWordToggle');
const multiWordDisplay = document.getElementById('multiWordDisplay');
const wordContainer = document.querySelector('.word-container');
const progressText = document.getElementById('progressText');
const statusText = document.getElementById('statusText');
const themeButton = document.getElementById('themeButton');
const themeLabel = document.getElementById('themeLabel');
const header = document.getElementById('header');
const controls = document.getElementById('controls');
const app = document.getElementById('app');

let words = [];
let currentIndex = 0;
let isPlaying = false;
let timerId = null;
let wpm = Number(speedInput.value);
let mouseTimeout = null;
let isMouseActive = true;
let multiWordMode = false;

// Load saved preferences
function loadPreferences() {
  const savedColor = localStorage.getItem('wordColor');
  const savedBgColor = localStorage.getItem('bgColor');
  const savedSize = localStorage.getItem('wordSize');
  const savedMultiWord = localStorage.getItem('multiWordMode');

  if (savedColor) {
    colorInput.value = savedColor;
    document.documentElement.style.setProperty('--word-color', savedColor);
  }

  if (savedBgColor) {
    bgColorInput.value = savedBgColor;
    document.documentElement.style.setProperty('--bg', savedBgColor);
  } else {
    // Set default based on current theme
    const isLight = document.documentElement.dataset.theme === 'light';
    const defaultBg = isLight ? '#ffffff' : '#000000';
    bgColorInput.value = defaultBg;
  }

  if (savedSize) {
    sizeInput.value = savedSize;
    const sizePercent = savedSize / 100;
    document.documentElement.style.setProperty('--word-size', sizePercent);
    sizeValue.textContent = `${savedSize}%`;
  }

  if (savedMultiWord === 'true') {
    multiWordMode = true;
    multiWordToggle.checked = true;
    toggleMultiWordMode();
  }
}

// Save preferences
function savePreferences() {
  localStorage.setItem('wordColor', colorInput.value);
  localStorage.setItem('bgColor', bgColorInput.value);
  localStorage.setItem('wordSize', sizeInput.value);
  localStorage.setItem('multiWordMode', multiWordMode);
}

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
  if (multiWordMode) {
    renderMultiWord(text);
  } else {
    wordEl.textContent = text || '';
  }
}

function renderMultiWord(text) {
  const centerWord = multiWordDisplay.querySelector('.multi-word-center');
  const left1Word = multiWordDisplay.querySelector('.multi-word-left-1');
  const right1Word = multiWordDisplay.querySelector('.multi-word-right-1');

  // Center word is the current word
  centerWord.textContent = text || '';

  // Previous word (last word)
  left1Word.textContent = currentIndex > 0 ? words[currentIndex - 1] : '';

  // Next word (upcoming word)
  right1Word.textContent =
    currentIndex < words.length - 1 ? words[currentIndex + 1] : '';
}

function toggleMultiWordMode() {
  multiWordMode = multiWordToggle.checked;

  if (multiWordMode) {
    wordContainer.classList.add('multi-word-mode');
    multiWordDisplay.classList.add('active');
    // Initialize with current word and context
    if (words.length > 0 && currentIndex < words.length) {
      renderMultiWord(words[currentIndex]);
    }
  } else {
    wordContainer.classList.remove('multi-word-mode');
    multiWordDisplay.classList.remove('active');
    // Clear multi-word display
    const allWords = multiWordDisplay.querySelectorAll('.multi-word');
    allWords.forEach((word) => (word.textContent = ''));
  }

  savePreferences();
}

function stopPlayback() {
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }
  isPlaying = false;
  playButton.textContent = 'Start';
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
    setStatus('Done');
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
  playButton.textContent = 'Pause';
  setStatus('Playing');
  scheduleNext();
}

function togglePlayback() {
  if (!isPlaying) {
    startPlayback();
    return;
  }

  stopPlayback();
  setStatus('Paused');
}

function resetReader() {
  stopPlayback();
  currentIndex = 0;
  updateProgress();
  if (multiWordMode) {
    const allWords = multiWordDisplay.querySelectorAll('.multi-word');
    allWords.forEach((word) => (word.textContent = ''));
    multiWordDisplay.querySelector('.multi-word-center').textContent = 'Ready';
  } else {
    renderWord('Ready');
  }
  setStatus('Ready');
}

async function extractWordsFromPdf(file) {
  setStatus('Loading PDF...');
  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;
  let textChunks = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item) => item.str).join(' ');
    if (pageText.trim()) {
      textChunks.push(pageText);
    }
  }

  return textChunks
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  stopPlayback();
  renderWord('Parsing...');
  playButton.disabled = true;
  resetButton.disabled = true;

  try {
    words = await extractWordsFromPdf(file);
    currentIndex = 0;
    updateProgress();
    if (multiWordMode) {
      const allWords = multiWordDisplay.querySelectorAll('.multi-word');
      allWords.forEach((word) => (word.textContent = ''));
      multiWordDisplay.querySelector('.multi-word-center').textContent =
        words.length ? 'Ready' : 'No text found';
    } else {
      renderWord(words.length ? 'Ready' : 'No text found');
    }
    setStatus(words.length ? 'Ready' : 'Empty');
    playButton.disabled = words.length === 0;
    resetButton.disabled = words.length === 0;
  } catch (error) {
    if (multiWordMode) {
      const allWords = multiWordDisplay.querySelectorAll('.multi-word');
      allWords.forEach((word) => (word.textContent = ''));
      multiWordDisplay.querySelector('.multi-word-center').textContent =
        'Failed to read PDF';
    } else {
      renderWord('Failed to read PDF');
    }
    setStatus('Error');
    playButton.disabled = true;
    resetButton.disabled = true;
    // eslint-disable-next-line no-console
    console.error(error);
  }
});

playButton.addEventListener('click', togglePlayback);
resetButton.addEventListener('click', resetReader);

speedInput.addEventListener('input', (event) => {
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

colorInput.addEventListener('input', (event) => {
  const color = event.target.value;
  document.documentElement.style.setProperty('--word-color', color);
  savePreferences();
});

bgColorInput.addEventListener('input', (event) => {
  const color = event.target.value;
  document.documentElement.style.setProperty('--bg', color);
  savePreferences();
});

sizeInput.addEventListener('input', (event) => {
  const size = Number(event.target.value);
  const sizePercent = size / 100;
  document.documentElement.style.setProperty('--word-size', sizePercent);
  sizeValue.textContent = `${size}%`;
  savePreferences();
});

multiWordToggle.addEventListener('change', toggleMultiWordMode);

function toggleTheme() {
  const root = document.documentElement;
  const isLight = root.dataset.theme === 'light';
  root.dataset.theme = isLight ? 'dark' : 'light';
  themeLabel.textContent = root.dataset.theme === 'light' ? 'Light' : 'Dark';
}

themeButton.addEventListener('click', toggleTheme);

// Auto-hide controls on mouse inactivity
function resetMouseTimer() {
  isMouseActive = true;
  header.classList.remove('hidden');
  controls.classList.remove('hidden');

  if (mouseTimeout) {
    clearTimeout(mouseTimeout);
  }

  mouseTimeout = setTimeout(() => {
    isMouseActive = false;
    header.classList.add('hidden');
    controls.classList.add('hidden');
  }, 3000); // Hide after 3 seconds of inactivity
}

// Track mouse movement
app.addEventListener('mousemove', resetMouseTimer);
app.addEventListener('mouseenter', resetMouseTimer);

// Show controls when interacting with them
controls.addEventListener('mouseenter', () => {
  resetMouseTimer();
});

header.addEventListener('mouseenter', () => {
  resetMouseTimer();
});

// Initialize mouse timer
resetMouseTimer();

// Load preferences on startup
loadPreferences();

updateSpeedLabel();
updateProgress();
setStatus('Idle');
