import type { Release, Repository } from '@db/schema'
import type { KnownBlock, RichTextBlock } from '@slack/types'

export function buildSecurityBlocks(
  repo: Repository,
  release: Release,
  reasons: string[],
  note?: string,
): KnownBlock[] {
  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: ':lock: Security Release',
        emoji: true,
      },
    },
    {
      type: 'rich_text',
      elements: [
        {
          type: 'rich_text_section',
          elements: [
            {
              type: 'link',
              url: release.url,
              text: `${repo.owner}/${repo.repo} ${release.tagName}`,
              style: { bold: true },
            },
          ],
        },
        {
          type: 'rich_text_list',
          style: 'bullet',
          elements: reasons.map((reason) => ({
            type: 'rich_text_section' as const,
            elements: [{ type: 'text' as const, text: reason }],
          })),
        },
      ],
    } satisfies RichTextBlock,
  ]

  if (note) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: note }],
    })
  }

  return blocks
}
