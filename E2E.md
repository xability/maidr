# End-to-End Testing Guide

This document provides comprehensive information about running and writing end-to-end (e2e) tests for the MAIDR project.

## Prerequisites

- Node.js 22 or higher
- npm (comes with Node.js)
- Git

## Available Test Scripts

The following npm scripts are available for running e2e tests:

```bash
# Run all e2e tests
npm run e2e

# Run e2e tests with UI mode (for debugging)
npm run e2e:ui

# Run e2e tests in debug mode
npm run e2e:debug

# Install Playwright browsers and dependencies
npm run e2e:install
```

## Test Structure

### Directory Structure

```
e2e_tests/
├── config/
│   ├── test-config.ts      # Playwright configuration
│   └── ...                 # Additional config files
├── page-objects/
│   ├── base.page.ts        # Base page object with common methods
│   └── plots/
│       ├── barplot.page.ts
│       ├── boxplotHorizontal.page.ts
│       ├── boxplotVertical.page.ts
│       ├── scatterplot-page.ts
│       └── ...            # Additional plot page objects
├── specs/
│   ├── barplot.spec.ts
│   ├── boxplotHorizontal.spec.ts
│   ├── boxplotVertical.spec.ts
│   ├── scatterplot.spec.ts
│   └── ...               # Additional test specs
└── utils/
    ├── constants.ts       # Test constants and selectors
    └── ...               # Additional utility files
```

### Test Categories

Each plot type's test suite includes the following categories:

1. **Navigation Controls**

- Basic navigation (up, down, left, right)
- First/last element navigation
- Data point navigation
- Box navigation (for boxplots)

2. **Autoplay Controls**

- Forward/backward autoplay
- Upward/downward autoplay (for boxplots)
- Autoplay with timeout configuration

3. **Mode Controls**

- Text mode toggle
- Braille mode toggle
- Sound mode toggle
- Review mode toggle

4. **Plot-Specific Features**

- Axis title verification
- Data point information
- Plot type verification

## Writing Tests

### Page Objects

Each plot type has its own page object class that extends the base page object. Page objects encapsulate:

- Element selectors
- Navigation methods
- Mode control methods
- Plot-specific methods

Example:

```typescript
class BoxplotVerticalPage extends BasePage {
  async moveToDataPointBelow() {
    // Implementation
  }

  async startDownwardAutoplay(options?: { timeout?: number }) {
    // Implementation
  }
}
```

### Test Structure

Tests are organized using Playwright's test framework:

```typescript
import { expect, test } from '@playwright/test';
import { BoxplotVerticalPage } from '../page-objects/plots/boxplotVertical-page';

test.describe('Boxplot Vertical Tests', () => {
  let boxplotVerticalPage: BoxplotVerticalPage;

  test.beforeEach(async ({ page }) => {
    boxplotVerticalPage = new BoxplotVerticalPage(page);
    await boxplotVerticalPage.navigateToPlot('boxplotVertical');
  });

  test('should move to data point below', async () => {
    await boxplotVerticalPage.moveToDataPointBelow();
    // Assertions
  });
});
```

### Best Practices

1. **Page Object Pattern**

- Keep selectors in page objects
- Encapsulate common operations
- Extend base page for shared functionality

2. **Test Organization**

- Group related tests using `test.describe`
- Use meaningful test descriptions
- Follow the Arrange-Act-Assert pattern

3. **Error Handling**

- Use try-catch blocks for expected errors
- Implement proper error messages
- Handle timeouts appropriately

4. **Constants**

- Use constants for selectors and text
- Keep test data in a separate file
- Use enums for mode states

## Debugging Tests

### UI Mode

Run tests in UI mode for visual debugging:

```bash
npm run e2e:ui
```

This opens Playwright's UI where you can:

- View test execution
- Debug step by step
- Inspect elements
- View test traces

### Debug Mode

For console debugging:

```bash
npm run e2e:debug
```

### Common Issues

1. **Timeout Errors**

- Increase timeout in test configuration
- Check for slow operations
- Verify element visibility

2. **Selector Issues**

- Use unique, stable selectors
- Wait for elements to be visible
- Check for dynamic content

3. **State Management**

- Reset state between tests
- Handle async operations properly
- Verify mode changes

## Continuous Integration

E2E tests are run:

- On every pull request
- On schedule (every 2 days)
- Can be triggered manually

### GitHub Actions

The workflow includes:

- Node.js setup
- Dependency installation
- Browser installation
- Test execution
- Report generation

## Contributing

When adding new tests:

1. Follow the existing structure
2. Add appropriate documentation
3. Include error handling
4. Update this guide if necessary

## Resources

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [MAIDR Project Documentation](https://github.com/maidr/maidr)
