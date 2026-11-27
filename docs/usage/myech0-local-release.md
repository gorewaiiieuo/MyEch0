# MyEch0：电脑打包、Docker Hub 发布、NAS 自动更新

代码：`https://github.com/gorewaiiieuo/MyEch0`。
镜像：`docker.io/yubaodocker1125/myech0`。
镜像在 Windows 电脑编译，GitHub 只保存代码。
目前支持 Linux amd64，即 Intel / AMD 的极空间；ARM 机型需要另外构建。

## 功能修复

- 定位后，关键词在选中位置周围 10 公里内搜索，按距离排序。选点、输入坐标也会更新搜索中心。附近没有结果时不会跳到北京；未选位置时仍可输入带城市的地名搜索。
- 本地原图通过服务器的 attachment 下载响应交给手机浏览器，保留原文件名、完整字节和内嵌动态视频。文件通常在浏览器“下载”或手机“文件”里；网页不能直接写入系统相册。
- 缩略图和打开后的大图支持触摸长按约 350 毫秒播放，松开停止；拖动、滚动、切后台会取消。轻点仍打开大图，原来的播放按钮保留。首次按住需要读取原图。
- 外链、对象存储原图仍要求跨域权限，可用时支持手机系统文件分享。App 内置浏览器限制下载时，请用系统浏览器打开。私有封装和不支持的视频编码仍需真实机型样本验证。

## 电脑端发布

Docker Desktop 运行并已登录 Docker Hub 后，在源码仓库执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\Publish-MyEch0.ps1
```

脚本要求先提交代码，从源码构建 amd64 镜像，再用独立临时容器检查启动。通过后上传带时间的版本标签，最后更新 `latest`。NAS 跟随 `latest`；旧版本标签可供人工回退。

构建不包含账号、附件、高德 Key 或 Docker 凭据。代码另用 `git push myech0 HEAD:main` 保存到 fork。`-UsePrebuilt` 仅用于有本机构建回执的发布，会核对二进制校验值和源码提交。

## NAS 首次接入

NAS 安装完成后自动更新才生效。需要能访问 Docker Hub，安装 Docker Compose，并具备 `flock`、`tar`、`crontab`，以能管理 Docker 和备份数据的账号执行。

1. 把源码中的 `deploy/nas` 放到 NAS，例如 `/volume1/docker/myech0-updater`，不要放入 Ech0 的 `data`。
2. 复制 `.env.example` 为 `.env`，将 `ECH0_DATA_DIR` 改为原容器实际使用的数据文件夹绝对路径，填写现有端口。查看原挂载可执行 `docker inspect ech0`，找到目标为 `/app/data` 的 Source。
3. 若原实例为手动创建，停止后完整备份数据，把旧容器改名留存。若原来有 Compose 或特殊环境、网络配置，需迁入新配置。新项目必须继续挂载原数据，不能新建空目录替代。
4. 在配置目录执行：

   ```sh
   docker compose --env-file .env -f compose.yml pull
   docker compose --env-file .env -f compose.yml up -d --wait
   ```

5. 确认原账号、动态和附件正常后，执行 `sh enable-auto-update.sh`。每 10 分钟检查一次，日志为 `update.log`。NAS 没有 crontab 时，需在 NAS 的计划任务中每 10 分钟执行 `/bin/sh /实际安装路径/update.sh`；具体入口需在实机确认。

## 更新和恢复

下载失败不会停止现有服务。发现新镜像后，先停止 SQLite，备份完整数据、容器配置和旧镜像标签，再更换容器并检查健康状态。

新版启动失败时，脚本保留失败版本的数据目录，恢复备份数据并启动旧镜像，写入 `update.failed`，暂停后续更新。检查日志和备份、处理故障后才移除该文件。

备份保留在 `backups/时间/`，不会自动删除。请定期检查空间并按自己的保留周期清理。不要把备份、`.env` 或 `data` 上传到 GitHub。

参考：Docker 官方 `docker image push`、`docker compose pull`、`docker compose up --wait` 文档；高德 JS API 的 `PlaceSearch.searchNearBy` 文档。
