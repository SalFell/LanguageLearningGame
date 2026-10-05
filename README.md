# LanguageLearningGame

A browser game: explore a black-and-white street, click objects to learn their name in English, Spanish or Japanese, and the object turns to color once learned.

- **Play locally:** serve this folder (`python3 -m http.server`) and open `index.html`. No build step.
- **itch.io:** zip the folder contents (with `index.html` at the root) and upload as an HTML5 game. Works on mobile (on-screen WASD buttons).
- **Controls:** W/S move, A/D turn, TAB or the ⚙ icon opens the pause menu, click an object to learn it.
- **Learning:** each word needs 3 steps (recognize, spell, use in a sentence), then it is colored permanently and awards 100 points. The language dropdown on the learning screen switches languages.
- **Street View:** put a Google Maps API key in `config.js` (`googleMapsApiKey`). Without a key an offline pseudo-street scene is used.
- **Accounts / leaderboard:** email+password accounts (salted SHA-256) and Google/Apple/Amazon "sign in" are stored in `localStorage` on the device. The provider buttons are a local demo; real OAuth and a truly global leaderboard need a backend. Set `leaderboardUrl` in `config.js` to a GET/POST endpoint.
- **Tests:** `node test/words.test.js`
