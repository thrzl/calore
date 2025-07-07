import quantize from '@lokesh.dhakar/quantize';
import jpeg from 'jpeg-js';
import type { BufferLike } from 'jpeg-js';

function createPixelArray(pixels: BufferLike, pixelCount: number, quality: number) {
	const pixelArray = [];

	for (let i = 0, offset, r, g, b, a; i < pixelCount; i += quality) {
		offset = i * 4;
		r = pixels[offset];
		g = pixels[offset + 1];
		b = pixels[offset + 2];
		a = pixels[offset + 3];

		// If pixel is mostly opaque and not white
		if ((typeof a === 'undefined' || a >= 125) && !(r > 250 && g > 250 && b > 250)) pixelArray.push([r, g, b]);
	}

	return pixelArray;
}

function validateOptions(options: { colorCount: number; quality: number }) {
	let { colorCount, quality } = options;

	if (typeof colorCount === 'undefined' || !Number.isInteger(colorCount)) {
		colorCount = 10;
	} else if (colorCount === 1) {
		throw new Error('`colorCount` should be between 2 and 20. To get one color, call `getColor()` instead of `getPalette()`');
	} else {
		colorCount = Math.max(colorCount, 2);
		colorCount = Math.min(colorCount, 20);
	}

	if (typeof quality === 'undefined' || !Number.isInteger(quality) || quality < 1) quality = 10;

	return { colorCount, quality };
}

function loadJPEG(jpegData: ArrayBuffer) {
	return jpeg.decode(jpegData);
}

export async function getPalette(img: ArrayBuffer, colorCount = 10, quality = 10) {
	const options = validateOptions({ colorCount, quality });

	const imgData = loadJPEG(img);
	const pixelCount = imgData.width * imgData.height;
	const pixelArray = createPixelArray(imgData.data, pixelCount, options.quality);

	const cmap = quantize(pixelArray, options.colorCount);
	const palette = cmap ? cmap.palette() : null;

	return palette;
}
