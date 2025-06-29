---
mode: "agent"
tools: ["github", "create_issue", "assign_copilot_to_issue", "codebase"]
description: "Generate a new bug report"
---

Before anything else, make sure you have received ${input:bug} from user.

#create_issue Create a GitHub issue for ${input:bug} at xability/maidr using [this template](../ISSUE_TEMPLATE/bug_report.md).

#assign_copilot_to_issue for the created issue.
