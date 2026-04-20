/**
 * Экспортёр для JSON формата (React, Vue, Next.js, Nuxt, React Native)
 */

/**
 * Экспортирует объект в JSON строку
 */
export function exportToJson(data: Record<string, any>): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Импортирует JSON строку в объект
 */
export function importFromJson(content: string): Record<string, any> {
  return JSON.parse(content);
}

export default {
  exportToJson,
  importFromJson
};
