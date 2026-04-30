import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';

export interface RunResult {
  stdout: string;
  stderr: string;
  code: number;
}

/** Executa `berean <args>` e devolve tudo de uma vez */
export async function runCommand(args: string[]): Promise<RunResult> {
  return new Promise((resolve) => {
    const proc = spawn('node', ['./dist/index.js', ...args], {
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => (stdout += chunk));
    proc.stderr.on('data', (chunk) => (stderr += chunk));
    proc.on('close', (code) =>
      resolve({ stdout, stderr, code: code ?? 1 })
    );
  });
}

/** Executa e retorna um Readable (para SSE / streaming) */
export function streamCommand(args: string[]): Readable {
  const proc = spawn('node', ['./dist/index.js', ...args], {
    env: { ...process.env },
  });

  // Mescla stdout e stderr num único stream
  const merged = new Readable({ read() {} });
  proc.stdout.on('data', (d) => merged.push(d));
  proc.stderr.on('data', (d) => merged.push(d));
  proc.on('close', ()  => merged.push(null));

  return merged;
}