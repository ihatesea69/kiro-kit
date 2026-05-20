# Installation Guide

## Prerequisites

- Node.js 18+ (for Playwright and JavaScript-based tools)
- Java 21+ (for Selenium and REST Assured skills)
- Git for version control

## Quick Start

1. Install the qa-automation preset using the CLI
2. Skills are automatically placed in `.kiro/skills/`
3. Reference material is available immediately

## Framework-Specific Setup

### Playwright

```bash
npm init playwright@latest
npx playwright install
```

### Selenium (Java)

Add to your `pom.xml`:
```xml
<dependency>
  <groupId>org.seleniumhq.selenium</groupId>
  <artifactId>selenium-java</artifactId>
  <version>4.x</version>
</dependency>
```

### k6 (Performance Testing)

```bash
# macOS
brew install k6

# Linux
sudo apt-get install k6
```

## Skill Configuration

Skills are activated contextually based on the task at hand. No additional configuration is required for basic usage.

For environment-specific settings, copy `.env.example` to `.env` and configure variables.
