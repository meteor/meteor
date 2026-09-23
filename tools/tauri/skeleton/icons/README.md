# Tauri app icons

This directory ships a default Meteor-branded icon set referenced by
`tauri.conf.json`:

- `32x32.png`
- `64x64.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)
- `icon-source.png` — the 1024×1024 source used to generate the set above.

## Using your own icon

Provide a single square (ideally 1024×1024) PNG in your app at one of:

- `private/tauri-icon.png`
- `public/tauri-icon.png`

The Meteor Tauri builder detects it, runs `@tauri-apps/cli icon` to regenerate
the platform icon set, and overwrites the defaults in this directory. You can
also regenerate manually:

```
npx @tauri-apps/cli icon path/to/app-icon.png
```
