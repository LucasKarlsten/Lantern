# Task contract

Copy and fill this template in the conversation before delegation. Use exact paths relative to the stated working directory; remove placeholders. Give each worker the complete contract and relevant prior results. This is a prompt convention, not an executable schema or security policy.

```yaml
id: TASK-001
objective: <observable outcome>
working_directory: <absolute local path>
initial_state: <commit and relevant existing changes, or explicit starting files>
inputs:
  - <requirements and exact relevant file paths>
optional_skills: [] # only explicitly available, relevant and authorized task skills
write_scope:
  - <allowed file paths>
forbidden:
  - changes outside write_scope or to trusted instructions
  - external authentication, infrastructure access and unapproved skills
  - dependency installation, remote writes and security-control changes
acceptance:
  - id: A1
    behavior: <specific behavior including relevant edge cases>
checks:
  - command: <exact local command>
    working_directory: <absolute local path>
    expected: <exit status, minimum test count and expected behavior>
verification:
  inspect: <actual files and comparison to starting state>
  negative_control: <permitted disposable-copy mutation and expected failure, or not permitted>
limits:
  max_correction_cycles: 2 # after the initial implementation
  stop_on: [missing prerequisite, scope conflict, permission denial, exhausted cycles]
outputs:
  - status and actual changed paths
  - commands with working directories, exit codes, test counts and output
  - findings, acceptance coverage and remaining gaps
```

Implementer returns completed/needs-revision/blocked. Verifier returns pass/needs-revision/blocked. Only the Leader makes final acceptance. Missing required evidence prevents acceptance. Corrections preserve the original acceptance criteria; scope changes need user direction.
