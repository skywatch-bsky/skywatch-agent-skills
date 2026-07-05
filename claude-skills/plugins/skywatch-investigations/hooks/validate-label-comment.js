#!/usr/bin/env node

let stdin = "";
process.stdin.setEncoding("utf-8");
for await (const chunk of process.stdin) {
  stdin += chunk;
}

let hookContext;
try {
  hookContext = JSON.parse(stdin);
} catch {
  process.exit(0);
}

const { tool_input: input } = hookContext;
if (!input) {
  process.exit(0);
}

const comment = input.comment || "";
const subject = input.subject || "";
const label = input.label || "";
const isAccountLevel = subject.startsWith("did:");

const errors = [];

if (!comment.trim()) {
  errors.push("comment is empty");
}

const summaryPattern = new RegExp(
  `^${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s+applied\\s*[—–-]`,
  "im"
);
if (comment.trim() && !summaryPattern.test(comment)) {
  errors.push(
    `missing summary line: comment must start with "${label} applied — [policy basis]"`
  );
}

if (comment.trim() && !/\bevidence:/i.test(comment)) {
  errors.push('missing "Evidence:" section');
}

const atUriCount = (comment.match(/at:\/\/did:plc:[a-z0-9]+\//g) || []).length;
if (comment.trim() && atUriCount === 0) {
  errors.push("no AT-URI citations found (at://did:plc:.../...)");
}

if (isAccountLevel && atUriCount > 0 && atUriCount < 2) {
  errors.push(
    `account-level label requires minimum 2 citations, found ${atUriCount}`
  );
}

if (errors.length === 0) {
  process.exit(0);
}

const reason = [
  `Label comment does not meet labelling standards (${errors.length} issue${errors.length > 1 ? "s" : ""}):`,
  ...errors.map((e) => `  - ${e}`),
  "",
  "Load the labeling-standards skill for the required format.",
  `Expected format: "${label} applied — [policy basis]\\n\\nEvidence:\\n- at://... — \\"[text]\\" — [editorial note]"`,
].join("\n");

const output = {
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: reason,
  },
};

console.log(JSON.stringify(output));
