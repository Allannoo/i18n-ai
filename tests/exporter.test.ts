import { describe, it, expect } from 'vitest';
import { exportToJson, importFromJson } from '../src/core/exporter/json';
import { exportToArb, importFromArb } from '../src/core/exporter/arb';
import { exportToXml, importFromXml } from '../src/core/exporter/xml';
import { exportToStrings, importFromStrings } from '../src/core/exporter/strings';

describe('JSON Exporter', () => {
  const testData = {
    title: 'Welcome',
    button: {
      save: 'Save',
      cancel: 'Cancel'
    },
    messages: {
      error: 'An error occurred'
    }
  };

  it('should export to JSON string', () => {
    const json = exportToJson(testData);
    const parsed = JSON.parse(json);
    
    expect(parsed.title).toBe('Welcome');
    expect(parsed.button.save).toBe('Save');
    expect(parsed.messages.error).toBe('An error occurred');
  });

  it('should import from JSON string', () => {
    const json = JSON.stringify(testData, null, 2);
    const imported = importFromJson(json);
    
    expect(imported).toEqual(testData);
  });
});

describe('ARB Exporter (Flutter)', () => {
  const testData = {
    title: 'Welcome',
    button_save: 'Save'
  };

  it('should export to ARB format with metadata', () => {
    const arb = exportToArb(testData, 'en');
    const parsed = JSON.parse(arb);
    
    expect(parsed['@@locale']).toBe('en');
    expect(parsed.title).toBe('Welcome');
    expect(parsed['@title']).toBeDefined();
    expect(parsed['@title'].description).toContain('title');
  });

  it('should import from ARB format', () => {
    const arb = `{
      "@@locale": "en",
      "title": "Welcome",
      "@title": {
        "description": "Main title"
      },
      "button_save": "Save"
    }`;

    const imported = importFromArb(arb);
    
    expect(imported.title).toBe('Welcome');
    expect(imported.button_save).toBe('Save');
    expect(imported['@title']).toBeUndefined();
  });
});

describe('XML Exporter (Android)', () => {
  const testData = {
    app_name: 'My App',
    welcome: 'Welcome!',
    button_save: 'Save'
  };

  it('should export to strings.xml format', () => {
    const xml = exportToXml(testData);
    
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain('<resources>');
    expect(xml).toContain('<string name="app_name">My App</string>');
    expect(xml).toContain('<string name="welcome">Welcome!</string>');
    expect(xml).toContain('<string name="button_save">Save</string>');
  });

  it('should escape special XML characters', () => {
    const data = {
      message: 'Tom & Jerry',
      symbol: '<test>'
    };
    
    const xml = exportToXml(data);
    
    expect(xml).toContain('Tom &amp; Jerry');
    expect(xml).toContain('&lt;test&gt;');
  });

  it('should import from strings.xml', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<resources>
    <string name="app_name">My App</string>
    <string name="welcome">Welcome!</string>
</resources>`;

    const imported = importFromXml(xml);
    
    expect(imported.app_name).toBe('My App');
    expect(imported.welcome).toBe('Welcome!');
  });
});

describe('Strings Exporter (iOS)', () => {
  const testData = {
    welcome: 'Welcome',
    button_save: 'Save',
    greeting: 'Hello, World!'
  };

  it('should export to .strings format', () => {
    const strings = exportToStrings(testData, 'en');
    
    expect(strings).toContain('"welcome" = "Welcome";');
    expect(strings).toContain('"button_save" = "Save";');
    expect(strings).toContain('"greeting" = "Hello, World!";');
  });

  it('should escape special characters', () => {
    const data = {
      message: 'Hello\nWorld',
      quote: 'Say "Hello"'
    };
    
    const strings = exportToStrings(data);
    
    expect(strings).toContain('"message" = "Hello\\nWorld";');
    expect(strings).toContain('"quote" = "Say \\"Hello\\"";');
  });

  it('should import from .strings', () => {
    const content = `
"welcome" = "Welcome";
"button_save" = "Save";
"greeting" = "Hello, World!";
`;

    const imported = importFromStrings(content);
    
    expect(imported.welcome).toBe('Welcome');
    expect(imported.button_save).toBe('Save');
    expect(imported.greeting).toBe('Hello, World!');
  });
});
