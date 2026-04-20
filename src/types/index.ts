/**
 * Основные типы данных для i18n-ai
 */

export type Framework = 'flutter' | 'react' | 'vue' | 'android' | 'ios' | 'react-native';

export type AIProvider = 'openai' | 'anthropic' | 'openrouter';

export interface ContextRules {
  button?: string;
  error?: string;
  title?: string;
  [key: string]: string | undefined;
}

export interface I18nConfig {
  framework: Framework;
  sourceLang: string;
  targetLangs: string[];
  localesDir: string;
  provider: AIProvider;
  model: string;
  contextRules: ContextRules;
  ignore: string[];
  outputFilename: string;
  supportEmail?: string;
}

export interface TranslationString {
  key: string;
  value: string;
  context?: string;
  translatedValue?: string;
}

export interface ScanResult {
  filePath: string;
  strings: TranslationString[];
  framework: Framework;
}

export interface ScanSummary {
  filesFound: number;
  totalStrings: number;
  translated: number;
  needTranslation: number;
  results: ScanResult[];
  languageStats: Record<string, LanguageStat>;
}

export interface LanguageStat {
  translated: number;
  total: number;
  percentage: number;
}

export interface TranslationBatch {
  strings: TranslationString[];
  targetLang: string;
}

export interface TranslationResult {
  key: string;
  original: string;
  translated: string;
  targetLang: string;
}

export interface TranslationProvider {
  name: AIProvider;
  translate(batch: TranslationBatch, context?: string): Promise<TranslationResult[]>;
  checkAvailability?(): Promise<boolean>;
}

export type ExportFormat = 'json' | 'arb' | 'xml' | 'strings';

export interface ExportOptions {
  format: ExportFormat;
  outPath: string;
  data: Record<string, any>;
}
