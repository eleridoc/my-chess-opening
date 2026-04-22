import { Injectable } from '@angular/core';

export type ExplorerPositionExportPngInput = {
	/** Board host element or direct SVG element to export. */
	element: HTMLElement | SVGSVGElement;

	/** Downloaded PNG file name. */
	fileName: string;
};

/**
 * Exports the current rendered board to PNG.
 *
 * Current strategy (V1.10.6):
 * - use the live SVG rendered by cm-chessboard
 * - clone it
 * - inline computed styles so visual markers/arrows survive outside the document
 * - absolutize linked resources (piece sprite references)
 * - render the SVG into a canvas
 * - trigger a PNG download
 *
 * This preserves the board "as displayed" as long as cm-chessboard keeps rendering
 * the current board state through SVG.
 */
@Injectable({
	providedIn: 'root',
})
export class ExplorerPositionExportPngService {
	async exportBoardAsPng(input: ExplorerPositionExportPngInput): Promise<void> {
		const svg = this.resolveBoardSvg(input.element);
		if (!svg) {
			throw new Error('Board SVG element was not found.');
		}

		const { width, height } = this.resolveSvgSize(svg);
		if (width <= 0 || height <= 0) {
			throw new Error('Board SVG size is invalid.');
		}

		const clonedSvg = svg.cloneNode(true) as SVGSVGElement;

		this.inlineComputedStylesRecursive(svg, clonedSvg);
		this.absolutizeLinkedResources(clonedSvg);
		this.prepareSvgRoot(clonedSvg, width, height);

		const serializedSvg = new XMLSerializer().serializeToString(clonedSvg);
		const svgBlob = new Blob([serializedSvg], {
			type: 'image/svg+xml;charset=utf-8',
		});

		const objectUrl = URL.createObjectURL(svgBlob);

		try {
			const image = await this.loadImage(objectUrl);

			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;

			const context = canvas.getContext('2d');
			if (!context) {
				throw new Error('Canvas 2D context is not available.');
			}

			context.clearRect(0, 0, width, height);
			context.drawImage(image, 0, 0, width, height);

			const pngBlob = await this.canvasToPngBlob(canvas);
			this.triggerBrowserDownload(pngBlob, input.fileName);
		} finally {
			URL.revokeObjectURL(objectUrl);
		}
	}

	private resolveBoardSvg(element: HTMLElement | SVGSVGElement): SVGSVGElement | null {
		if (element instanceof SVGSVGElement) {
			return element;
		}

		const candidates = Array.from(element.querySelectorAll('svg')).filter(
			(node): node is SVGSVGElement => node instanceof SVGSVGElement,
		);

		if (candidates.length === 0) {
			return null;
		}

		let best: SVGSVGElement | null = null;
		let bestArea = -1;

		for (const candidate of candidates) {
			const rect = candidate.getBoundingClientRect();
			const area = rect.width * rect.height;

			if (area > bestArea) {
				best = candidate;
				bestArea = area;
			}
		}

		return best ?? candidates[0] ?? null;
	}

	private resolveSvgSize(svg: SVGSVGElement): { width: number; height: number } {
		const rect = svg.getBoundingClientRect();

		const widthFromRect = Math.round(rect.width);
		const heightFromRect = Math.round(rect.height);

		if (widthFromRect > 0 && heightFromRect > 0) {
			return { width: widthFromRect, height: heightFromRect };
		}

		const widthAttr = Number.parseFloat(svg.getAttribute('width') ?? '0');
		const heightAttr = Number.parseFloat(svg.getAttribute('height') ?? '0');

		if (widthAttr > 0 && heightAttr > 0) {
			return {
				width: Math.round(widthAttr),
				height: Math.round(heightAttr),
			};
		}

		const viewBox = svg.viewBox?.baseVal;
		if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
			return {
				width: Math.round(viewBox.width),
				height: Math.round(viewBox.height),
			};
		}

		return { width: 0, height: 0 };
	}

	private prepareSvgRoot(svg: SVGSVGElement, width: number, height: number): void {
		svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
		svg.setAttribute('width', String(width));
		svg.setAttribute('height', String(height));

		if (!svg.getAttribute('viewBox')) {
			svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
		}
	}

	private inlineComputedStylesRecursive(source: Element, target: Element): void {
		this.inlineComputedStyle(source, target);

		const sourceChildren = Array.from(source.children);
		const targetChildren = Array.from(target.children);

		for (let index = 0; index < sourceChildren.length; index++) {
			const sourceChild = sourceChildren[index];
			const targetChild = targetChildren[index];
			if (!sourceChild || !targetChild) continue;

			this.inlineComputedStylesRecursive(sourceChild, targetChild);
		}
	}

	private inlineComputedStyle(source: Element, target: Element): void {
		const computed = window.getComputedStyle(source);
		const styleText = Array.from(computed)
			.map((prop) => `${prop}:${computed.getPropertyValue(prop)};`)
			.join('');

		if (styleText) {
			target.setAttribute('style', styleText);
		}
	}

	private absolutizeLinkedResources(svg: SVGSVGElement): void {
		const linkedNodes = Array.from(svg.querySelectorAll('use, image'));

		for (const node of linkedNodes) {
			this.absolutizeAttribute(node, 'href');
			this.absolutizeAttribute(node, 'xlink:href');
		}
	}

	private absolutizeAttribute(node: Element, attributeName: string): void {
		const currentValue = node.getAttribute(attributeName);
		if (!currentValue) return;

		// Keep fragment-only and already absolute URLs untouched.
		if (currentValue.startsWith('#') || /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(currentValue)) {
			return;
		}

		const absoluteUrl = new URL(currentValue, document.baseURI).href;
		node.setAttribute(attributeName, absoluteUrl);
	}

	private loadImage(src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const image = new Image();

			image.onload = () => resolve(image);
			image.onerror = () => reject(new Error('Failed to load serialized board SVG image.'));
			image.src = src;
		});
	}

	private canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
		return new Promise((resolve, reject) => {
			canvas.toBlob((blob) => {
				if (!blob) {
					reject(new Error('Failed to encode PNG blob.'));
					return;
				}

				resolve(blob);
			}, 'image/png');
		});
	}

	private triggerBrowserDownload(blob: Blob, fileName: string): void {
		const objectUrl = URL.createObjectURL(blob);

		const anchor = document.createElement('a');
		anchor.href = objectUrl;
		anchor.download = fileName;
		anchor.style.display = 'none';

		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();

		setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
	}
}
