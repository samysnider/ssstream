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

const menu = document.getElementById('menu');
const menuToggle = document.getElementById('menuToggle');
const menuItems = menu.querySelectorAll('.menu-item');

const writeScreen = document.getElementById('writeScreen');
const viewScreen = document.getElementById('viewScreen');
const viewTitle = document.getElementById('viewTitle');
const viewEditor = document.getElementById('viewEditor');
const viewBlurOverlay = document.getElementById('viewBlurOverlay');
const viewCustomCursor = document.getElementById('viewCustomCursor');
const viewEditorWrapper = document.getElementById('viewEditorWrapper');
const viewWordCount = document.getElementById('viewWordCount');
const viewSaveBtn = document.getElementById('viewSaveBtn');
const backBtn = document.getElementById('backBtn');
const exportBtn = document.getElementById('exportBtn');

const notesSheet = document.getElementById('notesSheet');
const sheetBackdrop = document.getElementById('sheetBackdrop');
const notesBackBtn = document.getElementById('notesBackBtn');
const notesCount = document.getElementById('notesCount');

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

let currentViewId = null;

// --- Screen switching ---
function showScreen(screen) {
  writeScreen.classList.remove('active');
  viewScreen.classList.remove('active');
  screen.classList.add('active');
}

// --- Quiet chrome: controls step back while typing, return on pointer move ---
let lastPointer = null;
function setTyping(on) { document.body.classList.toggle('is-typing', on); }
document.addEventListener('pointermove', (e) => {
  // Ignore the synthetic move some browsers fire after a keypress
  if (lastPointer && lastPointer.x === e.clientX && lastPointer.y === e.clientY) return;
  lastPointer = { x: e.clientX, y: e.clientY };
  setTyping(false);
});

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

function formatWordCount(count) {
  return count === 1 ? '1 word' : `${count} words`;
}

function updateBlurFor(editorEl, overlayEl, wordCountEl) {
  const text = getPlainTextFrom(editorEl);
  const caretPos = getCaretCharOffsetIn(editorEl);

  if (text.trim() === '') {
    editorEl.innerHTML = '';
    overlayEl.innerHTML = '';
    if (wordCountEl) wordCountEl.textContent = formatWordCount(0);
    return;
  }

  const words = text.trim().split(/\s+/).filter(w => w.length > 0);
  if (wordCountEl) wordCountEl.textContent = formatWordCount(words.length);

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
    temp.textContent = '​';
    range.insertNode(temp);
    rect = temp.getBoundingClientRect();
    const restoreRange = document.createRange();
    restoreRange.setStartAfter(temp);
    restoreRange.collapse(true);
    temp.parentNode.removeChild(temp);
    sel.removeAllRanges();
    sel.addRange(restoreRange);
  }

  const wrapperRect = wrapperEl.getBoundingClientRect();
  const cursorHeight = cursorEl.offsetHeight;

  if (!rect || (rect.width === 0 && rect.height === 0)) {
    const editorRect = editorEl.getBoundingClientRect();
    const lineHeight = parseFloat(getComputedStyle(editorEl).lineHeight) || cursorHeight;
    cursorEl.style.left = (editorRect.left - wrapperRect.left) + 'px';
    cursorEl.style.top = (editorRect.top - wrapperRect.top + (lineHeight - cursorHeight) / 2) + 'px';
    cursorEl.style.opacity = '';
    return;
  }

  cursorEl.style.left = (rect.left - wrapperRect.left) + 'px';
  cursorEl.style.top = (rect.top - wrapperRect.top + (rect.height - cursorHeight) / 2) + 'px';
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
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

// --- Wire up main editor ---
function updateMainBlur() {
  updateBlurFor(editor, blurOverlay, wordCountEl);
  checkPlaceholderVisibility();
}
function updateMainCursor() { updateCursorFor(editor, editorWrapper, customCursor); }

editor.addEventListener('input', () => { updateMainBlur(); updateMainCursor(); setTyping(true); });
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

// Clicking anywhere on the page (but not on a control) returns to the words
document.addEventListener('click', (e) => {
  if (!notesSheet.hidden) return;
  if (e.target.closest('button, .menu')) return;
  closeMenu();
  if (writeScreen.classList.contains('active')) editor.focus();
  if (viewScreen.classList.contains('active')) viewEditor.focus();
});

