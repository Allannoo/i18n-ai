import { logger } from '../../utils/logger';

/**
 * Реестр моделей с отслеживанием лимитов и статусов
 * === ИСПРАВЛЕНИЕ ПРОБЛЕМЫ 8: Корректный сброс лимитов ===
 */

export interface ModelInfo {
  provider: 'qwen' | 'gemini' | 'openai' | 'anthropic' | 'openrouter';
  code: string;
  priority: number;
  quota?: number;
  used?: number;
  rpm?: number;
  tpm?: number;
  rpd?: number;
  status: 'available' | 'limited' | 'exhausted' | 'unavailable';
  lastReset?: number;
}

export interface ModelUsage {
  tokens: number;
  requests: number;
  lastReset: number;
  minuteRequests: number;
  minuteReset: number;
}

export class ModelRegistry {
  private static readonly SUPPORTED_MODELS: ModelInfo[] = [
    // Qwen модели
    { provider: 'qwen', code: 'qwen3-max', priority: 1, quota: 1000000, status: 'available' },
    { provider: 'qwen', code: 'qwen-plus-2025-07-28', priority: 2, quota: 1000000, status: 'available' },
    { provider: 'qwen', code: 'qwen2.5-7b-instruct-1m', priority: 3, quota: 1000000, status: 'available' },
    { provider: 'qwen', code: 'qwen3.5-122b-a10b', priority: 4, quota: 1000000, status: 'available' },
    { provider: 'qwen', code: 'qwen2.5-vl-72b-instruct', priority: 5, quota: 1000000, status: 'available' },
    { provider: 'qwen', code: 'qvq-max-2025-03-25', priority: 6, quota: 1000000, status: 'available' },
    
    // Gemini модели
    { provider: 'gemini', code: 'gemini-3.1-flash-lite', priority: 1, rpm: 15, tpm: 250000, rpd: 500, status: 'available' },
    { provider: 'gemini', code: 'gemini-2.5-flash-lite', priority: 2, rpm: 10, tpm: 250000, rpd: 20, status: 'available' },
    { provider: 'gemini', code: 'gemini-2.5-flash', priority: 3, rpm: 5, tpm: 250000, rpd: 20, status: 'available' },
    { provider: 'gemini', code: 'gemini-3-flash', priority: 4, rpm: 5, tpm: 250000, rpd: 20, status: 'available' },
    
    // OpenRouter модели (free tier)
    { provider: 'openrouter', code: 'google/gemma-3-27b-it:free', priority: 1, rpm: 20, rpd: 200, status: 'available' },
    { provider: 'openrouter', code: 'google/gemma-3-12b-it:free', priority: 2, rpm: 20, rpd: 200, status: 'available' },
    { provider: 'openrouter', code: 'meta-llama/llama-4-maverick:free', priority: 3, rpm: 20, rpd: 200, status: 'available' },
    { provider: 'openrouter', code: 'mistralai/mistral-small-3.1-24b-instruct:free', priority: 4, rpm: 20, rpd: 200, status: 'available' }
  ];

