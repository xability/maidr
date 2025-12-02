---
mode: "ask"
description: "A guide to address a GitHub issue by fetching details, creating a branch, implementing a solution, and pushing changes."
---

# How to Address a GitHub Issue

This guide will walk you through the process of addressing a GitHub issue for the `xability/maidr` repository.

**1. Understand the Issue**

First, get the details of the issue from GitHub. You will need the issue number.
Open the following URL in your browser, replacing `${input:issue}` with the issue number you want to work on:
`https://github.com/xability/maidr/issues/${input:issue}`

**2. Create a Git Branch**

Before you start coding, create a new local Git branch for your changes in your terminal.

- The branch name should be concise and reflect the issue you are addressing.
- Use a conventional commit format for the branch name, such as `fix/login-bug` or `feat/new-feature`.

Run the following command in your terminal, replacing `<branch-name>` with your chosen branch name:

```bash
git checkout -b <branch-name>
```

**3. Implement Your Solution**

Now, you can start implementing your solution. As you code, please remember to:

- Follow the project's architectural design, detailed in `.github/copilot-instructions.md`.
- Adhere to the coding style guide found in `.github/instructions/style-guide.instructions.md`.

**4. Verify Your Changes**

Once you have implemented your solution, make sure to test it thoroughly.
Before you commit, ensure the linter and build process pass by running these commands in your terminal:

```bash
npm run lint
npm run build
```

**5. Commit and Push Your Changes**

When you are ready, commit your changes with a descriptive message using the conventional commit format.
Run the following commands in your terminal:

```bash
git add .
git commit -m "feat: your descriptive commit message"
```

Finally, push your branch to the remote repository:

```bash
git push origin <branch-name>
```

After pushing, you can create a pull request from the GitHub UI.
