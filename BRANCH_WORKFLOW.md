# Branch workflow for FlatMate

This repository uses a lightweight Git workflow to keep development organized and safe.

## Main branches

- `main` — production-ready code
- `develop` — optional integration branch if the project grows (not required for small teams)

## Feature branches

Create a separate branch for each task or feature:

```bash
git checkout main
git pull origin main
git checkout -b feature/<short-name>
```

Examples:

- `feature/user-dashboard`
- `feature/owner-request-flow`
- `feature/mira-price-model`

## Fix branches

Use fix branches for bug fixes and maintenance:

```bash
git checkout main
git pull origin main
git checkout -b fix/<short-name>
```

Examples:

- `fix/login-validation`
- `fix/profile-upload-error`

## Hotfix branches

Use hotfix branches only for urgent production issues:

```bash
git checkout main
git pull origin main
git checkout -b hotfix/<short-name>
```

## Standard workflow

```bash
git checkout main
git pull origin main
git checkout -b feature/my-change
git add .
git commit -m "Describe your change"
git push -u origin feature/my-change
```

Then open a pull request to merge into `main` after review.

## Pull request checklist

Before merging, confirm:

- code is tested locally
- no secrets or local environment files are included
- `.env` files are not committed
- related documentation is updated if needed

## Final merge step

```bash
git checkout main
git pull origin main
git merge --no-ff feature/my-change
git push origin main
```

This workflow keeps the default branch clean and makes future updates easier to manage.
