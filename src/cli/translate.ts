import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../core/config';
import { logger } from '../utils/logger';
import { createProgress } from '../utils/progress';
import { scanProject, createScanSummary } from '../core/scanner';
import { failoverManager } from '../core/translator/failover';
import { createBatches, sleep } from '../utils/batch';
import { TranslationResult, TranslationString } from '../types';
import chalk from 'chalk';

interface TranslateOptions {
  lang?: string;
  model?: string;
  dryRun?: boolean;
  force?: boolean;
}

export const translateCommand = new Command('translate')
  .description('Translate untranslated strings')
  .option('-l, --lang <langs>', 'translate only these languages (comma-separated)')
  .option('-m, --model <name>', 'select AI model')
  .option('--dry-run', 'show what will be translated, but don\'t translate')
  .option('--force', 'translate even already translated strings')
  .action(async (options: TranslateOptions) => {
    const progress = createProgress('Preparing translation...');
    
    try {
      const config = loadConfig();
      
      // === ПРОВЕРКА API КЛЮЧЕЙ (Проблема 7) ===
      progress.update('Checking API configuration...');
      const apiStatus = checkApiKeys(config.provider);
      
      if (!apiStatus.hasValidKey) {
        progress.fail('No API keys found');
        console.log('');
        logger.criticalError(
          'API Keys Not Configured',
          `Please set one of the following environment variables:\n` +
          `  - OPENROUTER_API_KEY\n` +
          `  - OPENAI_API_KEY\n` +
          `  - ANTHROPIC_API_KEY\n\n` +
          `Current provider: ${config.provider}`
        );
        process.exit(1);
      }
      
      // Определяем языки для перевода
      let targetLangs = config.targetLangs;
      if (options.lang) {
        targetLangs = options.lang.split(',').map(l => l.trim());
      }

      progress.update('Scanning for strings to translate...');

      // Сканируем проект (исходный код + файлы переводов)
      const scanResults = scanProject(
        process.cwd(),
        config.framework,
        config.ignore,
        {
          scanSource: true,
          sourceLang: config.sourceLang,
          targetLangs,
          localesDir: config.localesDir
        }
      );

      const summary = createScanSummary(scanResults, targetLangs, path.join(process.cwd(), config.localesDir));
      
      // Собираем все строки которые нужно перевести
      const stringsToTranslate = collectStringsToTranslate(
        scanResults,
        targetLangs,
        path.join(process.cwd(), config.localesDir),
        options.force || false
      );

      if (stringsToTranslate.length === 0) {
        progress.stop();
        logger.success('🎉 All strings are already translated!');
        displayCompletionStats(summary, targetLangs);
        return;
      }

      progress.update(`Found ${stringsToTranslate.length} strings to translate`);

      // Dry run режим
      if (options.dryRun) {
        progress.stop();
        displayDryRun(stringsToTranslate, targetLangs, config);
        return;
      }

      // Создаём батчи для перевода
      const batches = createBatches(stringsToTranslate, targetLangs, 20);
      
      progress.update(`Starting translation (${batches.length} batches)...`);
      console.log('');

      const allResults: TranslationResult[] = [];
      let completedBatches = 0;
      let failedBatches = 0;
      let totalTokens = 0;

      // Переводим каждый батч с failover логикой
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        completedBatches++;
        
        // Красивый прогресс
        const barWidth = 40;
        const barProgress = Math.round(((i + 1) / batches.length) * barWidth);
        const bar = chalk.green('█'.repeat(barProgress)) + chalk.gray('░'.repeat(barWidth - barProgress));
        process.stdout.write(`\r  [${bar}] ${Math.round(((i + 1) / batches.length) * 100)}% | Batch ${i + 1}/${batches.length}`);
        
        try {
          // === ИСПРАВЛЕНИЕ КОНТЕКСТА (Проблема 6) ===
          const contextRules = getContextRulesForBatch(batch, config.contextRules as Record<string, string>);
          
          const results = await failoverManager.translateWithFailover(batch, contextRules);
          allResults.push(...results);
          
          // Подсчёт токенов
          const estimatedTokens = batch.strings.reduce((sum, s) => sum + s.value.length / 4, 0);
          totalTokens += Math.round(estimatedTokens);
          
          // Пауза между запросами
          await sleep(100);
          
        } catch (error) {
          failedBatches++;
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          
          // Если ошибка критическая (все модели недоступны)
          if (errorMsg.includes('ТЕХНИЧЕСКИЕ ПРОБЛЕМЫ') || errorMsg.includes('All models')) {
            console.log('');
            progress.fail('Translation stopped due to technical issues');
            throw error;
          }
          
          logger.warn(`Batch ${i + 1} failed: ${errorMsg}`);
        }
      }
      
      console.log(''); // Новая строка после прогресс бара
      progress.stop();

      // Сохраняем результаты
      console.log('');
      logger.section('📊 Translation Results');
      logger.kv('Total strings', stringsToTranslate.length.toString());
      logger.kv('Successfully translated', allResults.length.toString());
      logger.kv('Failed', (stringsToTranslate.length - allResults.length).toString());
      logger.kv('Estimated tokens', totalTokens.toString());
      
      if (failedBatches > 0) {
        logger.warn(`Failed batches: ${failedBatches}`);
      }

      // Обновляем файлы переводов
      if (allResults.length > 0) {
        progress.update('Saving translations...');
        saveTranslations(allResults, config.localesDir, config.sourceLang, config.outputFilename);
        progress.succeed('Translation completed!');
        
        displayCompletionStats(summary, targetLangs);
      }

    } catch (error) {
      progress.fail('Translation failed');
      
      if (error instanceof Error) {
        if (error.message.includes('ТЕХНИЧЕСКИЕ ПРОБЛЕМЫ') || error.message.includes('All models')) {
          console.log('\n' + error.message);
        } else {
          logger.error(error.message);
        }
      } else {
        logger.error('Unknown error occurred');
      }
      
      process.exit(1);
    }
  });

