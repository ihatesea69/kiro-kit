---
name: app-deployment
description: Deploy mobile apps to App Store and Google Play. Use when configuring builds, signing, CI/CD pipelines, or preparing store submissions.
---

# App Deployment

Activate this skill when preparing mobile apps for store submission or configuring CI/CD.

## When to Use

- Configuring code signing (iOS provisioning, Android keystore)
- Setting up CI/CD pipelines for mobile builds
- Preparing app store metadata and screenshots
- Configuring build variants (dev, staging, production)
- Implementing over-the-air updates (CodePush, Shorebird)
- Handling app store review feedback

## iOS Deployment

- Configure signing with match or manual provisioning
- Set up App Store Connect metadata
- Generate screenshots for required device sizes
- Configure TestFlight for beta distribution
- Handle App Review guidelines compliance

## Android Deployment

- Configure signing with keystore (keep secure, never commit)
- Set up Google Play Console listing
- Generate App Bundle (AAB) for Play Store
- Configure internal/closed/open testing tracks
- Handle Play Store policy compliance

## CI/CD

- Use Fastlane for automated builds and deployment
- Configure GitHub Actions or Codemagic
- Implement version bumping automation
- Set up automated screenshot generation
- Configure crash reporting (Crashlytics, Sentry)

## Rules

- Never commit signing keys or keystores to git
- Use environment variables for sensitive build config
- Test release builds before submission
- Keep store metadata up to date with each release
- Plan for 1-7 day App Store review times
- Maintain backward compatibility for forced updates
