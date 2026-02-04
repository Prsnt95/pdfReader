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

// PDF Preview Modal Elements
const pdfPreviewModal = document.getElementById('pdfPreviewModal');
const closePreviewBtn = document.getElementById('closePreview');
const pageThumbnails = document.getElementById('pageThumbnails');
const pdfPageCanvas = document.getElementById('pdfPageCanvas');
const textOverlay = document.getElementById('textOverlay');
const prevPageBtn = document.getElementById('prevPage');
const nextPageBtn = document.getElementById('nextPage');
const pageInfoEl = document.getElementById('pageInfo');
const pageJumpInput = document.getElementById('pageJumpInput');
const startFromBeginningBtn = document.getElementById('startFromBeginning');
const selectionInfoEl = document.getElementById('selectionInfo');
const previewButton = document.getElementById('previewButton');

let words = [];
let currentIndex = 0;
let isPlaying = false;
let timerId = null;
let wpm = Number(speedInput.value);
let mouseTimeout = null;
let isMouseActive = true;
let multiWordMode = false;
let lastRenderedIndex = null;

// PDF Preview State
let loadedPdfDoc = null;
let previewCurrentPage = 1;
let selectedTextBlockIndex = null;
let pageTextContent = []; // Array of text content per page
let pageWordIndices = []; // Track word index at start of each page

function isPreviewOpen() {
  return pdfPreviewModal.classList.contains('active');
}

function updatePreviewToggleButton() {
  if (!previewButton) return;
  const isOpen = isPreviewOpen();
  previewButton.textContent = isOpen ? 'Hide Sidebar' : 'Preview & Select';
  previewButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
}

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
    if (words.length > 0) {
      setRenderedIndex(0);
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

function setRenderedIndex(index) {
  if (typeof index !== 'number' || Number.isNaN(index)) {
    return;
  }
  lastRenderedIndex = index;
  syncPreviewToWordIndex(index);
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

  const wordIndex = currentIndex;
  const wordToDisplay = words[wordIndex];
  renderWord(wordToDisplay);
  setRenderedIndex(wordIndex);
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
    const wordIndex = currentIndex;
    const wordToDisplay = words[wordIndex];
    renderWord(wordToDisplay);
    setRenderedIndex(wordIndex);
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
  if (words.length > 0) {
    setRenderedIndex(0);
  }
  setStatus('Ready');
}

async function extractWordsFromPdf(file) {
  setStatus('Loading PDF...');
  const data = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data });
  const pdf = await loadingTask.promise;

  loadedPdfDoc = pdf;

  let allWords = [];
  pageWordIndices = [];
  pageTextContent = []; // Store raw text items per page

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    pageWordIndices.push(allWords.length);

    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    pageTextContent[pageNum] = textContent.items;

    // Exact same splitting logic used in the preview layer
    textContent.items.forEach((item) => {
      const parts = item.str.split(/(\s+)/);
      parts.forEach((part) => {
        if (part.trim()) {
          allWords.push(part.trim());
        }
      });
    });
  }

  return allWords;
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
    if (words.length > 0) {
      setRenderedIndex(0);
    }
    setStatus(words.length ? 'Ready' : 'Empty');
    playButton.disabled = words.length === 0;
    resetButton.disabled = words.length === 0;
    if (previewButton) {
      previewButton.disabled = words.length === 0 || !loadedPdfDoc;
    }
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
    if (previewButton) {
      previewButton.disabled = true;
    }
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
    setRenderedIndex(currentIndex);
  } else if (currentIndex >= words.length && words.length > 0) {
    renderWord(words[words.length - 1]);
    setRenderedIndex(words.length - 1);
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

  // Reset color selections to theme defaults
  if (root.dataset.theme === 'light') {
    colorInput.value = '#111111';
    bgColorInput.value = '#ffffff';
  } else {
    colorInput.value = '#ffffff';
    bgColorInput.value = '#000000';
  }
  document.documentElement.style.setProperty('--word-color', colorInput.value);
  document.documentElement.style.setProperty('--bg', bgColorInput.value);
  savePreferences();
}

themeButton.addEventListener('click', toggleTheme);

// Auto-hide controls on mouse inactivity
let floatModeEnteredAt = 0;
const FLOAT_COOLDOWN_MS = 600;

