import chalk from 'chalk';

const SUPPORT_EMAIL = '92_92alan@mail.ru';

/**
 * Утилиты для красивого логирования в CLI
 */

export const logger = {
  /**
   * Выводит информационное сообщение
   */
  info(message: string): void {
    console.log(`${chalk.blue('ℹ')} ${message}`);
  },

  /**
   * Выводит сообщение об успехе
   */
  success(message: string): void {
    console.log(`${chalk.green('✓')} ${message}`);
  },

  /**
   * Выводит предупреждение
   */
  warn(message: string): void {
    console.log(`${chalk.yellow('⚠')} ${message}`);
  },

  /**
   * Выводит ошибку
   */
  error(message: string): void {
    console.log(`${chalk.red('✗')} ${message}`);
  },

  /**
   * Выводит критическую ошибку с контактами поддержки
   */
  criticalError(title: string, details?: string): void {
    const boxWidth = 60;
    const horizontalLine = '═'.repeat(boxWidth);
    const doubleLine = '═'.repeat(boxWidth);
    
    console.log('');
    console.log(chalk.red.bold(`╔${doubleLine}╗`));
    console.log(chalk.red.bold(`║${' '.repeat(boxWidth)}║`));
    console.log(chalk.red.bold(`║${centerText(title, boxWidth)}║`));
    console.log(chalk.red.bold(`║${' '.repeat(boxWidth)}║`));
    
    if (details) {
      const lines = wrapText(details, boxWidth - 4);
      for (const line of lines) {
        console.log(chalk.red(`║  ${line.padEnd(boxWidth - 2)}║`));
      }
      console.log(chalk.red.bold(`║${' '.repeat(boxWidth)}║`));
    }
    
    console.log(chalk.red.bold(`║  📧 ${SUPPORT_EMAIL.padEnd(boxWidth - 6)}║`));
    console.log(chalk.red.bold(`║${' '.repeat(boxWidth)}║`));
    console.log(chalk.red.bold(`╚${doubleLine}╝`));
    console.log('');
  },

  /**
   * Выводит отладочное сообщение
   */
  debug(message: string): void {
    if (process.env.DEBUG === 'i18n-ai') {
      console.log(`${chalk.gray('[DEBUG]')} ${message}`);
    }
  },

  /**
   * Выводит заголовок секции
   */
  section(title: string): void {
    console.log(`\n${chalk.bold.cyan('━━━')} ${chalk.bold(title)} ${chalk.bold.cyan('━━━')}`);
  },

  /**
   * Выводит подзаголовок
   */
  subtitle(title: string): void {
    console.log(`\n${chalk.bold(title)}`);
  },

  /**
   * Выводит ключ-значение
   */
  kv(key: string, value: string | number): void {
    console.log(`  ${chalk.gray(key)}: ${value}`);
  },

  /**
   * Выводит список элементов
   */
  list(items: string[]): void {
    items.forEach(item => {
      console.log(`  ${chalk.gray('•')} ${item}`);
    });
  },

  /**
   * Выводит статус с emoji
   */
  status(emoji: string, message: string): void {
    console.log(`  ${emoji} ${message}`);
  },

  /**
   * Выводит сообщение о переключении модели
   */
  modelSwitch(oldModel: string, newModel: string, reason: string): void {
    console.log(
      `${chalk.yellow('⚠')} ${chalk.gray(oldModel)} → ${chalk.green(newModel)} (${reason})`
    );
  },

  /**
   * Выводит прогресс бар
   */
  progress(current: number, total: number, options?: {
    width?: number;
    prefix?: string;
  }): void {
    const width = options?.width || 30;
    const prefix = options?.prefix || '';
    
    const percentage = Math.round((current / total) * 100);
    const filled = Math.round((width * current) / total);
    const empty = width - filled;
    
    const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
    
    console.log(`\r${prefix}[${bar}] ${percentage}% (${current}/${total})`);
  }
};

/**
 * Центрирует текст в рамке
 */
function centerText(text: string, width: number): string {
  const padding = Math.floor((width - text.length) / 2);
  const rightPadding = width - text.length - padding;
  return ' '.repeat(padding) + text + ' '.repeat(rightPadding);
}

/**
 * Переносит текст на несколько строк
 */
function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const words = text.split(' ');
  let currentLine = '';
  
  for (const word of words) {
    if (currentLine.length + word.length + 1 <= maxWidth) {
      currentLine += (currentLine ? ' ' : '') + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  return lines;
}

export default logger;
