import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureMoahProfile, stageMoahProfile } from "../src/moah/extension.ts";

describe("MoAH native profiles", () => {
	const temporaryDirectories: string[] = [];

	afterEach(() => {
		for (const directory of temporaryDirectories.splice(0)) {
			if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
		}
	});

	it("stages only generated re-export wrappers and replaces the previous profile", () => {
		const cwd = mkdtempSync(join(tmpdir(), "moah-profile-test-"));
		temporaryDirectories.push(cwd);
		const profileDirectory = ensureMoahProfile(cwd);
		const first = stageMoahProfile(cwd, ["structured-output"]);

		expect(first.entries.map((entry) => entry.id)).toEqual(["structured-output"]);
		const wrapper = join(profileDirectory, first.entries[0].wrapper);
		expect(readFileSync(wrapper, "utf8")).toContain("structured-output.ts");
		expect(readFileSync(wrapper, "utf8")).toContain("export { default }");

		const second = stageMoahProfile(cwd, ["todo"]);
		expect(second.entries.map((entry) => entry.id)).toEqual(["todo"]);
		expect(existsSync(wrapper)).toBe(false);
		expect(existsSync(join(profileDirectory, second.entries[0].wrapper))).toBe(true);
	});
});
