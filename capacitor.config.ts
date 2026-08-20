import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ludosom.game',
  appName: 'LudoSom',
  webDir: 'dist',
  server: {
    // Direct-distribution APKs load the same deployed frontend as browsers.
    // After users install this shell once, normal web/server deploys no longer
    // require another APK download. Native Android changes still do.
    url: process.env.CAPACITOR_SERVER_URL || 'https://ludosom.com',
    androidScheme: 'https',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    FirebaseAuthentication: {
      skipNativeAuth: true,
      providers: ['google.com'],
    },
  },
};

export default config;
