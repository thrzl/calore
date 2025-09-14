import { getPalette } from 'cf-colorthief';

async function validateRequest(url: string): Promise<{ imageURL: string; colorCount: number; imageSlug: string } | { error: string }> {
	const requestURL = new URL(url);
	const rawImageUrl = requestURL.searchParams.get('image');
	const colorCount = parseInt(requestURL.searchParams.get('count') || '4');

	if (!rawImageUrl) return { error: 'missing image url. specify with ?image=' };

	if (Number.isNaN(colorCount) || colorCount < 1 || colorCount > 10) {
		return { error: 'invalid color count specified.' };
	}

	try {
		const imageUrl = new URL(rawImageUrl);
		if (imageUrl.hostname === 'is1-ssl.mzstatic.com') {
			const newUrl = rawImageUrl.replace('100x100bb', '500x500bb').replace('60x60bb', '500x500bb');
			return {
				imageURL: newUrl,
				imageSlug: imageUrl.pathname.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0] || imageUrl.pathname,
				colorCount,
			};
		} else if (imageUrl.hostname !== 'i.scdn.co') {
			const mbidMatch = imageUrl.pathname.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
			if (imageUrl.hostname === 'coverartarchive.org' && mbidMatch) {
				const mbid = mbidMatch[0];
				return { imageURL: `https://coverartarchive.org/release/${mbid}/front-500`, imageSlug: mbid, colorCount };
			}
			return { error: 'invalid album image url' };
		}
	} catch {
		return { error: 'invalid album image url' };
	}

	const match = rawImageUrl.match(/[\w\d]{40}/);
	if (!match) {
		return { error: 'invalid album image url' };
	}
	const imageSlug = match[0];
	return { imageURL: rawImageUrl, colorCount, imageSlug };
}

function buildWorkersCacheRequest(url: string): Request {
	return new Request(new URL(url).toString());
}

async function workersCacheGet(key: string): Promise<[number, number, number][] | null> {
	const res = await caches.default.match(buildWorkersCacheRequest(`https://calore.thrzl.xyz/cache/${key}`));
	console.log(`workersCacheGet: ${res?.status}`);
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
		console.log(`local cache: ${cacheHit}`);
		if (!cacheHit) {
			const rawData = await env.KV.get(cacheKey);
			cacheHit = rawData ? JSON.parse(rawData) : null;

			// by this point, the local cache didnt have it but the KV did. so add to local cache
			if (cacheHit)
				ctx.waitUntil(
					caches.default.put(
						buildWorkersCacheRequest(`https://calore.thrzl.xyz/cache/${cacheKey}`),
						new Response(JSON.stringify(cacheHit)),
					),
				);
		} else console.log('local cache hit');

		if (cacheHit) {
			console.log(`cache hit: ${cacheKey}`);
			return new Response(JSON.stringify({ palette: cacheHit }), { headers });
		}
		console.log(`cache miss: ${cacheKey}`);

		const imageResp = await fetch(imageURL);
		console.log(imageResp.status, imageResp.statusText);
		if (!imageResp.ok) {
			return new Response(JSON.stringify({ error: 'image fetch failed' }), {
				status: imageResp.status,
				headers: { 'Content-Type': 'application/json' },
			});
		}

		const buffer = await imageResp.arrayBuffer();

		const palette = await getPalette(buffer, colorCount, 1);
		ctx.waitUntil(env.KV.put(cacheKey, JSON.stringify(palette), { expirationTtl: 2592000 }));
		ctx.waitUntil(
			caches.default.put(buildWorkersCacheRequest(`https://calore.thrzl.xyz/cache/${cacheKey}`), new Response(JSON.stringify(palette))),
		);

		return new Response(JSON.stringify({ palette }), { headers });
	},
} satisfies ExportedHandler<Env>;
