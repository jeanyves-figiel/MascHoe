// Per-build values on top of app.json. The API host doubles as the passkey relying party,
// so the iOS app must claim it as an associated domain (webcredentials, I-03).
module.exports = ({ config }) => {
  const api = process.env.EXPO_PUBLIC_API_URL;
  const host = api ? new URL(api).host : null;
  return {
    ...config,
    ios: {
      ...config.ios,
      associatedDomains: host ? [`webcredentials:${host}`] : [],
    },
  };
};
