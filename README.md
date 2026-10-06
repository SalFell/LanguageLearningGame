# LanguageLearningGame

A browser game: explore a black-and-white street, click objects to learn their name in English, Spanish or Japanese, and the object turns to color once learned.

- **Play locally:** serve this folder (`python3 -m http.server`) and open `index.html`. No build step.
- **itch.io:** zip the folder contents (with `index.html` at the root) and upload as an HTML5 game. Works on mobile (on-screen WASD buttons).
- **Controls:** W/S move, A/D turn, TAB or the ⚙ icon opens the pause menu, click an object to learn it.
- **Learning:** each word needs 3 steps (recognize, spell, use in a sentence), then it is colored permanently and awards 100 points. The language dropdown on the learning screen switches languages.
- **Street View:** put a Google Maps API key in `config.js` (`googleMapsApiKey`). Without a key an offline pseudo-street scene is used.
- **Backend (`server/server.js`, Node 18+, no dependencies):** `node server/server.js` serves the game and an API for email/password accounts, Google/Apple/Amazon sign-in, progress + settings sync, and a global leaderboard (stored in `server/data.json`). Score is computed server-side from learned words.
  - Env vars: `JWT_SECRET` (required in production), `PORT`, `DATA_FILE`, `CORS_ORIGIN`, `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID`, `AMAZON_CLIENT_ID` (a provider is enabled only when its ID is set; tokens are verified server-side).
  - In `config.js` set the same public client IDs (`googleClientId`, `appleClientId`, `appleRedirectUri`, `amazonClientId`). For itch.io hosting, set `apiUrl` to the deployed backend URL and `CORS_ORIGIN` to your game's origin. Set `apiUrl: null` for a fully offline mode (on-device accounts and leaderboard).
  - Endpoints: `POST /api/register|login|oauth`, `GET|PUT|DELETE /api/me`, `DELETE /api/me/progress`, `GET /api/leaderboard`.
  - You must create the Google/Apple/Amazon developer apps and deploy the backend yourself.
- **Tests:** `node test/words.test.js && node test/server.test.js`
