import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../core/config';
import { logger } from '../utils/logger';
import { createProgress } from '../utils/progress';
import chalk from 'chalk';

interface CheckOptions {
  path?: string;
  strict?: boolean;
}

export const checkCommand = new Command('check')
  .description('Check translation quality')
  .option('-p, --path <dir>', 'check specific folder')
  .option('--strict', 'fail on warnings too')
  .action(async (options: CheckOptions) => {
    const progress = createProgress('Checking translations...');
    
    try {
      const config = loadConfig();
      const checkPath = options.path || path.join(process.cwd(), config.localesDir);
      const strict = options.strict || false;

      const errors: TranslationError[] = [];
      const warnings: TranslationWarning[] = [];

      // Находим все файлы переводов
      const files = findTranslationFiles(checkPath, config.targetLangs);

      for (const file of files) {
        const content = JSON.parse(fs.readFileSync(file.path, 'utf-8'));
        const result = checkTranslationFile(content, file.lang, config.sourceLang, checkPath);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      }

      progress.stop();

      if (errors.length === 0 && warnings.length === 0) {
        logger.success('✅ All translations look good!');
        process.exit(0);
      }

      // Вывод ошибок
      if (errors.length > 0) {
        console.log('');
        logger.section('❌ Errors');
        errors.forEach(err => {
          console.log(chalk.red(`  ✖ ${err.file}:${err.key}`));
          console.log(chalk.gray(`    ${err.message}`));
        });
      }

      // Вывод предупреждений
      if (warnings.length > 0) {
        console.log('');
        logger.section('⚠️  Warnings');
        warnings.forEach(warn => {
          console.log(chalk.yellow(`  ! ${warn.file}:${warn.key}`));
          console.log(chalk.gray(`    ${warn.message}`));
        });
      }

      // Summary
      console.log('');
      logger.section('📊 Summary');
      console.log(chalk.gray('  ┌' + '─'.repeat(50) + '┐'));
      console.log(chalk.gray('  │') + chalk.red(`  Errors: ${errors.length}`).padEnd(52) + chalk.gray(' │'));
      console.log(chalk.gray('  │') + chalk.yellow(`  Warnings: ${warnings.length}`).padEnd(52) + chalk.gray(' │'));
      console.log(chalk.gray('  └' + '─'.repeat(50) + '┘'));

      // Exit code
      if (errors.length > 0 || (strict && warnings.length > 0)) {
        process.exit(1);
      }

    } catch (error) {
      progress.fail('Check failed');
      logger.error(error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  });

interface TranslationError {
  file: string;
  key: string;
  message: string;
}

interface TranslationWarning {
  file: string;
  key: string;
  message: string;
}

interface TranslationFile {
  path: string;
  lang: string;
}

/**
 * Рекурсивно находит файлы переводов
 */
function findTranslationFiles(dir: string, langs: string[]): TranslationFile[] {
  const files: TranslationFile[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...findTranslationFiles(fullPath, langs));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      const baseName = path.basename(entry.name, '.json');
      // Match both lang.json and *_lang.json patterns
      if (langs.includes(baseName)) {
        files.push({ path: fullPath, lang: baseName });
      } else {
        for (const lang of langs) {
          if (baseName.endsWith(`_${lang}`)) {
            files.push({ path: fullPath, lang });
            break;
          }
        }
      }
    }
  }

  return files;
}

/**
 * Проверяет файл перевода на ошибки
 * === ИСПРАВЛЕНИЕ ПРОБЛЕМЫ 5: Проверка длины ===
 */
function checkTranslationFile(
  content: Record<string, any>,
  lang: string,
  sourceLang: string,
  checkPath: string
): { errors: TranslationError[]; warnings: TranslationWarning[] } {
  const errors: TranslationError[] = [];
  const warnings: TranslationWarning[] = [];
  const file = `${lang}.json`;

  // Загружаем исходный файл для сравнения
  let sourceContent: Record<string, any> = {};
  
  // Search for source file with both naming patterns
  let sourcePath = '';
  const sourceCandidates = fs.existsSync(checkPath) ? fs.readdirSync(checkPath) : [];
  for (const f of sourceCandidates) {
    if (f === `${sourceLang}.json` || f.endsWith(`_${sourceLang}.json`)) {
      sourcePath = path.join(checkPath, f);
      break;
    }
  }
  
  if (sourcePath && fs.existsSync(sourcePath)) {
    try {
      sourceContent = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
    } catch {
      // Игнорируем
    }
  }

  for (const [key, value] of Object.entries(content)) {
    const stringValue = String(value);

    // === ERROR: Пустые переводы ===
    if (!stringValue || stringValue.trim() === '') {
      errors.push({ file, key, message: 'Empty translation' });
      continue;
    }

    // === ERROR: Placeholder'ы не совпадают ===
    if (sourceContent[key]) {
      const sourcePlaceholders = extractPlaceholders(String(sourceContent[key]));
      const targetPlaceholders = extractPlaceholders(stringValue);

      for (const placeholder of sourcePlaceholders) {
        if (!targetPlaceholders.includes(placeholder)) {
          errors.push({ file, key, message: `Missing placeholder: ${placeholder}` });
        }
      }
    }

    // === WARNING: Слишком длинный перевод (Проблема 5) ===
    if (sourceContent[key]) {
      const sourceLength = String(sourceContent[key]).length;
      const ratio = stringValue.length / sourceLength;
      
      if (ratio > 2) {
        warnings.push({ 
          file, 
          key, 
          message: `Translation is ${ratio.toFixed(1)}x longer than original (${sourceLength} → ${stringValue.length} chars). May not fit in UI.` 
        });
      }
    } else if (stringValue.length > 300) {
      warnings.push({ file, key, message: `Very long translation (${stringValue.length} chars). Consider breaking into multiple strings.` });
    }

    // === WARNING: Не переведено ===
    if (stringValue.toLowerCase() === key.toLowerCase()) {
      warnings.push({ file, key, message: 'Translation appears to be untranslated (same as key)' });
    }

    // === WARNING: Подозрительно похоже на английский ===
    if (lang !== 'en' && /^[a-zA-Z\s.,!?'-]+$/.test(stringValue) && stringValue.length > 10) {
      // Проверяем есть ли типичные английские слова
      const englishWords = ['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'are', 'was'];
      const words = stringValue.toLowerCase().split(/\s+/);
      const hasEnglish = words.some(w => englishWords.includes(w));
      
      if (hasEnglish) {
        warnings.push({ file, key, message: 'Translation looks like English. May need review.' });
      }
    }
  }

  return { errors, warnings };
}

/**
 * Извлекает плейсхолдеры из строки
 */
function extractPlaceholders(text: string): string[] {
  const placeholders: string[] = [];

  // {name}, {0}, etc.
  const curlyRegex = /\{([^}]+)\}/g;
  let match;
  while ((match = curlyRegex.exec(text)) !== null) {
    placeholders.push(`{${match[1]}}`);
  }

  // %s, %d, %f, etc.
  const percentRegex = /%[sdfoxXcfeEgG]/g;
  while ((match = percentRegex.exec(text)) !== null) {
    placeholders.push(match[0]);
  }

  return placeholders;
}
