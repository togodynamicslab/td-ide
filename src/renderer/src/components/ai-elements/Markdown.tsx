import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import CodeBlock from './CodeBlock'
import { cn } from '@/lib/utils'

interface MarkdownProps {
  content: string
  className?: string
  fontSize?: number
}

const components: Components = {
  code({ className, children, ...props }) {
    const match = /language-(\w+)/.exec(className || '')
    const isInline = !match && !String(children).includes('\n')

    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded bg-td-surface border border-td-border text-[13px] font-mono text-td-code-inline"
          {...props}
        >
          {children}
        </code>
      )
    }

    return (
      <CodeBlock
        code={String(children).replace(/\n$/, '')}
        language={match?.[1]}
      />
    )
  },
  pre({ children }) {
    // Let the code component handle rendering
    return <>{children}</>
  },
  p({ children }) {
    return <p className="mb-3 last:mb-0 leading-relaxed">{children}</p>
  },
  h1({ children }) {
    return <h1 className="text-xl font-semibold mb-3 mt-5 first:mt-0 text-td-text">{children}</h1>
  },
  h2({ children }) {
    return <h2 className="text-lg font-semibold mb-2 mt-4 first:mt-0 text-td-text">{children}</h2>
  },
  h3({ children }) {
    return <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0 text-td-text">{children}</h3>
  },
  h4({ children }) {
    return <h4 className="text-sm font-semibold mb-1 mt-2 first:mt-0 text-td-text">{children}</h4>
  },
  ul({ children }) {
    return <ul className="list-disc pl-6 mb-3 space-y-1">{children}</ul>
  },
  ol({ children }) {
    return <ol className="list-decimal pl-6 mb-3 space-y-1">{children}</ol>
  },
  li({ children }) {
    return <li className="text-td-text-secondary">{children}</li>
  },
  blockquote({ children }) {
    return (
      <blockquote className="border-l-2 border-td-accent pl-4 my-3 text-td-text-tertiary italic">
        {children}
      </blockquote>
    )
  },
  a({ href, children }) {
    return (
      <a
        href={href}
        className="text-td-accent hover:underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        {children}
      </a>
    )
  },
  table({ children }) {
    return (
      <div className="overflow-x-auto my-3">
        <table className="min-w-full border border-td-border text-sm">{children}</table>
      </div>
    )
  },
  thead({ children }) {
    return <thead className="bg-td-surface">{children}</thead>
  },
  th({ children }) {
    return (
      <th className="px-3 py-2 text-left text-xs font-medium text-td-text-secondary border-b border-td-border">
        {children}
      </th>
    )
  },
  td({ children }) {
    return (
      <td className="px-3 py-2 text-td-text-tertiary border-b border-td-border">{children}</td>
    )
  },
  hr() {
    return <hr className="border-td-border my-4" />
  },
  strong({ children }) {
    return <strong className="font-semibold text-td-text">{children}</strong>
  },
  em({ children }) {
    return <em className="italic text-td-text-secondary">{children}</em>
  },
  del({ children }) {
    return <del className="line-through text-td-muted">{children}</del>
  },
  input({ checked, ...props }) {
    return (
      <input
        type="checkbox"
        checked={checked}
        readOnly
        className="mr-2 accent-td-accent"
        {...props}
      />
    )
  }
}

export default function Markdown({ content, className, fontSize = 14 }: MarkdownProps): JSX.Element {
  return (
    <div className={cn('text-td-text-secondary break-words', className)} style={{ fontFamily: "'Lora', Georgia, serif", fontSize: `${fontSize}px` }}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
