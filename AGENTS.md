<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Portal screens use a validated `/portal/$role/$screen` route and shared browser-safe UI modules, keeping each role's navigation consistent without duplicating page shells.
- Prototype actions live only in a React context for the current visit; never imply that demo account or financial actions persist or call a service.
