# Lantern

Lantern is a WoW Classic dungeon guide built with
Go, vanilla JavaScript, CSS and embedded static assets.

## Architecture
- main.go: HTTP server
- web/app.js: shared viewer
- web/maps/: dungeon data
- web/style.css: presentation
- tests/: Node and browser tests

## Validation
- go test ./...
- go vet ./...
- node --test tests/atlas.test.cjs

## Rules
- Preserve unrelated changes.
- Do not change map artwork or route data without explicit scope.
- Do not invent verified dungeon routes.
- Use a separate branch for implementation.
- Require independent verification for feature changes.

## HiveKrew
- Follow the shared role definitions in core/.
- Delegate implementation and verification to native workers.
- Keep task contracts bounded to Lantern.
