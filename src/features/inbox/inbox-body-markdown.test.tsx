import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { InboxBodyMarkdown } from './inbox-body-markdown'

describe('InboxBodyMarkdown', () => {
  it('renders common markdown formatting', () => {
    render(
      <InboxBodyMarkdown
        source="github"
        body={'**Bold**\n\n- One\n- Two\n\n[Docs](https://example.com)\n\nUse `inline` code'}
      />,
    )

    expect(screen.getByText('Bold').closest('strong')).toBeInTheDocument()
    expect(screen.getByText('One').closest('li')).toBeInTheDocument()
    expect(screen.getByText('Two').closest('li')).toBeInTheDocument()
    expect(screen.getByText('Docs').closest('a')).toHaveAttribute('href', 'https://example.com')
    expect(screen.getByText('inline').closest('code')).toBeInTheDocument()
  })

  it('sanitizes unsafe html and javascript URLs', () => {
    render(
      <InboxBodyMarkdown
        source="slack"
        body={
          'safe\n\n<script>window.__xss = true</script>\n\n<a href="javascript:alert(1)">Bad</a>\n\n<b>Still Bold</b>'
        }
      />,
    )

    expect(screen.queryByText('window.__xss = true')).not.toBeInTheDocument()
    expect(document.querySelector('script')).not.toBeInTheDocument()
    const unsafeLink = screen.getByText('Bad').closest('a')
    expect(unsafeLink?.getAttribute('href')?.startsWith('javascript:')).not.toBe(true)
    expect(screen.getByText('Still Bold').closest('b')).toBeInTheDocument()
  })

  it('keeps shortcut mention markdown as styled mentions', () => {
    render(
      <InboxBodyMarkdown
        source="shortcut"
        body="Ping [@anirvan](shortcutapp://members/123) and review this."
      />,
    )

    const mention = screen.getByText('@anirvan')
    expect(mention).toHaveClass('item-body-mention')
    expect(screen.queryByText(/shortcutapp:\/\/members\//)).not.toBeInTheDocument()
  })
})
