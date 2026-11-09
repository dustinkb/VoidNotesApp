import React, { FC, useMemo, useRef, useEffect, useState } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Check, Copy, ExternalLink, Sparkles } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  onToggleTask?: (taskIndex: number) => void;
  onSwitchToEdit?: () => void;
  className?: string;
}

export const MarkdownRenderer: FC<MarkdownRendererProps> = ({
  content,
  onToggleTask,
  onSwitchToEdit,
  className = ''
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  const { html } = useMemo(() => {
    if (!content.trim()) {
      return { html: '', taskCount: 0 };
    }

    let taskIndexCounter = 0;

    const renderer = new marked.Renderer();

    // Checkbox support
    renderer.checkbox = ({ checked }: { checked: boolean }) => {
      const idx = taskIndexCounter++;
      return `<input type="checkbox" ${
        checked ? 'checked' : ''
      } data-task-index="${idx}" class="task-checkbox appearance-none w-4 h-4 rounded border border-border bg-surface checked:bg-accent checked:border-accent relative cursor-pointer align-middle mr-2 transition-all inline-flex items-center justify-center after:content-[''] after:hidden checked:after:block after:w-1.5 after:h-2.5 after:border-solid after:border-amoled-black after:border-r-2 after:border-b-2 after:rotate-45 after:-translate-y-0.5" />`;
    };

    // Code block with copy action
    let codeBlockIdx = 0;
    renderer.code = ({ text, lang }: { text: string; lang?: string }) => {
      const language = (lang || 'code').trim().toLowerCase();
      const codeId = `cb-${codeBlockIdx++}`;
      const escaped = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      return `
        <div class="code-block-container my-4 rounded-xl border border-border bg-surface/70 overflow-hidden font-mono text-[13px] shadow-xs" data-code-id="${codeId}">
          <div class="flex items-center justify-between px-3.5 py-1.5 border-b border-border/60 bg-surface/90 text-[10px] text-text-secondary uppercase tracking-widest font-mono select-none">
            <span class="opacity-80">${language}</span>
            <button
              type="button"
              data-action="copy-code"
              data-code-target="${codeId}"
              class="copy-code-btn px-2 py-0.5 rounded text-[10px] text-text-secondary hover:text-text-primary hover:bg-border/40 transition-colors flex items-center gap-1 cursor-pointer"
              aria-label="Copy code to clipboard"
            >
              <span>Copy</span>
            </button>
          </div>
          <pre class="p-4 overflow-x-auto text-text-primary leading-relaxed font-mono"><code>${escaped}</code></pre>
        </div>
      `;
    };

    // Links with safe target and styling
    renderer.link = ({ href, title, text }: { href: string; title?: string | null; text: string }) => {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}" target="_blank" rel="noopener noreferrer"${titleAttr} class="markdown-link inline-flex items-baseline gap-0.5 text-accent underline underline-offset-4 decoration-accent/40 hover:decoration-accent transition-colors">${text}</a>`;
    };

    // Tables wrapped in responsive container
    renderer.table = (token) => {
      let headerRow = '';
      if (token.header) {
        headerRow = token.header
          .map(
            (cell) =>
              `<th class="px-4 py-2.5 font-semibold text-text-primary border-b border-border/70 text-left">${cell.text}</th>`
          )
          .join('');
      }

      let bodyRows = '';
      if (token.rows) {
        bodyRows = token.rows
          .map(
            (row) =>
              `<tr class="border-b border-border/30 hover:bg-surface/40 transition-colors">${row
                .map((cell) => `<td class="px-4 py-2.5 text-text-secondary">${cell.text}</td>`)
                .join('')}</tr>`
          )
          .join('');
      }

      return `
        <div class="table-container my-5 overflow-x-auto rounded-xl border border-border/60 bg-surface/20">
          <table class="w-full text-left text-sm border-collapse">
            <thead><tr class="bg-surface/60">${headerRow}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>
      `;
    };

    const rawHtml = marked.parse(content, {
      renderer,
      gfm: true,
      breaks: true
    }) as string;

    const sanitized = DOMPurify.sanitize(rawHtml, {
      ADD_ATTR: ['target', 'rel', 'data-action', 'data-code-target', 'data-task-index', 'checked'],
      ADD_TAGS: ['input', 'button']
    });

    return { html: sanitized, taskCount: taskIndexCounter };
  }, [content]);

  // Click delegation for interactive checkboxes and copy buttons
  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;

    // Check if clicked checkbox
    const checkbox = target.closest('input[type="checkbox"][data-task-index]') as HTMLInputElement | null;
    if (checkbox && onToggleTask) {
      const idxStr = checkbox.getAttribute('data-task-index');
      if (idxStr !== null) {
        const index = parseInt(idxStr, 10);
        if (!isNaN(index)) {
          onToggleTask(index);
          return;
        }
      }
    }

    // Check if clicked copy button in code block
    const copyBtn = target.closest('button[data-action="copy-code"]') as HTMLButtonElement | null;
    if (copyBtn) {
      e.preventDefault();
      e.stopPropagation();
      const codeContainer = copyBtn.closest('.code-block-container');
      const codeElem = codeContainer?.querySelector('pre code');
      if (codeElem) {
        const codeText = codeElem.textContent || '';
        navigator.clipboard.writeText(codeText).then(() => {
          const codeId = codeContainer?.getAttribute('data-code-id') || 'temp';
          setCopiedCodeId(codeId);
          copyBtn.innerHTML = '<span>Copied!</span>';
          copyBtn.classList.add('text-accent');
          setTimeout(() => {
            setCopiedCodeId(null);
            copyBtn.innerHTML = '<span>Copy</span>';
            copyBtn.classList.remove('text-accent');
          }, 2000);
        });
      }
      return;
    }
  };

  if (!content.trim()) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-text-secondary select-none">
        <div className="w-12 h-12 rounded-xl border border-border/60 bg-surface/30 flex items-center justify-center mb-4 text-text-secondary/40">
          <Sparkles size={20} />
        </div>
        <p className="font-mono text-xs uppercase tracking-widest text-text-secondary/60 mb-2">
          Markdown Preview
        </p>
        <p className="text-sm text-text-secondary/40 max-w-sm mb-6">
          This note has no body text to preview.
        </p>
        {onSwitchToEdit && (
          <button
            type="button"
            onClick={onSwitchToEdit}
            className="px-4 py-2 rounded-lg border border-border bg-surface hover:bg-border/40 text-text-primary text-xs font-mono uppercase tracking-wider transition-all"
          >
            Switch to Raw Editor
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className={`markdown-preview-root markdown-body font-sans text-text-primary select-text overflow-y-auto ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
