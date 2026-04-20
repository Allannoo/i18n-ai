import { logger } from '../../utils/logger';

export interface ModelInfo {
  provider: 'openai' | 'anthropic' | 'openrouter';
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
    // OpenRouter РјРѕРґРµР»Рё (free tier)
    { provider: 'openrouter', code: 'openai/gpt-oss-120b:free', priority: 1, rpm: 20, rpd: 200, status: 'available' },
    { provider: 'openrouter', code: 'meta-llama/llama-3.3-70b-instruct:free', priority: 2, rpm: 20, rpd: 200, status: 'available' },
    { provider: 'openrouter', code: 'qwen/qwen3-next-80b-a3b-instruct:free', priority: 3, rpm: 20, rpd: 200, status: 'available' },
  ];

  private usage: Map<string, ModelUsage> = new Map();
  private providerPriority: ('openrouter' | 'openai' | 'anthropic')[] = ['openrouter'];
  private currentProviderIndex: number = 0;
  private resetInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initializeUsage();
    this.startPeriodicReset();
  }

  private initializeUsage(): void {
    ModelRegistry.SUPPORTED_MODELS.forEach(model => {
      this.usage.set(model.code, {
        tokens: 0, requests: 0, lastReset: Date.now(),
        minuteRequests: 0, minuteReset: Date.now()
      });
    });
  }

  private startPeriodicReset(): void {
    this.resetInterval = setInterval(() => {
      const now = Date.now();
      this.usage.forEach((usage) => {
        if (now - usage.minuteReset >= 60000) {
          usage.minuteRequests = 0;
          usage.minuteReset = now;
        }
      });
    }, 60000);

    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const msUntilMidnight = tomorrow.getTime() - now.getTime();
    setTimeout(() => {
      this.resetDailyCounters();
      setInterval(() => this.resetDailyCounters(), 86400000);
    }, msUntilMidnight);
  }

  private resetDailyCounters(): void {
    this.usage.forEach((usage) => {
      usage.requests = 0;
      usage.lastReset = Date.now();
    });
    logger.debug('Daily counters reset');
  }

  getModelsForProvider(provider: 'openrouter' | 'openai' | 'anthropic'): ModelInfo[] {
    return ModelRegistry.SUPPORTED_MODELS
      .filter(m => m.provider === provider && m.status === 'available')
      .sort((a, b) => a.priority - b.priority);
  }

  getNextModel(currentModel?: string): ModelInfo | null {
    const currentProvider = this.getCurrentProvider();
    const models = this.getModelsForProvider(currentProvider);
    if (models.length === 0) {
      this.switchProvider();
      return this.getNextModel();
    }
    if (!currentModel) return models[0];
    const currentIndex = models.findIndex(m => m.code === currentModel);
    if (currentIndex === -1 || currentIndex >= models.length - 1) {
      this.switchProvider();
      return this.getNextModel();
    }
    return models[currentIndex + 1];
  }

  markExhausted(modelCode: string): void {
    const model = ModelRegistry.SUPPORTED_MODELS.find(m => m.code === modelCode);
    if (model) { model.status = 'exhausted'; logger.warn(`Model ${modelCode} marked as exhausted`); }
  }

  markUnavailable(modelCode: string): void {
    const model = ModelRegistry.SUPPORTED_MODELS.find(m => m.code === modelCode);
    if (model) { model.status = 'unavailable'; logger.warn(`Model ${modelCode} marked as unavailable`); }
  }

  resetModelStatus(modelCode: string): void {
    const model = ModelRegistry.SUPPORTED_MODELS.find(m => m.code === modelCode);
    if (model) { model.status = 'available'; }
  }

  updateUsage(modelCode: string, tokens: number): { success: boolean; reason?: string } {
    const usage = this.usage.get(modelCode);
    const model = ModelRegistry.SUPPORTED_MODELS.find(m => m.code === modelCode);
    if (!usage || !model) return { success: true };

    const now = Date.now();
    if (now - usage.minuteReset >= 60000) { usage.minuteRequests = 0; usage.minuteReset = now; }
    if (model.rpm && usage.minuteRequests >= model.rpm) {
      return { success: false, reason: `Rate limit exceeded (${usage.minuteRequests}/${model.rpm} req/min)` };
    }
    if (now - usage.lastReset >= 86400000) { usage.requests = 0; usage.lastReset = now; }
    if (model.rpd && usage.requests >= model.rpd) {
      return { success: false, reason: `Daily limit exceeded (${usage.requests}/${model.rpd} req/day)` };
    }
    if (model.tpm && usage.tokens >= model.tpm) {
      return { success: false, reason: `Token limit exceeded (${usage.tokens}/${model.tpm} tokens)` };
    }

    usage.tokens += tokens;
    usage.requests += 1;
    usage.minuteRequests += 1;
    return { success: true };
  }

  public switchProvider(): void {
    this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providerPriority.length;
    const newProvider = this.providerPriority[this.currentProviderIndex];
    logger.info(`Switched provider to: ${newProvider}`);
  }

  getCurrentProvider(): 'openrouter' | 'openai' | 'anthropic' {
    return this.providerPriority[this.currentProviderIndex];
  }

  hasAvailableModels(): boolean {
    return ModelRegistry.SUPPORTED_MODELS.some(m => m.status === 'available');
  }

  getUsageStats(): Record<string, ModelUsage & { status: string }> {
    const result: Record<string, ModelUsage & { status: string }> = {};
    ModelRegistry.SUPPORTED_MODELS.forEach(model => {
      const usage = this.usage.get(model.code);
      if (usage) { result[model.code] = { ...usage, status: model.status }; }
    });
    return result;
  }

  resetAllStatuses(): void {
    ModelRegistry.SUPPORTED_MODELS.forEach(model => { model.status = 'available'; });
    this.currentProviderIndex = 0;
  }

  destroy(): void {
    if (this.resetInterval) { clearInterval(this.resetInterval); }
  }

  static getUnavailableMessage(): string {
    return 'Р’СЃРµ AI РјРѕРґРµР»Рё РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРЅС‹. Р•СЃС‚СЊ С‚РµС…РЅРёС‡РµСЃРєРёРµ РїСЂРѕР±Р»РµРјС‹, РјС‹ РЅР°Рґ СЌС‚РёРј СЂР°Р±РѕС‚Р°РµРј. ' +
           'РћР±СЂР°С‚РёС‚РµСЃСЊ: 92_92alan@mail.ru';
  }
}

export const modelRegistry = new ModelRegistry();
export default ModelRegistry;
