import fs from 'fs';
import path from 'path';

const INCLUDE_PATTERN = /^([ \t]*)<!--\s*@include\s+([^\s>]+?)\s*-->[ \t]*\r?\n?/gm;

/**
 * Minimal server-side HTML include engine.
 *
 * Replaces `<!-- @include partials/foo.html -->` markers with the referenced
 * file's contents, resolved relative to the views directory and applied
 * recursively. File reads are cached only in production so `tsx watch`
 * picks up partial edits during development.
 */
export function createTemplateEngine(viewsDir: string) {
  const root = path.resolve(viewsDir);
  const cache = new Map<string, string>();
  const useCache = process.env.NODE_ENV === 'production';

  function readFile(resolved: string): string {
    if (useCache && cache.has(resolved)) return cache.get(resolved) as string;
    const content = fs.readFileSync(resolved, 'utf8');
    cache.set(resolved, content);
    return content;
  }

  function resolveIncludes(content: string, baseDir: string, stack: string[]): string {
    return content.replace(INCLUDE_PATTERN, (_match, _indent: string, relPath: string) => {
      const resolved = path.resolve(baseDir, relPath);

      if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        throw new Error(`@include path escapes the views directory: ${relPath}`);
      }
      if (stack.includes(resolved)) {
        throw new Error(`Circular @include detected: ${[...stack, resolved].join(' -> ')}`);
      }

      const partial = readFile(resolved);
      return resolveIncludes(partial, path.dirname(resolved), [...stack, resolved]);
    });
  }

  return {
    /** Render a view (default: index.html) with all includes expanded. */
    render(viewName = 'index.html'): string {
      const entry = path.resolve(root, viewName);
      return resolveIncludes(readFile(entry), path.dirname(entry), [entry]);
    },
    renderPage(contentView: string): string {
      const layoutPath = path.resolve(root, 'index.html');
      const contentPath = path.resolve(root, contentView);
      if (!contentPath.startsWith(root + path.sep)) {
        throw new Error(`Page path escapes the views directory: ${contentView}`);
      }

      const layout = resolveIncludes(readFile(layoutPath), path.dirname(layoutPath), [layoutPath]);
      const content = resolveIncludes(readFile(contentPath), path.dirname(contentPath), [contentPath]);
      const contentSlot = '<!-- @content -->';
      if (!layout.includes(contentSlot)) {
        throw new Error('The application layout is missing its content slot');
      }
      return layout.replace(contentSlot, content);
    },
    clearCache(): void {
      cache.clear();
    },
  };
}
