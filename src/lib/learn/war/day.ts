/** Story of the day: the same story for everyone on an IST calendar day, cycling through all of them. */
export function istToday(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

export function storyOfTheDay<T extends { slug: string }>(stories: T[], day: string): T | null {
  if (!stories.length) return null;
  const sorted = [...stories].sort((a, b) => a.slug.localeCompare(b.slug));
  const n = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  return sorted[((n % sorted.length) + sorted.length) % sorted.length];
}
