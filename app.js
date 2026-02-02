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

// Recent PDFs storage (last 2)
const RECENT_PDFS_KEY = 'recentPdfs';
const MAX_RECENT_PDFS = 2;

function saveRecentPDF(filename, wordsArray) {
  try {
    let recentPdfs = JSON.parse(localStorage.getItem(RECENT_PDFS_KEY) || '[]');

    // Remove if already exists
    recentPdfs = recentPdfs.filter((pdf) => pdf.filename !== filename);

    // Add new entry at the beginning
    recentPdfs.unshift({
      id: Date.now().toString(),
      filename: filename,
      timestamp: Date.now(),
      wordCount: wordsArray.length,
      words: wordsArray,
    });

    // Keep only the last 2
    if (recentPdfs.length > MAX_RECENT_PDFS) {
      recentPdfs = recentPdfs.slice(0, MAX_RECENT_PDFS);
    }

    localStorage.setItem(RECENT_PDFS_KEY, JSON.stringify(recentPdfs));
    updateRecentPdfsUI();
  } catch (error) {
    console.error('Error saving recent PDF:', error);
  }
}

function getRecentPdfs() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_PDFS_KEY) || '[]');
  } catch (error) {
    return [];
  }
}

function loadRecentPDF(id) {
  const recentPdfs = getRecentPdfs();
  const pdf = recentPdfs.find((p) => p.id === id);
  if (pdf && pdf.words && pdf.words.length > 0) {
    words = pdf.words;
    currentIndex = 0;
    updateProgress();
    if (multiWordMode) {
      const allWords = multiWordDisplay.querySelectorAll('.multi-word');
      allWords.forEach((word) => (word.textContent = ''));
      multiWordDisplay.querySelector('.multi-word-center').textContent =
        'Ready';
    } else {
      renderWord('Ready');
    }
    setStatus('Ready');
    playButton.disabled = false;
    resetButton.disabled = false;
    if (progressSlider) {
      progressSlider.disabled = false;
      progressSlider.max = words.length;
      progressSlider.value = 0;
    }
    return true;
  }
  return false;
}

function deleteRecentPDF(id) {
  try {
    let recentPdfs = getRecentPdfs();
    recentPdfs = recentPdfs.filter((pdf) => pdf.id !== id);
    localStorage.setItem(RECENT_PDFS_KEY, JSON.stringify(recentPdfs));
    updateRecentPdfsUI();
  } catch (error) {
    console.error('Error deleting recent PDF:', error);
  }
}

function updateRecentPdfsUI() {
  const container = document.getElementById('recentPdfsContainer');
  const list = document.getElementById('recentPdfsList');
  if (!container || !list) return;

  const pdfs = getRecentPdfs();

  if (pdfs.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  list.innerHTML = '';

  pdfs.forEach((pdf) => {
    const item = document.createElement('div');
    item.className = 'recent-pdf-item';

    const loadBtn = document.createElement('button');
    loadBtn.className = 'recent-pdf-load';
    loadBtn.type = 'button';
    loadBtn.innerHTML = `<span class="recent-pdf-name">${pdf.filename}</span><span class="recent-pdf-meta">${pdf.wordCount} words</span>`;
    loadBtn.addEventListener('click', () => {
      if (!loadRecentPDF(pdf.id)) {
        renderWord('Failed to load');
        setStatus('Error');
      }
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'recent-pdf-delete';
    deleteBtn.type = 'button';
    deleteBtn.innerHTML = '×';
    deleteBtn.title = 'Remove';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      deleteRecentPDF(pdf.id);
    });

    item.appendChild(loadBtn);
    item.appendChild(deleteBtn);
    list.appendChild(item);
  });
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

function getPunctuationDelay(word) {
  if (!word) return 1;

  const trimmedWord = word.trim();
  const lastChar = trimmedWord[trimmedWord.length - 1];

  // Sentence endings: period, exclamation, question mark
  if (lastChar === '.' || lastChar === '!' || lastChar === '?') {
    return 2.0; // 2x longer pause after sentences
  }

  // Clause separators: comma, semicolon, colon
  if (lastChar === ',' || lastChar === ';' || lastChar === ':') {
    return 1.5; // 1.5x longer pause after clauses
  }

  // Normal word
  return 1.0;
}

function scheduleNext(wordToDisplay) {
  if (!isPlaying) {
    return;
  }

  // Check the word we're about to display for punctuation
  const punctuationMultiplier = getPunctuationDelay(wordToDisplay);

  const baseDelay = Math.max(1, Math.round(60000 / wpm));
  const delay = Math.max(1, Math.round(baseDelay * punctuationMultiplier));

  timerId = setTimeout(() => {
    showNextWord();
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

  const wordToDisplay = words[currentIndex];
  renderWord(wordToDisplay);
  currentIndex += 1;
  updateProgress();

  // Schedule next word, checking the word we just displayed for punctuation
  if (isPlaying) {
    scheduleNext(wordToDisplay);
  }
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

  // Start by displaying the first word immediately, then schedule next
  if (currentIndex < words.length) {
    const wordToDisplay = words[currentIndex];
    renderWord(wordToDisplay);
    currentIndex += 1;
    updateProgress();
    scheduleNext(wordToDisplay);
  }
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

    // Save to recent PDFs
    if (words.length > 0) {
      saveRecentPDF(file.name, words);
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

// Keyboard shortcuts
document.addEventListener('keydown', (event) => {
  // Prevent spacebar from scrolling when not in an input field
  if (event.code === 'Space' || event.key === ' ') {
    const target = event.target;
    const isInputField =
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.isContentEditable;

    if (!isInputField) {
      event.preventDefault();
      togglePlayback();
    }
  }
});

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
  app.classList.remove('all-hidden');

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
    app.classList.add('all-hidden');
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

// Initialize recent PDFs UI
updateRecentPdfsUI();
