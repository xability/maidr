---
mode: "agent"
tools: ["github", "create_issue", "assign_copilot_to_issue", "codebase"]
description: "Generate a new feature request"
---

#create_issue Create a GitHub issue at xability/maidr using [this template](../ISSUE_TEMPLATE/feature_request.md).

The feature request content is: ${input:fr}

#assign_copilot_to_issue for the created issue.
