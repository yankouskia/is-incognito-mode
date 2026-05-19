# Security Policy

## Supported Versions

| Version | Supported                                      |
| ------- | ---------------------------------------------- |
| 2.x     | :white_check_mark:                             |
| 1.x     | :x: (detection vectors broken; please upgrade) |

## Reporting a Vulnerability

Please **do not** open a public GitHub issue. Email
**alex.yankouski@gmail.com** with:

- A description of the vulnerability and its impact.
- Steps to reproduce.
- Affected version(s).
- Any suggested mitigation, if you have one.

You'll receive an acknowledgement within **7 days** and a remediation plan
within **30 days**. We coordinate disclosure timing with you and credit
reporters in the release notes (unless you'd prefer anonymity).

## Out of scope

- Bugs in browsers themselves, even ones that affect detection accuracy.
- False positives / negatives in incognito detection that are not
  exploitable as a security primitive.
- Vulnerabilities in transitive devDependencies that don't affect the
  published artifact.
