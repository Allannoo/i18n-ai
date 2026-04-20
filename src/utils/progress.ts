import ora, { Ora } from 'ora';
import chalk from 'chalk';

/**
 * Утилиты для отображения прогресса в CLI
 */

export class Progress {
  private spinner: Ora;
  private startTime: number = 0;

  constructor(message: string) {
    this.spinner = ora(message);
  }

  /**
   * Запускает спиннер
   */
  start(): Progress {
    this.startTime = Date.now();
    this.spinner.start();
    return this;
  }

  /**
   * Обновляет сообщение спиннера
   */
  update(message: string): Progress {
    this.spinner.text = message;
    return this;
  }

  /**
   * Завершает с успехом
   */
  succeed(message?: string): Progress {
    this.spinner.succeed(message);
    return this;
  }

  /**
   * Завершает с ошибкой
   */
  fail(message?: string): Progress {
    this.spinner.fail(message);
    return this;
  }

  /**
   * Завершает с предупреждением
   */
  warn(message?: string): Progress {
    this.spinner.warn(message);
    return this;
  }

  /**
   * Завершает с информацией
   */
  info(message?: string): Progress {
    this.spinner.info(message);
    return this;
  }

  /**
   * Останавливает спиннер
   */
  stop(): Progress {
    this.spinner.stop();
    return this;
  }

  /**
   * Возвращает прошедшее время в секундах
   */
  getElapsed(): number {
    return (Date.now() - this.startTime) / 1000;
  }
}

/**
 * Создаёт и запускает спиннер с сообщением
 */
export function createProgress(message: string): Progress {
  return new Progress(message).start();
}

/**
 * Отображает прогресс-бар для операции
 */
export function progressBar(current: number, total: number, options?: {
  width?: number;
  prefix?: string;
  suffix?: string;
}): string {
  const width = options?.width || 30;
  const prefix = options?.prefix || '';
  const suffix = options?.suffix || '';

  const percentage = Math.round((current / total) * 100);
  const filled = Math.round((width * current) / total);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);

  return `${prefix}[${bar}] ${percentage}%${suffix}`;
}

/**
 * Форматирует время выполнения
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

export default Progress;
