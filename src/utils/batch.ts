import { TranslationString, TranslationBatch } from '../types';

const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_DELAY_MS = 100;

/**
 * Разбивает массив строк на батчи для пакетной отправки в AI
 */
export function createBatches(
  strings: TranslationString[],
  targetLangs: string[],
  batchSize: number = DEFAULT_BATCH_SIZE
): TranslationBatch[] {
  const batches: TranslationBatch[] = [];

  for (const lang of targetLangs) {
    for (let i = 0; i < strings.length; i += batchSize) {
      const batch = strings.slice(i, i + batchSize);
      batches.push({
        strings: batch,
        targetLang: lang
      });
    }
  }

  return batches;
}

/**
 * Выполняет асинхронные операции с задержкой между вызовами
 * для соблюдения rate limiting API
 */
export async function processWithRateLimit<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  options?: {
    delayMs?: number;
    onError?: (error: Error, item: T) => void;
  }
): Promise<R[]> {
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;
  const results: R[] = [];

  for (let i = 0; i < items.length; i++) {
    try {
      const result = await processor(items[i]);
      results.push(result);
    } catch (error) {
      if (options?.onError) {
        options.onError(error as Error, items[i]);
      } else {
        throw error;
      }
    }

    // Добавляем паузу между запросами (кроме последнего)
    if (i < items.length - 1 && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  return results;
}

/**
 * Разбивает текст на предложения для лучшего контекста
 */
export function splitIntoSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
}

/**
 * Объединяет результаты перевода обратно в объект
 */
export function mergeTranslationResults(
  results: Array<{ key: string; translated: string }>,
  targetLang: string
): Record<string, string> {
  const merged: Record<string, string> = {};

  for (const result of results) {
    merged[result.key] = result.translated;
  }

  return merged;
}

/**
 * Promise-based sleep функция
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Проверяет, нужно ли переводить строку
 * (не пустая, не только пробелы, не число)
 */
export function needsTranslation(value: string): boolean {
  if (!value || value.trim() === '') {
    return false;
  }
  // Не переводим числа и специальные значения
  if (/^\d+$/.test(value.trim())) {
    return false;
  }
  return true;
}

export default {
  createBatches,
  processWithRateLimit,
  splitIntoSentences,
  mergeTranslationResults,
  sleep,
  needsTranslation
};
