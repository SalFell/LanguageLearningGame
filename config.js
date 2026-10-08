// Game configuration.
window.GAME_CONFIG = {
  // Google Maps JavaScript API key (browser key). Restrict it to your site's HTTP referrers in Google Cloud Console.
  googleMapsApiKey: "AIzaSyDkw5JLfgkfuuz7VMochi3ja8n_q_NtBzo",
  // The same key is used for object identification (Street View Static, Cloud Vision and Cloud Translation APIs must be enabled).
  // Base URL of the backend (server/server.js), e.g. "https://my-game.example.com". "" = same origin as the page when
  // served by the backend; use null to run fully offline with on-device accounts and a local leaderboard.
  // Single-player mode by default. Set true to re-enable accounts, sign-in and the leaderboard (needs the backend).
  enableAccounts: false,
  apiUrl: "",
  // Public OAuth client IDs (must match the server's env vars). Leave empty to hide the provider's real sign-in.
  googleClientId: "",
  appleClientId: "",
  appleRedirectUri: "",
  amazonClientId: "",
};
