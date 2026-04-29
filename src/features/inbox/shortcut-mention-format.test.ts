import { describe, expect, it } from 'vitest'
import { formatInboxBodyText, injectShortcutMentionSpans } from './shortcut-mention-format'

describe('formatInboxBodyText', () => {
  it('replaces Shortcut markdown mention links with mention tokens', () => {
    const parts = formatInboxBodyText(
      'shortcut',
      'Hey [@anirvan](shortcutapp://members/123), please review this.',
    )

    expect(parts).toEqual([
      { type: 'text', value: 'Hey ' },
      { type: 'mention', value: '@anirvan' },
      { type: 'text', value: ', please review this.' },
    ])
  })

  it('preserves punctuation and handles multiple mentions', () => {
    const parts = formatInboxBodyText(
      'shortcut',
      'Asked [@andy](shortcutapp://members/1), [@sam](shortcutapp://members/2).',
    )

    expect(parts).toEqual([
      { type: 'text', value: 'Asked ' },
      { type: 'mention', value: '@andy' },
      { type: 'text', value: ', ' },
      { type: 'mention', value: '@sam' },
      { type: 'text', value: '.' },
    ])
  })

  it('leaves non-Shortcut sources unchanged', () => {
    const input = 'Hey [@anirvan](shortcutapp://members/123)'

    expect(formatInboxBodyText('github', input)).toEqual([{ type: 'text', value: input }])
  })

  it('does not rewrite non-mention shortcutapp links', () => {
    const input = '[Story](shortcutapp://members/123) and [@andy team](shortcutapp://members/456)'

    expect(formatInboxBodyText('shortcut', input)).toEqual([{ type: 'text', value: input }])
  })

  it('injects styled mention spans for markdown pipeline', () => {
    const input = 'Ping [@anirvan](shortcutapp://members/123) now'

    expect(injectShortcutMentionSpans('shortcut', input)).toBe(
      'Ping <span class="item-body-mention">@anirvan</span> now',
    )
  })
})
