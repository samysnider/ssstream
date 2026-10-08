# Stream

A minimal writing app — plain HTML, CSS and JS (`index.html`, `styles.css`, `script.js`), no build step.

Live: https://ssstream.vercel.app/

## Markdown

Write in Markdown and it's styled as you type: `# Title` to `###### Title` for headings, `**bold**`, `*italic*`, `***both***`, `~~strikethrough~~`, `` `code` ``, `> quotes`, `- lists` and `1. lists`, `[links](url)`, `---` and ```` ``` ```` code blocks. The Markdown markers stay visible in light grey, so the text is always plain Markdown: "Copy as .md" copies it as is, and the notes list shows it without the markers.

Undo and redo (Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z) are Stream's own: typing is undone a word at a time, and undoing a deletion also brings back the word's variations.

## Focus mode

Every word but the one you're on is blurred. The small "Focus" switch at the top right turns that off; Stream remembers your choice.

## Word variations

Hover a word to highlight it; click it to open a panel from the left with your own variations for that word. Type a variation and press Enter to add it, click one to put it in your text (punctuation and capitals are kept, and Cmd/Ctrl+Z undoes it), or × to remove it. Esc or a click outside closes the panel.

A word with variations shows one small dot under it per variation (up to five). Hover the dots (tap them on a phone) to preview the variations without opening the panel. Variations belong to that one word, where it is, in that note: delete the word (or change its letters) and its variations go with it, and retyping it starts fresh. Swapping it for one of its own variations keeps them, even when you undo the swap. They're saved with the note, in your browser.

To place the cursor inside a word without opening the panel, hold Option (Alt) while clicking, or use the arrow keys.

## Run locally

Open `index.html` in a browser.
