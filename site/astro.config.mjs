// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { visit } from 'unist-util-visit';

/**
 * Tiny remark plugin: turn ```mermaid fenced blocks into
 * <pre class="mermaid">…</pre> raw HTML so the client-side bootstrap
 * (head script below) can render them with mermaid.js.
 *
 * Avoids pulling in rehype-mermaid + playwright at build time.
 */
function remarkMermaid() {
  /** @param {string} s */
  const escape = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  /** @param {import('mdast').Root} tree */
  return (tree) => {
    visit(tree, 'code', (node, index, parent) => {
      if (node.lang !== 'mermaid' || !parent || index === undefined) return;
      parent.children[index] = {
        type: 'html',
        value: `<pre class="mermaid">${escape(node.value)}</pre>`,
      };
    });
  };
}

// Client-side bootstrap that renders <pre class="mermaid"> blocks.
// Re-runs on Starlight client-side navigation and on theme change so
// diagrams pick up the right palette in light vs dark.
const mermaidClientScript = /* js */ `
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';

  const themeFor = () =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'neutral';

  let counter = 0;
  const stash = () => {
    document.querySelectorAll('pre.mermaid:not([data-mermaid-source])').forEach((n) => {
      n.setAttribute('data-mermaid-source', n.textContent ?? '');
    });
  };
  const reset = () => {
    document.querySelectorAll('pre.mermaid[data-processed]').forEach((n) => {
      const original = n.getAttribute('data-mermaid-source');
      if (original !== null) {
        n.textContent = original;
        n.removeAttribute('data-processed');
      }
    });
  };
  const render = async () => {
    const blocks = document.querySelectorAll('pre.mermaid:not([data-processed])');
    if (!blocks.length) return;
    mermaid.initialize({
      startOnLoad: false,
      theme: themeFor(),
      securityLevel: 'strict',
      flowchart: { useMaxWidth: true, htmlLabels: true },
    });
    for (const node of blocks) {
      const source = node.getAttribute('data-mermaid-source') ?? node.textContent ?? '';
      const id = 'mermaid-' + (++counter);
      try {
        const { svg } = await mermaid.render(id, source);
        node.innerHTML = svg;
        node.setAttribute('data-processed', 'true');
      } catch (err) {
        console.error('mermaid render failed', err);
      }
    }
  };
  const run = async () => { stash(); await render(); };

  run();
  document.addEventListener('astro:page-load', run);
  new MutationObserver(async () => { reset(); await run(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
`;

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.rettx.eu',
  markdown: {
    syntaxHighlight: { excludeLangs: ['mermaid'] },
    remarkPlugins: [remarkMermaid],
  },
  integrations: [
    starlight({
      title: 'rettX',
      description:
        'Engineering and governance documentation for the rettX patient registry — an initiative of Rett Syndrome Europe.',
      logo: {
        light: './src/assets/logo.svg',
        dark: './src/assets/logo-dark.svg',
        replacesTitle: true,
      },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/brand.css'],
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/rett-europe/rettx' },
      ],
      editLink: {
        baseUrl:
          'https://github.com/rett-europe/rettx/edit/main/site/',
      },
      lastUpdated: true,
      sidebar: [
        {
          label: 'Welcome',
          items: [
            { label: 'What is rettX?', link: '/' },
            { label: 'The ecosystem', link: '/welcome/ecosystem/' },
          ],
        },
        {
          label: 'Architecture',
          autogenerate: { directory: 'architecture' },
        },
        {
          label: 'Governance',
          autogenerate: { directory: 'governance' },
        },
        {
          label: 'Specifications',
          autogenerate: { directory: 'specs' },
        },
        {
          label: 'Decisions (ADRs)',
          autogenerate: { directory: 'decisions' },
        },
      ],
      head: [
        {
          tag: 'meta',
          attrs: {
            name: 'theme-color',
            content: '#8B4EA6',
          },
        },
        {
          tag: 'script',
          attrs: { type: 'module' },
          content: mermaidClientScript,
        },
      ],
      components: {},
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
    }),
  ],
});
