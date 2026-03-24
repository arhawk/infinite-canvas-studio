# GitHub PR Workflow Guide

### First-Time Setup

```bash
git clone git@github.com:baff0397/CS61-3-USYD2026.git
cd CS61-3-USYD2026
```

### Every Time You Work on Something New

```bash
# 1. Update main
git checkout main
git pull origin main

# 2. Create a new branch
git checkout -b feature/<your-feature-name>

# 3. Make your changes, then stage and commit (https://www.conventionalcommits.org/en/v1.0.0/)
git add .
git commit -m "fix/feat/docs...: brief description of changes"

# 4. Push the branch
git push origin feature/<your-feature-name>
```

### Open a Pull Request

1. Go to the repo on GitHub.
2. Click the **Compare & pull request** banner (or go to **Pull requests** → **New pull request**).
3. Fill in a title and description.
4. Click **Create pull request**.

Wait for the owner to review and merge.

---

## Handling Conflicts

If your push is rejected or the PR shows conflicts:

```bash
git checkout main
git pull origin main
git checkout feature/<your-feature-name>
git merge main
# Resolve conflicts in your editor, then:
git add .
git commit -m "resolve merge conflicts"
git push origin feature/<your-feature-name>
```

---

## Quick Reference

| Action | Command |
|---|---|
| Clone repo | `git clone <url>` |
| Create branch | `git checkout -b <branch>` |
| Stage changes | `git add .` |
| Commit | `git commit -m "message"` |
| Push branch | `git push origin <branch>` |
| Update main | `git checkout main && git pull` |

---

## Contributors List
 - Bowen Bai