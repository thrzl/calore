import { getPalette } from './colorthief';

async function validateRequest(url: string): Promise<{ imageURL: string; colorCount: number; imageSlug: string } | { error: string }> {
	const requestURL = new URL(url);
	const imageURL = requestURL.searchParams.get('image');
	const colorCount = parseInt(requestURL.searchParams.get('count') || '4');

	if (!imageURL) return { error: 'missing image url. specify with ?image=' };

	try {
		if (new URL(imageURL).hostname !== 'i.scdn.co') {
			return { error: 'invalid spotify album image url' };
		}
	} catch {
		return { error: 'invalid spotify album image url' };
	}

	if (Number.isNaN(colorCount) || colorCount < 1 || colorCount > 10) {
		return { error: 'invalid color count specified.' };
	}

	const match = imageURL.match(/[\w\d]{40}/);
	if (!match) {
		return { error: 'invalid spotify album image url' };
	}
	const imageSlug = match[0];
	return { imageURL, colorCount, imageSlug };
}

async function workersCacheGet(key: string): Promise<[number, number, number][] | null> {
	const res = await caches.default.match(key);
	return res ? res.json() : null;
}

export default {
	async fetch(request, env, ctx): Promise<Response> {
		const validation = await validateRequest(request.url);
		if ('error' in validation) {
			return new Response(JSON.stringify({ error: validation.error }), { status: 400, headers: { 'Content-Type': 'application/json' } });
		}
		const { colorCount, imageURL, imageSlug } = validation;

		const headers = {
			'Cache-Control': 'public, s-maxage 2592000',
			'Content-Type': 'application/json',
		};

		const cacheKey = `${colorCount}:${imageSlug}`;
		let cacheHit = await workersCacheGet(cacheKey);
		if (!cacheHit) {
			const rawData = await env.KV.get(cacheKey);
			cacheHit = rawData ? JSON.parse(rawData) : null;

			// by this point, the local cache didnt have it but the KV did. so add to local cache
			if (cacheHit) ctx.waitUntil(caches.default.put(`https://calore.thrzl.xyz/cache/${cacheKey}`, new Response(JSON.stringify(cacheHit))));
		}

		if (cacheHit) {
			console.log(`cache hit: ${cacheKey}`);
			return new Response(JSON.stringify({ palette: cacheHit }), { headers });
		}
		console.log(`cache miss: ${cacheKey}`);

		const imageResp = await fetch(imageURL);
		if (!imageResp.ok) {
			return new Response(JSON.stringify({ error: 'image fetch failed' }), {
				status: imageResp.status,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const buffer = await imageResp.arrayBuffer();

		const palette = await getPalette(buffer, colorCount, 1);
		ctx.waitUntil(env.KV.put(cacheKey, JSON.stringify(palette), { expirationTtl: 2592000 }));
		ctx.waitUntil(caches.default.put(`https://calore.thrzl.xyz/cache/${cacheKey}`, new Response(JSON.stringify(palette))));

		return new Response(JSON.stringify({ palette }), { headers });
	},
} satisfies ExportedHandler<Env>;
