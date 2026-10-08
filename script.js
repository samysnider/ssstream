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

// The editor's text and positions in it. Text nodes count their
// characters, and each line break (<br>, or a new block from some
// browsers) counts as one "\n", the same way everywhere below, so a
// character offset always points at the same spot on screen.
function walkText(root, visit) {
  const walk = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) visit('text', n);
      else if (n.nodeName === 'BR') { if (!n.hasAttribute('data-ph') && hasTextAfter(n, root)) visit('br', n); }
      else if (n.nodeType === Node.ELEMENT_NODE) {
        if (/^(DIV|P)$/.test(n.nodeName) && n.previousSibling) visit('block', n);
        walk(n);
      }
    }
  };
  walk(root);
}

// Whether any text follows a node inside root. A <br> with nothing after
// it is the browser's placeholder for an empty last line, not a line break.
function hasTextAfter(node, root) {
  for (let n = node; n && n !== root; n = n.parentNode) {
    for (let s = n.nextSibling; s; s = s.nextSibling) {
      if (s.textContent.length > 0) return true;
    }
  }
  return false;
}

function getEditorText(root) {
  let text = '';
  walkText(root, (kind, n) => { text += kind === 'text' ? n.data : '\n'; });
  return text;
}

// Character offset of a DOM position (node, offset) inside root
function offsetOf(root, node, offset) {
  const target = document.createRange();
  target.setStart(node, offset);
  target.collapse(true);
  let total = 0;
  let done = false;
  walkText(root, (kind, n) => {
    if (done) return;
    if (kind === 'text') {
      if (n === node) { total += offset; done = true; return; }
      if (target.comparePoint(n, n.length) <= 0) total += n.length;
      else done = true;
    } else {
      const parent = n.parentNode;
      const index = Array.prototype.indexOf.call(parent.childNodes, n);
      const after = kind === 'br' ? [parent, index + 1] : [n, 0];
      if (target.comparePoint(after[0], after[1]) <= 0) total += 1;
      else done = true;
    }
  });
  return total;
}

// DOM position (node, offset) of a character offset inside root
function positionAt(root, charOffset) {
  let remaining = charOffset;
  let found = null;
  walkText(root, (kind, n) => {
    if (found) return;
    if (kind === 'text') {
      if (remaining <= n.length) found = { node: n, offset: remaining };
      else remaining -= n.length;
    } else {
      const parent = n.parentNode;
      const index = Array.prototype.indexOf.call(parent.childNodes, n);
      if (remaining === 0) found = { node: parent, offset: index };
      else remaining -= 1;
    }
  });
  return found || { node: root, offset: root.childNodes.length };
}

function getCaretCharOffsetIn(el) {
  const sel = window.getSelection();
  if (!sel.rangeCount) return el._caret ?? -1;
  const range = sel.getRangeAt(0);
  if (!el.contains(range.startContainer)) return el._caret ?? -1;
  el._caret = offsetOf(el, range.startContainer, range.startOffset);
  return el._caret;
}

// Words: runs of non-space characters. The "core" is the word without
// the punctuation around it ("be." -> "be"), which is what variations
// are attached to and what gets replaced.
function tokenize(text) {
  const tokens = [];
  const re = /\S+|\s+/g;
  let m;
  while ((m = re.exec(text))) {
    const t = { text: m[0], start: m.index, end: m.index + m[0].length, word: false };
    if (!/\s/.test(m[0][0])) {
      const parts = m[0].match(/^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/su);
      if (parts && parts[2]) {
        t.word = true;
        t.lead = parts[1];
        t.core = parts[2];
        t.trail = parts[3];
      }
    }
    tokens.push(t);
  }
  return tokens;
}

// --- Markdown ---
// Notes are plain text that may contain Markdown. On screen it's shown
// exactly as typed; the Markdown is only used to lay out the PDF export
// (see "Export to PDF"). The editor and overlay are still split into
// lines and styled runs (classes with no on-screen styling), which keeps
// both layers' structure identical and lets the editor show a final
// empty line reliably.
const MD_BOLD = 1, MD_ITALIC = 2, MD_CODE = 4, MD_STRIKE = 8, MD_MARK = 16, MD_URL = 32, MD_LINK = 64;
const MD_CLASSES = [[MD_BOLD, 'md-b'], [MD_ITALIC, 'md-i'], [MD_CODE, 'md-code'], [MD_STRIKE, 'md-s'],
  [MD_MARK, 'md-mark'], [MD_URL, 'md-url'], [MD_LINK, 'md-link']];

