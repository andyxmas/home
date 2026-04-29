import type { SourceKind } from '../../domain/notification'

export type FormattedBodyPart =
  | { type: 'text'; value: string }
  | { type: 'mention'; value: string }

const SHORTCUT_MENTION_LINK_REGEX = /\[(@[^\]\r\n]+)\]\((shortcutapp:\/\/members\/[^)\s]+)\)/g
const VALID_MENTION_LABEL_REGEX = /^@\S+$/
const HTML_ESCAPE_LOOKUP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPE_LOOKUP[char] ?? char)
}

export function formatInboxBodyText(source: SourceKind, body?: string): FormattedBodyPart[] {
  if (!body) {
    return []
  }

  if (source !== 'shortcut') {
    return [{ type: 'text', value: body }]
  }

  const parts: FormattedBodyPart[] = []
  const pushText = (value: string) => {
    if (!value) {
      return
    }
    const lastPart = parts.at(-1)
    if (lastPart?.type === 'text') {
      lastPart.value += value
      return
    }
    parts.push({ type: 'text', value })
  }
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = SHORTCUT_MENTION_LINK_REGEX.exec(body)) !== null) {
    const [matchedText, label] = match
    const matchIndex = match.index

    if (matchIndex > cursor) {
      pushText(body.slice(cursor, matchIndex))
    }

    if (VALID_MENTION_LABEL_REGEX.test(label)) {
      parts.push({ type: 'mention', value: label })
    } else {
      pushText(matchedText)
    }

    cursor = matchIndex + matchedText.length
  }

  if (cursor < body.length) {
    pushText(body.slice(cursor))
  }

  return parts.length > 0 ? parts : [{ type: 'text', value: body }]
}

export function injectShortcutMentionSpans(source: SourceKind, body?: string): string {
  if (!body || source !== 'shortcut') {
    return body ?? ''
  }

  return body.replace(SHORTCUT_MENTION_LINK_REGEX, (matchedText, label: string) => {
    if (!VALID_MENTION_LABEL_REGEX.test(label)) {
      return matchedText
    }

    return `<span class="item-body-mention">${escapeHtml(label)}</span>`
  })
}
