const DEFAULT_REMOTE_BRIDGE_URL = 'https://echo-ai.tailfdbc33.ts.net:8443';

export const getBridgeUrl = (): string => {
  // Vercel rewrites to Ben's Tailscale Funnel bridge can fail with
  // ROUTER_EXTERNAL_TARGET_HANDSHAKE_ERROR on the custom HTTPS port. Use the
  // public Funnel bridge directly instead of the Vercel proxy.
  return DEFAULT_REMOTE_BRIDGE_URL;
};

export const BRIDGE_SECRET = 'brightforge-echo-bridge-2026';
