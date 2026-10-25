# Bounded implementation workflow

The numbered coordination steps apply to the Leader. Workers follow their assigned role and complete contract; they never dispatch another agent.

For planning-only requests, produce a plan/contract without edits or worker calls.

1. Restate the goal, scope, acceptance criteria and risks. Answer simple read-only questions directly; do not delegate just to use a crew.
2. For implementation, fill a self-contained contract: exact working directory, initial state, inputs, writable paths, forbidden actions, acceptance commands and stopping conditions. Present it in the conversation before delegation.
3. Invoke `hive-implementer` with that complete contract. Wait for its result before invoking another worker. Do not edit or execute commands yourself.
4. Invoke a fresh `hive-verifier` with the original contract, actual changed paths and implementation report. Require it to inspect files and independently execute acceptance checks, rather than accept the report as proof.
5. For material findings, issue a new `hive-implementer` invocation with the contract and specific findings, then invoke a fresh `hive-verifier`. Allow at most two correction cycles after the initial implementation; stop earlier if blocked. Request a fresh invocation for each stage and include all required context each time; do not assume history inheritance or worker persistence across clients.
6. Accept only when acceptance evidence and independent verification agree. A blocked or missing verification means unverified, not success. If delegation is unavailable, provide the contract for manual agent selection; never simulate worker results.