// --- Wire up view editor ---
function updateViewBlur() { updateBlurFor(viewEditor, viewBlurOverlay, viewWordCount); }
function updateViewCursor() { updateCursorFor(viewEditor, viewEditorWrapper, viewCustomCursor); }

viewEditor.addEventListener('input', () => { updateViewBlur(); updateViewCursor(); setTyping(true); });
viewEditor.addEventListener('keyup', () => { updateViewBlur(); updateViewCursor(); });
viewEditor.addEventListener('click', () => { updateViewBlur(); updateViewCursor(); });
viewEditor.addEventListener('focus', () => { updateViewBlur(); updateViewCursor(); });

setupKeydown(viewEditor, () => { saveViewNote(); flashLabel(viewSaveBtn, 'Saved'); });

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

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function formatDate(iso) {
  const d = new Date(iso);
  const h = d.getHours().toString().padStart(2, '0');
  const m = d.getMinutes().toString().padStart(2, '0');
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${h}:${m}`;
}

// Short date for the list, like a mail client: the time today, "Yesterday",
// the weekday this week, then the day and month
function formatShortDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate());
  const days = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (days <= 0) {
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  }
  if (days === 1) return 'Yesterday';
  if (days < 7) return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d.getDay()];
  if (d.getFullYear() === now.getFullYear()) return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function noteDate(note) {
  return note.created || new Date(Number(note.id)).toISOString();
}

// Swap a button's label for a moment ("Saved", "Copied")
function flashLabel(button, label) {
  clearTimeout(button._flashTimer);
  if (button._label === undefined) button._label = button.textContent;
  button.textContent = label;
  button._flashTimer = setTimeout(() => {
    button.textContent = button._label;
    button._label = undefined;
  }, 1800);
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
  wordCountEl.textContent = formatWordCount(0);
  checkPlaceholderVisibility();

  flashLabel(saveBtn, 'Saved');

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
  wordCountEl.textContent = formatWordCount(0);
  checkPlaceholderVisibility();
  editor.focus();
  updateMainCursor();
}

// --- Menu ---
function openMenu() {
  menu.classList.add('open');
  menuToggle.setAttribute('aria-expanded', 'true');
  menuToggle.setAttribute('aria-label', 'Close menu');
  menuItems.forEach(item => { item.tabIndex = 0; });
}

function closeMenu() {
  if (!menu.classList.contains('open')) return;
  menu.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open menu');
  menuItems.forEach(item => { item.tabIndex = -1; });
}

menuToggle.addEventListener('click', () => {
  if (menu.classList.contains('open')) closeMenu();
  else openMenu();
});

newBtn.addEventListener('click', () => { closeMenu(); newNote(); });
notesBtn.addEventListener('click', () => { closeMenu(); openNotes(); });

// --- Notes sheet ---
// Rises from the bottom while the page behind blurs; slides back down on close
function openNotes() {
  renderArchives();
  notesSheet.classList.remove('closing');
  notesSheet.hidden = false;
  notesSheet.classList.add('opening');
  notesSheet.querySelector('.sheet-scroll').scrollTop = 0;
  notesBackBtn.focus({ preventScroll: true });
}

function closeNotes(then) {
  if (notesSheet.hidden) { if (then) then(); return; }
  notesSheet.classList.remove('opening');
  const finish = () => {
    notesSheet.hidden = true;
    notesSheet.classList.remove('closing');
  };
  if (reduceMotion.matches) {
    finish();
  } else {
    notesSheet.classList.add('closing');
    setTimeout(finish, 450);
  }
  if (then) then();
}

function closeNotesToEditor() {
  closeNotes(() => {
    showScreen(writeScreen);
    editor.focus();
    updateMainBlur();
    updateMainCursor();
  });
}

notesBackBtn.addEventListener('click', closeNotesToEditor);
sheetBackdrop.addEventListener('click', closeNotesToEditor);

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!notesSheet.hidden) closeNotesToEditor();
  else if (menu.classList.contains('open')) { closeMenu(); menuToggle.focus(); }
});

// --- Render archives ---
const ICON_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/></svg>';
const ICON_DELETE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';
const ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

function renderArchives() {
  const notes = getNotes();
  updateNotesCount();

  if (notes.length === 0) {
    archivesList.innerHTML = '<li class="notes-empty">No notes yet. Write something, then Save.</li>';
    return;
  }

  archivesList.innerHTML = notes.map(note => {
    const lines = note.text.trim().split('\n').map(l => l.trim()).filter(Boolean);
    const title = (lines[0] || '').substring(0, 120);
    const snippet = lines.slice(1).join(' ').substring(0, 160);
    return `
      <li class="archive-item" data-id="${note.id}" tabindex="0">
        <span class="archive-item-text"><span class="archive-item-title">${escapeHtml(title)}</span>${snippet ? ` - ${escapeHtml(snippet)}` : ''}</span>
        <span class="archive-item-end">
          <span class="archive-item-date">${escapeHtml(formatShortDate(noteDate(note)))}</span>
          <span class="archive-item-actions">
            <button class="archive-action-btn export-note" data-id="${note.id}" aria-label="Copy as Markdown" title="Copy as Markdown">${ICON_COPY}</button>
            <button class="archive-action-btn delete" data-id="${note.id}" aria-label="Delete" title="Delete">${ICON_DELETE}</button>
          </span>
        </span>
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
    const note = getNotes().find(n => n.id === item.dataset.id);
    if (note) openNote(note);
  }
});

