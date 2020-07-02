# modul-auth-msal

Small Vuejs wrapper around Microsoft's OAuth lib

## Getting started

1. Install [Git](https://git-scm.com/)
1. Install [NodeJS Current](https://nodejs.org/)
1. Install [Yarn 1.X.X](https://classic.yarnpkg.com/en/docs/install)
1. Clone this project
1. Run `yarn install`

## Editor

[Visual Studio Code](https://code.visualstudio.com/) is the recommended editor.

The following extensions are recommended (see: `.vscode/extensions.json`):

- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) (Linting)
- [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode) (Code formatter)

Once installed, configure prettier to run on save.
Press `Cmd/Ctrl + Shift + p` and then type _"Preferences: Open Settings (JSON)"_.
Once `settings.json` open, add these two lines:

```json
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "esbenp.prettier-vscode",
```

## Supported commands

> yarn build

Builds the plugin for production. All files are put in the 'dist' folder.

> yarn lint

Runs the linters using ESLint and Prettier.

## TODO

- Add/improve examples
- Add more unit tests
