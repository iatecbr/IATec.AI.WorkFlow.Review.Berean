/**
 * Extrai apenas o bloco de code review do output bruto do CLI.
 * Descarta warnings do Node, mensagens de debug, linhas ANSI, etc.
 */
export function parseReviewOutput(raw: string): string {
    // 1. Remove códigos ANSI de cor/formatação  (\x1B[32m, [39m, etc.)
    const clean = raw.replace(/\x1B\[[0-9;]*m/g, '');

    // 2. Remove linhas de ruído conhecidas
    const noisePatterns = [
        /^\[CLI subprocess\]/,
        /^Debugger (listening|attached)/,
        /^For help, see:/,
        /^\(node:\d+\) Experimental/,
        /^Use `node --trace/,
        /^Waiting for the debugger to disconnect/,
    ];

    const lines = clean
        .split('\n')
        .filter((line) => !noisePatterns.some((p) => p.test(line.trim())));

    const text = lines.join('\n');

    // 3. Captura tudo a partir do primeiro separador ════
    const separatorIndex = text.indexOf('════');
    if (separatorIndex === -1) {
        // Fallback: devolve o texto limpo sem o ruído
        return text.trim();
    }

    return text.slice(separatorIndex).trim();
}