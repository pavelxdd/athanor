# Athanor - AI Workbench

This is a simplified version of [Athanor](https://github.com/lacerbi/athanor) for my personal use.

## Prompt Templates

Athanor includes a set of customizable XML prompt templates for different AI‑assisted workflows. The templates avoid numeric limits (e.g., "at least 5–10 commits") in favor of qualitative guidance, allowing the LLM to assess task complexity and detail level autonomously.

| Prompt          | Icon            | Description                                                 | Key Variants                                                                          |
| --------------- | --------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Architect**   | DraftingCompass | Plan feature implementation with chain‑of‑thought reasoning | `default` (multistep), `one‑shot`, `detailed‑multistep` (with completeness checklist) |
| **Coder**       | Wrench          | Execute coding tasks with state tracking                    | `default`, `full‑update`, `refactoring`, `new‑feature`, `bug‑fix`, `documentation`    |
| **Reviewer**    | ClipboardCheck  | Review code, plans, or security                             | `code-review`, `plan-review`, `security-review`                                       |
| **Autoselect**  | FileSearch      | Select task‑relevant files using detailed criteria          | `default`, `enhanced‑selection`                                                       |
| **Query**       | FileQuestion    | Query project/codebase with context management              | `default`, `enhanced‑context`                                                         |
| **Writer**      | Pen             | Write/edit text with style matching                         | `default`, `technical‑documentation`, `api‑documentation`, `user‑guides`              |
| **Meta‑prompt** | ClipboardList   | Create detailed prompts from task descriptions              | `default`, `edit`                                                                     |

### Key Features Implemented

- **Chain‑of‑thought reasoning** in Architect's detailed variant.
- **Completeness checklist** covering code, tests, documentation, configuration, security.
- **Specialized task variants** with **few-shot examples** for refactoring, new features, bug fixes, documentation.
- **Reviewer prompt** for auditing code quality, architectural plans, and security.
- **Self-assessment & Confidence scoring** in Architect plans.
- **Enhanced context‑selection criteria** with supplementary‑section support.
- **Flexible commit guidelines** – no numeric limits, LLM self‑assesses complexity.

### Custom Prompts

You can create your own `prompt_*.xml` files using the built‑in **Custom Prompt Designer**. Place custom prompts in the project’s `prompts` folder to override or extend the defaults.

### Development Notes

- Prompts are located in `resources/prompts/`.
- All prompts must wrap Athanor commands in a single `<athanor>` root tag.
- The project follows the principle of **qualitative over quantitative guidance** – LLMs interpret numeric limits as hard constraints rather than soft recommendations.