/**
 * Проверяет наличие API ключей
 */
function checkApiKeys(provider: string): { hasValidKey: boolean; availableProviders: string[] } {
  const availableProviders: string[] = [];
  
  if (process.env.OPENROUTER_API_KEY) availableProviders.push('openrouter');
  if (process.env.OPENAI_API_KEY) availableProviders.push('openai');
  if (process.env.ANTHROPIC_API_KEY) availableProviders.push('anthropic');
  
  return {
    hasValidKey: availableProviders.length > 0,
    availableProviders
  };
}

/**
 * Собирает строки для перевода из результатов сканирования
 * === ИСПРАВЛЕНИЕ ПРОБЛЕМЫ 4 ===
 */
function collectStringsToTranslate(
  results: ScanResult[],
  targetLangs: string[],
  localesDir: string,
  force: boolean
): TranslationString[] {
  const stringsToTranslate: TranslationString[] = [];
  const existingTranslations = loadAllTranslations(localesDir, targetLangs);
  
  for (const result of results) {
    for (const str of result.strings) {
      // Проверяем есть ли уже перевод
      const hasTranslation = targetLangs.some(lang => {
        const translations = existingTranslations.get(lang);
        return translations?.has(str.key) && translations.get(str.key)?.trim() !== '';
      });
      
      // Если не force режим и есть перевод, пропускаем
      if (!force && hasTranslation) {
        continue;
      }
      
      // Пропускаем пустые строки
      if (!str.value || str.value.trim() === '') {
        continue;
      }

      stringsToTranslate.push(str);
    }
  }
  
  return stringsToTranslate;
}

/**
 * Загружает все существующие переводы
 */
function loadAllTranslations(
  localesDir: string,
  targetLangs: string[]
): Map<string, Map<string, string>> {
  const allTranslations = new Map<string, Map<string, string>>();
  
  if (!fs.existsSync(localesDir)) {
    return allTranslations;
  }
  
  for (const lang of targetLangs) {
    const translations = new Map<string, string>();
    const patterns = [
      path.join(localesDir, `${lang}.json`),
      path.join(localesDir, `app_${lang}.arb`),
    ];
    
    // Also search for *_lang.json files
    if (fs.existsSync(localesDir)) {
      try {
        const files = fs.readdirSync(localesDir);
        for (const f of files) {
          if (f.endsWith(`_${lang}.json`)) {
            patterns.push(path.join(localesDir, f));
          }
        }
      } catch { /* ignore */ }
    }
    
    let content: string | null = null;
    
    for (const filePath of patterns) {
      if (fs.existsSync(filePath)) {
        content = fs.readFileSync(filePath, 'utf-8');
        break;
      }
    }
    
    if (content) {
      try {
        const data = JSON.parse(content);
        extractTranslations(data, '', translations);
      } catch {
        // Игнорируем ошибки парсинга
      }
    }
    
    allTranslations.set(lang, translations);
  }
  
  return allTranslations;
}

