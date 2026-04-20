import { TranslationBatch, TranslationResult } from '../../types';
import { BaseTranslationProvider } from './base';
import { logger } from '../../utils/logger';

/**
 * OpenRouter провайдер для перевода (поддерживает Gemma 4, Llama, Mistral и др.)
 * API совместим с OpenAI
 */
export class OpenRouterProvider extends BaseTranslationProvider {
  readonly name: 'openrouter' = 'openrouter';
  
  private apiKey: string;
  private model: string;
  private baseUrl: string = 'https://openrouter.ai/api/v1';

  private static readonly MODELS = [
    { code: 'google/gemma-3-27b-it:free', priority: 1 },
    { code: 'google/gemma-3-12b-it:free', priority: 2 },
    { code: 'meta-llama/llama-4-maverick:free', priority: 3 },
    { code: 'mistralai/mistral-small-3.1-24b-instruct:free', priority: 4 },
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
    
    this.apiKey = key;
    this.model = model || OpenRouterProvider.MODELS[0].code;
  }

  /**
   * Переводит батч строк используя OpenRouter API
   */
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
        
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
            'HTTP-Referer': 'https://github.com/Allannoo/i18n-ai',
            'X-Title': 'i18n-ai'
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
          
          if (response.status === 429) {
            logger.warn(`Model ${currentModel.code} rate limit exceeded. Switching...`);
            this.switchToNextModel();
            lastError = new Error('Rate limit exceeded');
            continue;
          }
          
          throw new Error(`OpenRouter API error: ${response.status} ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        
        if (!content) {
          logger.warn('Empty response from OpenRouter');
          return [];
        }

        return this.parseTranslationResponse(content, strings, batch.targetLang);

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (lastError.message.includes('rate limit') || lastError.message.includes('429')) {
          this.switchToNextModel();
          continue;
        }
        
        if (lastError.message.includes('unavailable') || lastError.message.includes('503')) {
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

export default OpenRouterProvider;
