import { ForgeError } from '@forges/types'

export function formatVerifyError(
  err: unknown,
  forgeDisplayName: string,
  owner: string,
  name: string,
): string {
  const kind = err instanceof ForgeError ? err.kind : 'not-found'

  switch (kind) {
    case 'token-rejected': {
      const forgeErr = err instanceof ForgeError ? err : undefined
      const reason = forgeErr?.forgeMessage ? `\n>${forgeErr.forgeMessage}` : ''
      const hint = forgeErr?.hint ? `\n${forgeErr.hint}` : ''
      return (
        `${forgeDisplayName} rejected the Release Monitor's access token for \`${owner}/${name}\`.${reason}\n` +
        `Ask an admin to update the token.${hint}`
      )
    }
    case 'rate-limited':
      return `${forgeDisplayName} rate limit reached, please try again later.`
    case 'not-found':
    case 'unknown':
      return `Repository \`${owner}/${name}\` not found or not accessible on ${forgeDisplayName}.`
  }
}
