/**
 * Экспортёр для ARB формата (Flutter)
 * ARB (Application Resource Bundle) - JSON-подобный формат с метаданными
 */

/**
 * Экспортирует объект в ARB строку
 * Добавляет метаданные для каждого ключа
 */
export function exportToArb(data: Record<string, any>, locale: string = 'en'): string {
  const arb: Record<string, any> = {
    '@@locale': locale
  };

  // Копируем все ключи
  for (const [key, value] of Object.entries(data)) {
    arb[key] = value;
    
    // Добавляем метаданные если значение строка
    if (typeof value === 'string') {
      const metadataKey = `@${key}`;
      if (!arb[metadataKey]) {
        arb[metadataKey] = {
          description: `Translation for ${key}`
        };
      }
    }
  }

  return JSON.stringify(arb, null, 2);
}

/**
 * Импортирует ARB строку в объект
 * Извлекает только значения, игнорируя метаданные
 */
export function importFromArb(content: string): Record<string, any> {
  const arb = JSON.parse(content);
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(arb)) {
    // Пропускаем метаданные и служебные ключи
    if (key.startsWith('@') || key === '@@locale') {
      continue;
    }
    result[key] = value;
  }

  return result;
}

/**
 * Извлекает метаданные из ARB
 */
export function extractMetadata(content: string): Record<string, any> {
  const arb = JSON.parse(content);
  const metadata: Record<string, any> = {};

  for (const [key, value] of Object.entries(arb)) {
    if (key.startsWith('@') && key !== '@@locale') {
      metadata[key.substring(1)] = value;
    }
  }

  return metadata;
}

export default {
  exportToArb,
  importFromArb,
  extractMetadata
};
