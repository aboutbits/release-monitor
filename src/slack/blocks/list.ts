import type { NotificationMode } from '@db/schema'
import type { KnownBlock, RichTextBlock, RichTextSection } from '@slack/types'

// Slack rejects a message with more blocks than this with `invalid_blocks`.
const MAX_BLOCKS_PER_MESSAGE = 50

// Keeps each message far below Slack's limit of about 40,000 characters.
export const MAX_SUBSCRIPTIONS_PER_MESSAGE = 200

// Slack accepts at most 5 replies to one command through its response_url.
export const MAX_MESSAGES_PER_COMMAND = 5

const MODE_HEADINGS: Record<NotificationMode, string> = {
  immediately: 'All releases immediately',
  digest: 'Periodic digest',
  'security-only': 'Security alerts only',
}

// The order of the groups in the list.
const MODES: readonly NotificationMode[] = [
  'immediately',
  'digest',
  'security-only',
]

const subscribedDateFmt = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})

export type SubscriptionRow = {
  forge: string
  owner: string
  repo: string
  url: string | null
  subscribedAt: Date
  subscribedBy: string
  notificationMode: string
}

function buildSummary(rows: SubscriptionRow[]): string {
  const repoWord = rows.length === 1 ? 'repo' : 'repos'
  const counts = MODES.map((mode) => ({
    mode,
    count: rows.filter((r) => r.notificationMode === mode).length,
  }))
    .filter(({ count }) => count > 0)
    .map(({ mode, count }) => `${count} ${MODE_HEADINGS[mode].toLowerCase()}`)

  return [`${rows.length} ${repoWord}`, ...counts].join('  |  ')
}

function buildItem(r: SubscriptionRow, showForge: boolean): RichTextSection {
  const url = r.url ?? `https://github.com/${r.owner}/${r.repo}`
  const name = `${r.owner}/${r.repo}`

  return {
    type: 'rich_text_section',
    elements: [
      ...(showForge ? [{ type: 'text' as const, text: `${r.forge} ` }] : []),
      { type: 'link', url, text: name },
      { type: 'text', text: '  |  ' },
      { type: 'user', user_id: r.subscribedBy },
      { type: 'text', text: `, ${subscribedDateFmt.format(r.subscribedAt)}` },
    ],
  }
}

function buildGroup(
  heading: string,
  rows: SubscriptionRow[],
  showForge: boolean,
): RichTextBlock {
  return {
    type: 'rich_text',
    elements: [
      {
        type: 'rich_text_section',
        elements: [{ type: 'text', text: heading, style: { bold: true } }],
      },
      {
        type: 'rich_text_list',
        style: 'bullet',
        elements: rows.map((r) => buildItem(r, showForge)),
      },
    ],
  }
}

// Returns the blocks of each message. One message holds the whole list unless it has more than
// MAX_SUBSCRIPTIONS_PER_MESSAGE subscriptions; a group that continues in the next message repeats its heading.
export function buildListMessages(rows: SubscriptionRow[]): KnownBlock[][] {
  // The forge is shown only when the channel follows repositories on more than one forge.
  const showForge = new Set(rows.map((r) => r.forge)).size > 1

  let current: KnownBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: 'Subscriptions in this channel' },
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: buildSummary(rows) }],
    },
  ]
  let inCurrent = 0
  const messages = [current]

  for (const mode of MODES) {
    const groupRows = rows.filter((r) => r.notificationMode === mode)
    let heading = MODE_HEADINGS[mode]

    while (groupRows.length > 0) {
      if (
        inCurrent === MAX_SUBSCRIPTIONS_PER_MESSAGE ||
        current.length + 2 > MAX_BLOCKS_PER_MESSAGE
      ) {
        current = []
        inCurrent = 0
        messages.push(current)
      }

      const part = groupRows.splice(
        0,
        MAX_SUBSCRIPTIONS_PER_MESSAGE - inCurrent,
      )
      if (current.length > 0) {
        current.push({ type: 'divider' })
      }
      current.push(buildGroup(heading, part, showForge))
      inCurrent += part.length
      heading = `${MODE_HEADINGS[mode]} (continued)`
    }
  }

  return messages
}
