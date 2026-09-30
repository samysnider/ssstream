// --- Elements ---
const editor = document.getElementById('editor');
const blurOverlay = document.getElementById('blurOverlay');
const wordCountEl = document.getElementById('wordCount');
const saveBtn = document.getElementById('saveBtn');
const newBtn = document.getElementById('newBtn');
const notesBtn = document.getElementById('notesBtn');
const customCursor = document.getElementById('customCursor');
const editorWrapper = editor.parentElement;
const archivesList = document.getElementById('archivesList');

const writeScreen = document.getElementById('writeScreen');
const notesScreen = document.getElementById('notesScreen');
const viewScreen = document.getElementById('viewScreen');
const viewTitle = document.getElementById('viewTitle');
const viewEditor = document.getElementById('viewEditor');
const viewBlurOverlay = document.getElementById('viewBlurOverlay');
const viewCustomCursor = document.getElementById('viewCustomCursor');
const viewEditorWrapper = document.getElementById('viewEditorWrapper');
const viewWordCount = document.getElementById('viewWordCount');
const backBtn = document.getElementById('backBtn');
const notesBackBtn = document.getElementById('notesBackBtn');
const exportBtn = document.getElementById('exportBtn');
const notesCount = document.getElementById('notesCount');

let currentViewId = null;

// --- Screen switching ---
function showScreen(screen) {
  writeScreen.classList.remove('active');
  notesScreen.classList.remove('active');
  viewScreen.classList.remove('active');
  screen.classList.add('active');
}

// --- Shared editor helpers ---
function getPlainTextFrom(el) {
  return el.innerText || '';
}

function getCaretCharOffsetIn(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return 0;
  const range = sel.getRangeAt(0);
  const preRange = range.cloneRange();
  preRange.selectNodeContents(el);
  preRange.setEnd(range.startContainer, range.startOffset);
  return preRange.toString().length;
}

function updateBlurFor(editorEl, overlayEl, wordCountEl) {
  const text = getPlainTextFrom(editorEl);
  const caretPos = getCaretCharOffsetIn(editorEl);

  if (text.trim() === '') {
    editorEl.innerHTML = '';
    overlayEl.innerHTML = '';
    if (wordCountEl) wordCountEl.textContent = '0 words';
    return;
  }

  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  const count = words.length;
  if (wordCountEl) wordCountEl.textContent = count === 1 ? '1 word' : `${count} words`;

  let start = caretPos;
  let end = caretPos;
  while (start > 0 && text[start - 1] !== ' ' && text[start - 1] !== '\n') start--;
  while (end < text.length && text[end] !== ' ' && text[end] !== '\n') end++;

  const before = text.substring(0, start);
  const current = text.substring(start, end);
  const after = text.substring(end);

  let html = '';
  if (before) html += `<span class="blurred">${escapeHtml(before)}</span>`;
  if (current) html += `<span class="clear">${escapeHtml(current)}</span>`;
  if (after) html += `<span class="blurred">${escapeHtml(after)}</span>`;
  overlayEl.innerHTML = html;
}

function updateCursorFor(editorEl, wrapperEl, cursorEl) {
  const sel = window.getSelection();
  if (!sel.rangeCount) { cursorEl.style.opacity = '0'; return; }

  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);

  let rect = range.getClientRects()[0];

  if (!rect) {
    const temp = document.createElement('span');
    temp.textContent = '\u200b';
    range.insertNode(temp);
    rect = temp.getBoundingClientRect();
    const restoreRange = document.createRange();
    restoreRange.setStartAfter(temp);
    restoreRange.collapse(true);
    temp.parentNode.removeChild(temp);
    sel.removeAllRanges();
    sel.addRange(restoreRange);
  }

  if (!rect || (rect.width === 0 && rect.height === 0)) {
    const editorRect = editorEl.getBoundingClientRect();
    const wrapperRect = wrapperEl.getBoundingClientRect();
    cursorEl.style.left = (editorRect.left - wrapperRect.left) + 'px';
    cursorEl.style.top = (editorRect.top - wrapperRect.top) + 'px';
    cursorEl.style.opacity = '';
    return;
  }

  const wrapperRect = wrapperEl.getBoundingClientRect();
  cursorEl.style.left = (rect.left - wrapperRect.left) + 'px';
  cursorEl.style.top = (rect.top - wrapperRect.top + (rect.height - 40) / 2) + 'px';
  cursorEl.style.opacity = '';
  cursorEl.style.animation = 'none';
  cursorEl.offsetHeight;
  cursorEl.style.animation = '';
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// --- Wire up main editor ---
function updateMainBlur() { updateBlurFor(editor, blurOverlay, wordCountEl); }
function updateMainCursor() { updateCursorFor(editor, editorWrapper, customCursor); }

