import { describe, expect, test } from 'bun:test'
import {
  MAX_SUBSCRIPTIONS_PER_MESSAGE,
  type SubscriptionRow,
  buildListMessages,
} from './list'
import type { KnownBlock, RichTextBlock } from '@slack/types'

function row(
  repo: string,
  notificationMode: string,
  overrides: Partial<SubscriptionRow> = {},
): SubscriptionRow {
  return {
    forge: 'github',
    owner: 'aboutbits',
    repo,
    url: null,
    subscribedAt: new Date('2026-06-24T10:00:00Z'),
    subscribedBy: 'U123',
    notificationMode,
    ...overrides,
  }
}

function rows(count: number, notificationMode = 'digest'): SubscriptionRow[] {
  return Array.from({ length: count }, (_, i) =>
    row(`repo-${i}`, notificationMode),
  )
}

function at<T>(values: readonly T[], index: number): T {
  const value = values[index]
  if (value === undefined) {
    throw new Error(`no element at index ${index}`)
  }
  return value
}

function groups(blocks: KnownBlock[]): RichTextBlock[] {
  return blocks.filter((b): b is RichTextBlock => b.type === 'rich_text')
}

function heading(group: RichTextBlock): string {
  const section = at(group.elements, 0)
  if (section.type !== 'rich_text_section') {
    throw new Error('first element is not a section')
  }
  const text = at(section.elements, 0)
  return text.type === 'text' ? text.text : ''
}

function items(group: RichTextBlock) {
  const list = at(group.elements, 1)
  if (list.type !== 'rich_text_list') {
    throw new Error('second element is not a list')
  }
  return list.elements
}

function firstElements(group: RichTextBlock) {
  return items(group).map((item) => at(item.elements, 0))
}

describe('buildListMessages', () => {
  test('puts 27 subscriptions into one message, grouped by mode', () => {
    const messages = buildListMessages([
      ...rows(24, 'digest'),
      ...rows(3, 'immediately'),
    ])

    expect(messages).toHaveLength(1)
    const blocks = at(messages, 0)
    expect(blocks.map((b) => b.type)).toEqual([
      'header',
      'context',
      'divider',
      'rich_text',
      'divider',
      'rich_text',
    ])
    expect(groups(blocks).map(heading)).toEqual([
      'All releases immediately',
      'Periodic digest',
    ])
    expect(groups(blocks).map((g) => items(g).length)).toEqual([3, 24])
  })

  test('writes a summary with the count of each mode', () => {
    const blocks = at(
      buildListMessages([...rows(2, 'digest'), ...rows(1, 'security-only')]),
      0,
    )

    expect(at(blocks, 1)).toEqual({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '3 repos  |  2 periodic digest  |  1 security alerts only',
        },
      ],
    })
  })

  test('writes one line per subscription with a link, the user and the date', () => {
    const blocks = at(
      buildListMessages([
        row('eslint-config', 'immediately', {
          url: 'https://github.com/aboutbits/eslint-config',
        }),
      ]),
      0,
    )

    expect(items(at(groups(blocks), 0))).toEqual([
      {
        type: 'rich_text_section',
        elements: [
          {
            type: 'link',
            url: 'https://github.com/aboutbits/eslint-config',
            text: 'aboutbits/eslint-config',
          },
          { type: 'text', text: '  |  ' },
          { type: 'user', user_id: 'U123' },
          { type: 'text', text: ', 24 Jun 2026' },
        ],
      },
    ])
  })

  test('builds the GitHub link when the repository has no url', () => {
    const blocks = at(buildListMessages([row('ts-config', 'digest')]), 0)

    expect(firstElements(at(groups(blocks), 0))).toEqual([
      {
        type: 'link',
        url: 'https://github.com/aboutbits/ts-config',
        text: 'aboutbits/ts-config',
      },
    ])
  })

  test('shows the forge only when the channel uses more than one forge', () => {
    const blocks = at(
      buildListMessages([
        row('a', 'digest'),
        row('b', 'digest', { forge: 'gitlab', url: 'https://gitlab.com/x/b' }),
      ]),
      0,
    )

    expect(firstElements(at(groups(blocks), 0))).toEqual([
      { type: 'text', text: 'github ' },
      { type: 'text', text: 'gitlab ' },
    ])
  })

  test('continues a large group in the next message with its heading repeated', () => {
    const messages = buildListMessages([
      ...rows(10, 'immediately'),
      ...rows(MAX_SUBSCRIPTIONS_PER_MESSAGE + 5, 'digest'),
    ])

    expect(messages).toHaveLength(2)
    const first = at(messages, 0)
    const second = at(messages, 1)
    expect(groups(first).map(heading)).toEqual([
      'All releases immediately',
      'Periodic digest',
    ])
    expect(groups(first).map((g) => items(g).length)).toEqual([
      10,
      MAX_SUBSCRIPTIONS_PER_MESSAGE - 10,
    ])
    expect(second.map((b) => b.type)).toEqual(['rich_text'])
    expect(groups(second).map(heading)).toEqual(['Periodic digest (continued)'])
    expect(items(at(groups(second), 0))).toHaveLength(15)
  })

  test('loses no subscription when a list spans several messages', () => {
    const input = [
      ...rows(700, 'digest'),
      ...rows(300, 'immediately'),
      ...rows(1, 'security-only'),
    ]
    const messages = buildListMessages(input)

    for (const blocks of messages) {
      expect(blocks.length).toBeLessThanOrEqual(50)
    }
    const total = messages
      .flatMap(groups)
      .reduce((sum, g) => sum + items(g).length, 0)
    expect(total).toBe(input.length)
  })

  test('starts a new message before one would pass 50 blocks', () => {
    const input = Array.from({ length: 30 }, (_, i) =>
      row(`repo-${i}`, `mode-${i}`),
    )
    const messages = buildListMessages(input)

    expect(messages.map((blocks) => blocks.length)).toEqual([50, 11])
    const total = messages
      .flatMap(groups)
      .reduce((sum, g) => sum + items(g).length, 0)
    expect(total).toBe(input.length)
  })

  test('shows a subscription with an unknown mode in a last group and counts it', () => {
    const blocks = at(
      buildListMessages([row('a', 'digest'), row('b', 'weekly')]),
      0,
    )

    expect(groups(blocks).map(heading)).toEqual(['Periodic digest', 'weekly'])
    expect(firstElements(at(groups(blocks), 1))).toEqual([
      {
        type: 'link',
        url: 'https://github.com/aboutbits/b',
        text: 'aboutbits/b',
      },
    ])
    expect(at(blocks, 1)).toEqual({
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: '2 repos  |  1 periodic digest  |  1 weekly' },
      ],
    })
  })
})
