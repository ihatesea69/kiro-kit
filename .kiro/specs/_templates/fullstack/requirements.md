# Requirements: [Feature Name]

## Overview

Brief description of the feature spanning frontend and backend.

## User Stories

- As a [user type], I want to [action] so that [benefit]

## Functional Requirements

### UI/UX
- [ ] Component renders correctly across breakpoints
- [ ] Loading states display skeleton UI during data fetch
- [ ] Error states show actionable messages with retry option
- [ ] Empty states provide guidance on next steps

### API Layer
- [ ] Endpoint accepts valid payloads and returns correct responses
- [ ] Input validation rejects malformed requests with descriptive errors
- [ ] Authentication and authorization enforced on protected endpoints
- [ ] Pagination implemented for list endpoints

### Data Layer
- [ ] Database schema supports the required data model
- [ ] Migrations are reversible and tested
- [ ] Indexes cover primary query patterns
- [ ] Data integrity constraints enforced at database level

### Business Logic
- [ ] [Describe core business rules]
- [ ] [Describe state transitions]
- [ ] [Describe integration requirements]

## Non-Functional Requirements

- [ ] First Contentful Paint under 1.5s
- [ ] API response time under 200ms for CRUD operations
- [ ] Database queries execute under 50ms (p95)
- [ ] Bundle size increase under 50KB (gzipped)

## Security Requirements

- [ ] Input validated on both client and server (Zod)
- [ ] Authentication required for non-public endpoints
- [ ] Authorization checked at resource level
- [ ] No sensitive data exposed in client bundle

## Acceptance Criteria

1. [Specific, testable criterion]
2. [Specific, testable criterion]
3. [Specific, testable criterion]
