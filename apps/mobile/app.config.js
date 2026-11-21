// Per-build values on top of app.json. The API host doubles as the passkey relying party,
// so the iOS app must claim it as an associated domain (webcredentials, I-03). Profile share
// links (I-02) open in the app from the site host (applinks, `/p/*`).
module.exports = ({ config }) => {
  const api = process.env.EXPO_PUBLIC_API_URL;
  const host = api ? new URL(api).host : null;
  const site = host ? host.replace(/^api\./, '') : null;
  return {
    ...config,
    ios: {
      ...config.ios,
      // CI sets IOS_BUILD_NUMBER (run number + offset); TestFlight needs it to grow.
      ...(process.env.IOS_BUILD_NUMBER ? { buildNumber: process.env.IOS_BUILD_NUMBER } : {}),
      associatedDomains: host ? [`webcredentials:${host}`, `applinks:${site}`] : [],
      // #119: the Live Activity extension (targets/safety-live) signs with the same team; CI has APPLE_TEAM_ID.
      ...(process.env.APPLE_TEAM_ID ? { appleTeamId: process.env.APPLE_TEAM_ID } : {}),
    },
  };
};
