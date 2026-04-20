import * as fs from 'fs';
import * as path from 'path';
import { ScanResult, TranslationString, Framework } from '../../types';

/**
 * Сканер для JSON файлов (React, Vue, Next.js, Nuxt, React Native)
 */
export function scanJsonFiles(dir: string, ignore: string[] = []): ScanResult[] {
  const results: ScanResult[] = [];
  
  if (!fs.existsSync(dir)) {
    return results;
  }

  const files = findJsonFiles(dir, ignore);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const data = JSON.parse(content);
      const strings = extractStringsFromObject(data);
      
      if (strings.length > 0) {
        results.push({
          filePath: file,
          strings,
          framework: 'react'
        });
      }
    } catch (error) {
      console.warn(`Warning: Could not parse ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return results;
}

/**
 * Рекурсивно находит все JSON файлы в директории
 */
function findJsonFiles(dir: string, ignore: string[]): string[] {
  const files: string[] = [];

  if (!fs.existsSync(dir)) {
    return files;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip ignored directories
    if (entry.isDirectory() && shouldIgnore(entry.name, ignore)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...findJsonFiles(fullPath, ignore));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      // Skip package.json, tsconfig.json, etc.
      const skipFiles = ['package.json', 'tsconfig.json', 'jsconfig.json', '.eslintrc.json'];
      if (!skipFiles.includes(entry.name)) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Извлекает все строковые значения из вложенного объекта
 */
export function extractStringsFromObject(
  obj: Record<string, any>,
  prefix: string = ''
): TranslationString[] {
  const strings: TranslationString[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      // Пропускаем пустые строки и URL
      if (value.trim() && !isUrl(value)) {
        strings.push({
          key: fullKey,
          value: value,
          context: inferContext(key)
        });
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      strings.push(...extractStringsFromObject(value, fullKey));
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
  if (keyLower.includes('placeholder') || keyLower.includes('placeholder')) {
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
 * Проверяет, является ли строка URL
 */
function isUrl(str: string): boolean {
  return str.startsWith('http://') || str.startsWith('https://') || str.startsWith('www.');
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

export default scanJsonFiles;
