/** Stored mention token: @[Display Name](user-uuid) */
export const MENTION_TOKEN_REGEX = /@\[([^\]]+)\]\(([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi

export function formatMentionToken(displayName: string, userId: string) {
  return `@[${displayName}](${userId})`
}

export function extractMentionedUserIds(text: string): string[] {
  const ids = new Set<string>()
  const re = new RegExp(MENTION_TOKEN_REGEX.source, 'gi')
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    ids.add(m[2])
  }
  return [...ids]
}

/** Plain text for emails and previews (tokens → @Name). */
export function commentTextToPlain(text: string) {
  return text.replace(MENTION_TOKEN_REGEX, (_, name: string) => `@${name}`)
}

export type MentionActiveQuery = {
  start: number
  query: string
}

/** If the caret is in an unfinished @mention, returns its start index and query text. */
export function getActiveMentionQuery(text: string, caret: number): MentionActiveQuery | null {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at === -1) return null
  if (at > 0 && !/\s/.test(before[at - 1])) return null
  const segment = before.slice(at + 1)
  if (/[\[\]()]/.test(segment)) return null
  return { start: at, query: segment }
}

export function insertMentionToken(
  text: string,
  caret: number,
  active: MentionActiveQuery,
  displayName: string,
  userId: string
) {
  const token = `${formatMentionToken(displayName, userId)} `
  const next = text.slice(0, active.start) + token + text.slice(caret)
  const nextCaret = active.start + token.length
  return { text: next, caret: nextCaret }
}
