import { join } from "node:path";
import { getExamplesPath } from "../config.ts";

export interface MoahCapability {
	id: string;
	description: string;
	entry: string;
}

/**
 * These are Pi-maintained examples shipped with MoAH, not reimplemented tools.
 * The router can only auto-load this conservative, auditable set. More
 * privileged extensions remain opt-in because loading an extension executes it.
 */
export function getMoahCapabilities(): MoahCapability[] {
	const examples = getExamplesPath();
	return [
		{
			id: "plan-mode",
			description: "Read-only code exploration, planning, and tracked plan execution.",
			entry: join(examples, "extensions", "plan-mode", "index.ts"),
		},
		{
			id: "todo",
			description: "Create and maintain a task checklist while carrying out multi-step work.",
			entry: join(examples, "extensions", "todo.ts"),
		},
		{
			id: "question",
			description: "Ask the user one focused interactive clarification question.",
			entry: join(examples, "extensions", "question.ts"),
		},
		{
			id: "questionnaire",
			description: "Ask the user a group of structured multiple-choice questions.",
			entry: join(examples, "extensions", "questionnaire.ts"),
		},
		{
			id: "structured-output",
			description: "Finish with a machine-readable structured summary and action items.",
			entry: join(examples, "extensions", "structured-output.ts"),
		},
		{
			id: "truncated-tool",
			description: "Search files with ripgrep while safely truncating large outputs.",
			entry: join(examples, "extensions", "truncated-tool.ts"),
		},
	];
}
