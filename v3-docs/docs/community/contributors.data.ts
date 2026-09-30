export interface Contributor {
  login: string
  avatar_url: string
  html_url: string
  contributions: number
}

declare const data: Contributor[]
export { data }

export default {
  async load(): Promise<Contributor[]> {
    const contributors: Contributor[] = []
    let page = 1
    const perPage = 100

    while (true) {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'meteor-docs-builder',
      }

      if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
      }

      const response = await fetch(
        `https://api.github.com/repos/meteor/meteor/contributors?per_page=${perPage}&page=${page}`,
        { headers }
      )

      if (!response.ok) {
        console.warn(
          `[contributors.data] GitHub API error: ${response.status} ${response.statusText}`
        )
        break
      }

      const batch = (await response.json()) as any[]

      if (!batch.length) break

      contributors.push(
        ...batch
          .filter((c) => c.type === 'User')
          .map((c) => ({
            login: c.login,
            avatar_url: c.avatar_url,
            html_url: c.html_url,
            contributions: c.contributions,
          }))
      )

      if (batch.length < perPage) break
      page++
    }

    return contributors
  },
}
