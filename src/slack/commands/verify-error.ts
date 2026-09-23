import { ForgeError } from '@forges/types'

export function formatVerifyError(
  err: unknown,
  forgeName: string,
  owner: string,
  name: string,
): string {
  const kind = err instanceof ForgeError ? err.kind : 'not-found'

  switch (kind) {
    case 'token-rejected': {
      const reason =
        err instanceof ForgeError && err.forgeMessage
          ? `\n>${err.forgeMessage}\n`
          : '\n'
      return (
        `${forgeName} rejected the Release Monitor's access token for \`${owner}/${name}\`.${reason}` +
        `Ask an admin to update the token, or if \`${owner}\` is an organization, to check its personal access token policy: https://github.com/organizations/${owner}/settings/personal-access-tokens`
      )
    }
    case 'rate-limited':
      return `${forgeName} rate limit reached, please try again later.`
    case 'not-found':
    case 'unknown':
      return `Repository \`${owner}/${name}\` not found or not accessible on ${forgeName}.`
  }
}
