# Stream

A minimal writing app — plain HTML, CSS and JS (`index.html`, `styles.css`, `script.js`), no build step.

Live: https://ssstream.vercel.app/

## Design

Stream shares its visual language with [Gmail Zen](https://github.com/samysnider/gmail-zen): a warm off-white page, near-black text, warm greys, and a single orange for what matters (the cursor and "Save"). Depth comes from soft shadows and blur instead of lines. You write in Space Mono, for a typewriter feel; the interface uses Bricolage Grotesque.

- **Writing:** every word but the one you're on goes soft. The "Blur" switch at the top right turns the effect off (Stream remembers your choice). On phones, Save stays just above the keyboard.
- **Menu:** the top-left button opens a small floating pill (new note, notes) and morphs into a close icon.
- **Notes:** rise as a sheet from the bottom while the page behind blurs. Hover a note to share it, copy it as Markdown or delete it. Share opens your device's share sheet (on iPhone: Messages, Mail, AirDrop…); it only appears where the browser supports it.

A thin 16px grid sits behind the page and the notes sheet, like a pixel editor's canvas. Save, Copy, Share and the Blur switch match the pixel icons: square keys with notched 2px corners and a solid lip that presses down, labeled in Space Mono. Icons are from [Termina](https://github.com/nickolas-nieves/Termina) (MIT), a pixel set drawn on a 13px grid, shown at 2× so they stay crisp.

Animations turn off when "Reduce motion" is enabled in your system settings.

## Run locally

Open `index.html` in a browser.
