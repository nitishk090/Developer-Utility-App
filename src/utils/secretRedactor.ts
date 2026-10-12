const SECRET_PATTERNS = [
  /authorization\s*:\s*bearer\s+.+/gi,
  /bearer\s+[a-z0-9._~+/=-]+/gi,
  /access_token\s*[:=]\s*['\"]?[^'\"\s,;]+/gi,
  /refresh_token\s*[:=]\s*['\"]?[^'\"\s,;]+/gi,
  /api[_-]?key\s*[:=]\s*['\"]?[^'\"\s,;]+/gi,
  /password\s*[:=]\s*['\"]?[^'\"\s,;]+/gi,
  /client_secret\s*[:=]\s*['\"]?[^'\"\s,;]+/gi,
  /secret\s*[:=]\s*['\"]?[^'\"\s,;]+/gi,
  /x-api-key\s*[:=]\s*['\"]?[^'\"\s,;]+/gi,
];

export function redactSecrets(text: string): string {
  let next = text;
  for (const pattern of SECRET_PATTERNS) {
    next = next.replace(pattern, (match) => {
      if (/authorization/i.test(match)) return match.replace(/(Bearer\s+).+/i, "$1••••••••••••••");
      return match.replace(/(:|=|\s+)([^\s,;]+)$/i, "$1••••••••••••••");
    });
  }
  return next;
}
