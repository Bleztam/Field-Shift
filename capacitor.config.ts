export interface CapacitorConfig {
  appId: string;
  appName: string;
  webDir: string;
  bundledWebRuntime?: boolean;
  server?: {
    url?: string;
    cleartext?: boolean;
    androidScheme?: string;
  };
  android?: {
    allowMixedContent?: boolean;
  };
  plugins?: Record<string, unknown>;
}

// Supports runtime backend routing for native Android APK builds
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

const config: CapacitorConfig = {
  appId: "gov.nasa.spaceapps.fieldshiftar",
  appName: "Field Shift AR",
  webDir: "out",
  server: {
    androidScheme: "https",
    ...(apiBaseUrl
      ? {
          url: apiBaseUrl,
          cleartext: apiBaseUrl.startsWith("http://"),
        }
      : {}),
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    TextToSpeech: {},
  },
};

export default config;
