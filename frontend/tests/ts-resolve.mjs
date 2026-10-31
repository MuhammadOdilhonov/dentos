// Kichik lokal ESM resolve hook: kengaytmasiz nisbiy importlarni (`./http`) `.ts`
// ga yo'naltiradi, shunda Node 24 ning native TypeScript type-stripping'i bilan
// frontend modullarini to'g'ridan-to'g'ri (bundlesiz, tashqi paketsiz) test qilsa bo'ladi.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    try {
      const base = context.parentURL ? new URL(specifier, context.parentURL) : null;
      if (base) {
        for (const ext of ['.ts', '.tsx']) {
          const candidate = new URL(base.href + ext);
          if (existsSync(fileURLToPath(candidate))) {
            return nextResolve(specifier + ext, context);
          }
        }
      }
    } catch { /* fall through */ }
  }
  return nextResolve(specifier, context);
}
