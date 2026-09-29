# 趣站博物馆

Sitopia 是 [有趣网址之家](https://youquhome.com/) 的一座浏览器展厅。人站在广场上，走进白墙厅，墙上挂着「千奇百怪」里的网站。走近一只画框，点一下，能看介绍、原文和传送门。

画框按文章发布日期从新到旧排列，分上、中、下三排。画芯用文章里的配图，浏览时直接向图片站要。站名和介绍写在页面浮层里。

用电脑和键鼠打开。手机上能看，不适合逛。

线上展厅：https://youquhome.com/sitopia/

## 在本机打开

需要已安装 Node.js。双击 `start-museum.bat`，或在这个目录里运行：

```bash
node tools/serve.mjs
```

浏览器打开 http://127.0.0.1:4173/ 。换端口可以设环境变量 `PORT`。

进馆前先起一个名字，以后点地图下面的在线人数改。本机打开时，同一个服务里的窗口互相看得见。线上页面的一起逛走 `wss://lobby.youquhome.com/lobby`，再转到 Cloudflare 的 sitopia-lobby，和本机不是同一间。有趣网址之家 `/sitopia/` 是另外传上去的，不跟这次仓库一起换。

## 怎么逛

点击画面之后鼠标才锁定。

- `W` `A` `S` `D` 走动，鼠标环顾，`Shift` 快步
- 单击画框，看介绍和链接。点卡片外面，鼠标回到走动。离开这个页面，人还会在线三十秒
- `回车` 说话。发出去的字出现在左下角，最新的在最上面，最多五行，也出现在头上。再按一次 `回车`，输入框收起
- 左上角按钮，或 `[` `]`，从清晨换到夜晚
- 右上角是平面图。地图下面，电梯和在线人数并排，宽度跟地图对齐，点一下换一个。`Tab` 或右上角三条横线打开导航
- 点在线人数，看谁在、聊天记录，改名字。再点一次才收起
- 电梯门外和轿厢里按 `E` 开门，轿厢里按 `F` 选层
- `R` 回到广场
- `Esc` 才出现左下角说明和右下角操作说明。左下角有各分类的数量。点说明外面继续走

地址后面可以加参数：`?preview=1` 相机对着一只画框，`?time=清晨` 指定时辰，`?debug=1` 画出碰撞线。

## 展品从哪来

`data/sites.json` 是当前这份清单，字段有标题、简介、传送门、原文、分类，有配图时还有图片地址。传送门取自有趣网址之家原文开篇；原文标了已挂的站仍保留。

重新拉文：

```bash
node tools/fetch-sites.mjs
```

给当前墙上的画框补上配图地址：

```bash
node tools/fetch-sites.mjs --images
```

改完布局或清单后跑一遍：

```bash
node tools/selftest.mjs
```

配图不放进这个仓库。运行时向 `img.youquhome.com` 要图，图片站需要允许跨域读取。

## 目录

| 路径 | 内容 |
| --- | --- |
| `index.html`、`museum.css` | 页面和浮层 |
| `js/` | 展厅、走动、时辰、在线的人 |
| `tools/serve.mjs` | 本机打开，并带上同一台电脑上的联机 |
| `worker/lobby.js` | 一起逛的房间，Cloudflare 上的 sitopia-lobby |
| `worker/youqu-proxy.js` | `lobby.youquhome.com` 的反代，转到上面的房间 |
| `server/youqu-lobby/index.php` | 有趣网址之家那份房间。仓库里留着，这次不传到主机 |
| `tools/fetch-sites.mjs` | 从有趣网址之家拉展品 |
| `tools/selftest.mjs` | 检查布局、朝向和能不能走到 |
| `data/sites.json` | 展品清单 |
| `vendor/three.module.js` | Three.js r170，许可在文件头 |

Three.js 已经放在仓库里，不需要 `npm install`。
