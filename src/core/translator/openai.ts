import OpenAI from 'openai';
import { TranslationBatch, TranslationResult } from '../../types';
import { BaseTranslationProvider } from './base';
import { logger } from '../../utils/logger';

/**
 * OpenAI провайдер для перевода
 */
export class OpenAIProvider extends BaseTranslationProvider {
  readonly name: 'openai' = 'openai';
  
  private client: OpenAI;
  private model: string;

  constructor(apiKey?: string, model: string = 'gpt-4o-mini') {
    super();
    
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error(
        'OpenAI API key not found. Set OPENAI_API_KEY environment variable or pass it as argument.'
      );
    }
    
    this.client = new OpenAI({ apiKey: key });
    this.model = model;
  }

  /**
   * Переводит батч строк используя OpenAI
   */
  async translate(batch: TranslationBatch, context?: string): Promise<TranslationResult[]> {
    const strings = batch.strings.map(s => ({ key: s.key, value: s.value }));
    
    const userPrompt = this.createUserPrompt(
      strings,
      batch.targetLang,
      context
    );

    try {
      const response = await this.client.chat.completions.create({
        model: this.model,
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
        max_tokens: 2000
      });

      const content = response.choices[0]?.message?.content;
      
      if (!content) {
        logger.warn('Empty response from OpenAI');
        return [];
      }

      return this.parseTranslationResponse(content, strings, batch.targetLang);

    } catch (error) {
      if (error instanceof Error) {
        logger.error(`OpenAI API error: ${error.message}`);
        
        // Проверяем на ошибки rate limiting
        if (error.message.includes('rate limit')) {
          logger.warn('Rate limit exceeded. Consider reducing batch size or adding delays.');
        }
      }
      
      throw error;
    }
  }

  /**
   * Проверяет доступность API
   */
  async checkAvailability(): Promise<boolean> {
    try {
      await this.client.models.list();
      return true;
    } catch {
      return false;
    }
  }
}

export default OpenAIProvider;
