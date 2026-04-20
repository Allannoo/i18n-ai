import * as fs from 'fs';
import * as path from 'path';
import { ScanResult, Framework, ScanSummary, LanguageStat, TranslationString } from '../../types';
import { scanJsonFiles, extractStringsFromObject } from './react';
import { scanArbFiles, extractStringsFromArb } from './flutter';
import { scanXmlFiles, parseStringsXml } from './android';
import { scanStringsFiles, parseStringsFile } from './ios';
import { scanSourceCode } from './source-code';

/**
 * Сканирует проект и возвращает результаты в зависимости от фреймворка
 * Поддерживает сканирование как файлов переводов, так и исходного кода
 */
export function scanProject(
  dir: string,
  framework: Framework,
  ignore: string[] = [],
  options?: {
    scanSource?: boolean;
    sourceLang?: string;
    targetLangs?: string[];
    localesDir?: string;
  }
): ScanResult[] {
  const results: ScanResult[] = [];
  
  // Если включено сканирование исходного кода
  if (options?.scanSource && options.sourceLang && options.targetLangs && options.localesDir) {
    const sourceResults = scanSourceCode(dir, {
      framework,
      ignore,
      sourceLang: options.sourceLang,
      targetLangs: options.targetLangs,
      localesDir: options.localesDir
    });
    results.push(...sourceResults);
  }
  
  // Сканируем файлы переводов (традиционный способ)
  switch (framework) {
    case 'flutter':
      results.push(...scanArbFiles(dir, ignore));
      break;
    case 'react':
    case 'vue':
    case 'react-native':
      results.push(...scanJsonFiles(dir, ignore));
      break;
    case 'android':
      results.push(...scanXmlFiles(dir, ignore));
      break;
    case 'ios':
      results.push(...scanStringsFiles(dir, ignore));
      break;
  }
  
  return results;
}

/**
 * Создаёт сводку по результатам сканирования с анализом по языкам
 */
export function createScanSummary(
  results: ScanResult[],
  targetLangs: string[],
  localesDir?: string
): ScanSummary {
  let totalStrings = 0;
  let translated = 0;
  let needTranslation = 0;

  const languageStats: Record<string, LanguageStat> = {};
  
  // Инициализируем статистику
  for (const lang of targetLangs) {
    languageStats[lang] = { translated: 0, total: 0, percentage: 0 };
  }

  // Собираем все уникальные строки
  const allStrings = new Map<string, TranslationString>();
  for (const result of results) {
    for (const str of result.strings) {
      if (!allStrings.has(str.key)) {
        allStrings.set(str.key, str);
        totalStrings++;
      }
    }
  }

  // Если есть директория с переводами, анализируем файлы по языкам
  if (localesDir && fs.existsSync(localesDir)) {
    for (const lang of targetLangs) {
      const langStats = analyzeLanguageFile(localesDir, lang, allStrings);
      languageStats[lang] = langStats;
      translated += langStats.translated;
    }
    needTranslation = totalStrings - Math.round(translated / targetLangs.length);
  } else {
    // Без файлов переводов - считаем всё как needing translation
    needTranslation = totalStrings;
  }

  // Вычисляем проценты
  for (const lang of targetLangs) {
    const stats = languageStats[lang];
    stats.percentage = stats.total > 0
      ? Math.round((stats.translated / stats.total) * 100)
      : 0;
  }

  return {
    filesFound: results.length,
    totalStrings,
    translated: Math.round(translated / targetLangs.length),
    needTranslation,
    results,
    languageStats
  };
}

/**
 * Анализирует файл перевода для конкретного языка
 */
function analyzeLanguageFile(
  localesDir: string,
  lang: string,
  allStrings: Map<string, TranslationString>
): LanguageStat {
  let translated = 0;
  const total = allStrings.size;
  
  // Пробуем найти файл перевода
  const jsonFile = path.join(localesDir, `${lang}.json`);
  const arbFile = path.join(localesDir, `app_${lang}.arb`);
  
  let content: string | null = null;
  
  if (fs.existsSync(jsonFile)) {
    content = fs.readFileSync(jsonFile, 'utf-8');
  } else if (fs.existsSync(arbFile)) {
    content = fs.readFileSync(arbFile, 'utf-8');
  } else if (fs.existsSync(localesDir)) {
    // Search for *_lang.json pattern
    try {
      const files = fs.readdirSync(localesDir);
      for (const f of files) {
        if (f.endsWith(`_${lang}.json`)) {
          content = fs.readFileSync(path.join(localesDir, f), 'utf-8');
          break;
        }
      }
    } catch { /* ignore */ }
  }
  
  if (content) {
    try {
      const data = JSON.parse(content);
      const translations = new Map<string, string>();
      extractAllTranslations(data, '', translations);
      
      // Проверяем каждую строку
      for (const [key] of allStrings.entries()) {
        const translation = translations.get(key) || translations.get(createSimpleKey(key));
        if (translation && translation.trim() !== '') {
          translated++;
        }
      }
    } catch {
      // Игнорируем ошибки парсинга
    }
  }
  
  return { translated, total, percentage: 0 };
}

/**
 * Извлекает все переводы из вложенного объекта
 */
function extractAllTranslations(
  obj: Record<string, any>,
  prefix: string,
  translations: Map<string, string>
): void {
  for (const [key, value] of Object.entries(obj)) {
    // Пропускаем метаданные
    if (key.startsWith('@') || key === '@@locale') {
      continue;
    }
    
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'string') {
      translations.set(fullKey, value);
      translations.set(createSimpleKey(fullKey), value);
    } else if (typeof value === 'object' && value !== null) {
      extractAllTranslations(value, fullKey, translations);
    }
  }
}

/**
 * Создаёт простой ключ из полного пути
 */
function createSimpleKey(key: string): string {
  return key.split('.').pop() || key;
}

/**
 * Определяет фреймворк по структуре проекта
 */
export function detectFramework(dir: string): Framework {
  const pubspecPath = path.join(dir, 'pubspec.yaml');
  const packageJsonPath = path.join(dir, 'package.json');
  const androidManifestPath = path.join(dir, 'AndroidManifest.xml');
  const podfilePath = path.join(dir, 'Podfile');

  // Flutter
  if (fs.existsSync(pubspecPath)) {
    return 'flutter';
  }

  // Android
  if (fs.existsSync(androidManifestPath)) {
    return 'android';
  }

  // iOS
  if (fs.existsSync(podfilePath)) {
    return 'ios';
  }

  // React/Vue/React Native
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      const deps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      if (deps['react-native']) {
        return 'react-native';
      }
      if (deps['vue'] || deps['nuxt']) {
        return 'vue';
      }
      if (deps['react'] || deps['next']) {
        return 'react';
      }
    } catch {
      // Не удалось распарсить package.json
    }
  }

  // По умолчанию React
  return 'react';
}

export default {
  scanProject,
  createScanSummary,
  detectFramework
};
