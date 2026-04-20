import * as fs from 'fs';
import * as path from 'path';
import { ScanResult, TranslationString, Framework } from '../../types';

/**
 * Сканер для XML файлов (Android strings.xml)
 */
export function scanXmlFiles(dir: string, ignore: string[] = []): ScanResult[] {
  const results: ScanResult[] = [];
  
  if (!fs.existsSync(dir)) {
    return results;
  }

  const files = findXmlFiles(dir, ignore);

  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf-8');
      const strings = parseStringsXml(content, file);
      
      if (strings.length > 0) {
        results.push({
          filePath: file,
          strings,
          framework: 'android'
        });
      }
    } catch (error) {
      console.warn(`Warning: Could not parse ${file}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return results;
}

/**
 * Находит все strings.xml файлы в директории
 */
function findXmlFiles(dir: string, ignore: string[]): string[] {
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
      files.push(...findXmlFiles(fullPath, ignore));
    } else if (entry.isFile() && entry.name === 'strings.xml') {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Парсит Android strings.xml и извлекает строки
 */
export function parseStringsXml(xmlContent: string, filePath: string): TranslationString[] {
  const strings: TranslationString[] = [];

  // Регулярка для поиска <string name="...">...</string>
  const stringRegex = /<string\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/gi;
  
  let match;
  while ((match = stringRegex.exec(xmlContent)) !== null) {
    const name = match[1];
    let value = match[2];

    // Очищаем значение от лишних пробелов
    value = value.trim();

    // Пропускаем пустые строки
    if (!value) {
      continue;
    }

    // Определяем контекст по имени
    const context = inferContext(name);

    strings.push({
      key: name,
      value,
      context
    });
  }

  // Также ищем <plurals> для множественных чисел
  const pluralsRegex = /<plurals\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/plurals>/gi;
  
  while ((match = pluralsRegex.exec(xmlContent)) !== null) {
    const name = match[1];
    const content = match[2];

    // Извлекаем отдельные формы (quantity="one", quantity="other", etc.)
    const itemRegex = /<item\s+quantity="([^"]+)"[^>]*>([\s\S]*?)<\/item>/gi;
    let itemMatch;
    
    while ((itemMatch = itemRegex.exec(content)) !== null) {
      const quantity = itemMatch[1];
      const value = itemMatch[2].trim();

      if (value) {
        strings.push({
          key: `${name}_${quantity}`,
          value,
          context: 'plurals'
        });
      }
    }
  }

  // Ищем <string-array>
  const arrayRegex = /<string-array\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/string-array>/gi;
  
  while ((match = arrayRegex.exec(xmlContent)) !== null) {
    const name = match[1];
    const content = match[2];

    // Извлекаем элементы массива
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let itemMatch;
    let index = 0;
    
    while ((itemMatch = itemRegex.exec(content)) !== null) {
      const value = itemMatch[1].trim();

      if (value) {
        strings.push({
          key: `${name}_${index}`,
          value,
          context: 'array'
        });
        index++;
      }
    }
  }

  return strings;
}

/**
 * Определяет контекст строки по имени
 */
function inferContext(name: string): string | undefined {
  const nameLower = name.toLowerCase();
  
  if (nameLower.includes('button') || nameLower.includes('btn')) {
    return 'button';
  }
  if (nameLower.includes('error') || nameLower.includes('err')) {
    return 'error';
  }
  if (nameLower.includes('title') || nameLower.includes('heading')) {
    return 'title';
  }
  if (nameLower.includes('label')) {
    return 'label';
  }
  if (nameLower.includes('hint') || nameLower.includes('placeholder')) {
    return 'placeholder';
  }
  if (nameLower.includes('message') || nameLower.includes('msg')) {
    return 'message';
  }
  if (nameLower.includes('action')) {
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

export default scanXmlFiles;
