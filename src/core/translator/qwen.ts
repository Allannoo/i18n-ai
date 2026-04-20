import { TranslationBatch, TranslationResult } from '../../types';
import { BaseTranslationProvider } from './base';
import { logger } from '../../utils/logger';

/**
 * Qwen провайдер для перевода (Alibaba Cloud)
 * Поддерживает множественные модели с автоматическим переключением
 */
export class QwenProvider extends BaseTranslationProvider {
  readonly name: 'qwen' = 'qwen';
  
  private apiKey: string;
  private model: string;
  private baseUrl: string = 'https://dashscope.aliyuncs.com/compatible-mode/v1';

  // Доступные модели Qwen с приоритетами
  private static readonly MODELS = [
    { code: 'qwen3-max', priority: 1, quota: 1000000 },
    { code: 'qwen-plus-2025-07-28', priority: 2, quota: 1000000 },
    { code: 'qwen2.5-7b-instruct-1m', priority: 3, quota: 1000000 },
    { code: 'qwen3.5-122b-a10b', priority: 4, quota: 1000000 },
    { code: 'qwen2.5-vl-72b-instruct', priority: 5, quota: 1000000 },
    { code: 'qvq-max-2025-03-25', priority: 6, quota: 1000000 }
  ];

  private currentModelIndex: number = 0;
  private usedTokens: Map<string, number> = new Map();

  constructor(apiKey?: string, model?: string) {
    super();
    
    const key = apiKey || process.env.QWEN_API_KEY;
    if (!key) {
      throw new Error(
        'Qwen API key not found. Set QWEN_API_KEY environment variable or pass it as argument.'
      );
    }
    
    this.apiKey = key;
    this.model = model || 'qwen3-max';
    
    // Инициализируем счётчики использованных токенов
    QwenProvider.MODELS.forEach(m => {
      if (!this.usedTokens.has(m.code)) {
        this.usedTokens.set(m.code, 0);
      }
    });
  }

  /**
   * Переводит батч строк используя Qwen API
   */
  async translate(batch: TranslationBatch, context?: string): Promise<TranslationResult[]> {
    const strings = batch.strings.map(s => ({ key: s.key, value: s.value }));
    
    const userPrompt = this.createUserPrompt(
      strings,
      batch.targetLang,
      context
    );

    let lastError: Error | null = null;
    const maxRetries = QwenProvider.MODELS.length;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const currentModel = this.getCurrentModel();
        
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify({
            model: currentModel.code,
            messages: [
              {
                role: 'system',
                content: this.systemPrompt
              },
              {
                role: 'user',
                content: userPrompt
              }
            ],
            temperature: 0.3,
            max_tokens: 4000
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          
          // Проверяем на лимиты
          if (response.status === 429 || errorData.code === 'QuotaExceeded') {
            logger.warn(`Model ${currentModel.code} quota exceeded. Switching to next model...`);
            this.switchToNextModel();
            lastError = new Error('Quota exceeded');
            continue;
          }
          
          throw new Error(`Qwen API error: ${response.status} ${errorData.message || response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) {
          logger.warn('Empty response from Qwen');
          return [];
        }

        // Обновляем счётчик токенов
        const usage = data.usage?.total_tokens || 0;
        this.addUsedTokens(currentModel.code, usage);

        return this.parseTranslationResponse(content, strings, batch.targetLang);

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // Проверяем на ошибки квоты
        if (lastError.message.includes('quota') || lastError.message.includes('limit')) {
          logger.warn(`Model quota exceeded. Switching...`);
          this.switchToNextModel();
          continue;
        }
        
        // Проверяем на недоступность модели
        if (lastError.message.includes('unavailable') || lastError.message.includes('503')) {
          logger.warn(`Model unavailable. Switching...`);
          this.switchToNextModel();
          continue;
        }
        
        logger.error(`Qwen API error: ${lastError.message}`);
        throw lastError;
      }
    }

    // Все модели исчерпаны
    throw new Error(
      'All Qwen models are unavailable. Quota exceeded for all models. ' +
      'Please contact support: 92_92alan@mail.ru'
    );
  }

  /**
   * Переключается на следующую модель
   */
  private switchToNextModel(): void {
    this.currentModelIndex = (this.currentModelIndex + 1) % QwenProvider.MODELS.length;
    this.model = QwenProvider.MODELS[this.currentModelIndex].code;
    logger.info(`Switched to model: ${this.model}`);
  }

  /**
   * Возвращает текущую модель
   */
  private getCurrentModel(): { code: string; priority: number; quota: number } {
    return QwenProvider.MODELS[this.currentModelIndex];
  }

  /**
   * Добавляет использованные токены
   */
  private addUsedTokens(modelCode: string, tokens: number): void {
    const current = this.usedTokens.get(modelCode) || 0;
    this.usedTokens.set(modelCode, current + tokens);
  }

  /**
   * Возвращает статистику использования токенов
   */
  getTokenUsage(): Record<string, number> {
    const result: Record<string, number> = {};
    this.usedTokens.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  /**
   * Проверяет доступность API
   */
  async checkAvailability(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

export default QwenProvider;
