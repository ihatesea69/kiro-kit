---
description: Implement platform-specific features or native integrations
inclusion: manual
argument-hint: "[feature] [platforms]"
---

## Arguments
FEATURE: $1 (required, feature to implement e.g., camera, notifications, biometrics)
PLATFORMS: $2 (default: both, options: both, ios, android)

## Workflow

### Flutter Platform Channel
1. Define MethodChannel interface in Dart
2. Implement iOS handler in Swift (ios/Runner/)
3. Implement Android handler in Kotlin (android/app/)
4. Add required permissions to manifests
5. Create Dart wrapper with proper error handling
6. Test on both platforms

### React Native Native Module
1. Define TypeScript interface for the module
2. Implement iOS module in Swift/Objective-C
3. Implement Android module in Kotlin/Java
4. Configure autolinking or manual linking
5. Add required permissions
6. Test on both platforms

## Common Features
- Camera: permissions, capture, gallery access
- Notifications: push setup, local notifications, channels
- Biometrics: Face ID, Touch ID, fingerprint
- Location: permissions, foreground/background tracking
- Storage: secure keychain/keystore access
- Share: system share sheet integration

## Conventions
- Always check permission status before accessing hardware
- Provide graceful fallback when feature unavailable
- Handle permission denial with user-friendly messaging
- Test on real devices (simulators may not support all features)
- Document required native setup steps in README
