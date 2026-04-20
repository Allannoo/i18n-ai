/**
 * Экспортёр для XML формата (Android strings.xml)
 */

/**
 * Экспортирует объект в Android strings.xml формат
 */
export function exportToXml(data: Record<string, any>, locale?: string): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<resources>\n';

  const entries = flattenObject(data);
  
  for (const [key, value] of Object.entries(entries)) {
    if (typeof value === 'string') {
      const escapedValue = escapeXmlValue(value);
      xml += `    <string name="${escapeXmlAttr(key)}">${escapedValue}</string>\n`;
    }
  }

  xml += '</resources>\n';
  
  return xml;
}

/**
 * Импортирует Android strings.xml в объект
 */
export function importFromXml(content: string): Record<string, any> {
  const result: Record<string, any> = {};

  // Парсим <string name="...">...</string>
  const stringRegex = /<string\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/string>/gi;
  let match;

  while ((match = stringRegex.exec(content)) !== null) {
    const name = match[1];
    const value = unescapeXmlValue(match[2].trim());
    result[name] = value;
  }

  // Парсим <plurals>
  const pluralsRegex = /<plurals\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/plurals>/gi;
  
  while ((match = pluralsRegex.exec(content)) !== null) {
    const name = match[1];
    const plContent = match[2];

    // Извлекаем отдельные формы
    const itemRegex = /<item\s+quantity="([^"]+)"[^>]*>([\s\S]*?)<\/item>/gi;
    let itemMatch;
    
    while ((itemMatch = itemRegex.exec(plContent)) !== null) {
      const quantity = itemMatch[1];
      const value = unescapeXmlValue(itemMatch[2].trim());
      result[`${name}_${quantity}`] = value;
    }
  }

  // Парсим <string-array>
  const arrayRegex = /<string-array\s+name="([^"]+)"[^>]*>([\s\S]*?)<\/string-array>/gi;
  
  while ((match = arrayRegex.exec(content)) !== null) {
    const name = match[1];
    const arrContent = match[2];
    const items: string[] = [];

    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let itemMatch;
    
    while ((itemMatch = itemRegex.exec(arrContent)) !== null) {
      items.push(unescapeXmlValue(itemMatch[1].trim()));
    }

    result[name] = items;
  }

  return result;
}

/**
 * Экранирует специальные XML символы в значении
 */
function escapeXmlValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Экранирует специальные XML символы в атрибуте
 */
function escapeXmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    .replace(/\./g, '_')  // Точки в именах ключей заменяем на _
    .replace(/\s+/g, '_'); // Пробелы тоже
}

/**
 * Декодирует XML сущности
 */
function unescapeXmlValue(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'");
}

/**
 * Преобразует вложенный объект в плоский
 */
function flattenObject(obj: Record<string, any>, prefix: string = ''): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}_${key}` : key;
    
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(result, flattenObject(value, newKey));
    } else {
      result[newKey] = value;
    }
  }

  return result;
}

export default {
  exportToXml,
  importFromXml
};