editor.addEventListener('input', () => { updateMainBlur(); updateMainCursor(); });
editor.addEventListener('keyup', () => { updateMainBlur(); updateMainCursor(); });
editor.addEventListener('click', () => { updateMainBlur(); updateMainCursor(); });
editor.addEventListener('focus', () => { updateMainBlur(); updateMainCursor(); });

function setupKeydown(editorEl, saveFn) {
  editorEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && ['b','i','u'].includes(e.key.toLowerCase())) {
      e.preventDefault();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveFn();
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      requestAnimationFrame(() => {
        if (editorEl === editor) { updateMainBlur(); updateMainCursor(); }
        else { updateViewBlur(); updateViewCursor(); }
      });
    }
  });

  editorEl.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    document.execCommand('insertText', false, text);
  });
}

setupKeydown(editor, saveNote);

document.addEventListener('click', (e) => {
  if (writeScreen.classList.contains('active') && !e.target.closest('.topbar-btn') && !e.target.closest('.bottom-toolbar')) {
    editor.focus();
  }
  if (viewScreen.classList.contains('active') && !e.target.closest('.topbar-btn')) {
    viewEditor.focus();
  }
});
editor.focus();
requestAnimationFrame(() => { updateMainCursor(); });

// --- Wire up view editor ---
function updateViewBlur() { updateBlurFor(viewEditor, viewBlurOverlay, viewWordCount); }
function updateViewCursor() { updateCursorFor(viewEditor, viewEditorWrapper, viewCustomCursor); }

viewEditor.addEventListener('input', () => { updateViewBlur(); updateViewCursor(); });
viewEditor.addEventListener('keyup', () => { updateViewBlur(); updateViewCursor(); });
viewEditor.addEventListener('click', () => { updateViewBlur(); updateViewCursor(); });
viewEditor.addEventListener('focus', () => { updateViewBlur(); updateViewCursor(); });

setupKeydown(viewEditor, saveViewNote);

// --- localStorage Notes ---
function getNotes() {
  try {
    return JSON.parse(localStorage.getItem('focus_notes') || '[]');
  } catch { return []; }
}

function setNotes(notes) {
  localStorage.setItem('focus_notes', JSON.stringify(notes));
  updateNotesCount();
}

function updateNotesCount() {
  const count = getNotes().length;
  notesCount.textContent = count > 0 ? count : '';
}

