import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QwenProvider } from '../src/core/translator/qwen';
import { GeminiProvider } from '../src/core/translator/gemini';
import { BaseTranslationProvider } from '../src/core/translator/base';

// Мокаем fetch глобально
global.fetch = vi.fn();

describe('BaseTranslationProvider', () => {
  class TestProvider extends BaseTranslationProvider {
    readonly name: 'qwen' = 'qwen';
    
    async translate() {
      return [];
    }
  }

  it('should create user prompt with context', () => {
    const provider = new TestProvider();
    const strings = [
      { key: 'title', value: 'Welcome' },
      { key: 'button', value: 'Click me' }
    ];

    const prompt = provider['createUserPrompt'](strings, 'ru', 'Main screen');
    
    expect(prompt).toContain('Translate the following UI strings to ru');
    expect(prompt).toContain('Context: Main screen');
    expect(prompt).toContain('Welcome');
    expect(prompt).toContain('Click me');
  });

  it('should create user prompt with context rules', () => {
    const provider = new TestProvider();
    const strings = [{ key: 'save_btn', value: 'Save' }];
    const contextRules = {
      button: 'Translate as verb-command, short'
    };

    const prompt = provider['createUserPrompt'](strings, 'de', undefined, contextRules);
    
    expect(prompt).toContain('Translation rules:');
    expect(prompt).toContain('For button: Translate as verb-command, short');
  });

  it('should parse translation response from JSON', () => {
    const provider = new TestProvider();
    const originalStrings = [
      { key: 'title', value: 'Welcome' },
      { key: 'button', value: 'Save' }
    ];
    const response = `[
      {"key": "title", "translated": "Добро пожаловать"},
      {"key": "button", "translated": "Сохранить"}
    ]`;

    const results = provider['parseTranslationResponse'](response, originalStrings, 'ru');
    
    expect(results).toHaveLength(2);
    expect(results[0].key).toBe('title');
    expect(results[0].translated).toBe('Добро пожаловать');
    expect(results[0].targetLang).toBe('ru');
  });

  it('should handle response with extra text', () => {
    const provider = new TestProvider();
    const originalStrings = [{ key: 'title', value: 'Welcome' }];
    const response = `Here is the translation:
    [{"key": "title", "translated": "Добро пожаловать"}]
    Hope this helps!`;

    const results = provider['parseTranslationResponse'](response, originalStrings, 'ru');
    
    expect(results).toHaveLength(1);
    expect(results[0].translated).toBe('Добро пожаловать');
  });
});

describe('QwenProvider', () => {
  let provider: QwenProvider;

  beforeEach(() => {
    vi.stubEnv('QWEN_API_KEY', 'test-key');
    provider = new QwenProvider();
  });

  it('should initialize with default model', () => {
    expect(provider).toBeDefined();
    expect(provider.name).toBe('qwen');
  });

  it('should throw error without API key', () => {
    vi.unstubAllEnvs();
    expect(() => new QwenProvider()).toThrow('Qwen API key not found');
  });

  it('should handle quota exceeded error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ code: 'QuotaExceeded', message: 'Quota exceeded' })
    } as any);

    const batch = {
      strings: [{ key: 'title', value: 'Welcome' }],
      targetLang: 'ru'
    };

    await expect(provider.translate(batch)).rejects.toThrow();
  });
});

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    vi.stubEnv('GEMINI_API_KEY', 'test-key');
    provider = new GeminiProvider();
  });

  it('should initialize with default model', () => {
    expect(provider).toBeDefined();
    expect(provider.name).toBe('gemini');
  });

  it('should throw error without API key', () => {
    vi.unstubAllEnvs();
    expect(() => new GeminiProvider()).toThrow('Gemini API key not found');
  });

  it('should handle rate limit error', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: 'Rate limit exceeded' } })
    } as any);

    const batch = {
      strings: [{ key: 'title', value: 'Welcome' }],
      targetLang: 'ru'
    };

    await expect(provider.translate(batch)).rejects.toThrow();
  });
});
