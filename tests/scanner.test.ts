import { describe, it, expect } from 'vitest';
import { extractStringsFromObject } from '../src/core/scanner/react';
import { extractStringsFromArb } from '../src/core/scanner/flutter';
import { parseStringsXml } from '../src/core/scanner/android';
import { parseStringsFile } from '../src/core/scanner/ios';

describe('JSON Scanner (React/Vue)', () => {
  it('should extract strings from flat object', () => {
    const obj = {
      title: 'Welcome',
      button: 'Click me',
      count: 42
    };

    const strings = extractStringsFromObject(obj);
    
    expect(strings).toHaveLength(2);
    expect(strings.find(s => s.key === 'title')?.value).toBe('Welcome');
    expect(strings.find(s => s.key === 'button')?.value).toBe('Click me');
  });

  it('should extract strings from nested object', () => {
    const obj = {
      common: {
        title: 'Welcome',
        button: {
          save: 'Save',
          cancel: 'Cancel'
        }
      },
      errors: {
        notFound: 'Page not found'
      }
    };

    const strings = extractStringsFromObject(obj);
    
    expect(strings).toHaveLength(4);
    expect(strings.find(s => s.key === 'common.title')?.value).toBe('Welcome');
    expect(strings.find(s => s.key === 'common.button.save')?.value).toBe('Save');
    expect(strings.find(s => s.key === 'errors.notFound')?.value).toBe('Page not found');
  });

  it('should skip URLs', () => {
    const obj = {
      title: 'Welcome',
      website: 'https://example.com',
      api: 'http://api.example.com'
    };

    const strings = extractStringsFromObject(obj);
    
    expect(strings).toHaveLength(1);
    expect(strings[0].key).toBe('title');
  });

  it('should infer context from key names', () => {
    const obj = {
      saveButton: 'Save',
      errorMessage: 'Error occurred',
      pageTitle: 'Home',
      nameLabel: 'Name'
    };

    const strings = extractStringsFromObject(obj);
    
    expect(strings.find(s => s.key === 'saveButton')?.context).toBe('button');
    expect(strings.find(s => s.key === 'errorMessage')?.context).toBe('error');
    expect(strings.find(s => s.key === 'pageTitle')?.context).toBe('title');
    expect(strings.find(s => s.key === 'nameLabel')?.context).toBe('label');
  });
});

describe('ARB Scanner (Flutter)', () => {
  it('should extract strings from ARB format', () => {
    const arb = {
      '@@locale': 'en',
      'title': 'Welcome',
      '@title': {
        'description': 'Main page title'
      },
      'button_save': 'Save',
      'count': 42
    };

    const strings = extractStringsFromArb(arb);
    
    expect(strings).toHaveLength(2);
    expect(strings.find(s => s.key === 'title')?.value).toBe('Welcome');
    expect(strings.find(s => s.key === 'title')?.context).toBe('Main page title');
    expect(strings.find(s => s.key === 'button_save')?.value).toBe('Save');
  });

  it('should skip metadata keys', () => {
    const arb = {
      'greeting': 'Hello',
      '@greeting': {
        'type': 'text'
      }
    };

    const strings = extractStringsFromArb(arb);
    
    expect(strings).toHaveLength(1);
    expect(strings[0].key).toBe('greeting');
  });
});

describe('XML Scanner (Android)', () => {
  it('should parse strings.xml format', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<resources>
    <string name="app_name">My App</string>
    <string name="welcome">Welcome!</string>
    <string name="button_save">Save</string>
</resources>`;

    const strings = parseStringsXml(xml, 'strings.xml');
    
    expect(strings).toHaveLength(3);
    expect(strings.find(s => s.key === 'app_name')?.value).toBe('My App');
    expect(strings.find(s => s.key === 'welcome')?.value).toBe('Welcome!');
    expect(strings.find(s => s.key === 'button_save')?.value).toBe('Save');
  });

  it('should parse plurals', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<resources>
    <plurals name="items">
        <item quantity="one">%d item</item>
        <item quantity="other">%d items</item>
    </plurals>
</resources>`;

    const strings = parseStringsXml(xml, 'strings.xml');
    
    expect(strings).toHaveLength(2);
    expect(strings.find(s => s.key === 'items_one')?.value).toBe('%d item');
    expect(strings.find(s => s.key === 'items_other')?.value).toBe('%d items');
  });

  it('should parse string arrays', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<resources>
    <string-array name="plans">
        <item>Free</item>
        <item>Pro</item>
        <item>Enterprise</item>
    </string-array>
</resources>`;

    const strings = parseStringsXml(xml, 'strings.xml');
    
    expect(strings).toHaveLength(3);
    expect(strings[0].key).toBe('plans_0');
    expect(strings[0].value).toBe('Free');
  });
});

describe('Strings Scanner (iOS)', () => {
  it('should parse .strings format', () => {
    const content = `// en.strings
"welcome" = "Welcome";
"button_save" = "Save";
"greeting" = "Hello, World!";`;

    const strings = parseStringsFile(content, 'en.strings');
    
    expect(strings).toHaveLength(3);
    expect(strings.find(s => s.key === 'welcome')?.value).toBe('Welcome');
    expect(strings.find(s => s.key === 'button_save')?.value).toBe('Save');
  });

  it('should handle escaped characters', () => {
    const content = `
"message" = "Hello\\nWorld";
"quote" = "Say \\"Hello\\"";
`;

    const strings = parseStringsFile(content, 'en.strings');
    
    expect(strings.find(s => s.key === 'message')?.value).toBe('Hello\nWorld');
    expect(strings.find(s => s.key === 'quote')?.value).toBe('Say "Hello"');
  });
});
