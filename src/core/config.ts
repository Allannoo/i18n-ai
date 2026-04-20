import { cosmiconfig } from 'cosmiconfig';
import * as fs from 'fs';
import * as path from 'path';
import { I18nConfig, Framework, AIProvider } from '../types';

const CONFIG_FILENAMES = [
  'i18n.config.json',
  'i18n.config.js',
  '.i18nrc',
  '.i18nrc.json',
  '.i18nrc.js'
];

const DEFAULT_CONFIG: Partial<I18nConfig> = {
  sourceLang: 'en',
  targetLangs: ['ru', 'de'],
  provider: 'openrouter',
  model: 'openai/gpt-oss-120b:free',
  contextRules: {
    button: 'Translate as verb-command, short',
    error: 'Translate as problem description',
    title: 'Translate with capital letter'
  },
  ignore: ['node_modules', '.git', 'build', 'dist', '.i18n-ai'],
  outputFilename: 'translations',
  supportEmail: '92_92alan@mail.ru'
};

/**
 * Загружает конфигурацию используя cosmiconfig
 * Поддерживает: i18n.config.json, .i18nrc, package.json.i18n
 */
export async function loadConfigAsync(): Promise<I18nConfig> {
  try {
    const explorer = cosmiconfig('i18n', {
      searchPlaces: CONFIG_FILENAMES,
      packageProp: 'i18n'
    });

    const result = await explorer.search();

    if (!result || !result.config) {
      throw new Error(
        'Config file not found. Run "i18n-ai init" to create one.'
      );
    }

    return normalizeConfig(result.config);
  } catch (error) {
    if (error instanceof Error && error.message.includes('Config file not found')) {
      throw error;
    }
    throw new Error(`Failed to load config: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Синхронная версия загрузки конфига
 */
export function loadConfig(): I18nConfig {
  const configPath = findConfigFile();
  
  if (!configPath) {
    throw new Error(
      'Config file not found. Run "i18n-ai init" to create one.'
    );
  }

  const ext = path.extname(configPath);
  let userConfig: any;

  if (ext === '.json' || ext === '.config') {
    const content = fs.readFileSync(configPath, 'utf-8');
    userConfig = JSON.parse(content);
  } else if (ext === '.js') {
    userConfig = require(configPath);
  } else {
    // Пробуем как JSON
    const content = fs.readFileSync(configPath, 'utf-8');
    userConfig = JSON.parse(content);
  }

  return normalizeConfig(userConfig);
}

/**
 * Нормализует конфигурацию к стандартному виду
 */
function normalizeConfig(config: any): I18nConfig {
  return {
    framework: config.framework || 'react',
    sourceLang: config.sourceLang || DEFAULT_CONFIG.sourceLang,
    targetLangs: config.targetLangs || DEFAULT_CONFIG.targetLangs,
    localesDir: config.localesDir || './.i18n-ai',
    provider: config.provider || DEFAULT_CONFIG.provider,
    model: config.model || DEFAULT_CONFIG.model,
    contextRules: config.contextRules || DEFAULT_CONFIG.contextRules,
    ignore: config.ignore || DEFAULT_CONFIG.ignore,
    outputFilename: config.outputFilename || DEFAULT_CONFIG.outputFilename,
    supportEmail: config.supportEmail || DEFAULT_CONFIG.supportEmail
  } as I18nConfig;
}

/**
 * Сохраняет конфигурацию в файл
 */
export function saveConfig(config: I18nConfig, filePath?: string): void {
  const configPath = filePath || path.join(process.cwd(), 'i18n.config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

/**
 * Проверяет, существует ли конфиг в текущей директории
 */
export function hasConfig(): boolean {
  return findConfigFile() !== null;
}

/**
 * Ищет файл конфигурации
 */
function findConfigFile(): string | null {
  let currentDir = process.cwd();

  while (currentDir !== path.dirname(currentDir)) {
    for (const filename of CONFIG_FILENAMES) {
      const candidate = path.join(currentDir, filename);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    currentDir = path.dirname(currentDir);
  }

  return null;
}

/**
 * Валидирует конфигурацию
 */
export function validateConfig(config: I18nConfig): string[] {
  const errors: string[] = [];

  const validFrameworks: Framework[] = ['flutter', 'react', 'vue', 'android', 'ios', 'react-native'];
  if (!validFrameworks.includes(config.framework)) {
    errors.push(`Invalid framework: ${config.framework}. Must be one of: ${validFrameworks.join(', ')}`);
  }

  if (!config.sourceLang || config.sourceLang.length < 2) {
    errors.push('sourceLang must be at least 2 characters');
  }

  if (!config.targetLangs || config.targetLangs.length === 0) {
    errors.push('targetLangs must contain at least one language');
  }

  const validProviders: AIProvider[] = ['openai', 'anthropic', 'openrouter'];
  if (!validProviders.includes(config.provider)) {
    errors.push(`Invalid provider: ${config.provider}. Must be one of: ${validProviders.join(', ')}`);
  }

  return errors;
}
