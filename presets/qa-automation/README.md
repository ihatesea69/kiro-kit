# QA Automation Preset

A comprehensive preset for QA automation engineers providing specialized agents, skills, commands, and workflows for test automation across multiple frameworks and test levels.

## Focus Areas

- **Browser Testing**: Playwright and Selenium WebDriver automation
- **API Testing**: REST, GraphQL, and contract testing
- **Performance**: Load, stress, and endurance testing
- **Accessibility**: WCAG compliance and axe-core integration
- **CI/CD**: Pipeline integration and optimization
- **Visual Regression**: Screenshot comparison and pixel diffing

## Contents

| Category | Count | Description |
|----------|-------|-------------|
| Agents | 18 | Specialized QA automation agents |
| Skills | 24 | Domain knowledge and reference material |
| Commands | 46 | Task-specific command shortcuts |
| Hooks | 8 | Lifecycle hooks for quality enforcement |
| Workflows | 5 | Structured work processes |
| Steering | 9 | Convention and pattern guidance |

## Key Agents

- **qa-orchestrator**: Routes tasks to specialized agents
- **playwright-test-generator**: Creates Playwright tests from plans
- **playwright-test-healer**: Debugs and fixes failing tests
- **flaky-test-hunter**: Identifies and eliminates test flakiness
- **api-tester-specialist**: REST and API test automation
- **selenium-test-specialist**: Java/WebDriver test creation
- **performance-tester**: Load and performance testing
- **visual-regression-tester**: Visual change detection

## Quick Start

1. Install the preset using the CLI
2. Configure `.env` with your application URL and preferences
3. Use commands like `/test e2e`, `/fix flaky`, `/generate page-object`
4. Agents are activated contextually based on the task

## Configuration

Copy `.env.example` to `.env` and configure:

- `BASE_URL`: Application URL under test
- `BROWSER`: Target browser (chromium, firefox, webkit)
- `HEADLESS`: Run without visible browser (true/false)
- `TEST_TIMEOUT`: Default test timeout in milliseconds
- `MIN_COVERAGE`: Minimum coverage threshold percentage

## Attribution

This preset includes adapted material from the test-automation-skills-agents project by Douglas Urrea Ocampo (MIT License). See `skills/THIRD_PARTY_NOTICES.md` for details.
