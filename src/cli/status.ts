import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../core/config';
import { logger } from '../utils/logger';
import { createProgress } from '../utils/progress';
import chalk from 'chalk';

export const statusCommand = new Command('status')
  .description('Show translation progress for each language')
  .action(async () => {
    const progress = createProgress('Analyzing translations...');
    
    try {
      const config = loadConfig();
      const localesDir = path.join(process.cwd(), config.localesDir);

      if (!fs.existsSync(localesDir)) {
        progress.fail(`Locales directory not found: ${localesDir}`);
        logger.error('Run "i18n-ai init" to configure the locales directory');
        process.exit(1);
      }

      // Получаем файл исходного языка
      const outputFilename = (config as any).outputFilename || 'translations';
      let sourceKeys: string[] = [];

      // Ищем source файл: сначала новый формат, потом старый
      const sourceFileCandidates = [
        path.join(localesDir, `${outputFilename}_${config.sourceLang}.json`),
        path.join(localesDir, `${config.sourceLang}.json`),
      ];
      
      for (const candidate of sourceFileCandidates) {
        if (fs.existsSync(candidate)) {
          const sourceContent = JSON.parse(fs.readFileSync(candidate, 'utf-8'));
          sourceKeys = getAllKeys(sourceContent);
          break;
        }
      }

      if (sourceKeys.length === 0) {
        progress.warn('Source language file not found');
      }

      progress.stop();

      console.log('');
      logger.section('📊 Translation Status');
      
      console.log(chalk.gray('  ┌' + '─'.repeat(55) + '┐'));
      console.log(chalk.gray('  │') + chalk.white('  Source Language:').padEnd(28) + chalk.cyan(config.sourceLang.padStart(26)) + chalk.gray(' │'));
      console.log(chalk.gray('  │') + chalk.white('  Total Keys:').padEnd(28) + chalk.cyan(String(sourceKeys.length).padStart(26)) + chalk.gray(' │'));
      console.log(chalk.gray('  └' + '─'.repeat(55) + '┘'));
      
      console.log('');

      // Проверяем каждый язык
      const stats: LanguageStat[] = [];

      for (const lang of config.targetLangs) {
        // Ищем файл перевода: новый формат, потом старый
        const langFileCandidates = [
          path.join(localesDir, `${outputFilename}_${lang}.json`),
          path.join(localesDir, `${lang}.json`),
        ];
        let translatedCount = 0;

        for (const langFile of langFileCandidates) {
          if (fs.existsSync(langFile)) {
            const content = JSON.parse(fs.readFileSync(langFile, 'utf-8'));
            
            for (const key of sourceKeys) {
              const value = getNestedValue(content, key);
              if (value && String(value).trim() !== '') {
                translatedCount++;
              }
            }
            break;
          }
        }

        const percentage = sourceKeys.length > 0
          ? Math.round((translatedCount / sourceKeys.length) * 100)
          : 0;

        stats.push({ lang, translated: translatedCount, total: sourceKeys.length, percentage });
      }

      // Сортируем по проценту (наивысший первый)
      stats.sort((a, b) => b.percentage - a.percentage);

      // Отображаем как таблицу с красивыми барами
      console.log('  ' + chalk.bold('Language Progress:'));
      console.log('');
      
      const maxLangWidth = Math.max(...stats.map(s => s.lang.length));

      for (const stat of stats) {
        const langPadded = stat.lang.padEnd(maxLangWidth);
        const bar = createProgressBar(stat.percentage, 25);
        const status = getLanguageStatus(stat.percentage);
        const translated = String(stat.translated).padStart(4);
        const total = String(stat.total).padStart(4);
        
        console.log(
          `    ${getLanguageFlag(stat.lang)} ${langPadded}  ${bar}  ${chalk.bold(stat.percentage.toString().padStart(3))}%  ` +
          chalk.gray(`(${translated}/${total})`) +
          `  ${status}`
        );
      }

      console.log('');

      // Summary
      const avgPercentage = stats.length > 0
        ? Math.round(stats.reduce((sum, s) => sum + s.percentage, 0) / stats.length)
        : 0;

      logger.section('📈 Summary');
      logger.kv('Languages', config.targetLangs.length.toString());
      logger.kv('Average Completion', `${avgPercentage}%`);

      const completed = stats.filter(s => s.percentage === 100).length;
      if (completed > 0) {
        logger.success(`${completed} language(s) fully translated`);
      }
      
      // Рекомендации
      const needsWork = stats.filter(s => s.percentage < 50);
      if (needsWork.length > 0) {
        console.log('');
        logger.subtitle('💡 Languages needing attention:');
        needsWork.forEach(stat => {
          const flag = getLanguageFlag(stat.lang);
          console.log(`  ${flag} ${stat.lang}: ${stat.percentage}% translated`);
        });
      }

    } catch (error) {
      progress.fail('Status check failed');
      logger.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

interface LanguageStat {
  lang: string;
  translated: number;
  total: number;
  percentage: number;
}

/**
 * Создаёт красивый ASCII прогресс-бар
 */
function createProgressBar(percentage: number, width: number): string {
  const filled = Math.round((width * percentage) / 100);
  const empty = width - filled;
  
  // Градиент в зависимости от процента
  let greenPart: string;
  if (percentage >= 80) {
    greenPart = chalk.green('█'.repeat(filled));
  } else if (percentage >= 50) {
    greenPart = chalk.yellow('█'.repeat(filled));
  } else {
    greenPart = chalk.red('█'.repeat(filled));
  }
  
  const grayPart = chalk.gray('░'.repeat(empty));
  
  return greenPart + grayPart;
}

/**
 * Возвращает emoji статус в зависимости от процента
 */
function getLanguageStatus(percentage: number): string {
  if (percentage === 100) return '✅';
  if (percentage >= 80) return '🟢';
  if (percentage >= 50) return '🟡';
  if (percentage >= 20) return '🟠';
  return '🔴';
}

/**
 * Рекурсивно получает все ключи из вложенного объекта
 */
function getAllKeys(obj: Record<string, any>, prefix: string = ''): string[] {
  const keys: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...getAllKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
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
    en: '🇬🇧', ko: '🇰🇷', ar: '🇸🇦', hi: '🇮🇳',
    uk: '🇺🇦', pl: '🇵🇱', tr: '🇹🇷', nl: '🇳🇱'
  };
  return flags[lang] || '🌐';
}
