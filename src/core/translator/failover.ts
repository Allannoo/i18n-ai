import { TranslationBatch, TranslationResult, TranslationProvider } from '../../types';
import { logger } from '../../utils/logger';
import { QwenProvider } from './qwen';
import { GeminiProvider } from './gemini';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { OpenRouterProvider } from './openrouter';
import { modelRegistry, ModelInfo } from './model-registry';

const SUPPORT_EMAIL = '92_92alan@mail.ru';

/**
 * Failover менеджер для автоматического переключения между провайдерами и моделями
 * === ИСПРАВЛЕНИЕ ПРОБЛЕМЫ 9: Оптимизация переключения ===
 */
export class FailoverManager {
  private providers: Map<string, TranslationProvider> = new Map();
  private currentModel: string | null = null;
  private maxRetries: number = 4;
  private providerInstances: Map<string, Map<string, TranslationProvider>> = new Map();

  constructor() {
    this.initializeProviders();
  }

  /**
   * Инициализирует провайдеров
   */
  private initializeProviders(): void {
    // Создаём пул провайдеров для разных моделей
    const providerConfigs = [
      { name: 'qwen', key: process.env.QWEN_API_KEY, models: ['qwen3-max', 'qwen-plus-2025-07-28', 'qwen2.5-7b-instruct-1m'] },
      { name: 'gemini', key: process.env.GEMINI_API_KEY, models: ['gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash'] },
      { name: 'openrouter', key: process.env.OPENROUTER_API_KEY, models: ['google/gemma-3-27b-it:free', 'google/gemma-3-12b-it:free', 'meta-llama/llama-4-maverick:free'] },
      { name: 'openai', key: process.env.OPENAI_API_KEY, models: ['gpt-4o-mini', 'gpt-4o'] },
      { name: 'anthropic', key: process.env.ANTHROPIC_API_KEY, models: ['claude-haiku-20240307', 'claude-sonnet-20240229'] }
    ];

    for (const config of providerConfigs) {
      if (config.key) {
        this.providerInstances.set(config.name, new Map());
        
        // Создаём провайдеры для каждой модели
        for (const model of config.models) {
          const provider = this.createProvider(config.name as any, model);
          if (provider) {
            this.providerInstances.get(config.name)!.set(model, provider);
            
            // Первый провайдер по умолчанию
            if (!this.providers.has(config.name)) {
              this.providers.set(config.name, provider);
              if (config.name === 'qwen' || config.name === 'gemini') {
                this.currentModel = model;
              }
            }
          }
        }
        
        logger.debug(`${config.name} provider initialized with ${config.models.length} models`);
      }
    }

    if (this.providers.size === 0) {
      logger.error('No AI providers configured. Please set at least one API key.');
    }
  }

  /**
   * Переводит батч с автоматическим failover
   */
  async translateWithFailover(
    batch: TranslationBatch,
    context?: string
  ): Promise<TranslationResult[]> {
    let lastError: Error | null = null;
    let attempts = 0;
    let switchedModels = 0;

    while (attempts < this.maxRetries) {
      try {
        attempts++;
        const currentProviderName = modelRegistry.getCurrentProvider();
        const provider = this.getProviderForModel(currentProviderName, this.currentModel);

        if (!provider) {
          logger.warn(`Provider ${currentProviderName} not available`);
          modelRegistry.switchProvider();
          continue;
        }

        // Проверяем лимиты перед запросом
        const estimatedTokens = this.estimateTokens(batch);
        const limitCheck = modelRegistry.updateUsage(this.currentModel || 'unknown', estimatedTokens);
        
        if (!limitCheck.success) {
          logger.warn(`Limit check failed: ${limitCheck.reason}`);
          this.switchToNextModel();
          switchedModels++;
          continue;
        }

        const result = await provider.translate(batch, context);
        
        if (result.length > 0) {
          return result;
        }
        
        lastError = new Error('Empty response from provider');
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (this.isRetryableError(lastError)) {
          this.switchToNextModel();
          switchedModels++;
          continue;
        }
        
        logger.error(`Critical error: ${lastError.message}`);
        modelRegistry.switchProvider();
      }
    }

    // Все попытки исчерпаны
    throw this.createFinalError(lastError, switchedModels);
  }

