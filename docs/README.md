# Documentation

Start with the role that matches your task. Every guide is current for ESQueryStudio 1.x.

## Reading paths

| I am… | Read in this order |
|---|---|
| Integrating a Spring Boot application | [README quick start](../README.md#-5-分钟接入) → [Quick start](integration/quickstart.md) → [Configuration reference](integration/configuration-reference.md) → [Troubleshooting](integration/troubleshooting.md) |
| Operating the console | [Desired state](integration/desired-state.md) → [Mapping conflicts](integration/mapping-conflict-to-adhoc.md) → [Troubleshooting](integration/troubleshooting.md) |
| Embedding the console in a host | [Architecture](architecture.md) → [Host integration](integration/README.md) → [Design constitution](design.md) |
| Contributing code | [CONTRIBUTING](../CONTRIBUTING.md) → [Architecture](architecture.md) → [Design constitution](design.md) → [GOVERNANCE](../GOVERNANCE.md) |

## Map

| Document | Purpose |
|---|---|
| [Architecture](architecture.md) | Modules, dependency rules, page contract, runtime layers, deployment modes |
| [Query workbench](query-workbench.md) | Six query modes, semantic completion, tree ⇄ text sync, relevance lab |
| [Chrome extension](../extensions/chrome/README.md) | Front-end direct query workbench: capabilities, cut list, install and security |
| [Design constitution](design.md) | Interaction rules and visual language for the console |
| [Integration index](integration/README.md) | Index of client/host integration guides |
| [Quick start](integration/quickstart.md) | First managed entity, mapping auto-register, and rebuild |
| [Configuration reference](integration/configuration-reference.md) | Every configuration key with its Java default |
| [Troubleshooting](integration/troubleshooting.md) | Mapping reconcile, auth, rebuild, and migration failures |
| [Mapping auto-register](integration/mapping-auto-register.md) | Startup timing, write boundaries, multi-instance behavior |
| [Entity mapping](integration/entity-mapping.md) | Declaring field semantics with Spring Data Elasticsearch annotations |
| [Desired state](integration/desired-state.md) | Copy expectations from the business app and choose a target cluster |
| [Mapping conflicts](integration/mapping-conflict-to-adhoc.md) | Moving incompatible mapping changes into a managed rebuild |
| [Releasing](releasing.md) | Version alignment, tag-driven release, artifacts, SBOM, rollback |
| [ES stack contract](es-stack-contract.md) | Why the host owns the Elasticsearch client versions |
| [Security policy](../SECURITY.md) | Credential boundaries and vulnerability reporting |
| [Support](../SUPPORT.md) | Where to ask questions and what to include |
| [Governance](../GOVERNANCE.md) | Roles, decision making, and release policy |

## Documentation rules

- Present tense, no timelines, no placeholders. Documentation contract tests fail on `TODO`,
  `TBD`, `待补充`, and `待完善` in integration guides.
- Configuration keys are written as `esquerystudio.elasticsearch.*` (engine) or
  `esquerystudio.console.*` (platform). Do not introduce compatibility aliases.
- Page keys and feature-pack ids come from `platform/src/main/resources/META-INF/esquerystudio-pages.json`.
- Screenshots must come from the real console; do not fabricate demo states.
