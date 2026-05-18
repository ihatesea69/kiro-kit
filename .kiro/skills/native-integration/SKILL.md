---
name: native-integration
description: Integrate native platform features via platform channels, native modules, or FFI. Use when accessing device hardware, OS APIs, or third-party native SDKs.
---

# Native Integration

Activate this skill when bridging between cross-platform code and native platform APIs.

## When to Use

- Implementing platform channels (Flutter MethodChannel/EventChannel)
- Creating native modules (React Native Turbo Modules)
- Integrating third-party native SDKs (payments, analytics, maps)
- Accessing device hardware (camera, biometrics, NFC)
- Implementing background processing or services
- Using Dart FFI for C/C++ library integration

## Flutter Platform Channels

- MethodChannel: request-response communication
- EventChannel: streaming data from native to Dart
- BasicMessageChannel: simple message passing
- Use pigeon for type-safe code generation
- Handle PlatformException gracefully

## React Native Native Modules

- Turbo Modules: JSI-based, synchronous access
- Fabric: new architecture native components
- Legacy bridge modules (for backward compatibility)
- Use codegen for type-safe interfaces

## Rules

- Minimize channel/bridge crossings (batch operations)
- Handle platform-not-supported gracefully
- Test on real devices (simulators may not support all hardware)
- Document required native setup steps (Podfile, build.gradle)
- Keep native code minimal -- business logic stays in Dart/JS
- Handle permission requests before accessing hardware
