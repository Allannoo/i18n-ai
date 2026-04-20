import { describe, it, expect } from 'vitest';
import { createBatches, needsTranslation, sleep } from '../src/utils/batch';
import { TranslationString } from '../src/types';

describe('Batch Utils', () => {
  const testStrings: TranslationString[] = [
    { key: 'title', value: 'Welcome' },
    { key: 'button', value: 'Click' },
    { key: 'error', value: 'Error' },
    { key: 'msg1', value: 'Message 1' },
    { key: 'msg2', value: 'Message 2' }
  ];

  describe('createBatches', () => {
    it('should split strings into batches', () => {
      const batches = createBatches(testStrings, ['ru', 'de'], 2);
      
      expect(batches).toHaveLength(6); // 6 batches: 3 for ru (2+2+1), 3 for de (2+2+1)
      
      // First batch should have 2 strings
      expect(batches[0].strings).toHaveLength(2);
      expect(batches[0].targetLang).toBe('ru');
      
      // Last batch should have 1 string
      expect(batches[batches.length - 1].strings).toHaveLength(1);
    });

    it('should handle empty strings array', () => {
      const batches = createBatches([], ['ru']);
      expect(batches).toHaveLength(0);
    });

    it('should use default batch size of 20', () => {
      const largeArray: TranslationString[] = Array.from({ length: 50 }, (_, i) => ({
        key: `key${i}`,
        value: `value${i}`
      }));

      const batches = createBatches(largeArray, ['ru']);
      
      // 50 strings / 20 per batch = 3 batches (20 + 20 + 10)
      expect(batches).toHaveLength(3);
    });
  });

  describe('needsTranslation', () => {
    it('should return false for empty strings', () => {
      expect(needsTranslation('')).toBe(false);
      expect(needsTranslation('   ')).toBe(false);
    });

    it('should return false for pure numbers', () => {
      expect(needsTranslation('123')).toBe(false);
      expect(needsTranslation('  456  ')).toBe(false);
    });

    it('should return true for translatable strings', () => {
      expect(needsTranslation('Hello')).toBe(true);
      expect(needsTranslation('Welcome message')).toBe(true);
      expect(needsTranslation('Привет')).toBe(true);
    });
  });

  describe('sleep', () => {
    it('should wait for specified milliseconds', async () => {
      const start = Date.now();
      await sleep(50);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(45); // Allow some tolerance
    });
  });
});
