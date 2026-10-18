# Legacy Vercel deployment diagnosis

[← Documentation](README.md) · [Getting started](getting-started.md)

**Status as of 2026-10-19:** diagnosed. The Git connection is unchanged; the proposed cleanup awaits explicit approval.

## Why builds fail

Vercel's `ally` project is connected to `AryanRai/Ally` and still attempts preview and production deployments from `ally-remote-service`. That directory is absent from the committed Git tree. Both the authenticated Vercel build log for PR43 and the production-failure email for merge `0fe238e` fail before building:

> The specified Root Directory "ally-remote-service" does not exist. Please update your Project Settings.

The repository README identifies the web build and `ally-remote-service` as retired in v2. The current application is Electron plus Android companions and the desktop/cloud bridge. Changing Root Directory to the Electron application would not restore the retired service.

## Proposed cleanup

Disconnect only this Vercel project's Git repository association to stop obsolete automatic Git builds. Preserve the project, successful historical deployment, domains, environment settings, GitHub app installation, and other Vercel projects.

This is a deployment-configuration change, not a source-code build fix. It does not turn a historical failed deployment into a successful one. Do not delete old deployments, suppress notifications globally, recreate the retired service, or change Ally's live bridge as a shortcut.

Automatic approval review rejected the attempted Disconnect action because stopping automatic deployments needs specific authorization. No setting changed, and a supported user-input question requested that decision. The subsequent README-polish request did not approve the disconnect.

## Verification after approval

1. Confirm this project displays no connected Git repository.
2. Check that its existing hosted deployment/domain and Ally's authenticated desktop bridge remain available.
3. Verify a subsequent Git change does not schedule another obsolete Vercel deployment.
4. Record the actual outcome here. Existing failures remain historical records.