function formatDate(iso) {
  const d = new Date(iso);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${day} ${month} ${year}, ${h}:${m}`;
}

// --- Save note (main editor, creates new) ---
function saveNote() {
  const text = getPlainTextFrom(editor);
  if (!text.trim()) return;

  const now = new Date();
  const note = {
    id: Date.now().toString(),
    title: formatDate(now.toISOString()),
    text: text,
    created: now.toISOString()
  };

  const notes = getNotes();
  notes.unshift(note);
  setNotes(notes);

  editor.innerHTML = '';
  blurOverlay.innerHTML = '';
  wordCountEl.textContent = '0 words';

  saveBtn.textContent = 'Saved';
  saveBtn.classList.add('saved');
  setTimeout(() => {
    saveBtn.textContent = 'Save';
    saveBtn.classList.remove('saved');
  }, 1800);

  editor.focus();
  requestAnimationFrame(() => { updateMainCursor(); });
}

// --- Save view note (updates existing) ---
function saveViewNote() {
  if (!currentViewId) return;
  const text = getPlainTextFrom(viewEditor);
  const notes = getNotes();
  const idx = notes.findIndex(n => n.id === currentViewId);
  if (idx === -1) return;
  notes[idx].text = text;
  setNotes(notes);
}

// --- New note ---
function newNote() {
  editor.innerHTML = '';
  blurOverlay.innerHTML = '';
  wordCountEl.textContent = '0 words';
  editor.focus();
  updateMainCursor();
}

// --- Show notes list ---
notesBtn.addEventListener('click', () => {
  renderArchives();
  showScreen(notesScreen);
});

// --- Back from notes list to editor (preserves editor content) ---
notesBackBtn.addEventListener('click', () => {
  showScreen(writeScreen);
  editor.focus();
  updateMainBlur();
  updateMainCursor();
});

// --- Render archives ---
function renderArchives() {
  const notes = getNotes();

  if (notes.length === 0) {
    archivesList.innerHTML = '<div class="notes-empty">No saved notes yet</div>';
    return;
  }

  archivesList.innerHTML = notes.map(note => {
    const preview = note.text.trim().substring(0, 80).replace(/\n/g, ' ');
    return `
      <li class="archive-item" data-id="${note.id}">
        <div class="archive-item-left">
          <span class="archive-item-title">${escapeHtml(preview)}</span>
          <span class="archive-item-preview">${escapeHtml(note.title)}</span>
        </div>
        <div class="archive-item-actions">
          <button class="archive-action-btn export-note" data-id="${note.id}">Copy .md</button>
          <button class="archive-action-btn delete" data-id="${note.id}">Delete</button>
        </div>
      </li>
    `;
  }).join('');
}

// --- Archive interactions ---
archivesList.addEventListener('click', (e) => {
  const deleteBtn = e.target.closest('.archive-action-btn.delete');
  if (deleteBtn) {
    e.stopPropagation();
    const id = deleteBtn.dataset.id;
    const notes = getNotes().filter(n => n.id !== id);
    setNotes(notes);
    renderArchives();
    return;
  }

  const exportBtnEl = e.target.closest('.export-note');
  if (exportBtnEl) {
    e.stopPropagation();
    const id = exportBtnEl.dataset.id;
    const note = getNotes().find(n => n.id === id);
    if (note) exportNote(note, exportBtnEl);
    return;
  }

  const item = e.target.closest('.archive-item');
  if (item) {
    const id = item.dataset.id;
    const note = getNotes().find(n => n.id === id);
    if (note) openNote(note);
  }
});

// --- Open note for editing ---
function openNote(note) {
  currentViewId = note.id;
  viewTitle.textContent = note.title;
  viewEditor.textContent = note.text;
  showScreen(viewScreen);
  viewEditor.focus();
  // Place cursor at end
  const range = document.createRange();
  range.selectNodeContents(viewEditor);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  updateViewBlur();
  updateViewCursor();
}

// --- Back from view to notes list (auto-saves changes) ---
backBtn.addEventListener('click', () => {
  saveViewNote();
  currentViewId = null;
  renderArchives();
  showScreen(notesScreen);
});

// --- Export from view ---
exportBtn.addEventListener('click', () => {
  const note = getNotes().find(n => n.id === currentViewId);
  if (note) {
    // Save latest text before copying
    saveViewNote();
    const updated = getNotes().find(n => n.id === currentViewId);
    if (updated) exportNote(updated, exportBtn);
  }
});

// --- Copy note as Markdown to clipboard ---
function exportNote(note, triggerEl) {
  navigator.clipboard.writeText(note.text).then(() => {
    // Show feedback on the button that was clicked
    if (triggerEl) {
      const original = triggerEl.textContent;
      triggerEl.textContent = 'Copied!';
      triggerEl.classList.add('saved');
      setTimeout(() => {
        triggerEl.textContent = original;
        triggerEl.classList.remove('saved');
      }, 1800);
    }
  }).catch(() => {
    // Fallback: select text in a temporary textarea
    const ta = document.createElement('textarea');
    ta.value = note.text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    if (triggerEl) {
      const original = triggerEl.textContent;
      triggerEl.textContent = 'Copied!';
      triggerEl.classList.add('saved');
      setTimeout(() => {
        triggerEl.textContent = original;
        triggerEl.classList.remove('saved');
      }, 1800);
    }
  });
}

// --- Button handlers ---
saveBtn.addEventListener('click', saveNote);
newBtn.addEventListener('click', newNote);

// --- Init ---
updateNotesCount();

// --- Placeholder ---
const quotePlaceholder = document.getElementById('quotePlaceholder');
quotePlaceholder.textContent = 'Start writing...';

function checkPlaceholderVisibility() {
  const text = getPlainTextFrom(editor);
  if (text.trim() === '') {
    quotePlaceholder.classList.remove('hidden');
  } else {
    quotePlaceholder.classList.add('hidden');
  }
}

// Hook into editor events
const origUpdateMainBlur = updateMainBlur;
updateMainBlur = function() {
  origUpdateMainBlur();
  checkPlaceholderVisibility();
};

// Show on load if editor is empty
checkPlaceholderVisibility();

// --- Generate apple-touch-icon ---
(function() {
  const c = document.createElement('canvas');
  c.width = 180; c.height = 180;
  const ctx = c.getContext('2d');
  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 180, 180);
  // Draw S curve
  ctx.beginPath();
  ctx.moveTo(56, 68);
  ctx.bezierCurveTo(56, 50, 72, 42, 90, 42);
  ctx.bezierCurveTo(108, 42, 124, 50, 124, 68);
  ctx.bezierCurveTo(124, 86, 108, 88, 90, 92);
  ctx.bezierCurveTo(72, 96, 56, 98, 56, 116);
  ctx.bezierCurveTo(56, 134, 72, 140, 90, 140);
  ctx.bezierCurveTo(108, 140, 124, 132, 124, 116);
  ctx.strokeStyle = '#1d1d1f';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.stroke();
  document.getElementById('touchIcon').href = c.toDataURL('image/png');
})();
