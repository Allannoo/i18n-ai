import * as fs from 'fs';
import * as path from 'path';
import { ScanResult, TranslationString, Framework } from '../../types';
import { extractStringsFromObject } from './react';

/**
 * Сканер для ARB файлов (Flutter)
 * ARB (Application Resource Bundle) - это JSON-подобный формат
 */
export function scanArbFiles(dir: string, ignore: string[] = []): ScanResult[] {
  const results: ScanResult[] = [];
  
  if (!fs.existsSync(dir)) {
    return results;
  }

  const files = findArbFiles(dir, ignore);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const data = JSON.parse(content);
      const strings = extractStringsFromArb(data);
      
      if (strings.length > 0) {
        results.push({
          filePath: file,
          strings,
          framework: 'flutter'
        });
      }
    } catch (error) {
      console.warn(`Warning: Could not parse ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return results;
}

/**
 * Находит все ARB файлы в директории
 */
function findArbFiles(dir: string, ignore: string[]): string[] {
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
      files.push(...findArbFiles(fullPath, ignore));
    } else if (entry.isFile() && entry.name.endsWith('.arb')) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Извлекает строки из ARB файла
 * ARB формат имеет ключи с переводами и метаданные в @key
 */
export function extractStringsFromArb(data: Record<string, any>): TranslationString[] {
  const strings: TranslationString[] = [];

  for (const [key, value] of Object.entries(data)) {
    // Пропускаем метаданные (ключи начинающиеся с @)
    if (key.startsWith('@')) {
      continue;
    }

    if (typeof value === 'string') {
      const metadataKey = `@${key}`;
      const metadata = data[metadataKey];
      
      let context: string | undefined;
      
      // Извлекаем описание из метаданных
      if (metadata && typeof metadata === 'object') {
        if (metadata.description) {
          context = metadata.description;
        }
        if (metadata.type) {
          context = metadata.type;
        }
      }

      // Также пытаемся определить контекст по ключу
      if (!context) {
        context = inferContext(key);
      }

      strings.push({
        key,
        value,
        context
      });
    }
  }

  return strings;
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
  if (keyLower.includes('hint') || keyLower.includes('placeholder')) {
    return 'placeholder';
  }
  if (keyLower.includes('tooltip')) {
    return 'tooltip';
  }
  if (keyLower.includes('message') || keyLower.includes('msg')) {
    return 'message';
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

export default scanArbFiles;
