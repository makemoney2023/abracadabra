export function smartQuotes(text) {
  const plain = String(text).replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
  return plain
    .replace(/(\w)'(\w)/g, "$1\u2019$2")
    .replace(/(^|[\s(\[{])"/g, "$1\u201C")
    .replace(/"/g, "\u201D")
    .replace(/(^|[\s(\[{])'/g, "$1\u2018")
    .replace(/'/g, "\u2019")
    .replace(/\.\.\./g, "\u2026");
}

export function smartQuotesHtml(html) {
  return String(html).replace(/<(script|style|code|pre)\b[^>]*>[\s\S]*?<\/\1>|<!--[\s\S]*?-->|<[^>]+>|[^<]+/gi, (chunk) => {
    if (chunk.startsWith("<")) return chunk;
    return smartQuotes(chunk);
  });
}
