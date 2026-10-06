# Vocab Venture

A browser game: explore Street View, box objects to learn their name in English, Spanish or Japanese, and earn points for each word learned.

- **Play locally:** serve this folder (`python3 -m http.server`) and open `index.html`. No build step.
- **itch.io:** zip the folder contents (with `index.html` at the root) and upload as an HTML5 game. Works on mobile.
- **Controls:** Navigate with the standard Google Street View controls (click the road arrows or the ground, arrow keys, on-screen pan/zoom controls); scroll out (or G, or the 🌍 button) for a global view where you click anywhere to drop into Street View, TAB or the ⚙ icon opens the pause menu, drag to look around, and **right-click and drag** a box around anything in Street View to identify it (touch/trackpad: toggle the 🔍 button, then drag).
- **Learning:** each word needs 3 steps (recognize, spell, use in a sentence), then it awards 100 points. The language dropdown on the learning screen switches languages.
- **Object identification:** the box you draw in Street View crops that part of the view (Street View Static API), identifies it with Cloud Vision, translates the name with Cloud Translation, and uses it as the learning word. Learned spots show as badges. Enable the **Maps JavaScript API, Street View Static API, Cloud Vision API and Cloud Translation API** for your key. Japanese words from translation have no romaji, so spelling asks you to type the shown word.
- **Street View:** put a Google Maps API key in `config.js` (`googleMapsApiKey`). Without a key an offline pseudo-street scene is used.
- **Backend (`server/server.js`, Node 18+, no dependencies):** `node server/server.js` serves the game and an API for email/password accounts, Google/Apple/Amazon sign-in, progress + settings sync, and a global leaderboard (stored in `server/data.json`). Score is computed server-side from learned words.
  - Env vars: `JWT_SECRET` (required in production), `PORT`, `DATA_FILE`, `CORS_ORIGIN`, `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID`, `AMAZON_CLIENT_ID` (a provider is enabled only when its ID is set; tokens are verified server-side).
  - In `config.js` set the same public client IDs (`googleClientId`, `appleClientId`, `appleRedirectUri`, `amazonClientId`). For itch.io hosting, set `apiUrl` to the deployed backend URL and `CORS_ORIGIN` to your game's origin. Set `apiUrl: null` for a fully offline mode (on-device accounts and leaderboard).
  - Endpoints: `POST /api/register|login|oauth`, `GET|PUT|DELETE /api/me`, `DELETE /api/me/progress`, `GET /api/leaderboard`.
  - You must create the Google/Apple/Amazon developer apps and deploy the backend yourself.
- **Tests:** `node test/words.test.js && node test/server.test.js`