/**
 * Извлекает переводы из объекта
 */
function extractTranslations(
  obj: Record<string, any>,
  prefix: string,
  translations: Map<string, string>
): void {
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('@') || key === '@@locale') {
      continue;
    }
    
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'string') {
      translations.set(fullKey, value);
    } else if (typeof value === 'object' && value !== null) {
      extractTranslations(value, fullKey, translations);
    }
  }
}

/**
 * === ИСПРАВЛЕНИЕ ПРОБЛЕМЫ 6: Контекст для батча ===
 */
function getContextRulesForBatch(
  batch: { strings: TranslationString[] },
  contextRules: Record<string, string>
): string | undefined {
  // Собираем контексты из строк в батче
  const contexts = new Set<string>();
  batch.strings.forEach(str => {
    if (str.context) {
      contexts.add(str.context);
    }
  });
  
  if (contexts.size === 0) {
    return undefined;
  }
  
  // Строим правила перевода
  const rules: string[] = [];
  for (const context of contexts) {
    const rule = contextRules[context];
    if (rule) {
      rules.push(`For ${context}: ${rule}`);
    }
  }
  
  return rules.length > 0 ? rules.join('\n') : undefined;
}

/**
 * === ИСПРАВЛЕНИЕ ПРОБЛЕМЫ 5: Проверка длины строк ===
 */
function checkStringLength(original: string, translated: string, maxLengthRatio: number = 2): {
  isValid: boolean;
  warning?: string;
} {
  const ratio = translated.length / original.length;
  
  if (ratio > maxLengthRatio) {
    return {
      isValid: false,
      warning: `Translation is ${ratio.toFixed(1)}x longer than original (${original.length} → ${translated.length} chars)`
    };
  }
  
  return { isValid: true };
}

/**
 * Отображает dry run информацию
 */
function displayDryRun(
  strings: TranslationString[],
  targetLangs: string[],
  config: any
): void {
  logger.section('📋 Dry Run - Translation Preview');
  logger.kv('Languages', targetLangs.join(', '));
  logger.kv('Model', config.model);
  logger.kv('Strings to translate', strings.length.toString());
  
  console.log('');
  logger.subtitle('First 10 strings:');
  
  strings.slice(0, 10).forEach((str, index) => {
    console.log(chalk.gray(`  ${index + 1}.`) + ` ${chalk.cyan(str.key)}: "${str.value}"`);
    if (str.context) {
      console.log(chalk.gray(`     Context: ${str.context}`));
    }
  });
  
  if (strings.length > 10) {
    console.log(chalk.gray(`  ... and ${strings.length - 10} more strings`));
  }
  
  console.log('');
  logger.info('Run without --dry-run to perform actual translation');
  console.log('');
  console.log(`  ${chalk.cyan('i18n-ai translate --lang ' + targetLangs.join(','))}`);
}

/**
 * Отображает статистику завершения
 */
function displayCompletionStats(summary: any, targetLangs: string[]): void {
  console.log('');
  logger.section('📈 Current Progress');
  
  for (const [lang, data] of Object.entries(summary.languageStats)) {
    const stats = data as any;
    const flag = getLanguageFlag(lang);
    console.log(`  ${flag} ${lang}: ${stats.percentage}% translated`);
  }
}

/**
 * Сохраняет переводы в файлы
 */
