import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../core/config';
import { logger } from '../utils/logger';
import { createProgress } from '../utils/progress';
import { scanProject, createScanSummary, detectFramework } from '../core/scanner';
import chalk from 'chalk';

interface ScanOptions {
  path?: string;
  output?: string;
}

export const scanCommand = new Command('scan')
  .description('Scan project for translatable strings')
  .option('-p, --path <dir>', 'scan specific folder')
  .option('-o, --output <report>', 'save report in JSON')
  .action(async (options: ScanOptions) => {
    const progress = createProgress('Initializing scan...');
    
    try {
      const config = loadConfig();
      const scanPath = options.path || process.cwd();
      
      progress.update('Detecting framework...');
      const framework = detectFramework(scanPath);
      
      progress.update(`Scanning all ${config.framework} project files...`);
      
      // Сканируем ВСЕ файлы проекта по выбранному фреймворку
      const results = scanProject(scanPath, config.framework, config.ignore, {
        scanSource: true,
        sourceLang: config.sourceLang,
        targetLangs: config.targetLangs,
        localesDir: config.localesDir
      });
      
      const summary = createScanSummary(
        results,
        config.targetLangs,
        path.join(scanPath, config.localesDir)
      );

      progress.stop();

      // Красивый вывод результатов
      console.log('');
      logger.section('📊 Scan Results');
      
      console.log(chalk.gray('  ┌' + '─'.repeat(50) + '┐'));
      console.log(chalk.gray('  │') + chalk.white('  Found files:').padEnd(28) + chalk.cyan(summary.filesFound.toString().padStart(20)) + chalk.gray(' │'));
      console.log(chalk.gray('  │') + chalk.white('  Total strings:').padEnd(28) + chalk.cyan(summary.totalStrings.toString().padStart(20)) + chalk.gray(' │'));
      console.log(chalk.gray('  │') + chalk.green('  ✅ Translated:').padEnd(28) + chalk.green(summary.translated.toString().padStart(20)) + chalk.gray(' │'));
      console.log(chalk.gray('  │') + chalk.yellow('  ⚠️  Need translation:').padEnd(28) + chalk.yellow(summary.needTranslation.toString().padStart(20)) + chalk.gray(' │'));
      console.log(chalk.gray('  └' + '─'.repeat(50) + '┘'));
      
      console.log('');
      logger.subtitle('🌍 Translation Progress by Language');
      console.log('');

      // Отображаем прогресс по языкам с красивыми барами
      const languages = Object.entries(summary.languageStats);
      const maxLangName = Math.max(...languages.map(([lang]) => lang.length));
      
      for (const [lang, data] of languages) {
        const percentage = data.percentage;
        const flag = getLanguageFlag(lang);
        const bar = createProgressBar(percentage, 30);
        
        const translated = data.translated;
        const total = data.total;
        
        console.log(
          `  ${flag} ${lang.padEnd(maxLangName)}  ${bar}  ${chalk.bold(percentage.toString().padStart(3))}%  ` +
          chalk.gray(`(${translated.toLocaleString()}/${total.toLocaleString()})`)
        );
      }

      // Сохраняем отчёт если нужно
      if (options.output) {
        const reportData = {
          scannedAt: new Date().toISOString(),
          framework: config.framework,
          summary: {
            filesFound: summary.filesFound,
            totalStrings: summary.totalStrings,
            translated: summary.translated,
            needTranslation: summary.needTranslation
          },
          languages: summary.languageStats,
          files: summary.results.map(r => ({
            path: r.filePath,
            stringsCount: r.strings.length,
            framework: r.framework
          }))
        };
        
        fs.writeFileSync(options.output, JSON.stringify(reportData, null, 2));
        console.log('');
        logger.success(`Report saved to: ${options.output}`);
      }
      
      // Рекомендации
      if (summary.needTranslation > 0) {
        console.log('');
        logger.section('💡 Next Steps');
        console.log(`  Run: ${chalk.cyan(`i18n-ai translate --lang ${config.targetLangs.join(',')}`)}`);
        console.log(`  Or:  ${chalk.cyan('i18n-ai translate --dry-run')} to preview`);
      }

    } catch (error) {
      progress.fail('Scan failed');
      logger.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

/**
 * Создаёт красивый ASCII прогресс-бар
 */
function createProgressBar(percentage: number, width: number): string {
  const filled = Math.round((width * percentage) / 100);
  const empty = width - filled;
  
  // Градиент от зелёного к красному
  const greenPart = chalk.green('█'.repeat(filled));
  const grayPart = chalk.gray('░'.repeat(empty));
  
  return greenPart + grayPart;
}

/**
 * Возвращает emoji флага для языка
 */
function getLanguageFlag(lang: string): string {
  const flags: Record<string, string> = {
    ru: '🇷🇺',
    de: '🇩🇪',
    zh: '🇨🇳',
    ja: '🇯🇵',
    fr: '🇫🇷',
    es: '🇪🇸',
    pt: '🇵🇹',
    it: '🇮🇹',
    en: '🇬🇧',
    ko: '🇰🇷',
    ar: '🇸🇦',
    hi: '🇮🇳',
    tr: '🇹🇷',
    pl: '🇵🇱',
    nl: '🇳🇱',
    uk: '🇺🇦',
    he: '🇮🇱',
    th: '🇹🇭',
    vi: '🇻🇳'
  };
  
  return flags[lang] || '🌐';
}
