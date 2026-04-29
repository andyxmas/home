import type { SourceKind } from '../../domain/notification'
import ReactMarkdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import remarkGfm from 'remark-gfm'
import { injectShortcutMentionSpans } from './shortcut-mention-format'

type InboxBodyMarkdownProps = {
  source: SourceKind
  body: string
}

const markdownSanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'span'],
  attributes: {
    ...(defaultSchema.attributes ?? {}),
    span: [['className', 'item-body-mention']],
  },
}

export function InboxBodyMarkdown({ source, body }: InboxBodyMarkdownProps) {
  const markdownText = injectShortcutMentionSpans(source, body)

  return (
    <div className="item-body item-body-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]}
        components={{
          a: (props) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {markdownText}
      </ReactMarkdown>
    </div>
  )
}
