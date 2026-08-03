export function extractRelativeJsImports(source) {
  return [
    ...source.matchAll(
      /(?:from\s*|import\s*\(\s*|import\s+)(["'])(\.[^"']+\.js)\1/g
    ),
  ].map((match) => match[2]);
}
