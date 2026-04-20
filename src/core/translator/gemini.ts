import { TranslationBatch, TranslationResult } from '../../types';
import { BaseTranslationProvider } from './base';
import { logger } from '../../utils/logger';

/**
 * Gemini провайдер для перевода (Google)
 * Поддерживает множественные модели с автоматическим переключением
 */
export class GeminiProvider extends BaseTranslationProvider {
  readonly name: 'gemini' = 'gemini';
  
  private apiKey: string;
  private model: string;
  private baseUrl: string = 'https://generativelanguage.googleapis.com/v1beta';

  // Доступные модели Gemini с приоритетами и лимитами
  private static readonly MODELS = [
    { code: 'gemini-2.5-flash-lite-preview-06-2025', priority: 1, rpm: 10, tpm: 250000, rpd: 20 },
    { code: 'gemini-2.5-flash-preview-05-2025', priority: 2, rpm: 5, tpm: 250000, rpd: 20 },
    { code: 'gemini-2.0-flash-exp', priority: 3, rpm: 5, tpm: 250000, rpd: 20 },
    { code: 'gemini-1.5-flash', priority: 4, rpm: 5, tpm: 250000, rpd: 20 }
  ];

  private currentModelIndex: number = 0;
  private requestCount: Map<string, number> = new Map();
  private tokenCount: Map<string, number> = new Map();
  private dailyReset: Map<string, number> = new Map(); // timestamp последнего сброса

  constructor(apiKey?: string, model?: string) {
    super();
    
    const key = apiKey || process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error(
        'Gemini API key not found. Set GEMINI_API_KEY environment variable or pass it as argument.'
      );
    }
    
    this.apiKey = key;
    this.model = model || 'gemini-3.1-flash-lite';
    
    // Инициализируем счётчики
    GeminiProvider.MODELS.forEach(m => {
      if (!this.requestCount.has(m.code)) {
        this.requestCount.set(m.code, 0);
        this.tokenCount.set(m.code, 0);
        this.dailyReset.set(m.code, Date.now());
      }
    });
  }

  /**
   * Переводит батч строк используя Gemini API
   */
  async translate(batch: TranslationBatch, context?: string): Promise<TranslationResult[]> {
    const strings = batch.strings.map(s => ({ key: s.key, value: s.value }));
    
    const userPrompt = this.createUserPrompt(
      strings,
      batch.targetLang,
      context
    );

    let lastError: Error | null = null;
    const maxRetries = GeminiProvider.MODELS.length;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const currentModel = this.getCurrentModel();
        
        // Проверяем лимиты перед запросом
        this.checkLimits(currentModel.code);

        const response = await fetch(
          `${this.baseUrl}/models/${currentModel.code}:generateContent?key=${this.apiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `${this.systemPrompt}\n\n${userPrompt}`
                }]
              }],
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 4000
              }
            })
          }
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          // Проверяем на лимиты (429 Too Many Requests)
          if (response.status === 429) {
            logger.warn(`Model ${currentModel.code} rate limit exceeded. Switching to next model...`);
            this.incrementRequestCount(currentModel.code);
            this.switchToNextModel();
            lastError = new Error('Rate limit exceeded');
            continue;
          }
          
          throw new Error(`Gemini API error: ${response.status} ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!content) {
          logger.warn('Empty response from Gemini');
          return [];
        }

        // Обновляем счётчики
        this.incrementRequestCount(currentModel.code);
        const usage = data.usageMetadata?.totalTokenCount || 0;
        this.addTokenCount(currentModel.code, usage);

        return this.parseTranslationResponse(content, strings, batch.targetLang);

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // Проверяем на ошибки лимитов
        if (lastError.message.includes('rate limit') || lastError.message.includes('429')) {
          logger.warn(`Model rate limit exceeded. Switching...`);
          this.switchToNextModel();
          continue;
        }
        
        // Проверяем на недоступность модели
        if (lastError.message.includes('unavailable') || lastError.message.includes('503')) {
          logger.warn(`Model unavailable. Switching...`);
          this.switchToNextModel();
          continue;
        }
        
        logger.error(`Gemini API error: ${lastError.message}`);
        throw lastError;
      }
    }

    // Все модели исчерпаны
    throw new Error(
      'All Gemini models are unavailable. Rate limits exceeded for all models. ' +
      'Please contact support: 92_92alan@mail.ru'
    );
  }

  /**
   * Проверяет лимиты модели
   */
  private checkLimits(modelCode: string): void {
    const model = GeminiProvider.MODELS.find(m => m.code === modelCode);
    if (!model) return;

    const now = Date.now();
    const requests = this.requestCount.get(modelCode) || 0;
    const tokens = this.tokenCount.get(modelCode) || 0;
    const lastReset = this.dailyReset.get(modelCode) || 0;

    // Сбрасываем дневные лимиты если прошёл день
    if (now - lastReset > 24 * 60 * 60 * 1000) {
      this.requestCount.set(modelCode, 0);
      this.tokenCount.set(modelCode, 0);
      this.dailyReset.set(modelCode, now);
      return;
    }

    // Проверяем RPD (requests per day)
    if (requests >= model.rpd) {
      throw new Error(`Daily request limit exceeded for ${modelCode}`);
    }

    // Проверяем TPM (tokens per minute) - упрощённо
    if (tokens >= model.tpm) {
      throw new Error(`Token limit exceeded for ${modelCode}`);
    }
  }

  /**
   * Увеличивает счётчик запросов
   */
  private incrementRequestCount(modelCode: string): void {
    const current = this.requestCount.get(modelCode) || 0;
    this.requestCount.set(modelCode, current + 1);
  }

  /**
   * Добавляет количество токенов
   */
  private addTokenCount(modelCode: string, tokens: number): void {
    const current = this.tokenCount.get(modelCode) || 0;
    this.tokenCount.set(modelCode, current + tokens);
  }

  /**
   * Переключается на следующую модель
   */
  private switchToNextModel(): void {
    this.currentModelIndex = (this.currentModelIndex + 1) % GeminiProvider.MODELS.length;
    this.model = GeminiProvider.MODELS[this.currentModelIndex].code;
    logger.info(`Switched to Gemini model: ${this.model}`);
  }

  /**
   * Возвращает текущую модель
   */
  private getCurrentModel(): { code: string; priority: number; rpm: number; tpm: number; rpd: number } {
    return GeminiProvider.MODELS[this.currentModelIndex];
  }

  /**
   * Возвращает статистику использования
   */
  getUsage(): Record<string, { requests: number; tokens: number }> {
    const result: Record<string, { requests: number; tokens: number }> = {};
    GeminiProvider.MODELS.forEach(m => {
      result[m.code] = {
        requests: this.requestCount.get(m.code) || 0,
        tokens: this.tokenCount.get(m.code) || 0
      };
    });
    return result;
  }

  /**
   * Проверяет доступность API
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const response = await fetch(
        `${this.baseUrl}/models/${this.model}?key=${this.apiKey}`
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}

export default GeminiProvider;
