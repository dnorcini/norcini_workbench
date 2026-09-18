# Future AI Integration

AI is optional and must not become a source of truth. 0.8.0 contains no required AI layer.

A future adapter may receive explicitly scoped context such as the current file, selected text, current project folder, Org tasks, terminal output, Zotero references, or search results from the local library.

Design constraints:

- core file browsing/editing/execution must work without AI
- context sent to an AI service must be visible and controllable
- AI output should be proposed text/actions, not silent filesystem mutation
- filesystem, Org, and Zotero ownership boundaries remain unchanged
- provider-specific code should live behind a replaceable adapter interface

A future implementation should start with read-only context and explicit user-initiated actions before considering any write capabilities.
