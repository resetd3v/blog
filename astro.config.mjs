// @ts-check

import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
	site: 'https://blog.confusing.wtf',
	server: {
		allowedHosts: [],
	},
	integrations: [mdx(), sitemap()],
	markdown: {
		syntaxHighlight: "shiki",
		shikiConfig: {
			theme: 'dark-plus'
		},
	},
});
