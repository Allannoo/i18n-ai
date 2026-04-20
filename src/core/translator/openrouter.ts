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

  static readonly DEFAULT_MODEL = 'openai/gpt-oss-120b:free';

  constructor(apiKey?: string, model?: string) {
    super();
    
    const key = apiKey || process.env.OPENROUTER_API_KEY;
    if (!key) {
      throw new Error(
        'OpenRouter API key not found. Set OPENROUTER_API_KEY environment variable or pass it as argument.'
      );
    }
    
    this.client = new OpenRouter({ apiKey: key });
    this.model = model || OpenRouterProvider.DEFAULT_MODEL;
  }

  async translate(batch: TranslationBatch, context?: string): Promise<TranslationResult[]> {
    const strings = batch.strings.map(s => ({ key: s.key, value: s.value }));
    
    const userPrompt = this.createUserPrompt(
      strings,
      batch.targetLang,
      context
    );

    try {
      const result = await this.client.chat.send({
        chatRequest: {
          model: this.model,
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          stream: false as const,
        },
        httpReferer: 'https://github.com/Allannoo/i18n-ai',
        appTitle: 'i18n-ai',
      });

      const content = result.choices?.[0]?.message?.content;
      
      if (!content || typeof content !== 'string') {
        logger.warn('Empty response from OpenRouter');
        return [];
      }

      return this.parseTranslationResponse(content, strings, batch.targetLang);

    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error('Unknown error');
      const statusCode = (error as { statusCode?: number }).statusCode;
      
      if (statusCode === 429) {
        logger.warn(`OpenRouter rate limit (${this.model}): ${err.message}`);
      } else {
        logger.error(`OpenRouter API error (${this.model}): ${err.message}`);
      }
      throw err;
    }
  }

  async checkAvailability(): Promise<boolean> {
    try {
      const result = await this.client.chat.send({
        chatRequest: {
          model: this.model,
          messages: [{ role: 'user', content: 'ping' }],
          stream: false as const,
        },
        httpReferer: 'https://github.com/Allannoo/i18n-ai',
        appTitle: 'i18n-ai',
      });
      return !!result.choices?.[0]?.message?.content;
    } catch {
      return false;
    }
  }
}

export default OpenRouterProvider;