// One entry per line: { start, text, cls, flags }, where cls styles the
// whole line (md-h1 ... md-h6, md-quote, md-li, md-hr, md-codeblock) and
// flags holds each character's inline styles
function parseMarkdown(text) {
  let offset = 0;
  let inFence = false;
  return text.split('\n').map(line => {
    const start = offset;
    offset += line.length + 1;
    const flags = new Uint8Array(line.length);
    const mark = (a, b) => { for (let i = a; i < b; i++) flags[i] |= MD_MARK; };
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      mark(0, line.length);
      return { start, text: line, cls: 'md-codeblock', flags };
    }
    if (inFence) return { start, text: line, cls: 'md-codeblock', flags };
    let cls = '';
    let body = 0;
    let m;
    if ((m = line.match(/^(#{1,6})(\s+|$)/))) {
      cls = 'md-h' + m[1].length;
      mark(0, m[0].length);
      body = m[0].length;
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      mark(0, line.length);
      return { start, text: line, cls: 'md-hr', flags };
    } else if ((m = line.match(/^\s*>\s?/))) {
      cls = 'md-quote';
      mark(0, m[0].length);
      body = m[0].length;
    } else if ((m = line.match(/^(\s*)([-*+]|\d+[.)])(\s+)/))) {
      cls = 'md-li';
      mark(m[1].length, m[0].length);
      body = m[0].length;
    }
    parseInline(line, body, flags);
    return { start, text: line, cls, flags };
  });
}

function parseInline(s, from, flags) {
  const set = (a, b, f) => { for (let i = a; i < b; i++) flags[i] |= f; };
  const taken = (a, b) => { for (let i = a; i < b; i++) if (flags[i] & (MD_CODE | MD_MARK | MD_URL)) return true; return false; };
  // fn returns false to turn a match down; the search then resumes one
  // character later, so a marker used elsewhere doesn't hide the next one
  const each = (re, fn) => {
    re.lastIndex = from;
    let m;
    while ((m = re.exec(s))) {
      if (fn(m, m.index, m.index + m[0].length) === false) re.lastIndex = m.index + 1;
    }
  };
  // `code`: nothing inside it is formatting
  each(/`([^`]+)`/g, (m, a, b) => { set(a, a + 1, MD_MARK); set(b - 1, b, MD_MARK); set(a + 1, b - 1, MD_CODE); });
  // [link](url)
  each(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, a, b) => {
    if (taken(a, b)) return false;
    const textEnd = a + 1 + m[1].length;
    set(a, a + 1, MD_MARK);
    set(a + 1, textEnd, MD_LINK);
    set(textEnd, textEnd + 2, MD_MARK);
    set(textEnd + 2, b - 1, MD_URL | MD_MARK);
    set(b - 1, b, MD_MARK);
  });
  const pair = (re, len, style, wordBound) => each(re, (m, a, b) => {
    if (taken(a, a + len) || taken(b - len, b)) return false;
    if (wordBound && ((a > 0 && /[\p{L}\p{N}]/u.test(s[a - 1])) || (b < s.length && /[\p{L}\p{N}]/u.test(s[b])))) return false;
    set(a, a + len, MD_MARK);
    set(b - len, b, MD_MARK);
    set(a + len, b - len, style);
  });
  pair(/\*\*\*(?=\S)(.+?)\*\*\*/g, 3, MD_BOLD | MD_ITALIC, false);
  pair(/\*\*(?=\S)(.+?)\*\*/g, 2, MD_BOLD, false);
  pair(/__(?=\S)(.+?)__/g, 2, MD_BOLD, true);
  pair(/~~(?=\S)(.+?)~~/g, 2, MD_STRIKE, false);
  pair(/\*(?=[^\s*])(.+?)\*/g, 1, MD_ITALIC, false);
  pair(/_(?=[^\s_])(.+?)_/g, 1, MD_ITALIC, true);
}

function escapeText(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// HTML for part of a line [a, b), as runs of characters sharing a style
function mdRuns(line, a, b) {
  let html = '';
  let i = a;
  while (i < b) {
    const f = line.flags[i];
    let j = i + 1;
    while (j < b && line.flags[j] === f) j++;
    const text = escapeText(line.text.slice(i, j));
    const cls = MD_CLASSES.filter(([bit]) => f & bit).map(([, c]) => c).join(' ');
    html += cls ? `<span class="${cls}">${text}</span>` : text;
    i = j;
  }
  return html;
}

// The editor's own markup: one span per line, separated by real "\n"
// characters (plus a placeholder <br> so a final empty line shows)
function editorMarkup(lines, text) {
  const html = lines.map(l => `<span class="md-line ${l.cls}">${mdRuns(l, 0, l.text.length)}</span>`).join('\n');
  return text.endsWith('\n') ? html + '<br data-ph="">' : html;
}

// Restyle the editor when its structure no longer matches the text (a
// heading started, a bold word closed...), keeping the selection. Never
// while an input method is composing a character.
const markupTemplate = document.createElement('template');
function syncEditorMarkup(editorEl, text, lines) {
  if (editorEl._composing) return;
  const html = editorMarkup(lines, text);
  markupTemplate.innerHTML = html;
  if (markupTemplate.innerHTML === editorEl.innerHTML) return;
  const sel = window.getSelection();
  const hasSel = sel.rangeCount > 0 && editorEl.contains(sel.anchorNode);
  const anchor = hasSel ? offsetOf(editorEl, sel.anchorNode, sel.anchorOffset) : -1;
  const focus = hasSel ? offsetOf(editorEl, sel.focusNode, sel.focusOffset) : -1;
  editorEl.innerHTML = html;
  if (hasSel) {
    const a = positionAt(editorEl, anchor);
    const f = positionAt(editorEl, focus);
    sel.setBaseAndExtent(a.node, a.offset, f.node, f.offset);
  }
}

// Markdown without its markers, for previews (the notes list)
function stripMarkdown(text) {
  return text
    .replace(/^\s*(```|~~~).*$/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^(\s*)([-*+]|\d+[.)])\s+/gm, '$1')
    .replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, '')
    .replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1')
    .replace(/(\*\*|__|~~|`)(?=\S)(.+?)\1/g, '$2')
    .replace(/(\*|_)(?=[^\s*_])(.+?)\1/g, '$2');
}

function updateBlurFor(editorEl, overlayEl, wordCountEl) {
  const text = getEditorText(editorEl);

  if (text.trim() === '') {
    editorEl.innerHTML = '';
    overlayEl.innerHTML = '';
    editorEl._tokens = [];
    editorEl._anchors = [];
    editorEl._text = '';
    if (wordCountEl) wordCountEl.textContent = '0 words';
    return;
  }

  const caretPos = getCaretCharOffsetIn(editorEl);
  const lines = parseMarkdown(text);
  syncEditorMarkup(editorEl, text, lines);

  // Words, line by line (offsets in the whole text)
  const tokens = [];
  const lineTokens = lines.map(l => tokenize(l.text).map(t => {
    const g = { ...t, start: t.start + l.start, end: t.end + l.start, rel: t.start };
    tokens.push(g);
    return g;
  }));
  editorEl._tokens = tokens;

  // Keep each word's variations attached to it through the edit, and let
  // go of any whose word was changed (e.g. a letter typed onto it). After
  // an undo, bring back the variations of words the undo restored.
  trackAnchors(editorEl, text, caretPos);
  if (editorEl._restoreAnchors) {
    const current = anchorsOf(editorEl);
    editorEl._restoreAnchors.forEach(r => {
      const overlaps = current.some(a => a.start < r.end && r.start < a.end);
      if (!overlaps && r.group.some(m => sameWord(m, text.slice(r.start, r.end)))) {
        current.push({ start: r.start, end: r.end, group: r.group.slice() });
      }
    });
    editorEl._restoreAnchors = null;
  }
  const wordAt = new Map(tokens.filter(t => t.word).map(t => [t.start + t.lead.length, t]));
  editorEl._anchors = anchorsOf(editorEl).filter(a => {
    const t = wordAt.get(a.start);
    return t && a.end === a.start + t.core.length;
  });

  const count = tokens.filter(t => t.word).length;
  if (wordCountEl) wordCountEl.textContent = count === 1 ? '1 word' : `${count} words`;

  // The word under the caret stays sharp, every other one goes soft. Each
  // word is its own span, so it can be highlighted on hover and carry
  // dots for its variations (the dots sit outside the blurred text, so
  // they stay sharp). Lines carry their Markdown styling, like the editor.
  let index = 0;
  const html = lines.map((l, li) => {
    let inner = '';
    lineTokens[li].forEach(t => {
      const i = index++;
      const a = t.rel;
      const b = t.rel + t.text.length;
      if (/\s/.test(t.text[0])) { inner += mdRuns(l, a, b); return; }
      const isCurrent = caretPos >= t.start && caretPos <= t.end;
      const n = t.word ? Math.min(variationsFor(editorEl, t.start + t.lead.length, t.core).length, 5) : 0;
      const cls = ['w', isCurrent ? 'clear' : 'blurred'];
      if (i === editorEl._hover) cls.push('hover');
      let word = `<span class="t">${mdRuns(l, a, b)}</span>`;
      if (n) {
        // Dots centered under the word itself, not its punctuation
        const coreA = a + t.lead.length;
        const coreB = coreA + t.core.length;
        const part = (x, y) => x < y ? `<span class="t">${mdRuns(l, x, y)}</span>` : '';
        word = `${part(a, coreA)}<span class="c"><span class="t">${mdRuns(l, coreA, coreB)}</span><span class="dots">${'<i></i>'.repeat(n)}</span></span>${part(coreB, b)}`;
      }
      inner += `<span class="${cls.join(' ')}" data-i="${i}">${word}</span>`;
    });
    return `<span class="md-line ${l.cls}">${inner}</span>`;
  }).join('\n');
  overlayEl.innerHTML = text.endsWith('\n') ? html + '<br>' : html;
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

  // 40px on body text, taller on headings (the caret's box grows with
  // the text size)
  const height = Math.max(40, Math.round(rect.height * 1.38));
  cursorEl.style.height = height + 'px';
  const wrapperRect = wrapperEl.getBoundingClientRect();
  cursorEl.style.left = (rect.left - wrapperRect.left) + 'px';
  cursorEl.style.top = (rect.top - wrapperRect.top + (rect.height - height) / 2) + 'px';
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

function escapeAttr(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// --- Word variations ---
// Variations belong to one word, at one place, in one note (not to a
// spelling). Each editor keeps a list of anchors { start, end, group }:
// [start, end) is the word in the text, and group holds the word and its
// variations, e.g. ["big", "large", "huge"]. When the text changes,
// anchors after the change shift along; an anchor whose word is deleted
// or retyped is dropped, and its variations with it. Swapping the word
// for one of its own variations (or undoing that swap) keeps it. The
// anchors are saved with the note.
function sameWord(a, b) {
  return a.toLocaleLowerCase() === b.toLocaleLowerCase();
}

function anchorsOf(editorEl) {
  if (!editorEl._anchors) editorEl._anchors = [];
  return editorEl._anchors;
}

// Load anchors (from a saved note), checking each still fits its text
function setAnchors(editorEl, anchors, text) {
  editorEl._text = text;
  editorEl._anchors = (Array.isArray(anchors) ? anchors : [])
    .filter(a => a && Number.isInteger(a.start) && Number.isInteger(a.end) && Array.isArray(a.group)
      && a.group.length > 1 && a.group.some(m => sameWord(m, text.slice(a.start, a.end))))
    .map(a => ({ start: a.start, end: a.end, group: a.group.slice() }));
}

function serializeAnchors(editorEl) {
  return anchorsOf(editorEl).map(a => ({ start: a.start, end: a.end, group: a.group.slice() }));
}

// Follow an edit: compare the text before and after to find the part
// that changed. The caret (where typing or deleting just happened) breaks
// ties when the same letters repeat, e.g. deleting the first of two
// identical words.
function trackAnchors(editorEl, text, caret) {
  const before = editorEl._text;
  editorEl._text = text;
  const anchors = editorEl._anchors;
  if (!anchors || !anchors.length || before === undefined || before === text) return;
  const max = Math.min(before.length, text.length);
  let p = 0;
  while (p < max && before[p] === text[p]) p++;
  if (caret >= 0) p = Math.min(p, caret);
  let sfx = 0;
  while (sfx < max - p && before[before.length - 1 - sfx] === text[text.length - 1 - sfx]) sfx++;
  const changedEnd = before.length - sfx; // end of the changed part, in the old text
  const delta = text.length - before.length;
  editorEl._anchors = anchors.filter(a => {
    if (a.end <= p) return true; // before the change
    if (a.start >= changedEnd) { // after it: shift along
      a.start += delta;
      a.end += delta;
      return true;
    }
    // The change is inside the word: keep it only if the word became one
    // of its own variations
    if (a.start <= p && changedEnd <= a.end) {
      const end = a.end + delta;
      if (a.group.some(m => sameWord(m, text.slice(a.start, end)))) {
        a.end = end;
        return true;
      }
    }
    return false;
  });
}

function anchorFor(editorEl, coreStart, core) {
  return anchorsOf(editorEl).find(a => a.start === coreStart && a.end === coreStart + core.length) || null;
}

function variationsFor(editorEl, coreStart, core) {
  const a = anchorFor(editorEl, coreStart, core);
  return a ? a.group.filter(m => !sameWord(m, core)) : [];
}

function addVariation(editorEl, coreStart, core, variation) {
  variation = variation.trim().replace(/\s+/g, ' ');
  if (!variation || sameWord(variation, core)) return;
  let a = anchorFor(editorEl, coreStart, core);
  if (!a) {
    a = { start: coreStart, end: coreStart + core.length, group: [core] };
    anchorsOf(editorEl).push(a);
  }
  if (!a.group.some(m => sameWord(m, variation))) a.group.push(variation);
}

function removeVariation(editorEl, coreStart, core, variation) {
  const a = anchorFor(editorEl, coreStart, core);
  if (!a) return;
  a.group = a.group.filter(m => !sameWord(m, variation) || sameWord(m, core));
  if (a.group.length < 2) editorEl._anchors = anchorsOf(editorEl).filter(x => x !== a);
}

// Variations used to be shared by spelling across all notes; that store
// is no longer used
try { localStorage.removeItem('stream_variations'); } catch {}

// Give a variation the case of the word it replaces: "Big" -> "Large",
// "BIG" -> "LARGE"
function matchCase(current, variation) {
  if (current.length > 1 && current === current.toLocaleUpperCase() && current !== current.toLocaleLowerCase()) {
    return variation.toLocaleUpperCase();
  }
  if (/^\p{Lu}/u.test(current) && /^\p{Ll}/u.test(variation)) {
    return variation[0].toLocaleUpperCase() + variation.slice(1);
  }
  return variation;
}

// The word under a point on screen, or null. The browser gives the
// nearest caret position even from far away, so the pointer must also be
// over the word's own box.
function wordAtPoint(editorEl, x, y) {
  let node, offset;
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    if (!p) return null;
    node = p.offsetNode; offset = p.offset;
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (!r) return null;
    node = r.startContainer; offset = r.startOffset;
  } else {
    return null;
  }
  if (!node || !editorEl.contains(node)) return null;
  const at = offsetOf(editorEl, node, offset);
  const tokens = editorEl._tokens || tokenize(getEditorText(editorEl));
  const index = tokens.findIndex(t => t.word && at >= t.start && at <= t.end);
  if (index === -1) return null;
  const token = tokens[index];
  const a = positionAt(editorEl, token.start);
  const b = positionAt(editorEl, token.end);
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  const onWord = [...range.getClientRects()].some(r =>
    x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 4 && y <= r.bottom + 4);
  return onWord ? { index, token } : null;
}

function hasSelectionIn(el) {
  const sel = window.getSelection();
  return sel.rangeCount > 0 && !sel.isCollapsed && el.contains(sel.anchorNode);
}

const varLayer = document.getElementById('varLayer');
const varBackdrop = document.getElementById('varBackdrop');
const varClose = document.getElementById('varClose');
const varWord = document.getElementById('varWord');
const varCount = document.getElementById('varCount');
const varList = document.getElementById('varList');
const varForm = document.getElementById('varForm');
const varInput = document.getElementById('varInput');
const varHint = document.getElementById('varHint');
const varPanel = document.getElementById('varPanel');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const canHover = window.matchMedia('(hover: hover)');

// The word the panel is about: which editor, where it is in the text.
// refresh(false) redraws the words (and their dots) without touching the
// caret, which would pull focus back into the text while the panel is open.
let varTarget = null;

// Hover highlights a word; a click opens its variations. Option/Alt-click
// places the caret as usual instead.
// --- Variations preview ---
// Hovering a word's dots (tapping them on a touch screen) shows its
// variations in a small card under the dots, without opening the panel.
const varPreview = document.getElementById('varPreview');
let previewDots = null;

// The dots under a point on screen (with a few pixels of slack, they're
// small), as { index, token, dots }, or null
function dotsAtPoint(editorEl, overlayEl, x, y) {
  for (const dots of overlayEl.querySelectorAll('.dots')) {
    const r = dots.getBoundingClientRect();
    if (x >= r.left - 6 && x <= r.right + 6 && y >= r.top - 5 && y <= r.bottom + 7) {
      const index = Number(dots.closest('.w').dataset.i);
      const token = editorEl._tokens && editorEl._tokens[index];
      if (token && token.word) return { index, token, dots, editorEl };
    }
  }
  return null;
}

function showPreview(hit) {
  if (previewDots === hit.dots && !varPreview.hidden) return;
  hidePreview();
  const t = hit.token;
  const list = variationsFor(hit.editorEl, t.start + t.lead.length, t.core).map(v => matchCase(t.core, v));
  if (!list.length) return;
  varPreview.innerHTML = `<span class="var-preview-label">Variations</span><ul>${list.map(v => `<li>${escapeHtml(v)}</li>`).join('')}</ul>`;
  varPreview.hidden = false;
  hit.dots.classList.add('active');
  previewDots = hit.dots;
  // Centered under the dots, kept inside the window; above them if there's
  // no room below
  const d = hit.dots.getBoundingClientRect();
  const card = varPreview.getBoundingClientRect();
  const left = Math.min(Math.max(12, d.left + d.width / 2 - card.width / 2), window.innerWidth - card.width - 12);
  const below = d.bottom + 8;
  const top = below + card.height > window.innerHeight - 12 ? d.top - 8 - card.height : below;
  varPreview.style.left = `${Math.round(left)}px`;
  varPreview.style.top = `${Math.round(top)}px`;
}

function hidePreview() {
  if (previewDots) previewDots.classList.remove('active');
  previewDots = null;
  varPreview.hidden = true;
}

// Touch and pen taps show the preview; a mouse click opens the panel
let lastPointerType = 'mouse';
document.addEventListener('pointerdown', (e) => {
  lastPointerType = e.pointerType || 'mouse';
  if (!varPreview.hidden) hidePreview();
}, true);
document.addEventListener('scroll', hidePreview, true);
window.addEventListener('resize', hidePreview);

function setupWordVariations(editorEl, overlayEl, refresh) {
  const setHover = (i) => {
    if (editorEl._hover === i) return;
    const previous = overlayEl.querySelector('.w.hover');
    if (previous) previous.classList.remove('hover');
    editorEl._hover = i;
    if (i != null) {
      const el = overlayEl.querySelector(`.w[data-i="${i}"]`);
      if (el) el.classList.add('hover');
    }
    editorEl.classList.toggle('over-word', i != null);
  };

  let frame = 0;
  editorEl.addEventListener('mousemove', (e) => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (e.altKey || !varLayer.hidden || hasSelectionIn(editorEl) || e.buttons) {
        setHover(null);
        hidePreview();
        editorEl.classList.remove('over-dots');
        return;
      }
      const dots = dotsAtPoint(editorEl, overlayEl, e.clientX, e.clientY);
      editorEl.classList.toggle('over-dots', !!dots);
      if (dots) {
        setHover(dots.index);
        showPreview(dots);
        return;
      }
      hidePreview();
      const hit = wordAtPoint(editorEl, e.clientX, e.clientY);
      setHover(hit ? hit.index : null);
    });
  });
  editorEl.addEventListener('mouseleave', () => {
    setHover(null);
    hidePreview();
    editorEl.classList.remove('over-dots');
  });
  editorEl.addEventListener('keydown', () => { setHover(null); hidePreview(); });

  editorEl.addEventListener('click', (e) => {
    if (e.altKey || hasSelectionIn(editorEl)) return;
    const dots = dotsAtPoint(editorEl, overlayEl, e.clientX, e.clientY);
    if (dots && lastPointerType !== 'mouse') {
      showPreview(dots);
      return;
    }
    const hit = dots || wordAtPoint(editorEl, e.clientX, e.clientY);
    if (!hit) return;
    setHover(null);
    openVariations(editorEl, refresh, hit.token);
  });
}

function renderVariations() {
  const { editorEl, start, lead, core } = varTarget;
  const list = variationsFor(editorEl, start + lead.length, core);
  varWord.textContent = core;
  varCount.textContent = list.length === 0 ? 'No variations yet'
    : list.length === 1 ? '1 variation' : `${list.length} variations`;
  varList.innerHTML = list.map(v => `
    <li class="var-item">
      <button class="var-use" type="button" data-v="${escapeAttr(v)}">${escapeHtml(matchCase(core, v))}</button>
      <button class="var-remove" type="button" data-v="${escapeAttr(v)}" aria-label="Remove ${escapeAttr(v)}" title="Remove">&times;</button>
    </li>`).join('');
  varHint.hidden = list.length === 0;
}

function openVariations(editorEl, refresh, token) {
  hidePreview();
  varTarget = { editorEl, refresh, start: token.start, lead: token.lead, core: token.core };
  renderVariations();
  varInput.value = '';
  varLayer.classList.remove('closing');
  varLayer.hidden = false;
  varLayer.classList.add('opening');
  // With a keyboard and mouse, the field is ready for typing. On a touch
  // screen, only bring up the keyboard when there's nothing to pick yet;
  // otherwise focus moves to the panel itself.
  const hasVariations = !!varList.querySelector('.var-use');
  const focusTarget = canHover.matches || !hasVariations ? varInput : varPanel;
  requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
}

function closeVariations({ restoreCaret = true } = {}) {
  if (varLayer.hidden || varLayer.classList.contains('closing')) return;
  const target = varTarget;
  varTarget = null;
  varLayer.classList.remove('opening');
  const finish = () => {
    varLayer.hidden = true;
    varLayer.classList.remove('closing');
  };
  if (reduceMotion.matches) finish();
  else {
    varLayer.classList.add('closing');
    setTimeout(finish, 320);
  }
  if (target && restoreCaret) {
    // Back to the text, with the caret after the word
    const end = positionAt(target.editorEl, target.start + target.lead.length + target.core.length);
    target.editorEl.focus({ preventScroll: true });
    const range = document.createRange();
    range.setStart(end.node, end.offset);
    range.collapse(true);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    target.refresh();
  }
}

// Replace the word in the text (keeping the punctuation around it). Done
// as a normal text edit, so Cmd/Ctrl+Z undoes it.
function useVariation(variation) {
  const t = varTarget;
  if (!t) return;
  const start = t.start + t.lead.length;
  const a = positionAt(t.editorEl, start);
  const b = positionAt(t.editorEl, start + t.core.length);
  t.editorEl.focus({ preventScroll: true });
  const range = document.createRange();
  range.setStart(a.node, a.offset);
  range.setEnd(b.node, b.offset);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand('insertText', false, matchCase(t.core, variation));
  closeVariations({ restoreCaret: false });
  requestAnimationFrame(() => t.refresh());
}

varList.addEventListener('click', (e) => {
  const remove = e.target.closest('.var-remove');
  if (remove) {
    const t = varTarget;
    removeVariation(t.editorEl, t.start + t.lead.length, t.core, remove.dataset.v);
    renderVariations();
    varTarget.refresh(false);
    varInput.focus({ preventScroll: true });
    return;
  }
  const use = e.target.closest('.var-use');
  if (use) useVariation(use.dataset.v);
});

varForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!varTarget) return;
  const t = varTarget;
  addVariation(t.editorEl, t.start + t.lead.length, t.core, varInput.value);
  varInput.value = '';
  renderVariations();
  varTarget.refresh(false);
});

varBackdrop.addEventListener('click', () => closeVariations());
varClose.addEventListener('click', () => closeVariations());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !varLayer.hidden) {
    e.preventDefault();
    closeVariations();
  }
});

// --- Wire up main editor ---
function updateMainBlur() { updateBlurFor(editor, blurOverlay, wordCountEl); }
function updateMainCursor() { updateCursorFor(editor, editorWrapper, customCursor); }

editor.addEventListener('input', () => { updateMainBlur(); updateMainCursor(); });
editor.addEventListener('keyup', () => { updateMainBlur(); updateMainCursor(); });
editor.addEventListener('click', () => { updateMainBlur(); updateMainCursor(); });
editor.addEventListener('focus', () => { updateMainBlur(); updateMainCursor(); });

// --- Undo / redo ---
// Restyling the editor as you type (Markdown) replaces its contents, which
// the browser's own undo can't follow, so Stream keeps its own history:
// snapshots of the text, the caret and the words' variations. Typing is
// grouped into one step per word.
function snapshotOf(editorEl) {
  return {
    text: editorEl._text ?? getEditorText(editorEl),
    caret: Math.max(0, editorEl._caret ?? 0),
    anchors: serializeAnchors(editorEl),
    time: Date.now(),
  };
}

function resetHistory(editorEl) {
  editorEl._history = { stack: [snapshotOf(editorEl)], index: 0 };
}

function recordHistory(editorEl, type, data) {
  const h = editorEl._history;
  if (!h || editorEl._composing) return;
  const snap = snapshotOf(editorEl);
  snap.type = type;
  const top = h.stack[h.index];
  if (top && top.text === snap.text) {
    top.caret = snap.caret;
    top.anchors = snap.anchors;
    return;
  }
  // Consecutive typing (within a word) or consecutive deleting is one step
  // (one character at a time, right where the last one went)
  const step = snap.caret - (top ? top.caret : 0);
  const typingWord = type === 'insertText' && data && data.length === 1 && !/\s/.test(data) && step === 1;
  const deleting = (type === 'deleteContentBackward' && step === -1) || (type === 'deleteContentForward' && step === 0);
  if ((typingWord || deleting) && top && top.type === type && h.index > 0
      && h.index === h.stack.length - 1 && snap.time - top.time < 1500) {
    h.stack[h.index] = snap; // still the same word: extend this step
    return;
  }
  h.stack.splice(h.index + 1);
  h.stack.push(snap);
  if (h.stack.length > 300) h.stack.shift();
  h.index = h.stack.length - 1;
}

function stepHistory(editorEl, dir, refresh) {
  const h = editorEl._history;
  if (!h) return;
  const i = h.index + dir;
  if (i < 0 || i >= h.stack.length) return;
  h.index = i;
  const snap = h.stack[i];
  editorEl.textContent = snap.text;
  editorEl._restoreAnchors = snap.anchors;
  editorEl.focus({ preventScroll: true });
  const p = positionAt(editorEl, Math.min(snap.caret, snap.text.length));
  window.getSelection().collapse(p.node, p.offset);
  refresh();
}

function setupHistory(editorEl, refresh) {
  resetHistory(editorEl);
  editorEl.addEventListener('input', (e) => recordHistory(editorEl, e.inputType, e.data));
  editorEl.addEventListener('beforeinput', (e) => {
    if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
      e.preventDefault();
      stepHistory(editorEl, e.inputType === 'historyUndo' ? -1 : 1, refresh);
    }
  });
  editorEl.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((e.metaKey || e.ctrlKey) && k === 'z') {
      e.preventDefault();
      stepHistory(editorEl, e.shiftKey ? 1 : -1, refresh);
    } else if (e.ctrlKey && !e.metaKey && k === 'y') {
      e.preventDefault();
      stepHistory(editorEl, 1, refresh);
    }
  });
  editorEl.addEventListener('compositionstart', () => { editorEl._composing = true; });
  editorEl.addEventListener('compositionend', () => {
    editorEl._composing = false;
    refresh();
    recordHistory(editorEl, 'insertCompositionText');
  });
}

function setupKeydown(editorEl, saveFn) {
  editorEl.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && ['b','i','u'].includes(e.key.toLowerCase())) {
      e.preventDefault();
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveFn();
    }
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.isComposing) {
      e.preventDefault();
      insertPlainText(editorEl, '\n', 'insertLineBreak');
    }
  });

  editorEl.addEventListener('paste', (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain').replace(/\r\n?/g, '\n');
    insertPlainText(editorEl, text, 'insertFromPaste');
  });
}

// Insert text at the selection by editing the text itself, then restyle.
// Browsers add stray, invisible line breaks when inserting newlines into
// styled text; doing it directly keeps the text exactly as typed. Undo is
// Stream's own (see above), so this stays undoable.
function insertPlainText(editorEl, str, inputType) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !editorEl.contains(sel.anchorNode)) return;
  const a = offsetOf(editorEl, sel.anchorNode, sel.anchorOffset);
  const f = offsetOf(editorEl, sel.focusNode, sel.focusOffset);
  const start = Math.min(a, f);
  const end = Math.max(a, f);
  const text = getEditorText(editorEl);
  editorEl.textContent = text.slice(0, start) + str + text.slice(end);
  const p = positionAt(editorEl, start + str.length);
  sel.collapse(p.node, p.offset);
  editorEl.dispatchEvent(new InputEvent('input', { inputType, data: str, bubbles: true }));
}

setupKeydown(editor, saveNote);
setupWordVariations(editor, blurOverlay, (withCursor = true) => { updateMainBlur(); if (withCursor) updateMainCursor(); });
setupHistory(editor, () => { updateMainBlur(); updateMainCursor(); });

document.addEventListener('click', (e) => {
  if (!varLayer.hidden) return;
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
setupWordVariations(viewEditor, viewBlurOverlay, (withCursor = true) => { updateViewBlur(); if (withCursor) updateViewCursor(); });
setupHistory(viewEditor, () => { updateViewBlur(); updateViewCursor(); });

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
  updateMainBlur(); // bring the word variations up to date with the text
  const text = getEditorText(editor);
  if (!text.trim()) return;

  const now = new Date();
  const note = {
    id: Date.now().toString(),
    title: formatDate(now.toISOString()),
    text: text,
    variations: serializeAnchors(editor),
    created: now.toISOString()
  };

  const notes = getNotes();
  notes.unshift(note);
  setNotes(notes);

  editor.innerHTML = '';
  blurOverlay.innerHTML = '';
  setAnchors(editor, [], '');
  resetHistory(editor);
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
  updateViewBlur(); // bring the word variations up to date with the text
  const text = getEditorText(viewEditor);
  const notes = getNotes();
  const idx = notes.findIndex(n => n.id === currentViewId);
  if (idx === -1) return;
  notes[idx].text = text;
  notes[idx].variations = serializeAnchors(viewEditor);
  setNotes(notes);
}

// --- New note ---
function newNote() {
  editor.innerHTML = '';
  blurOverlay.innerHTML = '';
  setAnchors(editor, [], '');
  resetHistory(editor);
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
    const preview = note.text.trim().replace(/\s*\n\s*/g, ' ').substring(0, 80);
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
  setAnchors(viewEditor, note.variations, getEditorText(viewEditor));
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
  resetHistory(viewEditor);
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

// --- Focus mode (blur on/off), remembered between visits ---
const focusSwitches = document.querySelectorAll('[data-focus-switch]');

function setFocusMode(on) {
  document.body.classList.toggle('no-focus', !on);
  focusSwitches.forEach(sw => sw.setAttribute('aria-checked', String(on)));
  try { localStorage.setItem('stream_focus', on ? 'on' : 'off'); } catch {}
}

focusSwitches.forEach(sw => sw.addEventListener('click', () => {
  setFocusMode(sw.getAttribute('aria-checked') !== 'true');
}));

let savedFocus = 'on';
try { savedFocus = localStorage.getItem('stream_focus') || 'on'; } catch {}
setFocusMode(savedFocus !== 'off');

// --- Export to PDF ---
// The note is laid out as a clean document (real headings, lists, quotes;
// no Markdown markers) and handed to the browser's print dialog, where
// "Save as PDF" makes the file. The PDF keeps selectable text.
function inlineHtml(line) {
  const f = line.flags;
  let html = '';
  let i = 0;
  while (i < line.text.length) {
    if (f[i] & MD_MARK) { i++; continue; }
    if (f[i] & MD_LINK) {
      let j = i;
      while (j < line.text.length && (f[j] & MD_LINK)) j++;
      let u = j;
      while (u < line.text.length && !(f[u] & MD_URL)) u++;
      let v = u;
      while (v < line.text.length && (f[v] & MD_URL)) v++;
      const href = line.text.slice(u, v);
      const safe = /^(https?:|mailto:)/i.test(href) ? href : '';
      const text = escapeText(line.text.slice(i, j));
      html += safe ? `<a href="${escapeAttr(safe)}">${text}</a>` : text;
      i = j;
      continue;
    }
    const style = f[i];
    let j = i + 1;
    while (j < line.text.length && f[j] === style && !(f[j] & MD_MARK)) j++;
    let piece = escapeText(line.text.slice(i, j));
    if (style & MD_CODE) piece = `<code>${piece}</code>`;
    if (style & MD_STRIKE) piece = `<s>${piece}</s>`;
    if (style & MD_ITALIC) piece = `<em>${piece}</em>`;
    if (style & MD_BOLD) piece = `<strong>${piece}</strong>`;
    html += piece;
    i = j;
  }
  return html;
}

function markdownToHtml(text) {
  const lines = parseMarkdown(text);
  let html = '';
  let paragraph = [];
  let list = null; // { tag, items }
  let quote = [];
  let code = null;
  const flush = () => {
    if (paragraph.length) html += `<p>${paragraph.join('<br>')}</p>`;
    if (list) html += `<${list.tag}>${list.items.map(x => `<li>${x}</li>`).join('')}</${list.tag}>`;
    if (quote.length) html += `<blockquote><p>${quote.join('<br>')}</p></blockquote>`;
    paragraph = []; list = null; quote = [];
  };
  lines.forEach(l => {
    if (l.cls === 'md-codeblock') {
      if (/^\s*(```|~~~)/.test(l.text)) {
        if (code) { html += `<pre><code>${escapeText(code.join('\n'))}</code></pre>`; code = null; }
        else { flush(); code = []; }
      } else if (code) code.push(l.text);
      return;
    }
    const heading = l.cls.match(/^md-h(\d)$/);
    if (heading) { flush(); html += `<h${heading[1]}>${inlineHtml(l)}</h${heading[1]}>`; return; }
    if (l.cls === 'md-hr') { flush(); html += '<hr>'; return; }
    if (l.cls === 'md-quote') {
      if (paragraph.length || list) flush();
      quote.push(inlineHtml(l));
      return;
    }
    if (l.cls === 'md-li') {
      const tag = /^\s*\d/.test(l.text) ? 'ol' : 'ul';
      if (paragraph.length || quote.length || (list && list.tag !== tag)) flush();
      if (!list) list = { tag, items: [] };
      list.items.push(inlineHtml(l));
      return;
    }
    if (!l.text.trim()) { flush(); return; }
    if (list || quote.length) flush();
    paragraph.push(inlineHtml(l));
  });
  if (code) html += `<pre><code>${escapeText(code.join('\n'))}</code></pre>`;
  flush();
  return html;
}

const printArea = document.getElementById('printArea');

function exportPdf(text) {
  if (!text.trim()) return;
  printArea.innerHTML = markdownToHtml(text);
  // The browser suggests the page title as the file name: use the note's
  // first line
  const firstLine = stripMarkdown(text).split('\n').map(s => s.trim()).find(Boolean) || 'Note';
  const previousTitle = document.title;
  document.title = firstLine.slice(0, 80);
  const restore = () => {
    document.title = previousTitle;
    printArea.innerHTML = '';
    window.removeEventListener('afterprint', restore);
  };
  window.addEventListener('afterprint', restore);
  window.print();
}

document.getElementById('pdfBtn').addEventListener('click', () => {
  updateMainBlur();
  exportPdf(getEditorText(editor));
});

document.getElementById('viewPdfBtn').addEventListener('click', () => {
  saveViewNote();
  exportPdf(getEditorText(viewEditor));
});

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
