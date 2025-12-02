---
mode: "agent"
tools: ["github", "get_pull_request_comments", "get_pull_request_reviews", "get_issue", "create_pull_request", "request_copilot_review", "context7", "Built-In", "codebase", "editFiles", "findTestFiles", "runCommands", "new", "openSimpleBrowser", "problems", "runTasks", "search", "searchResults", "terminalLastCommand", "terminalSelection", "testFailure", "usages", "create_branch", "get_issue_comments", "get-library-docs", "playwright"]
description: "Address Pull Request Review"
---

Before anything else, make sure you have received ${input:pr} from user.

#github Make sure your local Git branch is also checked out to the target PR branch to match with the remote PR branch.

#get_pull_request_comments #get_pull_request_reviews Address PR review for xability/maidr ${input:pr}.

You need to think deeply to understand the review comments and come up with right solution. When you implement your solution, you need to make sure that you follow [the project architecture design](../copilot-instructions.md) and [the coding style guide](../instructions/style-guide.instructions.md).

In case you need to make changes any libraries or dependencies, make sure to check the project's `package.json` file and verify whether the functions and methods you are using match the versions specified there. You can use #context7 for this.

If you are not sure about something, ask for clarification.

Once you have implemented your solution, make sure to test it thoroughly before submitting your changes. You can test with #playwright tool for those requiring manual tests.

Before you submit your PR, make sure #runTasks "npm lint" and #runTasks "npm build" are successful.

#github Once it is successful, push the update using Conventional Commits style.

Also, #request_copilot_review for the submitted PR.
