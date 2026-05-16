# Design: [Feature Name]

## Architecture

### Component Hierarchy

```
[ParentComponent]
  [ChildComponent]
    [GrandchildComponent]
```

### Data Flow

Describe how data flows through the component tree:
- Props passed down
- State lifted up
- Context providers
- Server vs client boundaries

## Component Design

### [ComponentName]

**Type**: Server Component / Client Component
**Props**:
```typescript
interface ComponentNameProps {
  // Define props
}
```

**State**: Describe internal state if Client Component
**Side Effects**: Describe effects and cleanup

## Rendering Strategy

- [ ] Static (build-time)
- [ ] Dynamic (per-request)
- [ ] ISR (revalidate interval: ___s)
- [ ] Streaming (with Suspense boundaries)

## API Integration

### Endpoints Used
- `GET /api/[resource]` - [description]
- `POST /api/[resource]` - [description]

### Caching Strategy
- Cache duration: ___
- Revalidation trigger: ___
- Optimistic updates: yes/no

## Testing Strategy

- Unit tests: component rendering, hook behavior
- Integration tests: user interactions, data flow
- E2E tests: critical user paths
- Visual regression: screenshot comparison

## Performance Considerations

- Code splitting boundaries
- Image optimization approach
- Font loading strategy
- Third-party script handling
