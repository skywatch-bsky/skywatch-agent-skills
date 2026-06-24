#!/usr/bin/env node
// Polytoken `pre_tool_use` hook: enforce `labeling-standards` on ozone_label
// comments. Adapted from the Claude Code hook at
// plugins/skywatch-investigations/hooks/validate-label-comment.js.
//
// Only the I/O layer changed for Polytoken:
//   - reads the event JSON `{ input: { comment, subject, label, ... } }`
//     (Polytoken passes tool args under `.input`)
//   - reports a DENY by printing the reason to stdout and exiting 2
//     (Polytoken's exit-code shorthand: stdout is shown to the model)
//   - reports ALLOW by exiting 0 with no output
// The validation logic itself is harness-agnostic and unchanged.

const fs = require("fs");

let event;
try {
  event = JSON.parse(fs.readFileSync(0, "utf8"));
} catch {
  process.exit(0); // unreadable input: do not block
}

const input = (event && event.input) || {};
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
  process.exit(0); // allow
}

const reason = [
  `Label comment does not meet labelling standards (${errors.length} issue${errors.length > 1 ? "s" : ""}):`,
  ...errors.map((e) => `  - ${e}`),
  "",
  "Load the labeling-standards skill for the required format.",
  `Expected format: "${label} applied — [policy basis]\\n\\nEvidence:\\n- at://... — \\"[text]\\" — [editorial note]"`,
].join("\n");

process.stdout.write(reason);
process.exit(2); // deny
