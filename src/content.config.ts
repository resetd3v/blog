import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	schema: ({ image }) =>
		z.object({
			layout: z.string(),
			title: z.string(),
			description: z.string(),
			pubDate: z.coerce.date(),
			tags: z.string().optional(),
			categories: z.string().optional(),
			updatedDate: z.coerce.date().optional(),
			image: image().optional(),
		}),
});

export const collections = { blog };
