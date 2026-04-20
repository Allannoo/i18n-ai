import * as fs from 'fs';
import * as path from 'path';
import { ScanResult, TranslationString, Framework } from '../../types';

/**
 * Сканер для .strings файлов (iOS/macOS)
 */
export function scanStringsFiles(dir: string, ignore: string[] = []): ScanResult[] {
  const results: ScanResult[] = [];
  
  if (!fs.existsSync(dir)) {
    return results;
  }

  const files = findStringsFiles(dir, ignore);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const strings = parseStringsFile(content, file);
      
      if (strings.length > 0) {
        results.push({
          filePath: file,
          strings,
          framework: 'ios'
        });
      }
    } catch (error) {
      console.warn(`Warning: Could not parse ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return results;
}

/**
 * Находит все .strings файлы в директории
 */
function findStringsFiles(dir: string, ignore: string[]): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory() && shouldIgnore(entry.name, ignore)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...findStringsFiles(fullPath, ignore));
    } else if (entry.isFile() && entry.name.endsWith('.strings')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Парсит .strings файл и извлекает строки
 * Формат: "key" = "value";
 */
export function parseStringsFile(content: string, filePath: string): TranslationString[] {
  const strings: TranslationString[] = [];

  // Регулярка для поиска "key" = "value";
  // Поддерживает экранированные кавычки внутри значений
  const lineRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*=\s*"([^"\\]*(?:\\.[^"\\]*)*)"\s*;/g;
  
  let match;
  while ((match = lineRegex.exec(content)) !== null) {
    const key = match[1];
    let value = match[2];

    // Декодируем экранированные символы
    value = decodeEscapedString(value);

    // Пропускаем пустые строки
    if (!value.trim()) {
      continue;
    }

    // Определяем контекст по ключу
    const context = inferContext(key);

    strings.push({
      key,
      value,
      context
    });
  }

  return strings;
}

/**
 * Декодирует экранированные символы в строке
 */
function decodeEscapedString(str: string): string {
  return str
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r');
}

/**
 * Определяет контекст строки по ключу
 */
function inferContext(key: string): string | undefined {
  const keyLower = key.toLowerCase();
  
  if (keyLower.includes('button') || keyLower.includes('btn')) {
    return 'button';
  }
  if (keyLower.includes('error') || keyLower.includes('err')) {
    return 'error';
  }
  if (keyLower.includes('title') || keyLower.includes('heading')) {
    return 'title';
  }
  if (keyLower.includes('label')) {
    return 'label';
  }
  if (keyLower.includes('placeholder')) {
    return 'placeholder';
  }
  if (keyLower.includes('alert')) {
    return 'alert';
  }
  if (keyLower.includes('message') || keyLower.includes('msg')) {
    return 'message';
  }
  if (keyLower.includes('action')) {
    return 'action';
  }
  
  return undefined;
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

export default scanStringsFiles;
