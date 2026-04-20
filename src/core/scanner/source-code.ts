/**
 * Сканер исходного кода для извлечения строк подлежащих переводу
 * Поддерживает: Dart, JavaScript, TypeScript, Java, Kotlin, Swift, XML
 */

import * as fs from 'fs';
import * as path from 'path';
import { ScanResult, TranslationString, Framework } from '../../types';

// Паттерны для извлечения строк из разных языков
const STRING_PATTERNS: Record<string, RegExp[]> = {
  // Dart: S('string'), 'string', "string"
  dart: [
    /S\(['"`]([^'"`]+)['"`]\)/g,                    // S('string')
    /AppLocalizations\.of\(\w+\)\.(\w+)/g,          // AppLocalizations.of(context).key
    /['"`]([^'"`\\]*(?:\\.[^'"`\\]*)*)['"`]/g       // Обычные строки
  ],
  
  // JavaScript/TypeScript: i18n.t('key'), t('key'), 'string'
  javascript: [
    /(?:i18n|i18next|t)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,  // i18n.t('key')
    /(?:translation|translate)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /['"`]([^'"`\\]*(?:\\.[^'"`\\]*)*)['"`]/g
  ],
  
  // TypeScript JSX: t('key'), {t('key')}
  typescript: [
    /(?:i18n|i18next|t)\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /t\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /['"`]([^'"`\\]*(?:\\.[^'"`\\]*)*)['"`]/g
  ],
  
  // Java: getString(R.string.key), "string"
  java: [
    /getString\s*\(\s*R\.string\.(\w+)\s*\)/g,
    /getResources\s*\(\)\s*\.getString\s*\(\s*R\.string\.(\w+)\s*\)/g,
    /"([^"\\]*(?:\\.[^"\\]*)*)"/g
  ],
  
  // Kotlin: getString(R.string.key), "string"
  kotlin: [
    /getString\s*\(\s*R\.string\.(\w+)\s*\)/g,
    /context\.getString\s*\(\s*R\.string\.(\w+)\s*\)/g,
    /"([^"\\]*(?:\\.[^"\\]*)*)"/g
  ],
  
  // Swift: NSLocalizedString("key", comment: "..."), "string"
  swift: [
    /NSLocalizedString\s*\(\s*["']([^"']+)["']/g,
    /LocalizedStringKey\s*\(\s*["']([^"']+)["']/g,
    /Text\s*\(\s*["']([^"']+)["']/g,
    /"([^"\\]*(?:\\.[^"\\]*)*)"/g
  ],
  
  // Vue: $t('key'), i18n.t('key')
  vue: [
    /\$t\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /i18n\.t\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    /['"`]([^'"`\\]*(?:\\.[^'"`\\]*)*)['"`]/g
  ]
};

// Расширения файлов и соответствующие языки
const FILE_EXTENSIONS: Record<string, string> = {
  '.dart': 'dart',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.java': 'java',
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  '.swift': 'swift',
  '.vue': 'vue',
  '.xml': 'xml',
  '.xib': 'swift',
  '.storyboard': 'swift'
};

/**
 * Сканирует исходный код проекта и извлекает строки для перевода
 */
export function scanSourceCode(
  rootDir: string,
  options: {
    framework: Framework;
    ignore: string[];
    sourceLang: string;
    targetLangs: string[];
    localesDir: string;
  }
): ScanResult[] {
  const results: ScanResult[] = [];
  const allStrings = new Map<string, TranslationString>();
  
  // Сканируем файлы
  const files = findSourceFiles(rootDir, options.ignore);
  
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const language = getFileLanguage(file);
      
      if (language) {
        const strings = extractStringsFromSource(content, language, file);
        strings.forEach(str => {
          allStrings.set(str.key, str);
        });
      }
    } catch (error) {
      console.warn(`Warning: Could not parse ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  // Загружаем существующие переводы
  const translations = loadExistingTranslations(options.localesDir, options.targetLangs);
  
  // Сопоставляем строки с переводами
  const stringsWithTranslations: TranslationString[] = [];
  for (const [key, str] of allStrings.entries()) {
    const translatedValue = translations.get(key);
    stringsWithTranslations.push({
      ...str,
      translatedValue
    });
  }
  
  if (stringsWithTranslations.length > 0) {
    results.push({
      filePath: rootDir,
      strings: stringsWithTranslations,
      framework: options.framework
    });
  }
  
  return results;
}

/**
 * Находит все файлы исходного кода в директории
 */
function findSourceFiles(dir: string, ignore: string[], files: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    // Пропускаем игнорируемые директории
    if (entry.isDirectory()) {
      if (shouldIgnore(entry.name, ignore) || 
          entry.name === 'node_modules' || 
          entry.name === '.git' ||
          entry.name === 'build' ||
          entry.name === 'dist') {
        continue;
      }
      findSourceFiles(fullPath, ignore, files);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (FILE_EXTENSIONS[ext]) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

/**
 * Определяет язык по расширению файла
 */
function getFileLanguage(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  return FILE_EXTENSIONS[ext] || null;
}

/**
 * Извлекает строки из исходного кода
 */
function extractStringsFromSource(
  content: string,
  language: string,
  filePath: string
): TranslationString[] {
  const strings: TranslationString[] = [];
  const patterns = STRING_PATTERNS[language] || STRING_PATTERNS.javascript;
  const seen = new Set<string>();
  
  for (const pattern of patterns) {
    let match;
    // Сбрасываем lastIndex для глобальных паттернов
    pattern.lastIndex = 0;
    
    while ((match = pattern.exec(content)) !== null) {
      let value: string;
      let key: string;
      
      // Обрабатываем разные типы матчей
      if (match[0].includes('S(') || match[0].includes('getString')) {
        // Это ключ локализации
        key = match[1] || match[0];
        value = match[1] || match[0];
      } else {
        // Это обычная строка
        value = match[1] || match[0];
        // Создаём ключ из значения
        key = createKeyFromValue(value);
      }
      
      // Пропускаем дубликаты и короткие строки
      if (seen.has(key) || value.length < 2 || value.length > 500) {
        continue;
      }
      
      // Пропускаем строки которые выглядят как код
      if (isLikelyCode(value)) {
        continue;
      }
      
      seen.add(key);
      
      strings.push({
        key,
        value: unescapeString(value),
        context: inferContextFromCode(match[0], filePath),
        translatedValue: undefined
      });
    }
  }
  
  return strings;
}

/**
 * Создаёт ключ из строкового значения
 */
function createKeyFromValue(value: string): string {
  // Преобразуем "Hello World" в hello_world
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .join('_')
    .substring(0, 50);
}

/**
 * Проверяет, является ли строка кодом
 */
function isLikelyCode(value: string): boolean {
  // Пропускаем URL
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('www.')) {
    return true;
  }
  
  // Пропускаем пути к файлам
  if (value.includes('/') && value.includes('.')) {
    return true;
  }
  
  // Пропускаем email
  if (value.includes('@') && value.includes('.')) {
    return true;
  }
  
  // Пропускаем строки с большим количеством специальных символов
  const specialChars = (value.match(/[^a-zA-Z0-9\s]/g) || []).length;
  if (specialChars > value.length / 2) {
    return true;
  }
  
  // Пропускаем чистые числа
  if (/^\d+$/.test(value)) {
    return true;
  }
  
  return false;
}

/**
 * Определяет контекст из кода
 */
function inferContextFromCode(codeSnippet: string, filePath: string): string | undefined {
  const codeLower = codeSnippet.toLowerCase();
  const fileLower = filePath.toLowerCase();
  
  // Контекст из кода
  if (codeLower.includes('button') || codeLower.includes('btn')) return 'button';
  if (codeLower.includes('error') || codeLower.includes('err')) return 'error';
  if (codeLower.includes('title') || codeLower.includes('heading')) return 'title';
  if (codeLower.includes('label')) return 'label';
  if (codeLower.includes('placeholder') || codeLower.includes('hint')) return 'placeholder';
  if (codeLower.includes('tooltip')) return 'tooltip';
  if (codeLower.includes('message') || codeLower.includes('msg')) return 'message';
  if (codeLower.includes('alert')) return 'alert';
  if (codeLower.includes('dialog')) return 'dialog';
  if (codeLower.includes('menu')) return 'menu';
  
  // Контекст из пути к файлу
  if (fileLower.includes('button')) return 'button';
  if (fileLower.includes('error')) return 'error';
  if (fileLower.includes('dialog')) return 'dialog';
  if (fileLower.includes('screen') || fileLower.includes('page')) return 'screen';
  
  return undefined;
}

/**
 * Декодирует экранированные символы в строке
 */
function unescapeString(value: string): string {
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, '\\');
}

/**
 * Загружает существующие переводы из файлов
 */
function loadExistingTranslations(localesDir: string, targetLangs: string[]): Map<string, string> {
  const translations = new Map<string, string>();
  
  if (!fs.existsSync(localesDir)) {
    return translations;
  }
  
  for (const lang of targetLangs) {
    const jsonFile = path.join(localesDir, `${lang}.json`);
    const arbFile = path.join(localesDir, `app_${lang}.arb`);
    
    let content: string | null = null;
    
    if (fs.existsSync(jsonFile)) {
      content = fs.readFileSync(jsonFile, 'utf-8');
    } else if (fs.existsSync(arbFile)) {
      content = fs.readFileSync(arbFile, 'utf-8');
    }
    
    if (content) {
      try {
        const data = JSON.parse(content);
        extractTranslationsFromObject(data, '', translations);
      } catch {
        // Игнорируем ошибки парсинга
      }
    }
  }
  
  return translations;
}

/**
 * Извлекает переводы из вложенного объекта
 */
function extractTranslationsFromObject(
  obj: Record<string, any>,
  prefix: string,
  translations: Map<string, string>
): void {
  for (const [key, value] of Object.entries(obj)) {
    // Пропускаем метаданные ARB
    if (key.startsWith('@') || key === '@@locale') {
      continue;
    }
    
    const fullKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'string') {
      translations.set(fullKey, value);
      translations.set(createKeyFromValue(value), value);
    } else if (typeof value === 'object' && value !== null) {
      extractTranslationsFromObject(value, fullKey, translations);
    }
  }
}

/**
 * Проверяет, нужно ли игнорировать директорию
 */
function shouldIgnore(name: string, ignore: string[]): boolean {
  return ignore.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace(/\*/g, '.*'));
      return regex.test(name);
    }
    return name === pattern;
  });
}

export default scanSourceCode;
