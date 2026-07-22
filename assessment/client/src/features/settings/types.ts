export type SettingsTab = 'ai' | 'assignment' | 'data';

export interface AiTemperatures {
  domainManagement: number;
  recordsScoring: number;
  recordsComments: number;
}

export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export type AnthropicOutputTask = 'domainManagement' | 'recordsScoring' | 'recordsComments' | 'subjectComprehensive';
export type GeminiThinkingLevel = 'low' | 'medium' | 'high';
export type OpenAIReasoningEffort = 'low' | 'medium' | 'high';

export interface AnthropicOutputOption {
  effort: AnthropicEffort;
  thinkingEnabled: boolean;
  maxTokens: number | '';
  thinkingLevel: GeminiThinkingLevel;
  reasoningEffort: OpenAIReasoningEffort;
}

export type AnthropicOutputOptions = Record<AnthropicOutputTask, AnthropicOutputOption>;

export interface SettingsState {
  provider: string;
  apiKey: string;
  apiKeys: Record<string, string>;
  model: string;
  baseUrl: string;
  maxConcurrency: number;
  temperatureEnabled: boolean;
  temperatures: AiTemperatures;
  anthropicOptionsEnabled: boolean;
  outputOptionsEnabled: boolean;
  anthropicEffort: AnthropicEffort;
  anthropicThinkingEnabled: boolean;
  anthropicMaxTokens: number | '';
  anthropicOutputOptions: AnthropicOutputOptions;
  providerSettings: Record<string, {
    model: string;
    baseUrl: string;
    maxConcurrency: number;
    temperatureEnabled?: boolean;
    temperatures?: AiTemperatures;
    anthropicOptionsEnabled?: boolean;
    outputOptionsEnabled?: boolean;
    anthropicEffort?: AnthropicEffort;
    anthropicThinkingEnabled?: boolean;
    anthropicMaxTokens?: number | '';
    anthropicOutputOptions?: AnthropicOutputOptions;
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
