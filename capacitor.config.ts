import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.brightforge.portal',
  appName: 'Bright Forge Portal',
  webDir: 'dist',
  // Matches the portal's dark theme so app launch doesn't flash white.
  backgroundColor: '#0d0f1a',
  server: {
    // Load the live portal rather than the web assets bundled at build time.
    // Sideloaded APKs have no store-driven updates, so this is what keeps
    // phones current: install once, always see the latest deployed portal.
    url: 'https://echo-ai.tailfdbc33.ts.net',
    androidScheme: 'https'
  },
  ios: {
    contentInset: 'automatic'
  },
  android: {
    allowMixedContent: true
  }
};

export default config;
