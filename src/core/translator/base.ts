import { TranslationProvider, TranslationBatch, TranslationResult } from '../../types';

/**
 * Базовый класс для провайдеров перевода
 */
export abstract class BaseTranslationProvider implements TranslationProvider {
  abstract readonly name: 'openai' | 'anthropic' | 'qwen' | 'gemini' | 'openrouter';
  
  /**
   * Системный промпт для переводчика
   */
  protected readonly systemPrompt = `You are a professional UI/UX translator. Translate interface strings accurately and concisely.

Important rules:
1. Keep translations short and natural for UI
2. Preserve placeholders like {name}, %s, %d, etc.
3. Maintain the tone and context of the original
4. Do not translate technical terms, brand names, or URLs
5. Adapt cultural references appropriately
6. Keep button text as imperative verbs (commands)
7. Error messages should clearly describe the problem

Return ONLY valid JSON array with translations. No additional text.`;

  /**
   * Переводит батч строк на целевой язык
   */
  abstract translate(batch: TranslationBatch, context?: string): Promise<TranslationResult[]>;

  /**
   * Создаёт пользовательский промпт для перевода
   */
  protected createUserPrompt(
    strings: Array<{ key: string; value: string }>,
    targetLang: string,
    context?: string,
    contextRules?: Record<string, string>
  ): string {
    let prompt = `Translate the following UI strings to ${targetLang}.\n\n`;
    
    if (context) {
      prompt += `Context: ${context}\n\n`;
    }

    if (contextRules && Object.keys(contextRules).length > 0) {
      prompt += 'Translation rules:\n';
      for (const [key, rule] of Object.entries(contextRules)) {
        prompt += `- For ${key}: ${rule}\n`;
      }
      prompt += '\n';
    }

    prompt += 'Strings to translate:\n';
    prompt += '```json\n';
    prompt += JSON.stringify(strings, null, 2);
    prompt += '\n```\n\n';
    prompt += 'Return ONLY a JSON array with objects containing "key" and "translated" fields.';

    return prompt;
  }

  /**
   * Парсит ответ от AI и извлекает переводы
   */
  protected parseTranslationResponse(
    response: string,
    originalStrings: Array<{ key: string; value: string }>,
    targetLang: string
  ): TranslationResult[] {
    try {
      // Пытаемся найти JSON в ответе
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        
        return parsed.map((item: any) => ({
          key: item.key,
          original: originalStrings.find(s => s.key === item.key)?.value || '',
          translated: item.translated,
          targetLang
        }));
      }
    } catch (e) {
      // Если не удалось распарсить JSON, возвращаем пустой массив
      console.warn('Failed to parse translation response:', e);
    }

    return [];
  }
}

export default BaseTranslationProvider;
