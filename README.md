# Stream

A minimal writing app — plain HTML, CSS and JS (`index.html`, `styles.css`, `script.js`), no build step.

Live: https://ssstream.vercel.app/

## Design

Stream shares its visual language with [Gmail Zen](https://github.com/samysnider/gmail-zen): a warm off-white page, near-black text, warm greys, and a single orange for what matters (the cursor and "Save"). Everything is set in [iA Writer Quattro](https://github.com/iaolo/iA-Fonts) by iA (Information Architects), based on IBM Plex: even, typewriter-like widths that stay comfortable for long writing. It's bundled in `fonts/` under the SIL Open Font License (`fonts/LICENSE.md`).

- **Writing:** every word but the one you're on goes soft. The "Blur" switch at the top right turns the effect off (Stream remembers your choice). The word count sits at the bottom center, level with Save. On phones, both stay just above the keyboard.
- **Menu:** the top-left button opens a small pixel window (new note, notes) sideways along the top bar, so it never covers your text, and swaps to a close icon.
- **Notes:** rise as a sheet from the bottom while the page behind blurs. Hover a note to share it, copy it as Markdown or delete it. Share opens your device's share sheet (on iPhone: Messages, Mail, AirDrop…); it only appears where the browser supports it.

The interface is drawn on a 2px pixel, matching the icons: hard square shapes instead of rounded ones, and solid 2px outlines and lips instead of soft shadows. Save, Copy, Share and the sheet's close button are keys that press down, with bold labels. Icons are from [Termina](https://github.com/nickolas-nieves/Termina) (MIT), a pixel set drawn on a 13px grid, shown at 2× so they stay crisp.

Animations turn off when "Reduce motion" is enabled in your system settings.

## Run locally

Open `index.html` in a browser.
