import { CRON_TZ } from '@jobs/schedule'
import type { Release, Repository } from '@db/schema'
import type { KnownBlock, RichTextBlock, RichTextSection } from '@slack/types'

const headerDateFmt = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  timeZone: CRON_TZ,
})
const releaseDateFmt = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  day: 'numeric',
  timeZone: CRON_TZ,
})

export function buildDigestBlocks(
  grouped: { repo: Repository; releases: Release[] }[],
): KnownBlock[] {
  const totalReleases = grouped.reduce(
    (sum, { releases }) => sum + releases.length,
    0,
  )
  const repoWord = grouped.length === 1 ? 'repo' : 'repos'
  const releaseWord = totalReleases === 1 ? 'release' : 'releases'

  const blocks: KnownBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: ':package: Release Digest',
        emoji: true,
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${headerDateFmt.format(new Date())}  |  ${totalReleases} new ${releaseWord} across ${grouped.length} ${repoWord}`,
        },
      ],
    },
    { type: 'divider' },
  ]

  for (const [i, { repo, releases }] of grouped.entries()) {
    const sorted = [...releases].sort(
      (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
    )

    const repoUrl = repo.url ?? `https://github.com/${repo.owner}/${repo.repo}`

    const block: RichTextBlock = {
      type: 'rich_text',
      elements: [
        {
          type: 'rich_text_section',
          elements: [
            {
              type: 'link',
              url: repoUrl,
              text: `${repo.owner}/${repo.repo}`,
              style: { bold: true },
            },
          ],
        },
        {
          type: 'rich_text_list',
          style: 'bullet',
          elements: sorted.map(
            (r): RichTextSection => ({
              type: 'rich_text_section',
              elements: [
                { type: 'link', url: r.url, text: r.tagName },
                {
                  type: 'text',
                  text: `  |  ${releaseDateFmt.format(r.publishedAt)}`,
                },
              ],
            }),
          ),
        },
      ],
    }

    blocks.push(block)
    if (i < grouped.length - 1) {
      blocks.push({ type: 'divider' })
    }
  }

  return blocks
}