function resetMouseTimer() {
  if (
    document.body.classList.contains('document-floating') &&
    Date.now() - floatModeEnteredAt < FLOAT_COOLDOWN_MS
  ) {
    return;
  }
  isMouseActive = true;
  header.classList.remove('hidden');
  controls.classList.remove('hidden');
  if (progressSection) {
    progressSection.classList.remove('hidden');
  }
  app.classList.remove('all-hidden');
  const wasFloating = document.body.classList.contains('document-floating');
  document.body.classList.remove('document-floating');
  if (wasFloating && isPreviewOpen()) {
    renderPreviewPage(previewCurrentPage, lastRenderedIndex);
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
    app.classList.add('all-hidden');
    if (isPreviewOpen()) {
      document.body.classList.add('document-floating');
      floatModeEnteredAt = Date.now();
      requestAnimationFrame(() => {
        renderPreviewPage(previewCurrentPage, lastRenderedIndex);
      });
    }
  }, 2000); // Hide after 2 seconds of inactivity
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

if (pdfPreviewModal) {
  pdfPreviewModal.addEventListener('mouseenter', resetMouseTimer);
  pdfPreviewModal.addEventListener('mousemove', resetMouseTimer);
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
updatePreviewToggleButton();

// ============================================
// PDF PREVIEW MODAL FUNCTIONALITY
// ============================================

// Open the PDF preview modal
function openPdfPreview() {
  if (!loadedPdfDoc) return;

  pdfPreviewModal.classList.add('active');
  document.body.classList.add('preview-open');
  document.body.classList.remove('document-floating');
  updatePreviewToggleButton();
  resetMouseTimer();

  const fallbackIndex =
    lastRenderedIndex !== null
      ? lastRenderedIndex
      : Math.min(currentIndex, Math.max(words.length - 1, 0));
  previewCurrentPage = words.length ? getPageForWordIndex(fallbackIndex) : 1;
  selectedTextBlockIndex = null;
  updateSelectionInfo();

  generateThumbnails();
  renderPreviewPage(previewCurrentPage, fallbackIndex);
}

// Close the PDF preview modal
function closePdfPreview() {
  pdfPreviewModal.classList.remove('active');
  document.body.classList.remove('preview-open');
  document.body.classList.remove('document-floating');
  updatePreviewToggleButton();
  textOverlay.innerHTML = '';
  resetMouseTimer();
}

// Generate page thumbnails
async function generateThumbnails() {
  pageThumbnails.innerHTML = '';

  for (let i = 1; i <= loadedPdfDoc.numPages; i++) {
    const page = await loadedPdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: 0.2 });

    const thumbDiv = document.createElement('div');
    thumbDiv.className =
      'page-thumbnail' + (i === previewCurrentPage ? ' active' : '');
    thumbDiv.dataset.page = i;

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    const ctx = canvas.getContext('2d');
    await page.render({
      canvasContext: ctx,
      viewport: viewport,
    }).promise;

    const pageNum = document.createElement('span');
    pageNum.className = 'page-thumbnail-number';
    pageNum.textContent = i;

    thumbDiv.appendChild(canvas);
    thumbDiv.appendChild(pageNum);

    thumbDiv.addEventListener('click', () => {
      previewCurrentPage = i;
      renderPreviewPage(i, lastRenderedIndex);
      updateThumbnailSelection();
    });

    pageThumbnails.appendChild(thumbDiv);
  }
}

// Update thumbnail selection highlighting
function updateThumbnailSelection() {
  const thumbs = pageThumbnails.querySelectorAll('.page-thumbnail');
  thumbs.forEach((thumb) => {
    thumb.classList.toggle(
      'active',
      parseInt(thumb.dataset.page) === previewCurrentPage
    );
  });
}

// Create clickable text overlay
function createTextOverlay(items, viewport, pageNum) {
  textOverlay.innerHTML = '';
  textOverlay.style.width = viewport.width + 'px';
  textOverlay.style.height = viewport.height + 'px';

  let globalWordCounter = pageWordIndices[pageNum - 1] || 0;

  items.forEach((item) => {
    if (!item.str.trim()) return;

    const tx = item.transform;
    const x = tx[4] * (viewport.scale / (tx[0] || 1)); // Handle potential scaling in transform
    const y =
      viewport.height - tx[5] * viewport.scale - item.height * viewport.scale;

    // Split item into words while keeping track of current global index
    const parts = item.str.split(/(\s+)/);
    let currentXOffset = 0;

    parts.forEach((part) => {
      if (part.trim()) {
        const wordDiv = document.createElement('div');
        wordDiv.className = 'text-word';
        wordDiv.textContent = part.trim();

        // Approximate word positioning within the item
        const wordWidth =
          item.width * viewport.scale * (part.length / item.str.length);
        const wordHeight = item.height * viewport.scale;

        wordDiv.style.left = tx[4] * viewport.scale + currentXOffset + 'px';
        wordDiv.style.top =
          viewport.height - tx[5] * viewport.scale - wordHeight + 'px';
        wordDiv.style.width = wordWidth + 'px';
        wordDiv.style.height = wordHeight + 'px';

        const wordIndex = globalWordCounter++;
        wordDiv.dataset.index = wordIndex;

        wordDiv.addEventListener('mouseover', () => {
          if (!wordDiv.classList.contains('selected')) {
            wordDiv.style.background = 'rgba(99, 102, 241, 0.2)';
          }
        });

        wordDiv.addEventListener('mouseout', () => {
          if (!wordDiv.classList.contains('selected')) {
            wordDiv.style.background = '';
          }
        });

        wordDiv.addEventListener('click', () => {
          handleWordClick(wordIndex, part.trim());
        });

        textOverlay.appendChild(wordDiv);
        currentXOffset += wordWidth;
      } else {
        // Space offset
        currentXOffset +=
          item.width * viewport.scale * (part.length / item.str.length);
      }
    });
  });
}

