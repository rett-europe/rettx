// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.rettx.eu',
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
      social: {
        github: 'https://github.com/rett-europe/rettx',
      },
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
      ],
      components: {},
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
    }),
  ],
});
