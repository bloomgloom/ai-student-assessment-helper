export type SettingsTab = 'ai' | 'data';

export interface SettingsState {
  provider: string;
  apiKey: string;
  apiKeys: Record<string, string>;
  model: string;
  baseUrl: string;
  maxConcurrency: number;
  loggingEnabled: boolean;
  storageRoot: string;
  storage?: {
    currentRoot: string;
    configuredRoot: string;
    defaultRoot: string;
    source: 'env' | 'config' | 'default';
    envLocked: boolean;
    configPath: string;
  };
}
