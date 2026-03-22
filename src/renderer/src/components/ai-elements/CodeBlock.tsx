import { useState, useCallback, useMemo } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Check, Copy, FileCode } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/lib/theme'

interface CodeBlockProps {
  code: string
  language?: string
  filename?: string
  showLineNumbers?: boolean
  className?: string
}

const LANGUAGE_LABELS: Record<string, string> = {
  js: 'JavaScript',
  jsx: 'JSX',
  ts: 'TypeScript',
  tsx: 'TSX',
  py: 'Python',
  rb: 'Ruby',
  go: 'Go',
  rs: 'Rust',
  java: 'Java',
  cpp: 'C++',
  c: 'C',
  cs: 'C#',
  php: 'PHP',
  swift: 'Swift',
  kt: 'Kotlin',
  sh: 'Shell',
  bash: 'Bash',
  zsh: 'Zsh',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  scss: 'SCSS',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  xml: 'XML',
  md: 'Markdown',
  dockerfile: 'Dockerfile',
  graphql: 'GraphQL',
  toml: 'TOML',
  ini: 'INI',
  diff: 'Diff',
  plaintext: 'Text',
  text: 'Text'
}

function getLanguageLabel(lang?: string): string {
  if (!lang) return 'Code'
  return LANGUAGE_LABELS[lang.toLowerCase()] || lang.charAt(0).toUpperCase() + lang.slice(1)
}

export default function CodeBlock({
  code,
  language,
  filename,
  showLineNumbers = true,
  className
}: CodeBlockProps): JSX.Element {
  const [copied, setCopied] = useState(false)
  const { theme } = useTheme()

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [code])

  const customTheme = useMemo(() => {
    const base = theme === 'dark' ? oneDark : oneLight
    return {
      ...base,
      'pre[class*="language-"]': {
        ...base['pre[class*="language-"]'],
        background: 'rgb(var(--td-code-bg))',
        margin: 0,
        padding: '1rem',
        fontSize: '13px',
        lineHeight: '1.6'
      },
      'code[class*="language-"]': {
        ...base['code[class*="language-"]'],
        background: 'transparent',
        fontSize: '13px',
        lineHeight: '1.6'
      }
    }
  }, [theme])

  return (
    <div className={cn('rounded-lg border border-td-border overflow-hidden my-3', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-td-surface border-b border-td-border">
        <div className="flex items-center gap-2 text-xs text-td-muted">
          <FileCode className="h-3.5 w-3.5" />
          <span>{filename || getLanguageLabel(language)}</span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-td-muted hover:text-td-text-secondary transition-colors px-1.5 py-0.5 rounded hover:bg-td-hover"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code */}
      <SyntaxHighlighter
        language={language || 'text'}
        style={customTheme}
        showLineNumbers={showLineNumbers}
        lineNumberStyle={{
          color: 'rgb(var(--td-line-number))',
          fontSize: '12px',
          paddingRight: '1em',
          minWidth: '2.5em',
          userSelect: 'none'
        }}
        customStyle={{
          margin: 0,
          borderRadius: 0,
          background: 'rgb(var(--td-code-bg))'
        }}
        wrapLongLines
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
