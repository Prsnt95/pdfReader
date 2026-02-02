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
const progressSlider = document.getElementById('progressSlider');
const progressSection = document.querySelector('.progress');
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

  // Update slider
  if (progressSlider) {
    progressSlider.max = total;
    progressSlider.value = shown;

    // Update progress fill percentage for visual feedback
    const progressPercent = total > 0 ? (shown / total) * 100 : 0;
    progressSlider.style.setProperty(
      '--progress-percent',
      `${progressPercent}%`
    );
  }
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

  // Don't update if user is dragging the slider
  if (isDraggingSlider) {
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
  if (progressSlider) {
    progressSlider.value = 0;
  }
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

async function handleFile(file) {
  if (!file) {
    return;
  }

  // Check if file is a PDF
  if (
    file.type !== 'application/pdf' &&
    !file.name.toLowerCase().endsWith('.pdf')
  ) {
    renderWord('Please drop a PDF file');
    setStatus('Invalid file type');
    setTimeout(() => {
      if (words.length === 0) {
        renderWord('Upload or drop a PDF to begin');
        setStatus('Idle');
      }
    }, 2000);
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
    if (progressSlider) {
      progressSlider.disabled = words.length === 0;
      progressSlider.max = words.length;
      progressSlider.value = 0;
    }
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
}

fileInput.addEventListener('change', async (event) => {
  const file = event.target.files[0];
  await handleFile(file);
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

// Progress slider functionality
let isDraggingSlider = false;
let wasPlayingBeforeDrag = false;

progressSlider.addEventListener('mousedown', () => {
  isDraggingSlider = true;
  wasPlayingBeforeDrag = isPlaying;
  if (isPlaying) {
    stopPlayback();
    setStatus('Seeking...');
  }
});

progressSlider.addEventListener('touchstart', () => {
  isDraggingSlider = true;
  wasPlayingBeforeDrag = isPlaying;
  if (isPlaying) {
    stopPlayback();
    setStatus('Seeking...');
  }
});

progressSlider.addEventListener('input', (event) => {
  const newIndex = Number(event.target.value);
  currentIndex = newIndex;

  // Render the word at the new position
  if (words.length > 0 && currentIndex < words.length) {
    renderWord(words[currentIndex]);
  } else if (currentIndex >= words.length && words.length > 0) {
    renderWord(words[words.length - 1]);
  }

  updateProgress();
});

progressSlider.addEventListener('mouseup', () => {
  isDraggingSlider = false;

  // Resume playback if it was playing before drag
  if (wasPlayingBeforeDrag && currentIndex < words.length) {
    startPlayback();
  } else if (currentIndex >= words.length) {
    setStatus('Done');
  } else if (!isPlaying) {
    setStatus('Paused');
  }
});

progressSlider.addEventListener('touchend', () => {
  isDraggingSlider = false;

  // Resume playback if it was playing before drag
  if (wasPlayingBeforeDrag && currentIndex < words.length) {
    startPlayback();
  } else if (currentIndex >= words.length) {
    setStatus('Done');
  } else if (!isPlaying) {
    setStatus('Paused');
  }
});

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
  if (progressSection) {
    progressSection.classList.remove('hidden');
  }

  if (mouseTimeout) {
    clearTimeout(mouseTimeout);
  }

  mouseTimeout = setTimeout(() => {
    isMouseActive = false;
    header.classList.add('hidden');
    controls.classList.add('hidden');
    if (progressSection) {
      progressSection.classList.add('hidden');
    }
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

if (progressSection) {
  progressSection.addEventListener('mouseenter', () => {
    resetMouseTimer();
  });
}

// Initialize mouse timer
resetMouseTimer();

// Drag and drop functionality
app.addEventListener('dragover', (event) => {
  event.preventDefault();
  event.stopPropagation();
  app.classList.add('drag-over');
});

app.addEventListener('dragleave', (event) => {
  event.preventDefault();
  event.stopPropagation();
  // Only remove drag-over if we're leaving the app element itself
  if (!app.contains(event.relatedTarget)) {
    app.classList.remove('drag-over');
  }
});

app.addEventListener('drop', async (event) => {
  event.preventDefault();
  event.stopPropagation();
  app.classList.remove('drag-over');

  const files = event.dataTransfer.files;
  if (files.length > 0) {
    await handleFile(files[0]);
  }
});

// Load preferences on startup
loadPreferences();

updateSpeedLabel();
updateProgress();
setStatus('Idle');

// Initialize slider as disabled
if (progressSlider) {
  progressSlider.disabled = true;
  progressSlider.max = 0;
  progressSlider.value = 0;
}
