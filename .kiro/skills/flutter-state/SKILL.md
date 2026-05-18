---
name: flutter-state
description: Implement state management in Flutter using BLoC, Riverpod, or Provider patterns. Use when designing data flow, managing async state, or implementing reactive architectures.
---

# Flutter State Management

Activate this skill when implementing state management in Flutter applications.

## When to Use

- Choosing a state management approach for a feature
- Implementing BLoC pattern with events and states
- Setting up Riverpod providers and notifiers
- Managing async state (loading, error, data)
- Implementing optimistic updates
- Debugging state-related issues

## BLoC Pattern

- Events in, states out (unidirectional data flow)
- Use sealed classes for events and states (Dart 3)
- Implement proper initial state
- Handle errors within the bloc, emit error states
- Use BlocObserver for debugging

## Riverpod Pattern

- Use appropriate provider type (Provider, StateNotifier, AsyncNotifier)
- Scope providers to minimize rebuilds
- Use ref.watch for reactive dependencies
- Implement proper disposal with autoDispose
- Use family for parameterized providers

## Rules

- Never mix state management approaches in one feature
- Keep state classes immutable (use freezed or sealed)
- Handle all async states explicitly (loading, error, data)
- Dispose resources properly to prevent memory leaks
- Test state transitions in isolation from UI
- Minimize widget rebuilds with selective listening
