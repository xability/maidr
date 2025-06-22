---
mode: "agent"
tools: ["github", "get_issue", "create_pull_request", "request_copilot_review", "context7", "Built-In", "codebase", "editFiles", "findTestFiles", "runCommands", "new", "openSimpleBrowser", "problems", "runTasks", "search", "searchResults", "terminalLastCommand", "terminalSelection", "testFailure", "usages", "create_branch", "get_issue_comments", "get-library-docs"]
description: "Address GitHub issue"
---

#get_issue Address xability/maidr ${input:issue}.

Before you start coding, make sure you have created a local Git branch and checkout for your changes. Create a new branch that concisely reflects the issue you are addressing. For branch name, use conventional commit format, such as `fix/NOUN`, where `NOUN` is a noun that describes the issue. For example, if the issue is about fixing a bug in the login feature, you might use `fix/login-bug`. Use appropriate prefixes, such as `fix/`, `feat/`, `refactor/`, `chore/`, to indicate the type of change you are making.

You need to think deeply to understand the issue and come up with right solution. When you implement your solution, you need to make sure that you follow [the project architecture design](../copilot-instructions.md) and [the coding style guide](../instructions/style-guide.instructions.md).

In case you need to make changes any libraries or dependencies, make sure to check the project's `package.json` file and verify whether the functions and emthods you are using match the versions specified there. You can use #context7 for this.

If you are not sure about something, ask for clarification.

Once you have implemented your solution, make sure to test it thoroughly before submitting your changes.
"searchResults",
"terminalLastCommand",
"terminalSelection",
"testFailure",
"usages",
"create_branch",
"get_issue_comments",
"get-library-docs",
]
description: "Address GitHub issue"

---

#get_issue Address xability/maidr ${input:issue}.

Before you start coding, make sure you have created a local Git branch and checkout for your changes. Create a new branch that concisely reflects the issue you are addressing. For branch name, use conventional commit format, such as `fix/NOUN`, where `NOUN` is a noun that describes the issue. For example, if the issue is about fixing a bug in the login feature, you might use `fix/login-bug`. Use appropriate prefixes, such as `fix/`, `feat/`, `refactor/`, `chore/`, to indicate the type of change you are making.

You need to think deeply to understand the issue and come up with right solution. When you implement your solution, you need to make sure that you follow [the project architecture design](../copilot-instructions.md) and [the coding style guide](../instructions/style-guide.instructions.md).

In case you need to make changes any libraries or dependencies, make sure to check the project's `package.json` file and verify whether the functions and emthods you are using match the versions specified there. You can use #context7 for this.

If you are not sure about something, ask for clarification.

Once you have implemented your solution, make sure to test it thoroughly before submitting your changes.
"terminalLastCommand",
"terminalSelection",
"testFailure",
"usages",
"create_branch",
"get_issue_comments", "get-library-docs",
]
description: "Address GitHub issue"
---

#get_issue Address xability/maidr ${input:issue}.

Before you start coding, make sure you have created a local Git branch and checkout for your changes. Create a new branch that concisely reflects the issue you are addressing. For branch name, use conventional commit format, such as `fix/NOUN`, where `NOUN` is a noun that describes the issue. For example, if the issue is about fixing a bug in the login feature, you might use `fix/login-bug`. Use appropriate prefixes, such as `fix/`, `feat/`, `refactor/`, `chore/`, to indicate the type of change you are making.

You need to think deeply to understand the issue and come up with right solution. When you implement your solution, you need to make sure that you follow [the project architecture design](../copilot-instructions.md) and [the coding style guide](../instructions/style-guide.instructions.md).

In case you need to make changes any libraries or dependencies, make sure to check the project's `package.json` file and verify whether the functions and emthods you are using match the versions specified there. You can use #context7 for this.

If you are not sure about something, ask for clarification.

Once you have implemented your solution, make sure to test it thoroughly before submitting your changes.

Before you submit your PR, make sure #runTasks "npm lint" and #runTasks "npm build" are successful.

#create_pull_request Create and submit a PR using [this PR template](../PULL_REQUEST_TEMPLATE.md) and make sure you include the issue number you are addressing at the bottom of the PR description like `Closes #xx`, where `xx` is ${input:issue}.

Also, #request_copilot_review for the submitted PR.
