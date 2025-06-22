---
mode: "agent"
tools: ["github", "create_issue", "assign_copilot_to_issue", "codebase"]
description: "Generate a new bug report"
---

#create_issue Create a GitHub issue at xability/maidr using [this template](../ISSUE_TEMPLATE/bug_report.md).

The bug report content is: ${input:bug}

#assign_copilot_to_issue for the created issue.
