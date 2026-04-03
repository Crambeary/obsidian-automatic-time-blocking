## ADDED Requirements

### Requirement: Repository documents a preferred fast verification loop
The project SHALL document a preferred development workflow that minimizes manual copy/paste and clearly states how contributors should validate changes.

#### Scenario: Contributor chooses validation path
- **WHEN** a contributor needs to verify a behavior change
- **THEN** the documentation must identify which checks belong in the local automated harness and which still require manual Obsidian smoke testing

#### Scenario: Agent follows repo workflow
- **WHEN** an agent or contributor is asked to debug a regression
- **THEN** the repository must provide enough workflow guidance to reproduce behavior locally without depending on repeated manual note setup inside Obsidian

### Requirement: Real-app validation remains explicitly scoped
The development workflow SHALL preserve a small manual validation path for host-application behavior that mocks cannot guarantee.

#### Scenario: Validate Obsidian-only integration behavior
- **WHEN** a change affects plugin registration, settings tab wiring, or host-specific behavior
- **THEN** the workflow must require a manual Obsidian smoke check in addition to automated harness coverage

### Requirement: Optional CLI smoke testing cannot be a hard dependency
If the repository adds an `obsidian-cli` or similar command-line smoke path, the development workflow SHALL treat it as supplemental rather than required for core regression coverage.

#### Scenario: CLI tool is unavailable or insufficient
- **WHEN** the optional CLI path cannot reproduce a bug or is unavailable in the local environment
- **THEN** the primary local verification workflow must still function through the mocked harness and fixture tests
