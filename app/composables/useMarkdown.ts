import { marked } from 'marked';

/**
 * Конвертирует markdown текст в HTML
 * Безопасно обрабатывает markdown форматирование для отображения в чате
 */
export function useMarkdown() {
  // Настройка marked для безопасного рендеринга
  marked.setOptions({
    breaks: true, // Переносы строк как <br>
    gfm: true, // GitHub Flavored Markdown
  });

  function renderMarkdown(text: string): string {
    if (!text) return '';

    try {
      // Конвертируем markdown в HTML
      const html = marked.parse(text) as string;
      return html;
    } catch (error) {
      console.error('[useMarkdown] Error rendering markdown:', error);
      // В случае ошибки возвращаем исходный текст
      return text;
    }
  }

  return {
    renderMarkdown,
  };
}
