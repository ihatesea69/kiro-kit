---
description: Add or modify navigation routes and flows
inclusion: manual
argument-hint: "[route-name] [type]"
---

## Arguments
ROUTE: $1 (required, route name or path)
TYPE: $2 (default: push, options: push, modal, tab, drawer, bottomSheet)

## Workflow

### Flutter (go_router)
1. Define route path and parameters
2. Create GoRoute entry with builder
3. Add type-safe route helper if using typed routes
4. Configure transitions based on TYPE
5. Add deep link path if applicable
6. Test navigation with widget test

### React Native (React Navigation)
1. Add screen to appropriate navigator (Stack, Tab, Drawer)
2. Define route params TypeScript interface
3. Configure screen options and transitions
4. Add deep linking configuration
5. Test navigation flow

## Conventions
- Use type-safe navigation (no magic strings)
- Define route parameters with proper types
- Handle authentication guards where needed
- Support deep linking for all public routes
- Configure proper back behavior
- Add transition animations appropriate to navigation type
