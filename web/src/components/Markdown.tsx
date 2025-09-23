import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// Minimal, safe Markdown renderer for assistant messages.
// - HTML is not rendered (safe by default)
// - GitHub-flavored markdown (tables, strikethrough, task lists)
// - Styled via .md-content utility classes in index.css
export default function Markdown({ content }: { content: string }) {
  return (
    <div className="md-content">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // rehypePlugins: none (avoid raw HTML)
        components={{
          // Slightly nicer code blocks/inline code
          code(props: any) {
            const { inline, children } = props || {};
            const c = String(children || '');
            if (inline) return <code className="md-code-inline">{c}</code>;
            return (
              <pre className="md-code-block">
                <code>{c}</code>
              </pre>
            );
          },
          a(props: any) {
            const { children, href } = props || {};
            return <a className="md-link" href={href || '#'} target="_blank" rel="noreferrer noopener">{children}</a>;
          },
          img() {
            // Images are uncommon in assistant text; keep them contained
            return null;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