  private usage: Map<string, ModelUsage> = new Map();
  private providerPriority: ('qwen' | 'gemini' | 'openrouter')[] = ['qwen', 'gemini', 'openrouter'];
  private currentProviderIndex: number = 0;
  private resetInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeUsage();
    this.startPeriodicReset();
  }

  /**
   * Инициализирует счётчики использования
   */
  private initializeUsage(): void {
    ModelRegistry.SUPPORTED_MODELS.forEach(model => {
      this.usage.set(model.code, {
        tokens: 0,
        requests: 0,
        lastReset: Date.now(),
        minuteRequests: 0,
        minuteReset: Date.now()
      });
    });
  }

  /**
   * Запускает периодический сброс счётчиков
   */
  private startPeriodicReset(): void {
    // Сбрасываем минутные счётчики каждую минуту
    this.resetInterval = setInterval(() => {
      const now = Date.now();
      this.usage.forEach((usage, code) => {
        // Сброс минутных запросов
        if (now - usage.minuteReset >= 60000) {
          usage.minuteRequests = 0;
          usage.minuteReset = now;
        }
      });
    }, 60000);

    // Сброс дневных счётчиков в полночь
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    
    setTimeout(() => {
      this.resetDailyCounters();
      // Затем каждый день
      setInterval(() => this.resetDailyCounters(), 86400000);
    }, msUntilMidnight);
  }

  /**
   * Сбрасывает дневные счётчики
   */
  private resetDailyCounters(): void {
    this.usage.forEach((usage) => {
      usage.requests = 0;
      usage.lastReset = Date.now();
    });
    logger.debug('Daily counters reset');
  }

  /**
   * Возвращает список доступных моделей для провайдера
   */
  getModelsForProvider(provider: 'qwen' | 'gemini' | 'openrouter'): ModelInfo[] {
    return ModelRegistry.SUPPORTED_MODELS
      .filter(m => m.provider === provider && m.status === 'available')
      .sort((a, b) => a.priority - b.priority);
  }

  /**
   * Возвращает следующую доступную модель
   */
  getNextModel(currentModel?: string): ModelInfo | null {
    const currentProvider = this.getCurrentProvider();
    const models = this.getModelsForProvider(currentProvider);

    if (models.length === 0) {
      this.switchProvider();
      return this.getNextModel();
    }

    if (!currentModel) {
      return models[0];
    }

    const currentIndex = models.findIndex(m => m.code === currentModel);
    
    if (currentIndex === -1 || currentIndex >= models.length - 1) {
      this.switchProvider();
      return this.getNextModel();
    }

    return models[currentIndex + 1];
  }

  /**
   * Отмечает модель как исчерпанную
   */
  markExhausted(modelCode: string): void {
    const model = ModelRegistry.SUPPORTED_MODELS.find(m => m.code === modelCode);
    if (model) {
      model.status = 'exhausted';
      logger.warn(`Model ${modelCode} marked as exhausted`);
    }
  }

  /**
   * Отмечает модель как недоступную
   */
  markUnavailable(modelCode: string): void {
    const model = ModelRegistry.SUPPORTED_MODELS.find(m => m.code === modelCode);
    if (model) {
      model.status = 'unavailable';
      logger.warn(`Model ${modelCode} marked as unavailable`);
    }
  }

  /**
   * Сбрасывает статус модели
   */
  resetModelStatus(modelCode: string): void {
    const model = ModelRegistry.SUPPORTED_MODELS.find(m => m.code === modelCode);
    if (model) {
      model.status = 'available';
    }
  }

  /**
   * Обновляет использование модели с проверкой лимитов
   */
  updateUsage(modelCode: string, tokens: number): { success: boolean; reason?: string } {
    const usage = this.usage.get(modelCode);
    const model = ModelRegistry.SUPPORTED_MODELS.find(m => m.code === modelCode);
    
    if (!usage || !model) {
      return { success: true };
    }

    const now = Date.now();

    // Проверка RPM (requests per minute)
    if (now - usage.minuteReset >= 60000) {
      usage.minuteRequests = 0;
      usage.minuteReset = now;
    }

    if (model.rpm && usage.minuteRequests >= model.rpm) {
      return { 
        success: false, 
        reason: `Rate limit exceeded (${usage.minuteRequests}/${model.rpm} req/min)` 
      };
    }

    // Проверка RPD (requests per day)
    if (now - usage.lastReset >= 86400000) {
      usage.requests = 0;
      usage.lastReset = now;
    }

    if (model.rpd && usage.requests >= model.rpd) {
      return { 
        success: false, 
        reason: `Daily limit exceeded (${usage.requests}/${model.rpd} req/day)` 
      };
    }

    // Проверка TPM (tokens per minute)
    if (model.tpm && usage.tokens >= model.tpm) {
      return { 
        success: false, 
        reason: `Token limit exceeded (${usage.tokens}/${model.tpm} tokens)` 
      };
    }

    // Обновляем счётчики
    usage.tokens += tokens;
    usage.requests += 1;
    usage.minuteRequests += 1;

    return { success: true };
  }

  /**
   * Переключает провайдера
   */
  public switchProvider(): void {
    this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providerPriority.length;
    const newProvider = this.providerPriority[this.currentProviderIndex];
    logger.info(`Switched provider to: ${newProvider}`);
  }

  /**
   * Возвращает текущего провайдера
   */
  getCurrentProvider(): 'qwen' | 'gemini' | 'openrouter' {
    return this.providerPriority[this.currentProviderIndex];
  }

  /**
   * Проверяет, есть ли доступные модели
   */
  hasAvailableModels(): boolean {
    return ModelRegistry.SUPPORTED_MODELS.some(m => m.status === 'available');
  }

  /**
   * Возвращает статистику использования
   */
  getUsageStats(): Record<string, ModelUsage & { status: string }> {
    const result: Record<string, ModelUsage & { status: string }> = {};
    
    ModelRegistry.SUPPORTED_MODELS.forEach(model => {
      const usage = this.usage.get(model.code);
      if (usage) {
        result[model.code] = {
          ...usage,
          status: model.status
        };
      }
    });

    return result;
  }

  /**
   * Сбрасывает все статусы моделей
   */
  resetAllStatuses(): void {
    ModelRegistry.SUPPORTED_MODELS.forEach(model => {
      model.status = 'available';
    });
    this.currentProviderIndex = 0;
  }

  /**
   * Очищает интервалы при завершении
   */
  destroy(): void {
    if (this.resetInterval) {
      clearInterval(this.resetInterval);
    }
  }

  /**
   * Возвращает сообщение об ошибке когда все модели недоступны
   */
  static getUnavailableMessage(): string {
    return 'Все AI модели временно недоступны. Есть технические проблемы, мы над этим работаем. ' +
           'Обратитесь: 92_92alan@mail.ru';
  }
}

export const modelRegistry = new ModelRegistry();
export default ModelRegistry;
