import { TranslationBatch, TranslationResult } from '../../types';
import { BaseTranslationProvider } from './base';
import { logger } from '../../utils/logger';
import { OpenRouter } from '@openrouter/sdk';

/**
 * OpenRouter провайдер для перевода
 * Использует официальный @openrouter/sdk
 * Модели: gpt-oss-120b, llama-3.3-70b, qwen3-next-80b (все free)
 */
export class OpenRouterProvider extends BaseTranslationProvider {
  readonly name: 'openrouter' = 'openrouter';
  
  private client: OpenRouter;
  private model: string;

  private static readonly MODELS = [
    { code: 'openai/gpt-oss-120b:free', priority: 1 },
    { code: 'meta-llama/llama-3.3-70b-instruct:free', priority: 2 },
    { code: 'qwen/qwen3-next-80b-a3b-instruct:free', priority: 3 },
  ];

  private currentModelIndex: number = 0;

  constructor(apiKey?: string, model?: string) {
    super();
    
    const key = apiKey || process.env.OPENROUTER_API_KEY;
    if (!key) {
      throw new Error(
        'OpenRouter API key not found. Set OPENROUTER_API_KEY environment variable or pass it as argument.'
      );
    }
    
    this.client = new OpenRouter({ apiKey: key });
    this.model = model || OpenRouterProvider.MODELS[0].code;
  }

  async translate(batch: TranslationBatch, context?: string): Promise<TranslationResult[]> {
    const strings = batch.strings.map(s => ({ key: s.key, value: s.value }));
    
    const userPrompt = this.createUserPrompt(
      strings,
      batch.targetLang,
      context
    );

    let lastError: Error | null = null;
    const maxRetries = OpenRouterProvider.MODELS.length;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const currentModel = this.getCurrentModel();
        
        const result = await this.client.chat.send({
          chatRequest: {
            model: currentModel.code,
            messages: [
              { role: 'system', content: this.systemPrompt },
              { role: 'user', content: userPrompt }
            ],
            temperature: 0.3,
            stream: false,
          },
          httpReferer: 'https://github.com/Allannoo/i18n-ai',
          appTitle: 'i18n-ai',
        });

        const content = (result as any).choices?.[0]?.message?.content;
        
        if (!content) {
          logger.warn('Empty response from OpenRouter');
          return [];
        }

        return this.parseTranslationResponse(content, strings, batch.targetLang);

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        const msg = lastError.message.toLowerCase();
        
        if (msg.includes('rate limit') || msg.includes('429') || msg.includes('quota')) {
          logger.warn(`Model ${this.getCurrentModel().code} rate limited. Switching...`);
          this.switchToNextModel();
          continue;
        }
        
        if (msg.includes('unavailable') || msg.includes('503') || msg.includes('502')) {
          logger.warn(`Model ${this.getCurrentModel().code} unavailable. Switching...`);
          this.switchToNextModel();
          continue;
        }
        
        logger.error(`OpenRouter API error: ${lastError.message}`);
        throw lastError;
      }
    }

    throw new Error(
      'All OpenRouter models are unavailable. ' +
      'Please contact support: 92_92alan@mail.ru'
    );
  }

  private switchToNextModel(): void {
    this.currentModelIndex = (this.currentModelIndex + 1) % OpenRouterProvider.MODELS.length;
    this.model = OpenRouterProvider.MODELS[this.currentModelIndex].code;
    logger.info(`Switched to OpenRouter model: ${this.model}`);
  }

  private getCurrentModel(): { code: string; priority: number } {
    return OpenRouterProvider.MODELS[this.currentModelIndex];
  }

  async checkAvailability(): Promise<boolean> {
    try {
      const result = await this.client.chat.send({
        chatRequest: {
          model: this.model,
          messages: [{ role: 'user', content: 'ping' }],
          stream: false,
        },
      });
      return !!(result as any).choices?.[0]?.message?.content;
    } catch {
      return false;
    }
  }
}

export default OpenRouterProvider;
