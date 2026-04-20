# 🌍 i18n-ai
> AI-powered localization CLI for Flutter, React, Vue, Android & iOS

[![npm version](https://img.shields.io/npm/v/i18n-ai.svg)](https://www.npmjs.com/package/i18n-ai)
[![downloads/month](https://img.shields.io/npm/dm/i18n-ai.svg)](https://www.npmjs.com/package/i18n-ai)
[![license](https://img.shields.io/npm/l/i18n-ai.svg)](https://github.com/Allannoo/i18n-ai/blob/main/LICENSE)
[![CI status](https://github.com/Allannoo/i18n-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Allannoo/i18n-ai/actions)

Автоматически сканирует исходный код вашего приложения, находит строки для перевода и переводит их на нужные языки с помощью ИИ (Qwen, Gemini, OpenAI, Anthropic).

## ⚡ Быстрый старт

```bash
npm install -g i18n-ai
i18n-ai init
i18n-ai scan
i18n-ai translate --lang ru,de,zh
```

## 📋 Возможности

### 🔍 Сканирование исходного кода
Утилита сканирует файлы вашего проекта и автоматически находит строки для перевода:

| Язык | Файлы | Примеры строк |
|------|-------|---------------|
| **Dart** | `.dart` | `S('Hello')`, `AppLocalizations.of(context).title` |
| **JavaScript/TypeScript** | `.js`, `.ts`, `.jsx`, `.tsx` | `t('welcome')`, `i18n.t('button.save')` |
| **Java** | `.java` | `getString(R.string.welcome)`, `"Hello"` |
| **Kotlin** | `.kt`, `.kts` | `getString(R.string.title)`, `"Welcome"` |
| **Swift** | `.swift`, `.xib` | `NSLocalizedString("key")`, `Text("Hello")` |
| **Vue** | `.vue` | `$t('home.title')`, `i18n.t('message')` |

### 🤖 Мульти-провайдер AI с failover
- **Qwen** (Alibaba) — 6 моделей, 1M токенов бесплатно
- **Gemini** (Google) — 4 модели, бесплатные лимиты
- **OpenAI** — gpt-4o-mini, gpt-4o
- **Anthropic** — Claude Haiku, Sonnet

Автоматическое переключение при исчерпании лимитов или ошибках.

### 📁 Поддерживаемые форматы
- **JSON** (React, Vue, Next.js, Nuxt, React Native)
- **ARB** (Flutter)
- **XML** (Android strings.xml)
- **.strings** (iOS/macOS)

## 🚀 Использование

### 1. Инициализация

```bash
i18n-ai init
```

Мастер задаст вопросы:
- Какой фреймворк? (Flutter, React, Vue, Android, iOS)
- Исходный язык? (по умолчанию en)
- Какие языки добавить? (мультивыбор)
- Где хранить файлы переводов?
- Какой AI провайдер? (Qwen, Gemini, OpenAI, Anthropic)

Создаётся файл `i18n.config.json`.

### 2. Сканирование

```bash
# Сканировать весь проект (исходный код + файлы переводов)
i18n-ai scan

# Сканировать конкретную папку
i18n-ai scan --path ./src

# Только файлы переводов
i18n-ai scan --source false

# Сохранить отчёт в JSON
i18n-ai scan --output report.json
```

**Результат сканирования:**
```
  ┌────────────────────────────────────────────┐
  │  Found files:                           15 │
  │  Total strings:                        342 │
  │  ✅ Translated:                        280 │
  │  ⚠️  Need translation:                 62 │
  └────────────────────────────────────────────┘

  🌍 Translation Progress by Language

  🇷🇺 ru  ██████████████████████░░░░░░  82%  (280/342)
  🇩🇪 de  ████████████████░░░░░░░░░░░░  58%  (198/342)
  🇨🇳 zh  ██████████░░░░░░░░░░░░░░░░░░  34%  (116/342)
```

### 3. Перевод

```bash
# Перевести на русский и немецкий
i18n-ai translate --lang ru,de

# Выбрать конкретную модель
i18n-ai translate --model qwen3-max

# Предварительный просмотр (без перевода)
i18n-ai translate --dry-run

# Переводить даже переведённые строки
i18n-ai translate --force
```

**Процесс перевода:**
```
  [████████████████████████████████████░░░░] 85% | Batch 17/20
```

### 4. Проверка качества

```bash
# Проверить все переводы
i18n-ai check

# Проверить с строгим режимом (ошибки на предупреждения)
i18n-ai check --strict
```

Проверяет:
- ❌ Пустые переводы
- ❌ Отсутствующие placeholder'ы (`{name}`, `%s`)
- ⚠️ Слишком длинные переводы (>2x оригинала)
- ⚠️ Непереведённые строки

### 5. Статус переводов

```bash
i18n-ai status
```

```
  ┌─────────────────────────────────────────────────┐
  │  Source Language:                            en │
  │  Total Keys:                                342 │
  └─────────────────────────────────────────────────┘

  Language Progress:

    🇷🇺 ru  █████████████████████████  82%  ( 280/ 342)  ✅
    🇩🇪 de  ██████████████████░░░░░░░  58%  ( 198/ 342)  🟢
    🇨🇳 zh  ███████████░░░░░░░░░░░░░░  34%  ( 116/ 342)  🟠
```

### 6. Экспорт в другой формат

```bash
# Экспорт в ARB (Flutter)
i18n-ai export --format arb

# Экспорт в XML (Android)
i18n-ai export --format xml --out ./android/app/res

# Экспорт в .strings (iOS)
i18n-ai export --format strings --out ./ios/Runner
```

## ⚙️ Конфигурация

### i18n.config.json

```json
{
  "framework": "react",
  "sourceLang": "en",
  "targetLangs": ["ru", "de", "zh", "ja"],
  "localesDir": "./public/locales",
  "provider": "qwen",
  "model": "qwen3-max",
  "contextRules": {
    "button": "Translate as short verb-command",
    "error": "Translate as problem description",
    "title": "Translate with capital letter"
  },
  "ignore": ["node_modules", ".git", "build", "dist"]
}
```

### Поддерживаемые провайдеры

| Провайдер | Модели | Бесплатный лимит |
|-----------|--------|-----------------|
| **Qwen** | qwen3-max, qwen-plus, qwen2.5-7b | 1M токенов |
| **Gemini** | gemini-3.1-flash-lite, gemini-2.5-flash | 15 RPM, 500 RPD |
| **OpenAI** | gpt-4o-mini, gpt-4o | Платно |
| **Anthropic** | claude-haiku, claude-sonnet | Платно |

### Переменные окружения

```bash
# Обязательно (хотя бы один)
QWEN_API_KEY=sk-...
GEMINI_API_KEY=AIzaSy...
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

## 🔧 Примеры использования

### Flutter проект

```bash
# 1. Инициализация
i18n-ai init
# Выбрать: Flutter, en → [ru, de], ./lib/l10n, Qwen

# 2. Сканировать ARB файлы и исходный код Dart
i18n-ai scan

# 3. Перевести
export QWEN_API_KEY="sk-..."
i18n-ai translate --lang ru,de

# 4. Проверить
i18n-ai check

# 5. Экспорт (если нужно)
i18n-ai export --format arb
```

### React / Next.js проект

```bash
# 1. Инициализация
i18n-ai init
# Выбрать: React, en → [ru, de, zh], ./public/locales, Qwen

# 2. Сканировать JSON файлы и TSX/JS исходный код
i18n-ai scan

# 3. Перевести
i18n-ai translate --lang ru,de,zh

# 4. Статус
i18n-ai status
```

### Android проект

```bash
# 1. Инициализация
i18n-ai init
# Выбрать: Android, en → [ru, es, fr], ./res/values, Gemini

# 2. Сканировать strings.xml и Java/Kotlin код
i18n-ai scan

# 3. Перевести
export GEMINI_API_KEY="AIzaSy..."
i18n-ai translate --lang ru,es,fr

# 4. Экспорт в XML
i18n-ai export --format xml
```

## 📊 Приоритет моделей и failover

Инструмент использует умную систему переключения:

```
1. Qwen (qwen3-max) → лимит → Qwen (qwen-plus) → лимит → Qwen (qwen2.5-7b)
2. Если все Qwen исчерпаны → Gemini (3.1 Flash Lite) → лимит → Gemini (2.5 Flash Lite)
3. Если все модели недоступны → сообщение с контактом поддержки
```

**Автоматический сброс лимитов:**
- Минутные счётчики (RPM) сбрасываются каждую минуту
- Дневные счётчики (RPD) сбрасываются в полночь

## 💰 Планы

| План | Цена | Строки/месяц | Языки |
|------|------|--------------|-------|
| 🆓 Free | $0 | 500 | 3 |
| 🚀 Indie | $7/мес | 5,000 | 10 |
| 👥 Team | $19/мес | 25,000 | Все |
| 🏢 Business | $49/мес | 100,000 | Все + API |

**Self-Hosted** — используйте свои API ключи без ограничений.

## 🤝 Contributing

```bash
git clone https://github.com/Allannoo/i18n-ai.git
cd i18n-ai
npm install
npm run dev
```

См. [CONTRIBUTING.md](CONTRIBUTING.md)

## 📧 Поддержка

При возникновении проблем:
- **Email:** 92_92alan@mail.ru
- **GitHub Issues:** https://github.com/Allannoo/i18n-ai/issues

## 📄 License

MIT

---

**Создано с ❤️ для разработчиков по всему миру 🌍**
