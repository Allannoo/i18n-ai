import Anthropic from '@anthropic-ai/sdk';
import { TranslationBatch, TranslationResult } from '../../types';
import { BaseTranslationProvider } from './base';
import { logger } from '../../utils/logger';

/**
 * Anthropic провайдер для перевода
 */
export class AnthropicProvider extends BaseTranslationProvider {
  readonly name: 'anthropic' = 'anthropic';
  
  private client: Anthropic;
  private model: string;

  constructor(apiKey?: string, model: string = 'claude-haiku-20240307') {
    super();
    
    const key = apiKey || process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new Error(
        'Anthropic API key not found. Set ANTHROPIC_API_KEY environment variable or pass it as argument.'
      );
    }
    
    this.client = new Anthropic({ apiKey: key });
    this.model = model;
  }

  /**
   * Переводит батч строк используя Anthropic
   */
  async translate(batch: TranslationBatch, context?: string): Promise<TranslationResult[]> {
    const strings = batch.strings.map(s => ({ key: s.key, value: s.value }));
    
    const userPrompt = this.createUserPrompt(
      strings,
      batch.targetLang,
      context
    );

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        system: this.systemPrompt,
        messages: [
          {
            role: 'user',
            content: userPrompt
          }
        ]
      });

      const content = response.content[0];
      
      if (!content || content.type !== 'text') {
        logger.warn('Empty or invalid response from Anthropic');
        return [];
      }

      return this.parseTranslationResponse(content.text, strings, batch.targetLang);

    } catch (error) {
      if (error instanceof Error) {
        logger.error(`Anthropic API error: ${error.message}`);
        
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
      await this.client.messages.create({
        model: this.model,
        max_tokens: 10,
        messages: [{ role: 'user', content: 'test' }]
      });
      return true;
    } catch {
      return false;
    }
  }
}

export default AnthropicProvider;
