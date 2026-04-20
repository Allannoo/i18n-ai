import { describe, it, expect, beforeAll } from 'vitest';
import { OpenRouterProvider } from '../src/core/translator/openrouter';
import { TranslationBatch } from '../src/types';
import * as dotenv from 'dotenv';

dotenv.config();

const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY;

/**
 * Интеграционные тесты с реальным OpenRouter API
 * Запуск: npx vitest run tests/integration.test.ts
 * Требует OPENROUTER_API_KEY в .env
 */
describe.skipIf(!OPENROUTER_KEY)('OpenRouter Integration', () => {
  let provider: OpenRouterProvider;

  beforeAll(() => {
    provider = new OpenRouterProvider(OPENROUTER_KEY);
  });

  it('должен проверить доступность API', async () => {
    const available = await provider.checkAvailability();
    expect(available).toBe(true);
  }, 30000);

  it('должен перевести одну строку на русский', async () => {
    const batch: TranslationBatch = {
      strings: [{ key: 'greeting', value: 'Hello, world!' }],
      targetLang: 'ru',
    };

    const results = await provider.translate(batch);
    
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe('greeting');
    expect(results[0].translated).toBeTruthy();
    expect(results[0].targetLang).toBe('ru');
    // Проверяем что перевод содержит кириллицу
    expect(results[0].translated).toMatch(/[а-яёА-ЯЁ]/);
    console.log(`  ✅ "Hello, world!" → "${results[0].translated}"`);
  }, 30000);

  it('должен перевести несколько строк на немецкий', async () => {
    const batch: TranslationBatch = {
      strings: [
        { key: 'save_btn', value: 'Save' },
        { key: 'cancel_btn', value: 'Cancel' },
        { key: 'delete_btn', value: 'Delete' },
      ],
      targetLang: 'de',
    };

    const results = await provider.translate(batch);
    
    expect(results).toHaveLength(3);
    results.forEach(r => {
      expect(r.translated).toBeTruthy();
      expect(r.targetLang).toBe('de');
    });
    console.log(`  ✅ Переводы на немецкий:`);
    results.forEach(r => console.log(`     "${r.key}": "${r.translated}"`));
  }, 30000);

  it('должен перевести с контекстом', async () => {
    const batch: TranslationBatch = {
      strings: [
        { key: 'bank', value: 'bank' },
      ],
      targetLang: 'ru',
    };

    const results = await provider.translate(batch, 'Financial application, banking context');
    
    expect(results).toHaveLength(1);
    expect(results[0].translated).toBeTruthy();
    console.log(`  ✅ "bank" (финансовый контекст) → "${results[0].translated}"`);
  }, 30000);

  it('должен работать с другой моделью (llama) или получить rate limit', async () => {
    const llamaProvider = new OpenRouterProvider(OPENROUTER_KEY, 'meta-llama/llama-3.3-70b-instruct:free');
    
    const batch: TranslationBatch = {
      strings: [{ key: 'title', value: 'Welcome to our app' }],
      targetLang: 'es',
    };

    try {
      const results = await llamaProvider.translate(batch);
      expect(results).toHaveLength(1);
      expect(results[0].translated).toBeTruthy();
      console.log(`  ✅ Llama: "Welcome to our app" → "${results[0].translated}" (es)`);
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 429) {
        console.log('  ⚠️ Llama rate limited (429) — ожидаемо для free tier');
      } else {
        throw error;
      }
    }
  }, 30000);

  it('должен работать с третьей моделью (qwen) или получить rate limit', async () => {
    const qwenProvider = new OpenRouterProvider(OPENROUTER_KEY, 'qwen/qwen3-next-80b-a3b-instruct:free');
    
    const batch: TranslationBatch = {
      strings: [{ key: 'logout', value: 'Log out' }],
      targetLang: 'fr',
    };

    try {
      const results = await qwenProvider.translate(batch);
      expect(results).toHaveLength(1);
      expect(results[0].translated).toBeTruthy();
      console.log(`  ✅ Qwen: "Log out" → "${results[0].translated}" (fr)`);
    } catch (error: unknown) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 429) {
        console.log('  ⚠️ Qwen rate limited (429) — ожидаемо для free tier');
      } else {
        throw error;
      }
    }
  }, 30000);
});
