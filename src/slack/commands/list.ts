import { eq, sql } from 'drizzle-orm'
import { MAX_MESSAGES_PER_COMMAND, buildListMessages } from '@bot/blocks/list'
import { db } from '@db/client'
import { repositories, subscriptions } from '@db/schema'
import type { CommandContext } from './index'
import type { ParsedArgs } from './parse'

export async function handleList(
  _args: ParsedArgs,
  ctx: CommandContext,
): Promise<void> {
  const rows = await db
    .select({
      forge: repositories.forge,
      owner: repositories.owner,
      repo: repositories.repo,
      url: repositories.url,
      subscribedAt: subscriptions.subscribedAt,
      subscribedBy: subscriptions.subscribedBy,
      notificationMode: subscriptions.notificationMode,
    })
    .from(subscriptions)
    .innerJoin(repositories, eq(subscriptions.repositoryId, repositories.id))
    .where(eq(subscriptions.channelId, ctx.channelId))
    .orderBy(
      sql`lower(${repositories.owner})`,
      sql`lower(${repositories.repo})`,
    )

  if (rows.length === 0) {
    await ctx.respond(
      'No subscriptions in this channel. Use `/releases add <forge> owner/repo` to add one.',
    )
    return
  }

  const messages = buildListMessages(rows)
  if (messages.length > MAX_MESSAGES_PER_COMMAND) {
    console.error(
      `List for channel ${ctx.channelId} needs ${messages.length} messages, Slack allows ${MAX_MESSAGES_PER_COMMAND}`,
    )
    await ctx.respond(
      `This channel has ${rows.length} subscriptions. That is too many to list in Slack.`,
    )
    return
  }

  for (const blocks of messages) {
    await ctx.respond({ text: 'Subscriptions in this channel', blocks })
  }
}
