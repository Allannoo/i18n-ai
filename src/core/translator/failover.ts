import { TranslationBatch, TranslationResult, TranslationProvider } from '../../types';
import { logger } from '../../utils/logger';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { OpenRouterProvider } from './openrouter';
import { modelRegistry, ModelInfo } from './model-registry';

const SUPPORT_EMAIL = '92_92alan@mail.ru';

export class FailoverManager {
  private providers: Map<string, TranslationProvider> = new Map();
  private currentModel: string | null = null;
  private maxRetries: number = 4;
  private providerInstances: Map<string, Map<string, TranslationProvider>> = new Map();

  constructor() {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    const providerConfigs = [
      { name: 'openrouter', key: process.env.OPENROUTER_API_KEY, models: ['openai/gpt-oss-120b:free', 'meta-llama/llama-3.3-70b-instruct:free', 'qwen/qwen3-next-80b-a3b-instruct:free'] },
      { name: 'openai', key: process.env.OPENAI_API_KEY, models: ['gpt-4o-mini', 'gpt-4o'] },
      { name: 'anthropic', key: process.env.ANTHROPIC_API_KEY, models: ['claude-haiku-20240307', 'claude-sonnet-20240229'] }
    ];

    for (const config of providerConfigs) {
      if (config.key) {
        this.providerInstances.set(config.name, new Map());
        for (const model of config.models) {
          const provider = this.createProvider(config.name as any, model);
          if (provider) {
            this.providerInstances.get(config.name)!.set(model, provider);
            if (!this.providers.has(config.name)) {
              this.providers.set(config.name, provider);
              if (config.name === 'openrouter') {
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

  async translateWithFailover(
    batch: TranslationBatch,
    context?: string
  ): Promise<TranslationResult[]> {
    let lastError: Error | null = null;
    let attempts = 0;
    let switchedModels = 0;

    while (attempts < this.maxRetries) {
      const currentProviderName = modelRegistry.getCurrentProvider();
      const provider = this.getProviderForModel(currentProviderName, this.currentModel);

      if (!provider) {
        logger.warn(`Provider ${currentProviderName} not available`);
        modelRegistry.switchProvider();
        attempts++;
        continue;
      }

      const estimatedTokens = this.estimateTokens(batch);
      const limitCheck = modelRegistry.updateUsage(this.currentModel || 'unknown', estimatedTokens);
      
      if (!limitCheck.success) {
        logger.warn(`Limit check failed: ${limitCheck.reason}`);
        this.switchToNextModel();
        switchedModels++;
        attempts++;
        continue;
      }

      try {
        const result = await provider.translate(batch, context);
        if (result.length > 0) {
          return result;
        }
        lastError = new Error('Empty response from provider');
        attempts++;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        attempts++;
        if (this.isRetryableError(lastError)) {
          this.switchToNextModel();
          switchedModels++;
          continue;
        }
        logger.error(`Critical error: ${lastError.message}`);
        modelRegistry.switchProvider();
      }
    }

    throw this.createFinalError(lastError, switchedModels);
  }

  private switchToNextModel(): void {
    const currentProvider = modelRegistry.getCurrentProvider();
    const nextModel = modelRegistry.getNextModel(this.currentModel || undefined);
    if (nextModel) {
      this.currentModel = nextModel.code;
      logger.info(`Switched to model: ${nextModel.code} (${nextModel.provider})`);
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

  private getProviderForModel(providerName: string, modelCode: string | null): TranslationProvider | null {
    const providerMap = this.providerInstances.get(providerName);
    if (!providerMap) return null;
    if (modelCode && providerMap.has(modelCode)) return providerMap.get(modelCode)!;
    const firstProvider = providerMap.values().next().value;
    return firstProvider || null;
  }

  private createProvider(providerName: string, modelCode: string): TranslationProvider | null {
    const apiKey = process.env[`${providerName.toUpperCase()}_API_KEY`];
    if (!apiKey) return null;
    switch (providerName) {
      case 'openrouter': return new OpenRouterProvider(apiKey, modelCode);
      case 'openai': return new OpenAIProvider(apiKey, modelCode);
      case 'anthropic': return new AnthropicProvider(apiKey, modelCode);
      default: return null;
    }
  }

  private isRetryableError(error: Error): boolean {
    const message = error.message.toLowerCase();
    const statusCode = (error as { statusCode?: number }).statusCode;
    return statusCode === 429 || statusCode === 503 || statusCode === 502 ||
           message.includes('quota') || message.includes('limit') ||
           message.includes('rate limit') || message.includes('429') ||
           message.includes('unavailable') || message.includes('503') ||
           message.includes('502') || message.includes('timeout');
  }

  private createFinalError(lastError: Error | null, switchedModels: number): Error {
    const message = `
в•”в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•—
в•‘                    РўР•РҐРќРР§Р•РЎРљРР• РџР РћР‘Р›Р•РњР«                       в•‘
в• в•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•Ј
в•‘                                                               в•‘
в•‘  Р’СЃРµ AI РјРѕРґРµР»Рё РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїС‹.                            в•‘
в•‘  РњС‹ СЂР°Р±РѕС‚Р°РµРј РЅР°Рґ СѓСЃС‚СЂР°РЅРµРЅРёРµРј РїСЂРѕР±Р»РµРјС‹.                        в•‘
в•‘                                                               в•‘
в•‘  РџРѕРїС‹С‚РѕРє РІС‹РїРѕР»РЅРµРЅРѕ: ${String(lastError ? 1 : 0).padEnd(35)} в•‘
в•‘  РџРµСЂРµРєР»СЋС‡РµРЅРёР№ РјРѕРґРµР»РµР№: ${String(switchedModels).padEnd(29)} в•‘
в•‘                                                               в•‘
в•‘  РћР±СЂР°С‚РёС‚РµСЃСЊ РІ РїРѕРґРґРµСЂР¶РєСѓ:                                      в•‘
в•‘  рџ“§ ${SUPPORT_EMAIL.padEnd(44)} в•‘
в•‘                                                               в•‘
в•љв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ђв•ќ
`.trim();
    return new Error(message);
  }

  private estimateTokens(batch: TranslationBatch): number {
    const textLength = batch.strings.reduce((sum, s) => sum + s.value.length, 0);
    return Math.round(textLength / 4);
  }

  getUsageStats(): Record<string, any> {
    return modelRegistry.getUsageStats();
  }

  async checkProviders(): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const [name, provider] of this.providers.entries()) {
      if (provider.checkAvailability) {
        result[name] = await provider.checkAvailability().catch(() => false);
      } else {
        result[name] = true;
      }
    }
    return result;
  }

  destroy(): void {
    modelRegistry.destroy();
  }
}

export const failoverManager = new FailoverManager();
export default FailoverManager;
