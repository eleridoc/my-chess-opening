import { Injectable } from '@angular/core';

export type ExplorerPositionExportPngInput = {
	/** Board host element or direct SVG element to export. */
	element: HTMLElement | SVGSVGElement;

	/** Downloaded PNG file name. */
	fileName: string;
};

type SvgLinkRef = {
	node: Element;
	attributeName: 'href' | 'xlink:href';
	value: string;
};

type ExternalSvgReference = {
	node: Element;
	attributeName: 'href' | 'xlink:href';
	assetUrl: string;
	fragmentId: string;
};

type ImportedSvgAsset = {
	prefix: string;
	idMap: Map<string, string>;
};

/**
 * Exports the current rendered board to PNG.
 *
 * Strategy:
 * - collect visible SVG layers rendered by the board
 * - clone them
 * - inline computed styles
 * - embed external SVG sprite references locally
 * - embed missing local fragment definitions (for cached piece sprites)
 * - compose everything into a single SVG
 * - render the result to canvas and download as PNG
 */
@Injectable({
	providedIn: 'root',
})
export class ExplorerPositionExportPngService {
	private readonly svgDocumentCache = new Map<string, Promise<XMLDocument>>();

	async exportBoardAsPng(input: ExplorerPositionExportPngInput): Promise<void> {
		const svgLayers = this.resolveBoardSvgLayers(input.element);
		if (svgLayers.length === 0) {
			throw new Error('Board SVG layers were not found.');
		}

		const { width, height } = this.resolveExportSize(input.element, svgLayers);
		if (width <= 0 || height <= 0) {
			throw new Error('Board export size is invalid.');
		}

		const composedSvg = await this.buildComposedSvg(input.element, svgLayers, width, height);

		const serializedSvg = new XMLSerializer().serializeToString(composedSvg);
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

	private resolveBoardSvgLayers(element: HTMLElement | SVGSVGElement): SVGSVGElement[] {
		if (element instanceof SVGSVGElement) {
			return [element];
		}

		const allSvgs = Array.from(element.querySelectorAll('svg')).filter(
			(node): node is SVGSVGElement => node instanceof SVGSVGElement,
		);

		const topLevelSvgs = allSvgs.filter((svg) => {
			let parent = svg.parentElement;
			while (parent && parent !== element) {
				if (parent instanceof SVGSVGElement) {
					return false;
				}
				parent = parent.parentElement;
			}
			return true;
		});

		return topLevelSvgs.filter((svg) => {
			const rect = svg.getBoundingClientRect();
			return rect.width > 0 && rect.height > 0;
		});
	}

	private resolveExportSize(
		element: HTMLElement | SVGSVGElement,
		svgLayers: readonly SVGSVGElement[],
	): { width: number; height: number } {
		if (element instanceof HTMLElement) {
			const rect = element.getBoundingClientRect();
			const width = Math.round(rect.width);
			const height = Math.round(rect.height);

			if (width > 0 && height > 0) {
				return { width, height };
			}
		}

		for (const svg of svgLayers) {
			const rect = svg.getBoundingClientRect();
			const width = Math.round(rect.width);
			const height = Math.round(rect.height);

			if (width > 0 && height > 0) {
				return { width, height };
			}
		}

		return this.resolveSvgSize(svgLayers[0]);
	}

	private async buildComposedSvg(
		exportRoot: HTMLElement | SVGSVGElement,
		sourceLayers: readonly SVGSVGElement[],
		width: number,
		height: number,
	): Promise<SVGSVGElement> {
		const composedSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

		composedSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		composedSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
		composedSvg.setAttribute('width', String(width));
		composedSvg.setAttribute('height', String(height));
		composedSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);

		for (const sourceLayer of sourceLayers) {
			const clonedLayer = sourceLayer.cloneNode(true) as SVGSVGElement;

			this.inlineComputedStylesRecursive(sourceLayer, clonedLayer);
			await this.embedExternalSvgReferences(clonedLayer);
			this.prepareNestedLayerSvg(clonedLayer, width, height);

			composedSvg.appendChild(clonedLayer);
		}

		this.embedMissingLocalFragmentDefinitions(composedSvg, exportRoot);

		return composedSvg;
	}

