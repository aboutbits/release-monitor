import { eq, sql } from 'drizzle-orm'
import { buildListMessages } from '@bot/blocks/list'
import { db } from '@db/client'
import { repositories, subscriptions } from '@db/schema'
import { sendListMessages } from './send-list'
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

  await sendListMessages(buildListMessages(rows), rows.length, ctx)
}
