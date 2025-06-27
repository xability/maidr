---
mode: "agent"
tools: ["github", "create_issue", "assign_copilot_to_issue", "codebase"]
description: "Generate a new feature request"
---

Before anything else, make sure you have received ${input:fr} from user.

#create_issue Create a GitHub issue for ${input:fr} at xability/maidr using [this template](../ISSUE_TEMPLATE/feature_request.md).

#assign_copilot_to_issue for the created issue.
