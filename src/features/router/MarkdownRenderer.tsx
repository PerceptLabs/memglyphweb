/**
 * Simple Markdown Renderer
 *
 * Renders basic markdown to HTML.
 * For production, consider using a library like marked or react-markdown.
 */

export interface MarkdownRendererProps {
  content: string;
}

export function MarkdownRenderer({ content }: MarkdownRendererProps) {
  const html = renderMarkdown(content);

  return (
    <div
      className="markdown-content"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

/**
 * Simple markdown to HTML converter
 * Handles: headings, paragraphs, lists, links, bold, italic, code
 */
function renderMarkdown(markdown: string): string {
  let html = markdown;

  // Escape HTML
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // Links
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

  // Code blocks
  html = html.replace(/```(.*?)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>');

  // Lists (unordered)
  html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>');

  // Lists (ordered)
  html = html.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');

  // Paragraphs (lines separated by double newline)
  const lines = html.split('\n\n');
  html = lines
    .map((line) => {
      // Don't wrap if already wrapped
      if (
        line.startsWith('<h') ||
        line.startsWith('<ul>') ||
        line.startsWith('<ol>') ||
        line.startsWith('<pre>') ||
        line.startsWith('<li>')
      ) {
        return line;
      }
      return `<p>${line}</p>`;
    })
    .join('\n');

  // Line breaks
  html = html.replace(/\n/g, '<br>');

  return html;
}