function handleWordClick(index, text) {
  const words = textOverlay.querySelectorAll('.text-word');
  words.forEach((w) => w.classList.remove('selected'));

  const selectedEl = textOverlay.querySelector(`[data-index="${index}"]`);
  if (selectedEl) selectedEl.classList.add('selected');

  selectedTextBlockIndex = index;
  updateSelectionInfo(text, index);
}

function getPageForWordIndex(wordIndex) {
  if (!pageWordIndices.length) return 1;
  for (let i = pageWordIndices.length - 1; i >= 0; i -= 1) {
    if (wordIndex >= pageWordIndices[i]) {
      return i + 1;
    }
  }
  return 1;
}

function isWordOnPage(wordIndex, pageNum) {
  const start = pageWordIndices[pageNum - 1] ?? 0;
  const end =
    pageNum < pageWordIndices.length ? pageWordIndices[pageNum] : words.length;
  return wordIndex >= start && wordIndex < end;
}

function ensureWordVisible(wordElement) {
  const container = document.getElementById('pdfPageCanvasContainer');
  if (!container || !wordElement) return;
  const containerRect = container.getBoundingClientRect();
  const wordRect = wordElement.getBoundingClientRect();
  const padding = 24;
  const isVisible =
    wordRect.top >= containerRect.top + padding &&
    wordRect.bottom <= containerRect.bottom - padding &&
    wordRect.left >= containerRect.left + padding &&
    wordRect.right <= containerRect.right - padding;

  if (!isVisible) {
    wordElement.scrollIntoView({
      block: 'center',
      inline: 'center',
      behavior: 'smooth',
    });
  }
}

function highlightWordInPreview(wordIndex, shouldScroll = false) {
  const previous = textOverlay.querySelector('.text-word.current');
  if (previous) previous.classList.remove('current');

  const current = textOverlay.querySelector(`[data-index="${wordIndex}"]`);
  if (!current) return;
  current.classList.add('current');

  if (shouldScroll) {
    ensureWordVisible(current);
  }
}

// Update a preview page with text overlay
async function renderPreviewPage(pageNum, highlightIndex = null) {
  if (!loadedPdfDoc) return;

  const page = await loadedPdfDoc.getPage(pageNum);

  const container = document.getElementById('pdfPageCanvasContainer');
  const containerWidth = Math.max(container.clientWidth, 1);
  const containerHeight = Math.max(container.clientHeight, 1);

  const baseViewport = page.getViewport({ scale: 1 });
  const scaleY = containerHeight / baseViewport.height;
  const scaleX = containerWidth / baseViewport.width;
  let scale = Math.min(scaleX, scaleY);
  if (!Number.isFinite(scale) || scale <= 0) {
    scale = 1;
  }
  if (document.body.classList.contains('document-floating')) {
    scale *= 0.85;
  }
  scale = Math.max(scale, 0.1);

  const viewport = page.getViewport({ scale });

  pdfPageCanvas.width = viewport.width;
  pdfPageCanvas.height = viewport.height;

  const ctx = pdfPageCanvas.getContext('2d');
  await page.render({
    canvasContext: ctx,
    viewport: viewport,
  }).promise;

  // Use stored items for consistent word mapping
  const items = pageTextContent[pageNum];
  createTextOverlay(items, viewport, pageNum);

  updatePageNavigation();

  if (highlightIndex !== null && isWordOnPage(highlightIndex, pageNum)) {
    highlightWordInPreview(highlightIndex, true);
  } else if (
    lastRenderedIndex !== null &&
    isWordOnPage(lastRenderedIndex, pageNum)
  ) {
    highlightWordInPreview(lastRenderedIndex, true);
  }
}

