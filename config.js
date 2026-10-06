// Game configuration.
window.GAME_CONFIG = {
  // Google Maps JavaScript API key (browser key). Restrict it to your site's HTTP referrers in Google Cloud Console.
  googleMapsApiKey: "AIzaSyAgRGyMBq5rNJHfEE2p3zsdkMcb46FAlww",
  // Base URL of the backend (server/server.js), e.g. "https://my-game.example.com". "" = same origin as the page when
  // served by the backend; use null to run fully offline with on-device accounts and a local leaderboard.
  apiUrl: "",
  // Public OAuth client IDs (must match the server's env vars). Leave empty to hide the provider's real sign-in.
  googleClientId: "",
  appleClientId: "",
  appleRedirectUri: "",
  amazonClientId: "",
};
