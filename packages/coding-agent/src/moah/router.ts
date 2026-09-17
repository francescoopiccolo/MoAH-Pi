import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { env, type FeatureExtractionPipeline, pipeline } from "@huggingface/transformers";
import type { MoahCapability } from "./capabilities.ts";

const MODEL = "Xenova/multilingual-e5-small";
const BATCH_SIZE = 8;

export interface MoahRoute {
	selected: string[];
	ranked: Array<{ id: string; score: number }>;
	elapsedMs: number;
}

function cosine(left: number[], right: number[]): number {
	if (left.length !== right.length || left.length === 0) throw new Error("Invalid embedding dimensions");
	let dot = 0;
	let leftNorm = 0;
	let rightNorm = 0;
	for (let index = 0; index < left.length; index += 1) {
		dot += left[index] * right[index];
		leftNorm += left[index] ** 2;
		rightNorm += right[index] ** 2;
	}
	const result = dot / Math.sqrt(leftNorm * rightNorm);
	if (!Number.isFinite(result)) throw new Error("Invalid embedding values");
	return result;
}

function toVectors(value: Awaited<ReturnType<FeatureExtractionPipeline>>): number[][] {
	const list = value.tolist();
	if (!Array.isArray(list) || !list.every((row) => Array.isArray(row) && row.every(Number.isFinite))) {
		throw new Error("Embedding model returned an invalid tensor");
	}
	return list as number[][];
}

export class MoahRouter {
	private extractor: FeatureExtractionPipeline | undefined;
	private readonly vectors = new Map<string, number[]>();
	private readonly cacheDir: string;

	constructor(cacheDir: string) {
		this.cacheDir = cacheDir;
	}

	async setup(): Promise<void> {
		await this.load(true);
	}

	async route(prompt: string, candidates: MoahCapability[]): Promise<MoahRoute> {
		const started = performance.now();
		if (candidates.length === 0) return { selected: [], ranked: [], elapsedMs: performance.now() - started };
		const descriptions = candidates.map((candidate) => `${candidate.id}: ${candidate.description}`.slice(0, 2000));
		await this.ensureCandidateVectors(descriptions);
		const [query] = await this.embed([`query: ${prompt.slice(0, 4000) || "available capability"}`], false);
		const ranked = candidates
			.map((candidate, index) => ({
				id: candidate.id,
				score: cosine(query, this.vectors.get(descriptions[index]) ?? []),
			}))
			.sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
		return {
			selected: ranked
				.filter((candidate) => candidate.score >= 0.28)
				.slice(0, 3)
				.map((candidate) => candidate.id),
			ranked,
			elapsedMs: performance.now() - started,
		};
	}

	private async ensureCandidateVectors(descriptions: string[]): Promise<void> {
		const cacheKey = createHash("sha256")
			.update(JSON.stringify([MODEL, descriptions]))
			.digest("hex");
		const cacheFile = join(this.cacheDir, "embeddings", `${cacheKey}.json`);
		let cached: number[][] | undefined;
		try {
			const parsed: unknown = JSON.parse(await readFile(cacheFile, "utf8"));
			if (
				Array.isArray(parsed) &&
				parsed.length === descriptions.length &&
				parsed.every((row) => Array.isArray(row) && row.length > 0 && row.every(Number.isFinite))
			) {
				cached = parsed as number[][];
			}
		} catch {
			// The cache is optional. Missing or malformed data is rebuilt below.
		}
		const values =
			cached ??
			(await this.embed(
				descriptions.map((description) => `passage: ${description}`),
				false,
			));
		for (let index = 0; index < descriptions.length; index += 1) this.vectors.set(descriptions[index], values[index]);
		if (!cached) {
			await mkdir(join(this.cacheDir, "embeddings"), { recursive: true });
			const temporary = `${cacheFile}.${process.pid}.${Date.now()}.tmp`;
			await writeFile(temporary, JSON.stringify(values), "utf8");
			await rename(temporary, cacheFile);
		}
	}

	private async embed(texts: string[], download: boolean): Promise<number[][]> {
		const extractor = await this.load(download);
		const vectors: number[][] = [];
		for (let index = 0; index < texts.length; index += BATCH_SIZE) {
			const tensor = await extractor(texts.slice(index, index + BATCH_SIZE), {
				pooling: "mean",
				normalize: true,
			});
			vectors.push(...toVectors(tensor));
			tensor.dispose();
		}
		return vectors;
	}

	private async load(download: boolean): Promise<FeatureExtractionPipeline> {
		if (this.extractor) return this.extractor;
		await mkdir(this.cacheDir, { recursive: true });
		env.cacheDir = this.cacheDir;
		this.extractor = await pipeline("feature-extraction", MODEL, {
			cache_dir: this.cacheDir,
			local_files_only: !download,
			// transformers.js currently maps "auto" to DirectML alone on Windows,
			// while ONNX Runtime requires DirectML together with the CPU provider.
			device: process.platform === "win32" ? "dml" : "cpu",
			dtype: "q8",
			session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 },
		});
		return this.extractor;
	}
}
