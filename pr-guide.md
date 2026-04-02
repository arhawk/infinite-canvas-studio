# GitHub PR Workflow Guide


### When you had GitHub login
一共五个存储位置, 由远及近

upstream 官方aka.Bai远程仓库(作用: 每次递交前, 本地main pull一遍然后合并解决冲突)

origin 自己远程仓库(作用: 让origin的main库与upstream保持同步即可)

local 自己开发的本地仓库(在git commit后存储) .git/objects `git ls-tree -r HEAD --name-only`

stage 自己本地暂存区(在git add后存储在当前branch上)`git ls-files`

workspace 当前的开发目录的(只是创建文件不存储在任何branch上) `ls`

### STEP1: 下载upstream到origin,与local
folk upstream->origin

```bash
git clone https://github.com/<your_github_username>/CS61-3-USYD2026 #origin->local
git add upstream https://github.com/baff0397/CS61-3-USYD2026 #see in git remote -v
cd CS61-3-USYD2026    #cd to workspace, in main branch
```

### STEP2: 更换branch并打开readme加自己的名字

```
git checkout -b pr-guide-contributor-<your_name> #create & shift to a new branch
echo " - <your_name>" >> pr-guide.md  #add your name

#之后的文档修改可能会涉及文档冲突合并, 但这里不考虑
```

### STEP3: 更换的文件在workspace上传到local, 再上传到origin

```bash
git add pr-guide.md    # workspace -> stage
git commit -m "fix/feat/docs...: brief description of changes" #stage -> local
git push origin pr-guide-contributor-<your_name> #local -> origin
```

### STEP4: 由origin上传到upstream
打开origin, 点击pull requests, 找到自己的commit, 并申请new pull request

1. Go to the repo on GitHub.
2. Click the **Compare & pull request** banner (or go to **Pull requests** → **New pull request**).
3. Fill in a title and description.
4. Click **Create pull request**.
5. 申请是合并自己的origin feature分支与upstream main 分支合并即可

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
|查看当前文件状态, Changes to be committed: 就是文件在stage; Changesanges not staged for commit: 就是文件add/commit了但是被修改了,stage与workspace 文件不同需要再commit;Untracktracked files:就是文件在workspace,还没有add | `git status` |

---

## Contributors List
 - Bowen Bai
 - Zehao Liu
 - Xuexin Lin
 - Jialu Shi
 - xiaoyan Cao
 - Zeru Li
 - Qiuwen Li
