# SP4-33: Automated security scans (SCRUM-275)

## Coverage

- **npm audit:** scans dependencies recorded by `frontend/package-lock.json` for known advisories. Produces `security-audit.json` as a downloadable GitHub Actions artifact and a summary of severity counts.
- **CodeQL:** scans JavaScript/TypeScript code for potential security weaknesses using `security-extended` queries. Findings are published to GitHub's **Security > Code scanning** where supported.

## Triggers

- Push to `main` or `mohammed/sprint-4`
- Pull requests
- Every Monday at 06:17 UTC (scheduled workflows normally only run on the default branch)
- Manual run from GitHub Actions

## Expected baseline behavior

The user's latest local `npm ci` reported 10 advisories (7 moderate, 2 high, 1 critical). The audit job deliberately **reports**, but does not fail solely because these existing vulnerabilities are found. It **does fail** if npm cannot run, `npm ci` fails, or the audit output is invalid. This is not an assertion that the dependencies are secure. Remediate findings before switching to a blocking threshold.

CodeQL needs code scanning to be supported/enabled in the repository. Private repositories may require a paid GitHub security entitlement. If CodeQL fails for entitlement or permission reasons, check the workflow log and repository Settings > Security.

## Verification

1. Push the workflow to `mohammed/sprint-4`.
2. Open GitHub Actions > **SP4-33 Automated Security Scans**.
3. Confirm both jobs run. Open `dependency-audit`, check the vulnerability count, and download artifact `sp4-33-npm-audit`.
4. Check `codeql` for completion, then review **Security > Code scanning** if available.
5. Record findings, severity, affected packages or code locations, and remediation tickets. Do not mark vulnerabilities as fixed simply because the workflow is green.

## Local commands

From `frontend`:

```powershell
npm ci
npm audit
```

Use `npm audit --json` to inspect details. Do **not** use `npm audit fix --force` without assessing breaking changes.
