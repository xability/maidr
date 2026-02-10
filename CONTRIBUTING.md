# Contributing to maidr

Thank you for your interest in contributing to maidr project! We welcome contributions from everyone.

## Pre-requisites

To contribute to this project, you need to have the following installed on your local machine:

1. git

1. node.js (version 20 or higher is recommended)

1. npm (version 10 or higher is recommended)

1. [Visual Studio Code (VS Code)](https://code.visualstudio.com/) (This is the recommended IDE)

1. [Docker Desktop](https://www.docker.com/products/docker-desktop/) (For leveraging the dev container within the project)

## Getting Started

### Installing Node

Check if node is available and above version 20 or higher on your system using the following command:

```shell
node -v
```

This command should display the version of node installed on your system. In case this command does not provide the expected version number, please download [node](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) from here, depending on your development environment.

### Installing NPM

Check if NPM is available on your system and above version 10 using the following command:

```shell
npm -v
```

This command should display the version of node installed on your system. In case this command does not provide the expected version number, please download [npm](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) from here, depending on your development environment.

### Setting up the Repository:

To locally set up the repository, please follow these steps in order:

1. Fork the repository on GitHub.

1. Clone your forked repository to your local machine.

1. Open the project in VS Code.

1. Install all the recommended VSCode extensions.

### Setting up the Development environment:

Once the above steps are complete, we set up the development environment.

The repository comes with the ability to spawn a dev container so that you get all necessary dependancies for the project in an isolated development environment exclusive to maidr and devoid of any interference from local environment configuration.

Docker Desktop that was installed as part of the pre-requisites will be used for accessing the spawned dev container.

The Dev Container can be used via Visual Studio Code or Github Codespaces

To enable this dev container and use it for project development, please follow the steps in order:

#### Accessing Dev Container through Visual Studio Code

1. Use `Ctrl/Cmd + Shift + P` to invoke the VS Code command palette.

1. In the search box, type in `> Dev Containers: Rebuild and Reopen in Container `. This option will pick up the dockerfile configuration available in the directory at the time and spawn a new dev container.

1. VS Code takes a few minutes to prepare the dev container with all required dependancies. Once the dev container is successfully spawned, it can be used to work on development activities specific to the maidr repository.

   **NOTE**: Rebuild process is only required when the dev container is being spawned for the first time or when there are changes to the dockerfile configuration. Subsequent access to the dev container can be done by directly selecting the option `> Dev Containers: Reopen in Container` from the command palette.

#### Accessing Dev Container through Github Codespaces

1. Use `Ctrl/Cmd + Shift + P` to invoke the VS Code command palette.

1. In the search box, type in `> Codespaces: Create New Codespace`. This option will pick up the dockerfile configuration available in the directory at the time and spawn a new dev container.

   **NOTE**: We will periodically update the configuration of the dev container with any dependancies that are added in the future. In case there are any issues in spawning the dev container or working in that environment, please raise an [issue](https://github.com/xability/maidr-ts/issues/new?template=bug_report.md) with `DevOps : <Issue Description>` as the title.

### Publishing Changes to Forked Repository

As contributors, you can publish changes for to your forked repository through the following procedure:

1. All changes should be in a dedicated branch on your local forked repository pertaining to the feature or bug you are working on. The naming of the branch should be as relevant as possible so that maintainers have a decent context on what it relates to.

2. Execute `npm run build` to evaluate if the changes do not break the sanity of the build.

3. Use `git add` to include all changes that are affected by your changes.

4. Use `git commit -m <commit-message>` to commit your changes. (please read [Committing Your Changes](#committing-your-changes) section to learn more about the conventional commits).

5. The lint checker will run after `git commit` is executed. To address any lint issues thrown after this point, execute `npm run lint:fix` to address all lint issues detected in one go and attempt to commit the changes again. (There could be certain lint issues that may not be resolved even after automatic addressing. Such issues need to be resolved manually.)

6. Once the local commit is successful, utilize `git push` to publish changes to your forked repository.

### Publishing Changes for Review

Once the changes and concerned branch are updated in your remote forked repository, you can prepare them for review by maintainers by the following procedure:

1. Create a PR from the relevant branch on your remote forked repository to the `main` branch of the maidr repository.

2. Provide all information pertaining to the changes in the PR and be as detailed as possible. This helps the reviewers to validate the changes and provide constructive feedback.

3. If and when feedback is received, please address them as promptly as possible for efficient integration.

## Guidelines

Please follow these guidelines when contributing to the project:

- Use TypeScript (es6) for all code.
- Write clear and concise commit messages.
- Follow the code style and formatting guidelines.
- Write tests for new features and bug fixes.

### Code Style and Formatting

We use ESLint to enforce a consistent code style and formatting. Please run `npm run lint` to check for lint errors and address them using `npm run lint:fix` (Even after auto fixing the lint errors, there may be a few lint errors that will require manual inspection)

### Tests

We use Playwright for end-to-end testing. Please refer to the [documentation](https://playwright.dev/docs/intro) if you are new to Playwright.

1. Use `npm run e2e` to run the end-to-end tests
2. Use `npm run e2e:ui` to run tests with UI mode
3. Use `npm run e2e:debug` to debug tests

### Committing Your Changes

We use [conventional commits](https://www.conventionalcommits.org/) to maintain a clear and consistent commit history. Here's how to write a conventional commit message:

#### Format

Each commit message should follow this format: `<type>[optional scope]: <description>`

- **Types**: Describes the type of change you're making. Common types include:
  - `feat`: Introduces a new feature.
  - `fix`: Fixes a bug.
  - `docs`: Documentation changes.
  - `style`: Code style changes (formatting, missing semi-colons, etc. – does not affect code logic).
  - `refactor`: Code changes that neither fixes a bug nor adds a feature.
  - `perf`: Performance improvements.
  - `test`: Adding or correcting tests.
  - `chore`: Routine tasks, maintenance, and other non-production changes.
  - `ci`: Changes to our CI configuration files and scripts, specifically for GitHub Actions.
- **Scope**: (Optional) A word or two describing where the change happens, like `login`, `signup`, etc.
- **Description**: A succinct description of the change in lowercase.

#### Denoting a Breaking Change

To denote a breaking change, include an exclamation mark `!` before the colon.

- Example: `feat(database)!: remove deprecated methods`

#### Mentioning Issue Numbers

If your commit addresses a specific issue, mention the issue number at the end of the commit message.

- Example: `fix(file-upload): correct MIME type handling, closes #123`

#### Examples

- `feat(authentication): add JWT token support`
- `fix(api): resolve data retrieval issue`
- `docs(readme): update installation instructions`
- `style(header): adjust layout spacing`
- `refactor(user-profile): streamline user data processing`
- `perf(image-loading): optimize image caching`
- `chore(dependencies): update lodash to 4.17.21`
- `test(login): add additional unit tests for password reset`
- `ci(github-actions): update build and deployment workflow`

#### Commit Message Linting

When you commit your changes, Husky and Commitlint will automatically check your commit messages. If your message does not meet the conventional commit format, the commit will be rejected, and you'll need to modify the message.

### Maintaining the website

Here's how to update the MAIDR documentation:

1. Update Source Code Documentation (if needed)

- Edit JSDoc comments in TypeScript files (src/**/*.ts)
- These comments will be extracted by TypeDoc for the API Reference

2. Update Content Pages (if needed)

Edit these files for different sections:

- README.md - Main landing page content (converted to index.html)
- docs/template.html - HTML template for generated pages
- examples/ - Example files (embedded in examples.html)

3. Build Documentation

```shell
npm run docs
```

This runs the build script which:
- Converts README.md to index.html
- Generates examples.html
- Copies media and examples folders
- Runs TypeDoc to generate API documentation in `_site/api/`

4. Preview Locally

```shell
npm run docs:serve
```

This builds the docs and starts a local HTTP server. Alternatively, open `_site/index.html` directly in your browser.

5. Deploy to GitHub Pages

The documentation will automatically deploy when you push to:

- main branch
- docs/jsdoc branch (for testing)

## Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.
