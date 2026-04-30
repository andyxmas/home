import { describe, expect, it } from 'vitest'
import { storyHasHandleTaskMention } from './shortcut-work-sync'

describe('shortcut work sync', () => {
  it('detects checklist mentions of handle (case-insensitive, with/without @)', () => {
    const story = {
      tasks: [
        { description: 'PR @andyc' },
        { description: 'Code review @SomeoneElse' },
        { description: 'please REVIEW @ANDYC when ready' },
      ],
    }

    expect(storyHasHandleTaskMention(story, 'andyc')).toBe(true)
    expect(storyHasHandleTaskMention(story, '@andyc')).toBe(true)
    expect(storyHasHandleTaskMention(story, 'nope')).toBe(false)
  })
})

