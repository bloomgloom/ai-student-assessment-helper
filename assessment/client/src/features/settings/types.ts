export type SettingsTab = 'ai' | 'assignment' | 'data';

export interface AiTemperatures {
  domainManagement: number;
  recordsScoring: number;
  recordsComments: number;
}

export interface SettingsState {
  provider: string;
  apiKey: string;
  apiKeys: Record<string, string>;
  model: string;
  baseUrl: string;
  maxConcurrency: number;
  temperatureEnabled: boolean;
  temperatures: AiTemperatures;
  providerSettings: Record<string, {
    model: string;
    baseUrl: string;
    maxConcurrency: number;
    temperatureEnabled?: boolean;
    temperatures?: AiTemperatures;
  }>;
  loggingEnabled: boolean;
  artifactStripIntroBlocks: boolean;
  artifactStripIntroBlocksDeprecated: boolean;
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
