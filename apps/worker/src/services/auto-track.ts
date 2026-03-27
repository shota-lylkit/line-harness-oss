/**
 * Auto-track stub — tracked links removed for spot-hoiku.
 * Returns content unchanged (no URL tracking).
 */
export async function autoTrackContent(
  _db: D1Database,
  messageType: string,
  content: string,
  _workerUrl: string,
): Promise<{ messageType: string; content: string }> {
  return { messageType, content };
}