archivesList.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !e.target.classList.contains('archive-item')) return;
  const note = getNotes().find(n => n.id === e.target.dataset.id);
  if (note) openNote(note);
});

// --- Open note for editing ---
function openNote(note) {
  currentViewId = note.id;
  viewTitle.textContent = note.title || formatDate(noteDate(note));
  viewEditor.textContent = note.text;
  showScreen(viewScreen);
  closeNotes();
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

// --- Back from view to notes (auto-saves changes) ---
backBtn.addEventListener('click', () => {
  saveViewNote();
  currentViewId = null;
  showScreen(writeScreen);
  updateMainBlur();
  openNotes();
});

viewSaveBtn.addEventListener('click', () => {
  saveViewNote();
  flashLabel(viewSaveBtn, 'Saved');
  viewEditor.focus();
});

// --- Export from view ---
exportBtn.addEventListener('click', () => {
  saveViewNote();
  const note = getNotes().find(n => n.id === currentViewId);
  if (note) exportNote(note, exportBtn);
});

// --- Copy note as Markdown to clipboard ---
function showCopied(triggerEl) {
  if (!triggerEl) return;
  if (triggerEl.classList.contains('archive-action-btn')) {
    clearTimeout(triggerEl._flashTimer);
    triggerEl.innerHTML = ICON_CHECK;
    triggerEl.classList.add('done');
    triggerEl._flashTimer = setTimeout(() => {
      triggerEl.innerHTML = ICON_COPY;
      triggerEl.classList.remove('done');
    }, 1800);
  } else {
    flashLabel(triggerEl, 'Copied');
  }
}

function exportNote(note, triggerEl) {
  navigator.clipboard.writeText(note.text).then(() => {
    showCopied(triggerEl);
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
    showCopied(triggerEl);
  });
}

// --- Button handlers ---
saveBtn.addEventListener('click', saveNote);

// --- Placeholder ---
const quotePlaceholder = document.getElementById('quotePlaceholder');
quotePlaceholder.textContent = 'Start writing...';

function checkPlaceholderVisibility() {
  quotePlaceholder.classList.toggle('hidden', getPlainTextFrom(editor).trim() !== '');
}

// --- Init ---
updateNotesCount();
checkPlaceholderVisibility();
editor.focus();
requestAnimationFrame(() => { updateMainCursor(); });

// --- Generate apple-touch-icon ---
(function() {
  const c = document.createElement('canvas');
  c.width = 180; c.height = 180;
  const ctx = c.getContext('2d');
  // Warm off-white background
  ctx.fillStyle = '#fdfdfc';
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
  ctx.strokeStyle = '#21201c';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.stroke();
  // One touch of orange
  ctx.beginPath();
  ctx.arc(134, 140, 7, 0, Math.PI * 2);
  ctx.fillStyle = '#ff670d';
  ctx.fill();
  document.getElementById('touchIcon').href = c.toDataURL('image/png');
})();
