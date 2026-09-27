# shadcn/ui Build Guidelines — 2026-09-24

## Purpose

The customer, Admin, and Super Admin interfaces should use **shadcn/ui as the first UI source** whenever a required UI pattern exists there.

shadcn/ui is not treated like a black-box component package. Its model distributes the actual component source code into the project, so the project owns the copied/generated component code and can customize it. Official docs describe it as an open-code, composable, AI-ready component distribution system. See the official references below.

## Important distinction: UI source vs business data

shadcn/ui supplies UI component source and patterns. It does not supply this project's products, customers, categories, prices, orders, inventory, or business rules.

Use:

```text
shadcn/ui → UI structure/components
backend API → ecommerce data
Aiven PostgreSQL → authoritative application state
```

Do not try to obtain live business data from shadcn examples or hard-code example data into production features.

## Mandatory UI rule

Before building a UI pattern from scratch:

1. Check the official shadcn/ui component catalog.
2. Check official shadcn/ui blocks when a larger composed UI is needed.
3. Add the closest official component/block to the frontend project.
4. Customize the generated source to match the ecommerce design system.
5. Compose multiple shadcn components before inventing a new primitive.
6. Only create a new custom primitive when the official components cannot reasonably support the requirement.

Examples:

```text
Button            → shadcn/ui Button
Card              → shadcn/ui Card
Dialog            → shadcn/ui Dialog
Drawer            → shadcn/ui Drawer
Form controls     → shadcn/ui Input / Label / Select / Checkbox / etc.
Tables            → shadcn/ui Table / Data Table patterns
Pagination        → shadcn/ui Pagination
Tabs              → shadcn/ui Tabs
Toast/feedback    → shadcn/ui toast/sonner pattern as configured
Admin sidebar     → shadcn/ui Sidebar
Dashboard cards   → shadcn/ui Card + chart/table primitives
Login form        → shadcn/ui blocks/components when available
```

## Do not install multiple UI libraries casually

The default frontend UI stack is:

```text
Tailwind CSS
+
shadcn/ui
+
Lucide icons (through shadcn setup where applicable)
```

Do not add another full UI library such as MUI, Chakra, Ant Design, or Bootstrap unless the project owner explicitly approves it.

## Use the official source

The official shadcn/ui site is:

https://ui.shadcn.com/

The project should prefer the official shadcn/ui registry and official CLI. Third-party registries/components must be reviewed before use.

## CLI rule

For an existing frontend project, use the official shadcn CLI to initialize and add components when that is the chosen workflow.

Examples:

```bash
npx shadcn@latest init
npx shadcn@latest add button card input label
```

Do not use `add --all` merely to install everything. Add only components actually needed by the feature.

## Components are project-owned code

Once a shadcn component is added:

```text
shadcn/ui
   ↓
component source enters project
   ↓
project owns/customizes it
```

Do not repeatedly overwrite customized components from upstream without checking the diff.

## Blocks rule

Use shadcn blocks when they match a real page pattern, for example:

- Login/auth pages
- Dashboard layouts
- Data-table layouts
- Sidebar navigation
- Forms
- Settings pages

Adapt the block to this ecommerce project instead of copying unrelated visual/business logic.

## Business logic must stay outside UI primitives

A shadcn component should remain a UI building block.

Do not put:

- database queries
- Cashfree logic
- authorization decisions
- pricing calculations
- payout logic
- order state logic

inside a generic UI component.

Correct:

```text
Page / Feature
   ↓
Business hook / API client
   ↓
Data
   ↓
shadcn UI components
```

## Accessibility rule

Prefer accessible shadcn primitives and preserve keyboard, focus, form-label, dialog, menu, and error-message behavior when customizing.

Do not visually customize a component in a way that removes its accessibility behavior.

## AI/Codex rule

When an AI is asked to create frontend UI:

```text
1. Read project docs.
2. Search/check official shadcn components/blocks.
3. Prefer an existing shadcn pattern.
4. Add only needed components.
5. Customize the source inside the project.
6. Do not create a new UI system.
```

If shadcn does not contain the exact component, compose existing primitives first.

## References

Official introduction:
https://ui.shadcn.com/docs

Official installation:
https://ui.shadcn.com/docs/installation

Official CLI:
https://ui.shadcn.com/docs/cli

Official components:
https://ui.shadcn.com/docs/components

Official blocks are available through the official site/registry and CLI.

Official source/registry guidance:
https://ui.shadcn.com/docs/official