	private prepareNestedLayerSvg(svg: SVGSVGElement, width: number, height: number): void {
		svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
		svg.setAttribute('x', '0');
		svg.setAttribute('y', '0');
		svg.setAttribute('width', String(width));
		svg.setAttribute('height', String(height));

		if (!svg.getAttribute('viewBox')) {
			svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
		}
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

	private async embedExternalSvgReferences(svg: SVGSVGElement): Promise<void> {
		const refs = this.collectExternalSvgReferences(svg);
		if (refs.length === 0) return;

		const refsByAssetUrl = new Map<string, ExternalSvgReference[]>();

		for (const ref of refs) {
			const current = refsByAssetUrl.get(ref.assetUrl) ?? [];
			current.push(ref);
			refsByAssetUrl.set(ref.assetUrl, current);
		}

		let assetIndex = 0;

		for (const [assetUrl, assetRefs] of refsByAssetUrl) {
			const externalSvgDocument = await this.loadExternalSvgDocument(assetUrl);
			const importedAsset = this.importExternalSvgAsset(
				svg,
				externalSvgDocument,
				`mcoext${++assetIndex}`,
			);

			for (const ref of assetRefs) {
				const localId = importedAsset.idMap.get(ref.fragmentId);
				if (!localId) {
					console.warn(
						`[ExplorerPositionExportPng] Missing fragment "${ref.fragmentId}" in external SVG asset "${assetUrl}".`,
					);
					continue;
				}

				ref.node.setAttribute(ref.attributeName, `#${localId}`);
			}
		}
	}

	private collectExternalSvgReferences(svg: SVGSVGElement): ExternalSvgReference[] {
		const refs: ExternalSvgReference[] = [];
		const nodes = Array.from(svg.querySelectorAll('use, image'));

		for (const node of nodes) {
			for (const attributeName of ['href', 'xlink:href'] as const) {
				const rawValue = node.getAttribute(attributeName);
				if (!rawValue) continue;
				if (rawValue.startsWith('#')) continue;

				const parsed = this.parseExternalSvgReference(rawValue);
				if (!parsed) continue;

				refs.push({
					node,
					attributeName,
					assetUrl: parsed.assetUrl,
					fragmentId: parsed.fragmentId,
				});
			}
		}

		return refs;
	}

	private parseExternalSvgReference(
		value: string,
	): { assetUrl: string; fragmentId: string } | null {
		try {
			const absoluteUrl = new URL(value, document.baseURI);
			if (!absoluteUrl.hash) return null;
			if (!absoluteUrl.pathname.toLowerCase().endsWith('.svg')) return null;

			const fragmentId = absoluteUrl.hash.slice(1);
			if (!fragmentId) return null;

			absoluteUrl.hash = '';

			return {
				assetUrl: absoluteUrl.href,
				fragmentId,
			};
		} catch {
			return null;
		}
	}

	private async loadExternalSvgDocument(assetUrl: string): Promise<XMLDocument> {
		let cached = this.svgDocumentCache.get(assetUrl);
		if (!cached) {
			cached = fetch(assetUrl)
				.then(async (response) => {
					if (!response.ok) {
						throw new Error(`Failed to fetch SVG asset: ${assetUrl}`);
					}

					const text = await response.text();
					return new DOMParser().parseFromString(text, 'image/svg+xml');
				})
				.then((doc) => {
					if (doc.querySelector('parsererror')) {
						throw new Error(`Failed to parse SVG asset: ${assetUrl}`);
					}
					return doc;
				});

			this.svgDocumentCache.set(assetUrl, cached);
		}

		return cached;
	}

	private importExternalSvgAsset(
		targetSvg: SVGSVGElement,
		externalSvgDocument: XMLDocument,
		prefix: string,
	): ImportedSvgAsset {
		const defs = this.ensureDefs(targetSvg);
		const importedAssetGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
		const idMap = new Map<string, string>();

		for (const childNode of Array.from(externalSvgDocument.documentElement.childNodes)) {
			const importedNode = document.importNode(childNode, true);
			importedAssetGroup.appendChild(importedNode);
		}

		this.remapIdsRecursive(importedAssetGroup, prefix, idMap);
		this.rewriteLocalReferencesRecursive(importedAssetGroup, idMap);

		while (importedAssetGroup.firstChild) {
			defs.appendChild(importedAssetGroup.firstChild);
		}

		return {
			prefix,
			idMap,
		};
	}

	private embedMissingLocalFragmentDefinitions(
		composedSvg: SVGSVGElement,
		exportRoot: HTMLElement | SVGSVGElement,
	): void {
		const missingIds = this.collectMissingLocalReferenceIds(composedSvg);
		if (missingIds.length === 0) return;

		const defs = this.ensureDefs(composedSvg);
		const searchRoots = this.buildDefinitionSearchRoots(exportRoot);
		const importedIds = new Set<string>();
		const visitingIds = new Set<string>();

		for (const id of missingIds) {
			this.importLocalDefinitionRecursive(id, defs, searchRoots, importedIds, visitingIds);
		}
	}

	private collectMissingLocalReferenceIds(svg: SVGSVGElement): string[] {
		const missing = new Set<string>();
		const nodes = Array.from(svg.querySelectorAll('*'));

		for (const node of nodes) {
			for (const ref of this.collectLocalRefsFromNode(node)) {
				if (svg.querySelector(`#${this.escapeSelector(ref)}`)) continue;
				missing.add(ref);
			}
		}

		return Array.from(missing);
	}

	private collectLocalRefsFromNode(node: Element): string[] {
		const refs: string[] = [];

		for (const attributeName of [
			'href',
			'xlink:href',
			'fill',
			'stroke',
			'filter',
			'clip-path',
			'mask',
			'marker-start',
			'marker-mid',
			'marker-end',
			'style',
		]) {
			const value = node.getAttribute(attributeName);
			if (!value) continue;

			for (const ref of this.extractLocalFragmentIds(value)) {
				refs.push(ref);
			}
		}

		if (node.tagName.toLowerCase() === 'style' && node.textContent) {
			for (const ref of this.extractLocalFragmentIds(node.textContent)) {
				refs.push(ref);
			}
		}

		return refs;
	}

	private extractLocalFragmentIds(value: string): string[] {
		const ids = new Set<string>();

		const directFragmentMatch = value.match(/^#([A-Za-z_][\w:.-]*)$/);
		if (directFragmentMatch) {
			ids.add(directFragmentMatch[1]);
		}

		for (const match of value.matchAll(/url\(#([^)]+)\)/g)) {
			const id = match[1]?.trim();
			if (id) ids.add(id);
		}

		return Array.from(ids);
	}

	private buildDefinitionSearchRoots(exportRoot: HTMLElement | SVGSVGElement): ParentNode[] {
		const roots: ParentNode[] = [];

		if (exportRoot instanceof SVGSVGElement) {
			roots.push(exportRoot);
		} else {
			roots.push(exportRoot);
			if (exportRoot.ownerDocument) {
				roots.push(exportRoot.ownerDocument);
			}
		}

		return roots;
	}

	private importLocalDefinitionRecursive(
		id: string,
		targetDefs: SVGDefsElement,
		searchRoots: readonly ParentNode[],
		importedIds: Set<string>,
		visitingIds: Set<string>,
	): void {
		if (importedIds.has(id) || visitingIds.has(id)) return;

		const sourceElement = this.findDefinitionElementById(id, searchRoots);
		if (!sourceElement) return;

		visitingIds.add(id);

		const clone = document.importNode(sourceElement, true) as Element;

		for (const depId of this.collectLocalRefsFromNode(clone)) {
			if (depId !== id) {
				this.importLocalDefinitionRecursive(
					depId,
					targetDefs,
					searchRoots,
					importedIds,
					visitingIds,
				);
			}
		}

		targetDefs.appendChild(clone);
		importedIds.add(id);
		visitingIds.delete(id);
	}

	private findDefinitionElementById(
		id: string,
		searchRoots: readonly ParentNode[],
	): Element | null {
		for (const root of searchRoots) {
			if (!(root instanceof Document || root instanceof Element)) continue;

			const found = root.querySelector(`#${this.escapeSelector(id)}`);
			if (found && found instanceof Element) {
				return found;
			}
		}

		return null;
	}

	private ensureDefs(svg: SVGSVGElement): SVGDefsElement {
		const existingDefs = Array.from(svg.children).find(
			(node): node is SVGDefsElement => node instanceof SVGDefsElement,
		);

		if (existingDefs) {
			return existingDefs;
		}

		const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
		svg.insertBefore(defs, svg.firstChild);
		return defs;
	}

	private remapIdsRecursive(node: Node, prefix: string, idMap: Map<string, string>): void {
		if (node instanceof Element) {
			const currentId = node.getAttribute('id');
			if (currentId) {
				const nextId = `${prefix}__${currentId}`;
				idMap.set(currentId, nextId);
				node.setAttribute('id', nextId);
			}
		}

		for (const child of Array.from(node.childNodes)) {
			this.remapIdsRecursive(child, prefix, idMap);
		}
	}

	private rewriteLocalReferencesRecursive(node: Node, idMap: ReadonlyMap<string, string>): void {
		if (node instanceof Element) {
			for (const attrName of [
				'href',
				'xlink:href',
				'fill',
				'stroke',
				'filter',
				'clip-path',
				'mask',
				'marker-start',
				'marker-mid',
				'marker-end',
				'style',
			]) {
				const value = node.getAttribute(attrName);
				if (!value) continue;

				const rewritten = this.rewriteReferenceValue(value, idMap);
				if (rewritten !== value) {
					node.setAttribute(attrName, rewritten);
				}
			}

			if (node.tagName.toLowerCase() === 'style' && node.textContent) {
				node.textContent = this.rewriteReferenceValue(node.textContent, idMap);
			}
		}

		for (const child of Array.from(node.childNodes)) {
			this.rewriteLocalReferencesRecursive(child, idMap);
		}
	}

	private rewriteReferenceValue(value: string, idMap: ReadonlyMap<string, string>): string {
		let out = value.replace(/url\(#([^)]+)\)/g, (full, id: string) => {
			const mapped = idMap.get(id);
			return mapped ? `url(#${mapped})` : full;
		});

		if (out.startsWith('#')) {
			const rawId = out.slice(1);
			const mapped = idMap.get(rawId);
			if (mapped) {
				out = `#${mapped}`;
			}
		}

		return out;
	}

	private escapeSelector(value: string): string {
		if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
			return CSS.escape(value);
		}

		return value.replace(/([ !"#$%&'()*+,./:;<=>?@[\\\]^`{|}~])/g, '\\$1');
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
