export type SettingsTab = 'ai' | 'assignment' | 'data';

export interface SettingsState {
  provider: string;
  apiKey: string;
  apiKeys: Record<string, string>;
  model: string;
  baseUrl: string;
  maxConcurrency: number;
  providerSettings: Record<string, { model: string; baseUrl: string; maxConcurrency: number }>;
  loggingEnabled: boolean;
  artifactStripIntroBlocks: boolean;
  pdfRedactionTopCm: number;
  aiEnabled: boolean;
  assignmentTeacherPasswordSet?: boolean;
  storage?: {
    currentRoot: string;
    defaultRoot: string;
    source: 'env' | 'default';
    envLocked: boolean;
  };
}
