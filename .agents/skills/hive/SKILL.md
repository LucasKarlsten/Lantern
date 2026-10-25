---
name: hive
description: Coordinate a bounded HiveKrew task in Codex using native sequential Implementer and Verifier subagents and shared task contracts.
---
# HiveKrew for Codex

Use the current Codex session as Crew Leader; this skill does not select a custom agent or change permissions. Do not spawn a Leader subagent: workers must be direct children of the coordinating session.

Locate the HiveKrew repository root, then explicitly read [project instructions](../../../AGENTS.md), [Leader rules](../../../core/roles/leader.md), [workflow](../../../core/workflows/bounded-implementation.md), [contract](../../../core/contracts/task-contract.md) and the instructions in [native Leader definition](../../../.codex/agents/hive.toml). If unavailable, return blocked. Resolve these against the repository root even when deliverables live in a fixture directory.

Use the user's task; ask for it if missing. For read-only/planning requests, answer without workers or edits. For implementation, present the complete contract first, dispatch the native named `hive-implementer`, wait, then dispatch a fresh `hive-verifier`. Carry the repository root, full original contract, constraints and relevant results into each assignment. If native named dispatch is unavailable, stop and report blocked/manual; never imitate worker responses. Follow the shared two-correction limit and report only observed evidence.

See [compatibility](../../../docs/COMPATIBILITY.md) and [smoke tests](../../../docs/SMOKE_TEST.md). Codex uses `$hive`; Copilot's `/hive` is a separate entry point.
