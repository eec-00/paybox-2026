const CHUNK_SIZE = 1000

/**
 * Fetches all rows from a Supabase query by paginating in chunks of 1000.
 * Pass a factory fn that returns a fresh query with .range(from, to) applied.
 */
export async function fetchAllRows<T>(
  queryFactory: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const all: T[] = []
  let from = 0

  while (true) {
    const { data, error } = await queryFactory(from, from + CHUNK_SIZE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < CHUNK_SIZE) break
    from += CHUNK_SIZE
  }

  return all
}
