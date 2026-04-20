import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OpenRouterProvider } from '../src/core/translator/openrouter';
import { BaseTranslationProvider } from '../src/core/translator/base';

describe('BaseTranslationProvider', () => {
  class TestProvider extends BaseTranslationProvider {
    readonly name: 'openrouter' = 'openrouter';
    async translate() { return []; }
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
    const contextRules = { button: 'Translate as verb-command, short' };
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

describe('OpenRouterProvider', () => {
  let provider: OpenRouterProvider;

  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-key');
    provider = new OpenRouterProvider();
  });

  it('should initialize with default model', () => {
    expect(provider).toBeDefined();
    expect(provider.name).toBe('openrouter');
  });

  it('should throw error without API key', () => {
    vi.unstubAllEnvs();
    expect(() => new OpenRouterProvider()).toThrow('OpenRouter API key not found');
  });

  it('should accept custom API key', () => {
    vi.unstubAllEnvs();
    const p = new OpenRouterProvider('custom-key');
    expect(p).toBeDefined();
    expect(p.name).toBe('openrouter');
  });

  it('should handle API error gracefully', async () => {
    const batch = { strings: [{ key: 'title', value: 'Welcome' }], targetLang: 'ru' };
    // The SDK will throw because the key is fake
    await expect(provider.translate(batch)).rejects.toThrow();
  });
});
