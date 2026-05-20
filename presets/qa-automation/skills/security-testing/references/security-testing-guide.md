# Security Testing Guide

Comprehensive reference for integrating security testing into automated test suites, covering common vulnerabilities and testing patterns.

---

## Security Testing Categories

| Category | Scope | Tools |
|----------|-------|-------|
| SAST | Source code analysis | ESLint security, Semgrep, SonarQube |
| DAST | Running application | OWASP ZAP, Burp Suite |
| Dependency Scan | Third-party packages | npm audit, Snyk, Dependabot |
| Secret Detection | Credentials in code | GitLeaks, TruffleHog |
| Container Scan | Docker images | Trivy, Grype |
| API Security | Endpoint validation | OWASP ZAP API scan |

---

## OWASP Top 10 Testing Patterns

### Injection Prevention

```typescript
import { test, expect } from '@playwright/test';

const injectionPayloads = [
  "'; DROP TABLE users; --",
  "<script>alert('xss')</script>",
  "{{7*7}}",
  "${7*7}",
  "../../../etc/passwd",
  "| ls -la",
];

test.describe('Injection Prevention', () => {
  for (const payload of injectionPayloads) {
    test(`rejects injection payload: ${payload.slice(0, 30)}`, async ({ request }) => {
      const response = await request.post('/api/search', {
        data: { query: payload },
      });

      // Should not return server error (indicates unhandled injection)
      expect(response.status()).not.toBe(500);

      const body = await response.text();
      // Response should not reflect unescaped input
      expect(body).not.toContain(payload);
    });
  }
});
```

### Authentication Testing

```typescript
test.describe('Authentication Security', () => {
  test('rejects requests without auth token', async ({ request }) => {
    const response = await request.get('/api/user/profile');
    expect(response.status()).toBe(401);
  });

  test('rejects expired tokens', async ({ request }) => {
    const expiredToken = generateExpiredJWT();
    const response = await request.get('/api/user/profile', {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    expect(response.status()).toBe(401);
  });

  test('prevents brute force login', async ({ request }) => {
    const attempts = 10;
    let rateLimited = false;

    for (let i = 0; i < attempts; i++) {
      const response = await request.post('/api/auth/login', {
        data: { email: 'user@example.com', password: `wrong${i}` },
      });
      if (response.status() === 429) {
        rateLimited = true;
        break;
      }
    }

    expect(rateLimited).toBe(true);
  });

  test('does not expose user enumeration', async ({ request }) => {
    const validEmail = await request.post('/api/auth/login', {
      data: { email: 'real@example.com', password: 'wrong' },
    });
    const invalidEmail = await request.post('/api/auth/login', {
      data: { email: 'fake@example.com', password: 'wrong' },
    });

    // Same status and similar response shape for both
    expect(validEmail.status()).toBe(invalidEmail.status());
  });
});
```

### Authorization Testing

```typescript
test.describe('Authorization Controls', () => {
  test('user cannot access admin endpoints', async ({ request }) => {
    const userToken = await getTokenForRole('user');
    const response = await request.get('/api/admin/users', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(response.status()).toBe(403);
  });

  test('user cannot modify other users data', async ({ request }) => {
    const userAToken = await getTokenForRole('user', 'user-a');
    const response = await request.put('/api/users/user-b/profile', {
      headers: { Authorization: `Bearer ${userAToken}` },
      data: { name: 'Hacked' },
    });
    expect(response.status()).toBe(403);
  });

  test('IDOR prevention - cannot access resources by ID', async ({ request }) => {
    const userToken = await getTokenForRole('user', 'user-a');
    const response = await request.get('/api/orders/order-belonging-to-user-b', {
      headers: { Authorization: `Bearer ${userToken}` },
    });
    expect(response.status()).toBe(404); // 404 not 403 to avoid info leak
  });
});
```

### XSS Prevention

```typescript
test.describe('XSS Prevention', () => {
  const xssPayloads = [
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    'javascript:alert(1)',
    '"><script>alert(1)</script>',
    "'-alert(1)-'",
  ];

  test('user input is sanitized in rendered output', async ({ page }) => {
    for (const payload of xssPayloads) {
      await page.goto('/profile/edit');
      await page.fill('[name="displayName"]', payload);
      await page.click('[type="submit"]');

      // Check that the payload is escaped in the page
      const content = await page.content();
      expect(content).not.toContain(payload);

      // Verify no script execution
      const alerts: string[] = [];
      page.on('dialog', (dialog) => {
        alerts.push(dialog.message());
        dialog.dismiss();
      });

      await page.goto('/profile');
      expect(alerts).toHaveLength(0);
    }
  });
});
```

---

## Security Headers Validation

```typescript
test.describe('Security Headers', () => {
  test('response includes security headers', async ({ request }) => {
    const response = await request.get('/');
    const headers = response.headers();

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toMatch(/DENY|SAMEORIGIN/);
    expect(headers['strict-transport-security']).toContain('max-age=');
    expect(headers['content-security-policy']).toBeDefined();
    expect(headers['x-xss-protection']).toBe('0'); // Disabled in favor of CSP
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('CSP blocks inline scripts', async ({ page }) => {
    const violations: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('Content Security Policy')) {
        violations.push(msg.text());
      }
    });

    await page.goto('/');
    await page.evaluate(() => {
      const script = document.createElement('script');
      script.textContent = 'window.__injected = true';
      document.body.appendChild(script);
    });

    const injected = await page.evaluate(() => (window as any).__injected);
    expect(injected).toBeUndefined();
  });
});
```

---

## Dependency Scanning

### npm audit in CI

```yaml
- name: Security audit
  run: |
    npm audit --production --audit-level=high
    if [ $? -ne 0 ]; then
      echo "High severity vulnerabilities found"
      exit 1
    fi
```

### Automated Dependency Updates

```yaml
# .github/dependabot.yml
version: 2
updates:
  - package-ecosystem: "npm"
    directory: "/"
    schedule:
      interval: "weekly"
    open-pull-requests-limit: 10
    labels:
      - "dependencies"
      - "security"
```

---

## Secret Detection

```bash
# Pre-commit hook for secret detection
npx gitleaks detect --source . --verbose

# Common patterns to detect
# AWS keys: AKIA[0-9A-Z]{16}
# Private keys: -----BEGIN (RSA|EC|DSA) PRIVATE KEY-----
# Tokens: ghp_[A-Za-z0-9]{36}
# Generic secrets: (password|secret|token|key)\s*[:=]\s*['"][^'"]+['"]
```

---

## OWASP ZAP Integration

```yaml
- name: OWASP ZAP baseline scan
  uses: zaproxy/action-baseline@v0.10.0
  with:
    target: 'http://localhost:3000'
    rules_file_name: '.zap/rules.tsv'
    fail_action: 'warn'

- name: OWASP ZAP API scan
  uses: zaproxy/action-api-scan@v0.7.0
  with:
    target: 'http://localhost:3000/api/openapi.json'
    format: openapi
```

---

## Best Practices

- Run security tests as part of every CI pipeline
- Separate security tests from functional tests for clear reporting
- Keep vulnerability databases updated (npm audit, Snyk)
- Test both positive (valid access) and negative (invalid access) paths
- Regularly review and update security test payloads
- Never store real credentials in test fixtures

---

## References

- OWASP Testing Guide: https://owasp.org/www-project-web-security-testing-guide/
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Snyk: https://snyk.io/
- OWASP ZAP: https://www.zaproxy.org/
- Security headers: https://securityheaders.com/