async function syncPreviewToWordIndex(wordIndex) {
  if (!isPreviewOpen() || !loadedPdfDoc) return;
  if (!pageWordIndices.length) return;
  if (wordIndex === null || wordIndex === undefined) return;
  if (wordIndex < 0 || wordIndex >= words.length) return;

  const targetPage = getPageForWordIndex(wordIndex);
  if (targetPage !== previewCurrentPage) {
    previewCurrentPage = targetPage;
    await renderPreviewPage(targetPage, wordIndex);
    updateThumbnailSelection();
    return;
  }

  if (isWordOnPage(wordIndex, previewCurrentPage)) {
    highlightWordInPreview(wordIndex);
  }
}

// Update selection info display
function updateSelectionInfo(text = null, wordIndex = null) {
  const selectionText = selectionInfoEl.querySelector('.selection-text');
  let startBtn = selectionInfoEl.querySelector('.start-reading-btn');

  if (!startBtn) {
    startBtn = document.createElement('button');
    startBtn.className = 'start-reading-btn';
    startBtn.textContent = 'Start Reading Here';
    startBtn.addEventListener('click', startReadingFromSelection);
    selectionInfoEl.appendChild(startBtn);
  }

  if (text && wordIndex !== null) {
    const preview = text.substring(0, 50) + (text.length > 50 ? '...' : '');
    selectionText.textContent = `"${preview}" (word ${wordIndex + 1})`;
    startBtn.classList.add('visible');
  } else {
    selectionText.textContent = 'Click on any text to select starting point';
    startBtn.classList.remove('visible');
  }
}

// Start reading from the selected text block
function startReadingFromSelection() {
  if (selectedTextBlockIndex !== null) {
    stopPlayback();
    currentIndex = selectedTextBlockIndex;
    updateProgress();

    if (progressSlider) {
      progressSlider.value = currentIndex;
    }

    // Show the current word
    if (words.length > 0 && currentIndex < words.length) {
      renderWord(words[currentIndex]);
      setRenderedIndex(currentIndex);
    }

    playButton.disabled = false;
    resetButton.disabled = false;
    setStatus('Playing');
    resetMouseTimer();
    startPlayback();
  }
}

// Update page navigation buttons
function updatePageNavigation() {
  pageInfoEl.textContent = `Page ${previewCurrentPage} of ${loadedPdfDoc.numPages}`;
  prevPageBtn.disabled = previewCurrentPage <= 1;
  nextPageBtn.disabled = previewCurrentPage >= loadedPdfDoc.numPages;
  if (pageJumpInput) {
    pageJumpInput.min = 1;
    pageJumpInput.max = loadedPdfDoc.numPages;
    pageJumpInput.value = previewCurrentPage;
    pageJumpInput.placeholder = `1–${loadedPdfDoc.numPages}`;
  }
}

// Jump to specific page
function jumpToPage() {
  if (!pageJumpInput || !loadedPdfDoc) return;
  const page = parseInt(pageJumpInput.value, 10);
  if (page >= 1 && page <= loadedPdfDoc.numPages) {
    previewCurrentPage = page;
    renderPreviewPage(previewCurrentPage, lastRenderedIndex);
    updateThumbnailSelection();
  } else {
    pageJumpInput.value = previewCurrentPage;
  }
}

// Navigate to previous page
function goToPrevPage() {
  if (previewCurrentPage > 1) {
    previewCurrentPage--;
    renderPreviewPage(previewCurrentPage, lastRenderedIndex);
    updateThumbnailSelection();
  }
}

// Navigate to next page
function goToNextPage() {
  if (previewCurrentPage < loadedPdfDoc.numPages) {
    previewCurrentPage++;
    renderPreviewPage(previewCurrentPage, lastRenderedIndex);
    updateThumbnailSelection();
  }
}

// Start reading from beginning
function startFromBeginning() {
  currentIndex = 0;
  updateProgress();

  if (progressSlider) {
    progressSlider.value = 0;
  }

  if (words.length > 0) {
    renderWord('Ready');
    setRenderedIndex(0);
  }

  setStatus('Ready');
}

// Event listeners for PDF preview
if (previewButton) {
  previewButton.addEventListener('click', () => {
    if (isPreviewOpen()) {
      closePdfPreview();
    } else {
      openPdfPreview();
    }
  });
}

if (closePreviewBtn) {
  closePreviewBtn.addEventListener('click', closePdfPreview);
}

if (prevPageBtn) {
  prevPageBtn.addEventListener('click', goToPrevPage);
}

if (nextPageBtn) {
  nextPageBtn.addEventListener('click', goToNextPage);
}

if (pageJumpInput) {
  pageJumpInput.addEventListener('change', jumpToPage);
  pageJumpInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      jumpToPage();
    }
  });
}

if (startFromBeginningBtn) {
  startFromBeginningBtn.addEventListener('click', startFromBeginning);
}

// Close modal on Escape key
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isPreviewOpen()) {
    closePdfPreview();
  }
});
