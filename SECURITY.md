# Security notes

This project can write files through the GitHub Contents API using a token entered by the repository owner.

## Required token scope

Use a fine-grained personal access token restricted to one repository with only:

- Repository permissions → Contents → Read and write

Do not grant administration, actions, secrets, packages, or organization permissions.

## Never commit credentials

Do not add a token to source code, `.env` files committed to Git, workflow YAML, `progress.json`, screenshots, or Markdown notes.

## Public deployment warning

The website code is public on GitHub Pages. A token typed into the page is accessible to that browser session and could be stolen by malicious injected code or a compromised browser extension. Use a dedicated, short-lived, least-privilege token and revoke it when it is no longer needed.

For multi-user deployment, replace direct browser authentication with a GitHub App or a server-side token exchange.
