/** Raw GitHub API response shape - internal to this forge implementation. */
export type GithubApiRelease = {
  id: number
  tag_name: string
  name: string | null
  html_url: string
  published_at: string
  updated_at: string | null
  body: string | null
  draft: boolean
  prerelease: boolean
}
