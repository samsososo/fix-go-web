/** Clean visible feed-container chrome without changing the stored source snapshot. */
export function cleanFacebookPostText(raw: string): string {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const clean = (line: string) =>
    line
      .replace(/&#(?:x20|32);/gi, " ")
      .replace(/[\u034f\u200b-\u200f\u2060\ufeff]/g, "")
      .trim();
  const removed = new Set<number>();
  // Facebook renders timestamps as long runs of individual, reordered glyphs.
  // Only remove a run, not legitimate standalone quantities in the post body.
  for (let i = 0; i < lines.length; i++) {
    if (!/^[A-Za-z0-9]$/.test(clean(lines[i]))) continue;
    let end = i;
    while (end < lines.length && /^[A-Za-z0-9]$/.test(clean(lines[end]))) end++;
    if (end - i >= 8) {
      for (let j = i; j < end; j++) removed.add(j);
      // The immediately preceding line is the author in the captured header.
      if (i > 0 && clean(lines[i - 1]) && clean(lines[i - 1]) !== "Facebook")
        removed.add(i - 1);
    }
    i = end - 1;
  }
  const result: string[] = [];
  let footer = false;
  for (let i = 0; i < lines.length; i++) {
    if (removed.has(i)) continue;
    const line = clean(lines[i]);
    if (/^(?:Comment as |以.+身分留言|以.+身份留言)/i.test(line)) break;
    if (
      /^(?:See translation|Translation preferences|Rate this translation|All reactions:|Like|React|Share|Comment|Leave a comment|Send message|See original)$/i.test(
        line,
      )
    ) {
      if (
        /^(?:See translation|All reactions:|Like|React|Share|Comment|Leave a comment)$/i.test(
          line,
        )
      )
        footer = true;
      continue;
    }
    if (!line || /^(?:Facebook|See more|·|Sponsored)$/i.test(line)) continue;
    // A compact obfuscated timestamp can also occur on a single line.
    if (lines[i].includes("\u034f") && /^[A-Za-z0-9\s]+$/.test(line)) continue;
    if (
      footer &&
      /^(?:\+?\d+(?:[.,]\d+)?[KM]?|\d+\s+(?:comments?|shares?|reactions?))$/i.test(
        line,
      )
    )
      continue;
    result.push(line.replace(/\s*See more\s*$/i, "").replace(/^\\#/, "#"));
  }
  return result.join("\n").trim();
}
