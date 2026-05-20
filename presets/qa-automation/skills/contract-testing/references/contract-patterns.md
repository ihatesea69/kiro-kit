# Contract Testing Patterns

## Consumer-Driven Contracts

1. Consumer defines expected interactions
2. Contract generated from consumer tests
3. Provider verifies against contract
4. Changes require consumer agreement

## Pact Workflow

- Consumer: write tests defining expected API behavior
- Generate: produce Pact contract JSON
- Publish: upload to Pact Broker
- Verify: provider runs verification against contracts
- Deploy: can-i-deploy check before release

## Schema Validation

- Validate response structure against OpenAPI spec
- Check required fields, types, and constraints
- Verify enum values and format patterns
- Test additional properties handling

## Backward Compatibility

- Adding fields: backward compatible
- Removing fields: breaking change
- Changing types: breaking change
- Adding required fields: breaking change for consumers
