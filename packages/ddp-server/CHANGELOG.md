# DDP Server Changelog

## v3.1.1, 2025-05-02

### Changes

- Improved parsing of `x-forwarded-for` headers in Session._clientAddress:
  - Changed header splitting method to handle comma-separated values more reliably
  - Added explicit trimming of IP addresses with map function
  - Modified validation check to require exact match for httpForwardedCount
- Bumped package version from 3.1.0 to 3.1.1 