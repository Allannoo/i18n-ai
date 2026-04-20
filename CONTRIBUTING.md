# Contributing to i18n-ai

Спасибо за интерес к проекту! Любая помощь приветствуется.

## 📋 Как помочь

### 1. Сообщить о баге

1. Проверьте существующие issues
2. Создайте новый issue с:
   - Чётким описанием проблемы
   - Шагами для воспроизведения
   - Ожидаемым и фактическим результатом
   - Версией Node.js и i18n-ai

### 2. Предложить функцию

1. Проверьте существующие feature requests
2. Создайте issue с описанием:
   - Какую проблему решает функция
   - Примеры использования
   - Возможные альтернативы

### 3. Написать код

#### Настройка окружения

```bash
git clone https://github.com/your-username/i18n-ai.git
cd i18n-ai
npm install
npm run dev
```

#### Запуск тестов

```bash
npm test
npm test -- --watch  # watch mode
```

#### Сборка

```bash
npm run build
```

#### Проверка типов

```bash
npm run typecheck
```

### 4. Улучшить документацию

- Исправление опечаток
- Добавление примеров
- Перевод на другие языки

## 📝 Pull Request Process

1. Fork репозиторий
2. Создайте ветку (`git checkout -b feature/amazing-feature`)
3. Внесите изменения
4. Добавьте тесты для новых функций
5. Убедитесь что все тесты проходят
6. Отправьте PR (`git push origin feature/amazing-feature`)

### Требования к коду

- TypeScript со строгими типами
- Async/await вместо callbacks
- Обработка ошибок с понятными сообщениями
- Файлы не длиннее 200 строк
- JSDoc для публичных функций

### Стиль коммитов

```
feat: добавить поддержку нового формата
fix: исправить ошибку парсинга ARB
docs: обновить README
test: добавить тесты для сканера
refactor: улучшить структуру кода
```

## 🧪 Тестирование

### Запуск всех тестов

```bash
npm test
```

### Запуск конкретного файла

```bash
npm test -- tests/scanner.test.ts
```

### Watch mode

```bash
npm test -- --watch
```

### Coverage

```bash
npm test -- --coverage
```

## 💬 Общение

- GitHub Issues — для багов и фич
- GitHub Discussions — для вопросов
- Email — для личных сообщений

## 📜 License

MIT — см. [LICENSE](LICENSE)

---

**Спасибо за вклад! 🙏**
