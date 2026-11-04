const DEFAULT_REMOTE_BRIDGE_URL = 'https://echo-ben.tailfdbc33.ts.net';

export const getBridgeUrl = (): string => {
  if (
    typeof window !== 'undefined' &&
    window.location?.origin &&
    window.location.protocol.startsWith('http') &&
    window.location.hostname.endsWith('vercel.app')
  ) {
    return `${window.location.origin}/api/bridge`;
  }

  return DEFAULT_REMOTE_BRIDGE_URL;
};