  /**
   * Переключается на следующую модель
   */
  private switchToNextModel(): void {
    const currentProvider = modelRegistry.getCurrentProvider();
    const nextModel = modelRegistry.getNextModel(this.currentModel || undefined);
    
    if (nextModel) {
      this.currentModel = nextModel.code;
      logger.info(`Switched to model: ${nextModel.code} (${nextModel.provider})`);
      
      // Переключаем провайдер если сменился провайдер
      if (nextModel.provider !== currentProvider) {
        const provider = this.getProviderForModel(nextModel.provider, nextModel.code);
        if (provider) {
          this.providers.set(nextModel.provider, provider);
        }
      }
    } else {
      modelRegistry.switchProvider();
    }
  }

  /**
   * Получает провайдер для конкретной модели
   */
  private getProviderForModel(providerName: string, modelCode: string | null): TranslationProvider | null {
    const providerMap = this.providerInstances.get(providerName);
    
    if (!providerMap) {
      return null;
    }
    
    // Если модель указана, пробуем получить провайдер для неё
    if (modelCode && providerMap.has(modelCode)) {
      return providerMap.get(modelCode)!;
    }
    
    // Иначе возвращаем первый доступный
    const firstProvider = providerMap.values().next().value;
    return firstProvider || null;
  }

  /**
   * Создаёт провайдер для модели
   */
  private createProvider(providerName: string, modelCode: string): TranslationProvider | null {
    const apiKey = process.env[`${providerName.toUpperCase()}_API_KEY`];
    
    if (!apiKey) {
      return null;
    }
    
    switch (providerName) {
      case 'qwen':
        return new QwenProvider(apiKey, modelCode);
      case 'gemini':
        return new GeminiProvider(apiKey, modelCode);
      case 'openrouter':
        return new OpenRouterProvider(apiKey, modelCode);
      case 'openai':
        return new OpenAIProvider(apiKey, modelCode);
      case 'anthropic':
        return new AnthropicProvider(apiKey, modelCode);
      default:
        return null;
    }
  }

  /**
   * Проверяет, можно ли повторить запрос
   */
  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    return message.includes('quota') ||
           message.includes('limit') ||
           message.includes('rate limit') ||
           message.includes('429') ||
           message.includes('unavailable') ||
           message.includes('503') ||
           message.includes('502') ||
           message.includes('timeout');
  }

  /**
   * Создаёт финальную ошибку когда все попытки исчерпаны
   */
  private createFinalError(lastError: Error | null, switchedModels: number): Error {
    const message = `
╔═══════════════════════════════════════════════════════════════╗
║                    ТЕХНИЧЕСКИЕ ПРОБЛЕМЫ                       ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  Все AI модели временно недоступы.                            ║
║  Мы работаем над устранением проблемы.                        ║
║                                                               ║
║  Попыток выполнено: ${String(lastError ? 1 : 0).padEnd(35)} ║
║  Переключений моделей: ${String(switchedModels).padEnd(29)} ║
║                                                               ║
║  Обратитесь в поддержку:                                      ║
║  📧 ${SUPPORT_EMAIL.padEnd(44)} ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`.trim();

    return new Error(message);
  }

  /**
   * Оценивает количество токенов в батче
   */
  private estimateTokens(batch: TranslationBatch): number {
    const textLength = batch.strings.reduce((sum, s) => sum + s.value.length, 0);
    return Math.round(textLength / 4);
  }

  /**
   * Возвращает статистику использования
   */
  getUsageStats(): Record<string, any> {
    return modelRegistry.getUsageStats();
  }

  /**
   * Проверяет доступность провайдеров
   */
  async checkProviders(): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    
    for (const [name, provider] of this.providers.entries()) {
      result[name] = await provider.checkAvailability().catch(() => false);
    }
    
    return result;
  }

  /**
   * Очищает ресурсы
   */
  destroy(): void {
    modelRegistry.destroy();
  }
}

export const failoverManager = new FailoverManager();
export default FailoverManager;
