// Test-only loader: execute actual server TS with aliases; bypass only the bundler sentinel.
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
const root = new URL('../../', import.meta.url);
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (['next/server', 'next/headers'].includes(specifier))
      return nextResolve(`${specifier}.js`, context);
    if (specifier === 'server-only')
      return { url: 'data:text/javascript,export{}', shortCircuit: true };
    if (
      specifier.startsWith('@/') ||
      (specifier.startsWith('.') && context.parentURL?.endsWith('.ts'))
    ) {
      const base = specifier.startsWith('@/')
        ? new URL(`src/${specifier.slice(2)}`, root)
        : new URL(specifier, context.parentURL);
      const path = fileURLToPath(base);
      for (const candidate of [path, `${path}.ts`, `${path}/index.ts`])
        if (candidate.endsWith('.ts') && existsSync(candidate))
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts'))
      return {
        format: 'module',
        shortCircuit: true,
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText,
      };
    return nextLoad(url, context);
  },
});
