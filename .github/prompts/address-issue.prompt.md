---
mode: "agent"
tools: ["github", "codebase", "context7"]
description: "Address GitHub issue"
---

Address GitHub issue.

Before you start coding, make sure you have created a local Git branch and checkout for your changes. Create a new branch that concisely reflects the issue you are addressing. For branch name, use conventional commit format, such as `fix/NOUN`, where `NOUN` is a noun that describes the issue. For example, if the issue is about fixing a bug in the login feature, you might use `fix/login-bug`. Use appropriate prefixes, such as `fix/`, `feat/`, `refactor/`, `chore/`, to indicate the type of change you are making.

You need to think deeply to understand the issue and come up with right solution. When you implement your solution, you need to make sure that you follow [the project architecture design](../copilot-instructions.md) and [the coding style guide](../instructions/style-guide.instructions.md).

In case you need to make changes any libraries or dependencies, make sure to check the project's `package.json` file and verify whether the functions and emthods you are using match the versions specified there. You can use #context7 for this.

If you are not sure about something, ask for clarification.

Once you have implemented your solution, make sure to test it thoroughly before submitting your changes.

- organization: xability
- repo: maidr
- issue-number: {input:issue}
