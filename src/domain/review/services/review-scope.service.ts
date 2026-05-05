export interface ReviewScope {
  changedFiles: Set<string>;
  changedLinesByFile: Map<string, Set<number>>;
}

export function extractReviewScope(diff: string): ReviewScope {
  const changedFiles = new Set<string>();
  const changedLinesByFile = new Map<string, Set<number>>();
  let currentFile: string | null = null;
  let currentLine: number | null = null;
  let currentChangeType: string | null = null;

  for (const rawLine of diff.split('\n')) {
    const fileMatch = rawLine.match(/^## ([^:]+): (.+)$/);
    if (fileMatch) {
      currentChangeType = fileMatch[1].trim();
      currentFile = fileMatch[2].trim();
      changedFiles.add(currentFile);
      if (!changedLinesByFile.has(currentFile)) {
        changedLinesByFile.set(currentFile, new Set<number>());
      }
      currentLine = currentChangeType === 'Add' ? 1 : null;
      continue;
    }

    const hunkMatch = rawLine.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      currentLine = parseInt(hunkMatch[1], 10);
      continue;
    }

    if (!currentFile || currentLine == null) continue;
    if (rawLine.startsWith('```')) continue;
    if (rawLine.startsWith('+ ')) {
      changedLinesByFile.get(currentFile)?.add(currentLine);
      currentLine += 1;
      continue;
    }
    if (rawLine.startsWith('- ')) continue;
    if (rawLine.startsWith('  ')) currentLine += 1;
  }

  return { changedFiles, changedLinesByFile };
}
