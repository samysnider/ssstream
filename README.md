# Stream

A minimal writing app — plain HTML, CSS and JS (`index.html`, `styles.css`, `script.js`), no build step.

Live: https://ssstream.vercel.app/

## Design

Stream shares its visual language with [Gmail Zen](https://github.com/samysnider/gmail-zen): a warm off-white page, near-black text, warm greys, Inter, and a single orange for what matters (the cursor and "Save"). Depth comes from soft shadows and blur instead of lines.

- **Writing:** every word but the one you're on goes soft. While you type, the controls fade back; moving the pointer brings them back.
- **Menu:** the top-left button opens a small floating pill (new note, notes) and morphs into a close icon.
- **Notes:** rise as a sheet from the bottom while the page behind blurs. Hover a note to copy it as Markdown or delete it.

Animations turn off when "Reduce motion" is enabled in your system settings.

## Run locally

Open `index.html` in a browser.
