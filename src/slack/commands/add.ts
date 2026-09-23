import { db } from '@db/client'
import { type NotificationMode, subscriptions } from '@db/schema'
import { listForges, tryGetForge } from '@forges/registry'
import { trackRepository } from '@forges/track'
import { type ParsedArgs, parseRepo } from './parse'
import { formatVerifyError } from './verify-error'
import type { CommandContext } from './index'

const VALID_MODES: readonly NotificationMode[] = [
  'digest',
  'immediately',
  'security-only',
]

function isMode(v: string): v is NotificationMode {
  return (VALID_MODES as readonly string[]).includes(v)
}

function parseMode(arg: string | undefined): NotificationMode | null {
  if (arg === undefined) {
    return 'digest'
  }

  return isMode(arg) ? arg : null
}

export async function handleAdd(
  args: ParsedArgs,
  ctx: CommandContext,
): Promise<void> {
  const [forgeName, repoArg, modeArg] = args.positional

  if (!forgeName || !repoArg) {
    await ctx.respond(
      `Usage: \`/releases add <${listForges().join('|')}> owner/repo [${VALID_MODES.join('|')}]\``,
    )
    return
  }

  const forge = tryGetForge(forgeName)
  if (!forge) {
    await ctx.respond(
      `Unknown forge \`${forgeName}\`. Supported: ${listForges()
        .map((f) => `\`${f}\``)
        .join(', ')}.`,
    )
    return
  }

  const parsed = parseRepo(repoArg)
  if (!parsed) {
    await ctx.respond('Invalid repo format. Use `owner/repo`.')
    return
  }

  const mode = parseMode(modeArg)
  if (mode === null) {
    const invalidMode = modeArg ?? ''
    await ctx.respond(
      `Unknown mode \`${invalidMode}\`. Valid modes: ${VALID_MODES.map((m) => `\`${m}\``).join(', ')}.`,
    )
    return
  }

  try {
    await forge.verifyRepository(parsed.owner, parsed.name)
  } catch (err) {
    console.error(`Verify failed for ${forgeName}/${repoArg}:`, err)
    await ctx.respond(
      formatVerifyError(err, forgeName, parsed.owner, parsed.name),
    )
    return
  }

  const repo = await trackRepository(forge, parsed.owner, parsed.name)

  const inserted = await db
    .insert(subscriptions)
    .values({
      channelId: ctx.channelId,
      repositoryId: repo.id,
      subscribedBy: ctx.userId,
      notificationMode: mode,
    })
    .onConflictDoNothing()
    .returning()

  if (inserted.length === 0) {
    await ctx.respond(
      `This channel is already subscribed to \`${forgeName} ${parsed.owner}/${parsed.name}\`.`,
    )
    return
  }

  const modeLabel = mode === 'digest' ? '' : `  _(${mode})_`
  await ctx.respond({
    response_type: 'in_channel',
    text: `<@${ctx.userId}> subscribed to \`${forgeName} ${parsed.owner}/${parsed.name}\`${modeLabel}.`,
  })
}
