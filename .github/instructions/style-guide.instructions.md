---
applyTo: "**/*.ts"
---

# Coding Standards and Style Guide

## General Guidelines

1. Follow TypeScript best practices and patterns
2. Use strict mode with `"strict": true` in tsconfig
3. Always add type annotations for function parameters and return types
4. Prefer interfaces over type aliases for object types
5. Use meaningful variable and function names in camelCase

## Documentation

1. Add JSDoc comments for all functions, classes, and interfaces
2. Include @param, @returns, and @throws tags where applicable
3. Add examples in documentation for complex functions
4. Document public APIs thoroughly

## Code Style

1. Use 2 spaces for indentation
2. Add semicolons at the end of statements
3. Use single quotes for strings
4. Add trailing commas in multi-line objects and arrays
5. Keep line length under 100 characters

## Error Handling

1. Use type-safe error handling with custom error classes
2. Avoid using `any` type
3. Handle Promise rejections properly
4. Use null coalescing and optional chaining when appropriate

## Testing

1. Write unit tests for all business logic
2. Use descriptive test names
3. Follow AAA (Arrange-Act-Assert) pattern
4. Maintain test coverage above 80%

## File Organization

1. One class per file
2. Use meaningful file names in kebab-case
3. Group related files in appropriate directories
4. Keep index.ts files for exports
