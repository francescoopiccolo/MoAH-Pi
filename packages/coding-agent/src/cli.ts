#!/usr/bin/env node
import { setupCli } from "./cli/setup.ts";
import { main } from "./main.ts";
import { createMoahExtension, ensureMoahProfile } from "./moah/extension.ts";

setupCli();
const cwd = process.cwd();
void main(process.argv.slice(2), {
	extensionFactories: [{ name: "moah-router", factory: createMoahExtension({ cwd }) }],
	additionalExtensionPaths: [ensureMoahProfile(cwd)],
});