function saveTranslations(
  results: TranslationResult[],
  localesDir: string,
  sourceLang: string,
  outputFilename: string = 'translations'
): void {
  // Группируем результаты по языкам
  const byLanguage: Record<string, Record<string, string>> = {};
  
  for (const result of results) {
    if (!byLanguage[result.targetLang]) {
      byLanguage[result.targetLang] = {};
    }
    byLanguage[result.targetLang][result.key] = result.translated;
  }

  // Ensure localesDir exists
  const outputDir = path.join(process.cwd(), localesDir);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Сохраняем каждый язык в отдельный файл
  for (const [lang, translations] of Object.entries(byLanguage)) {
    if (lang === sourceLang) continue;
    
    const filePath = path.join(outputDir, `${outputFilename}_${lang}.json`);
    
    let existingContent: Record<string, any> = {};
    
    // Загружаем существующий файл если есть
    if (fs.existsSync(filePath)) {
      existingContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }

    // Обновляем переводы
    const updatedContent = updateNestedObject(existingContent, translations);
    
    // === ПРОВЕРКА ДЛИНЫ (Проблема 5) ===
    const warnings: string[] = [];
    for (const [key, value] of Object.entries(translations)) {
      const original = findOriginalString(updatedContent, key, sourceLang, localesDir);
      if (original) {
        const lengthCheck = checkStringLength(original, value);
        if (!lengthCheck.isValid) {
          warnings.push(`${key}: ${lengthCheck.warning}`);
        }
      }
    }
    
    if (warnings.length > 0) {
      logger.warn(`Long translations detected in ${lang}.json:`);
      warnings.slice(0, 5).forEach(w => console.log(chalk.gray(`    ${w}`)));
      if (warnings.length > 5) {
        console.log(chalk.gray(`    ... and ${warnings.length - 5} more`));
      }
    }
    
    // Сохраняем
    fs.writeFileSync(filePath, JSON.stringify(updatedContent, null, 2));
    logger.success(`Updated ${outputFilename}_${lang}.json`);
  }
}

/**
 * Находит оригинальную строку для проверки длины
 */
function findOriginalString(
  content: Record<string, any>,
  key: string,
  sourceLang: string,
  localesDir: string
): string | null {
  const baseDir = path.join(process.cwd(), localesDir);
  const candidates = [path.join(baseDir, `${sourceLang}.json`)];
  
  // Also search for *_sourceLang.json
  if (fs.existsSync(baseDir)) {
    try {
      const files = fs.readdirSync(baseDir);
      for (const f of files) {
        if (f.endsWith(`_${sourceLang}.json`)) {
          candidates.unshift(path.join(baseDir, f));
        }
      }
    } catch { /* ignore */ }
  }
  
  for (const sourceFile of candidates) {
    if (fs.existsSync(sourceFile)) {
      try {
        const sourceContent = JSON.parse(fs.readFileSync(sourceFile, 'utf-8'));
        const value = getNestedValue(sourceContent, key);
        if (value && typeof value === 'string') {
          return value;
        }
      } catch {
        // Игнорируем
      }
    }
  }
  
  return null;
}

/**
 * Обновляет вложенный объект переводами
 */
function updateNestedObject(
  obj: Record<string, any>,
  updates: Record<string, string>,
  prefix: string = ''
): Record<string, any> {
  const result = { ...obj };

  for (const [key, value] of Object.entries(updates)) {
    if (key.includes('.')) {
      const [first, ...rest] = key.split('.');
      const nestedKey = rest.join('.');
      
      if (!result[first]) {
        result[first] = {};
      }
      
      result[first] = updateNestedObject(result[first], { [nestedKey]: value });
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Получает значение по точечному пути
 */
function getNestedValue(obj: Record<string, any>, path: string): any {
  const keys = path.split('.');
  let current: any = obj;

  for (const key of keys) {
    if (current === undefined || current === null) {
      return undefined;
    }
    current = current[key];
  }

  return current;
}

/**
 * Возвращает emoji флага
 */
function getLanguageFlag(lang: string): string {
  const flags: Record<string, string> = {
    ru: '🇷🇺', de: '🇩🇪', zh: '🇨🇳', ja: '🇯🇵',
    fr: '🇫🇷', es: '🇪🇸', pt: '🇵🇹', it: '🇮🇹',
    en: '🇬🇧', ko: '🇰🇷', ar: '🇸🇦', hi: '🇮🇳'
  };
  return flags[lang] || '🌐';
}

// Импортируем типы
interface ScanResult {
  filePath: string;
  strings: TranslationString[];
  framework: any;
}
