import re
from typing import Optional, Dict, Any, List
from urllib.parse import quote
from .base import PlatformResult

# Well-known site mappings and their custom search templates (155 platforms)
PLATFORM_SEARCH_TEMPLATES = {

    # --- 1. 社交、社区与论坛平台 ---
    "wechat": {
        "idx": 1,
        "name": "微信公众号 (WeChat)",
        "domain": "mp.weixin.qq.com",
        "search_url": "https://weixin.sogou.com/weixin?type=2&query={query}",
        "badge": "微信公众号"
    },
    "weibo": {
        "idx": 2,
        "name": "新浪微博 (Weibo)",
        "domain": "weibo.com",
        "search_url": "https://s.weibo.com/weibo?q={query}",
        "badge": "新浪微博"
    },
    "xiaohongshu": {
        "idx": 3,
        "name": "小红书 (Xiaohongshu)",
        "domain": "xiaohongshu.com",
        "search_url": "https://www.xiaohongshu.com/search_result?keyword={query}",
        "badge": "小红书"
    },
    "zhihu": {
        "idx": 4,
        "name": "知乎 (Zhihu)",
        "domain": "zhihu.com",
        "search_url": "https://www.zhihu.com/search?type=content&q={query}",
        "badge": "知乎"
    },
    "douban": {
        "idx": 5,
        "name": "豆瓣 (Douban)",
        "domain": "douban.com",
        "search_url": "https://www.douban.com/search?q={query}",
        "badge": "豆瓣"
    },
    "tieba": {
        "idx": 6,
        "name": "百度贴吧 (Tieba)",
        "domain": "tieba.baidu.com",
        "search_url": "https://tieba.baidu.com/f/search/res?qw={query}",
        "badge": "百度贴吧"
    },
    "hupu": {
        "idx": 7,
        "name": "虎扑社区 (Hupu)",
        "domain": "hupu.com",
        "search_url": "https://bbs.hupu.com/search?q={query}",
        "badge": "虎扑社区"
    },
    "v2ex": {
        "idx": 8,
        "name": "V2EX",
        "domain": "v2ex.com",
        "search_url": "https://www.google.com/search?q=site:v2ex.com+{query}",
        "badge": "V2EX"
    },
    "okjike": {
        "idx": 9,
        "name": "即刻 (Jike)",
        "domain": "okjike.com",
        "search_url": "https://www.baidu.com/s?wd=site%3Aokjike.com%20{query}",
        "badge": "即刻"
    },
    "nga": {
        "idx": 10,
        "name": "NGA 玩家社区",
        "domain": "nga.cn",
        "search_url": "https://bbs.nga.cn/thread.php?key={query}",
        "badge": "NGA社区"
    },
    "coolapk": {
        "idx": 11,
        "name": "酷安 (Coolapk)",
        "domain": "coolapk.com",
        "search_url": "https://www.baidu.com/s?wd=site%3Acoolapk.com%20{query}",
        "badge": "酷安"
    },
    "maimai": {
        "idx": 12,
        "name": "脉脉 (Maimai)",
        "domain": "maimai.cn",
        "search_url": "https://www.baidu.com/s?wd=site%3Amaimai.cn%20{query}",
        "badge": "脉脉"
    },
    "toutiao": {
        "idx": 13,
        "name": "今日头条 (Toutiao)",
        "domain": "toutiao.com",
        "search_url": "https://so.toutiao.com/search?keyword={query}",
        "badge": "今日头条"
    },
    "douyin": {
        "idx": 14,
        "name": "抖音 (Douyin)",
        "domain": "douyin.com",
        "search_url": "https://www.douyin.com/search/{query}",
        "badge": "抖音"
    },
    "kuaishou": {
        "idx": 15,
        "name": "快手 (Kuaishou)",
        "domain": "kuaishou.com",
        "search_url": "https://www.kuaishou.com/search/video?searchKey={query}",
        "badge": "快手"
    },
    "twitter": {
        "idx": 16,
        "name": "X (Twitter)",
        "domain": "x.com",
        "search_url": "https://twitter.com/search?q={query}",
        "badge": "X (Twitter)"
    },
    "reddit": {
        "idx": 17,
        "name": "Reddit",
        "domain": "reddit.com",
        "search_url": "https://www.reddit.com/search/?q={query}",
        "badge": "Reddit"
    },
    "instagram": {
        "idx": 18,
        "name": "Instagram",
        "domain": "instagram.com",
        "search_url": "https://www.instagram.com/explore/tags/{query}/",
        "badge": "Instagram"
    },
    "threads": {
        "idx": 19,
        "name": "Threads",
        "domain": "threads.net",
        "search_url": "https://www.threads.net/search?q={query}",
        "badge": "Threads"
    },
    "linkedin": {
        "idx": 20,
        "name": "LinkedIn (领英)",
        "domain": "linkedin.com",
        "search_url": "https://www.linkedin.com/search/results/all/?keywords={query}",
        "badge": "领英"
    },
    "facebook": {
        "idx": 21,
        "name": "Facebook",
        "domain": "facebook.com",
        "search_url": "https://www.facebook.com/search/top?q={query}",
        "badge": "Facebook"
    },
    "discord": {
        "idx": 22,
        "name": "Discord",
        "domain": "discord.com",
        "search_url": "https://www.google.com/search?q=site:discord.com+{query}",
        "badge": "Discord"
    },
    "quora": {
        "idx": 23,
        "name": "Quora",
        "domain": "quora.com",
        "search_url": "https://www.quora.com/search?q={query}",
        "badge": "Quora"
    },
    "bluesky": {
        "idx": 24,
        "name": "Bluesky",
        "domain": "bsky.app",
        "search_url": "https://bsky.app/search?q={query}",
        "badge": "Bluesky"
    },
    "mastodon": {
        "idx": 25,
        "name": "Mastodon (长毛象)",
        "domain": "mastodon.social",
        "search_url": "https://mastodon.social/search?q={query}",
        "badge": "Mastodon"
    },
    "telegram": {
        "idx": 26,
        "name": "Telegram Web",
        "domain": "web.telegram.org",
        "search_url": "https://www.google.com/search?q=site:t.me+{query}",
        "badge": "Telegram"
    },

    # --- 2. 协同知识库、在线文档与数字笔记 ---
    "feishu": {
        "idx": 27,
        "name": "飞书文档 / 知识库",
        "domain": "feishu.cn",
        "search_url": "https://www.google.com/search?q=site:feishu.cn+{query}&btnI=1",
        "badge": "飞书文档"
    },
    "yuque": {
        "idx": 28,
        "name": "语雀 (Yuque)",
        "domain": "yuque.com",
        "search_url": "https://www.yuque.com/search?q={query}",
        "badge": "语雀"
    },
    "tencent_docs": {
        "idx": 29,
        "name": "腾讯文档 (Docs)",
        "domain": "docs.qq.com",
        "search_url": "https://www.baidu.com/s?wd=site%3Adocs.qq.com%20{query}",
        "badge": "腾讯文档"
    },
    "shimo": {
        "idx": 30,
        "name": "石墨文档 (Shimo)",
        "domain": "shimo.im",
        "search_url": "https://www.baidu.com/s?wd=site%3Ashimo.im%20{query}",
        "badge": "石墨文档"
    },
    "kdocs": {
        "idx": 31,
        "name": "金山文档 (WPS 365)",
        "domain": "kdocs.cn",
        "search_url": "https://www.baidu.com/s?wd=site%3Akdocs.cn%20{query}",
        "badge": "金山文档"
    },
    "weread": {
        "idx": 32,
        "name": "微信读书 (WeRead)",
        "domain": "weread.qq.com",
        "search_url": "https://weread.qq.com/web/search/books?keyword={query}",
        "badge": "微信读书"
    },
    "dedao": {
        "idx": 33,
        "name": "得到 App (网页版)",
        "domain": "dedao.cn",
        "search_url": "https://www.baidu.com/s?wd=site%3Adedao.cn%20{query}",
        "badge": "得到"
    },
    "yinxiang": {
        "idx": 34,
        "name": "印象笔记 (Evernote)",
        "domain": "yinxiang.com",
        "search_url": "https://www.baidu.com/s?wd=site%3Ayinxiang.com%20{query}",
        "badge": "印象笔记"
    },
    "youdao_note": {
        "idx": 35,
        "name": "有道云笔记",
        "domain": "note.youdao.com",
        "search_url": "https://www.baidu.com/s?wd=site%3Anote.youdao.com%20{query}",
        "badge": "有道云笔记"
    },
    "siyuan": {
        "idx": 36,
        "name": "思源笔记 (Siyuan)",
        "domain": "b3log.org",
        "search_url": "https://www.google.com/search?q=site:b3log.org/siyuan+{query}",
        "badge": "思源笔记"
    },
    "mubu": {
        "idx": 37,
        "name": "幕布 (Mubu)",
        "domain": "mubu.com",
        "search_url": "https://www.baidu.com/s?wd=site%3Amubu.com%20{query}",
        "badge": "幕布"
    },
    "pan_quark": {
        "idx": 38,
        "name": "夸克文档 / 夸克网盘",
        "domain": "pan.quark.cn",
        "search_url": "https://www.baidu.com/s?wd=site%3Apan.quark.cn%20{query}",
        "badge": "夸克文档"
    },
    "notion": {
        "idx": 39,
        "name": "Notion",
        "domain": "notion.so",
        "search_url": "https://www.google.com/search?q=site:notion.site+{query}",
        "badge": "Notion"
    },
    "google_docs": {
        "idx": 40,
        "name": "Google Docs / Drive",
        "domain": "docs.google.com",
        "search_url": "https://www.google.com/search?q=site:docs.google.com+{query}",
        "badge": "Google Docs"
    },
    "wikipedia": {
        "idx": 41,
        "name": "Wikipedia (维基百科)",
        "domain": "wikipedia.org",
        "search_url": "https://zh.wikipedia.org/w/index.php?search={query}",
        "badge": "维基百科"
    },
    "coda": {
        "idx": 42,
        "name": "Coda",
        "domain": "coda.io",
        "search_url": "https://www.google.com/search?q=site:coda.io+{query}",
        "badge": "Coda"
    },
    "slite": {
        "idx": 43,
        "name": "Slite",
        "domain": "slite.com",
        "search_url": "https://www.google.com/search?q=site:slite.com+{query}",
        "badge": "Slite"
    },
    "confluence": {
        "idx": 44,
        "name": "Confluence (Atlassian)",
        "domain": "atlassian.net",
        "search_url": "https://www.google.com/search?q=site:atlassian.net+{query}",
        "badge": "Confluence"
    },
    "miro": {
        "idx": 45,
        "name": "Miro",
        "domain": "miro.com",
        "search_url": "https://miro.com/search/?query={query}",
        "badge": "Miro"
    },
    "obsidian": {
        "idx": 46,
        "name": "Obsidian Publish",
        "domain": "publish.obsidian.md",
        "search_url": "https://www.google.com/search?q=site:publish.obsidian.md+{query}",
        "badge": "Obsidian"
    },
    "roamresearch": {
        "idx": 47,
        "name": "Roam Research",
        "domain": "roamresearch.com",
        "search_url": "https://www.google.com/search?q=site:roamresearch.com+{query}",
        "badge": "Roam Research"
    },
    "airtable": {
        "idx": 48,
        "name": "Airtable",
        "domain": "airtable.com",
        "search_url": "https://airtable.com/universe/search?q={query}",
        "badge": "Airtable"
    },
    "craft": {
        "idx": 49,
        "name": "Craft Docs",
        "domain": "craft.do",
        "search_url": "https://www.google.com/search?q=site:craft.do+{query}",
        "badge": "Craft"
    },

    # --- 3. 技术开发、代码开源与问答社区 ---
    "juejin": {
        "idx": 50,
        "name": "稀土掘金 (Juejin)",
        "domain": "juejin.cn",
        "search_url": "https://juejin.cn/search?query={query}",
        "badge": "掘金"
    },
    "csdn": {
        "idx": 51,
        "name": "CSDN",
        "domain": "csdn.net",
        "search_url": "https://so.csdn.net/so/search?q={query}",
        "badge": "CSDN"
    },
    "cnblogs": {
        "idx": 52,
        "name": "博客园 (CNBlogs)",
        "domain": "cnblogs.com",
        "search_url": "https://zzk.cnblogs.com/s/blogpost?Keywords={query}",
        "badge": "博客园"
    },
    "segmentfault": {
        "idx": 53,
        "name": "思否 (SegmentFault)",
        "domain": "segmentfault.com",
        "search_url": "https://segmentfault.com/search?q={query}",
        "badge": "思否"
    },
    "oschina": {
        "idx": 54,
        "name": "开源中国 (OSCHINA)",
        "domain": "oschina.net",
        "search_url": "https://www.oschina.net/search?scope=project&q={query}",
        "badge": "开源中国"
    },
    "sspai": {
        "idx": 55,
        "name": "少数派 (sspai)",
        "domain": "sspai.com",
        "search_url": "https://sspai.com/search?keyword={query}",
        "badge": "少数派"
    },
    "leetcode_cn": {
        "idx": 56,
        "name": "力扣中国 (LeetCode CN)",
        "domain": "leetcode.cn",
        "search_url": "https://leetcode.cn/problemset/?search={query}",
        "badge": "力扣中国"
    },
    "jianshu": {
        "idx": 57,
        "name": "简书 (Jianshu)",
        "domain": "jianshu.com",
        "search_url": "https://www.jianshu.com/search?q={query}",
        "badge": "简书"
    },
    "infoq": {
        "idx": 58,
        "name": "InfoQ 极客邦",
        "domain": "infoq.cn",
        "search_url": "https://www.infoq.cn/search?keywords={query}",
        "badge": "InfoQ"
    },
    "aliyun_dev": {
        "idx": 59,
        "name": "阿里云开发者社区",
        "domain": "developer.aliyun.com",
        "search_url": "https://developer.aliyun.com/search?keyword={query}",
        "badge": "阿里云社区"
    },
    "tencent_cloud_dev": {
        "idx": 60,
        "name": "腾讯云开发者社区",
        "domain": "cloud.tencent.com",
        "search_url": "https://cloud.tencent.com/developer/search/article-{query}",
        "badge": "腾讯云社区"
    },
    "gitee": {
        "idx": 61,
        "name": "Gitee 码云",
        "domain": "gitee.com",
        "search_url": "https://gitee.com/search?q={query}",
        "badge": "Gitee"
    },
    "51cto": {
        "idx": 62,
        "name": "51CTO",
        "domain": "51cto.com",
        "search_url": "https://search.51cto.com/?q={query}",
        "badge": "51CTO"
    },
    "github": {
        "idx": 63,
        "name": "GitHub",
        "domain": "github.com",
        "search_url": "https://github.com/search?q={query}&type=repositories",
        "badge": "GitHub"
    },
    "stackoverflow": {
        "idx": 64,
        "name": "Stack Overflow",
        "domain": "stackoverflow.com",
        "search_url": "https://stackoverflow.com/search?q={query}",
        "badge": "Stack Overflow"
    },
    "huggingface": {
        "idx": 65,
        "name": "Hugging Face",
        "domain": "huggingface.co",
        "search_url": "https://huggingface.co/models?search={query}",
        "badge": "Hugging Face"
    },
    "gitlab": {
        "idx": 66,
        "name": "GitLab",
        "domain": "gitlab.com",
        "search_url": "https://gitlab.com/search?search={query}",
        "badge": "GitLab"
    },
    "leetcode": {
        "idx": 67,
        "name": "LeetCode (Global)",
        "domain": "leetcode.com",
        "search_url": "https://leetcode.com/problemset/?search={query}",
        "badge": "LeetCode"
    },
    "npm": {
        "idx": 68,
        "name": "npm",
        "domain": "npmjs.com",
        "search_url": "https://www.npmjs.com/search?q={query}",
        "badge": "npm"
    },
    "pypi": {
        "idx": 69,
        "name": "PyPI",
        "domain": "pypi.org",
        "search_url": "https://pypi.org/search/?q={query}",
        "badge": "PyPI"
    },
    "dockerhub": {
        "idx": 70,
        "name": "Docker Hub",
        "domain": "hub.docker.com",
        "search_url": "https://hub.docker.com/search?q={query}",
        "badge": "Docker Hub"
    },
    "mdn": {
        "idx": 71,
        "name": "MDN Web Docs",
        "domain": "developer.mozilla.org",
        "search_url": "https://developer.mozilla.org/zh-CN/search?q={query}",
        "badge": "MDN Docs"
    },
    "dev_to": {
        "idx": 72,
        "name": "Dev.to",
        "domain": "dev.to",
        "search_url": "https://dev.to/search?q={query}",
        "badge": "Dev.to"
    },
    "hashnode": {
        "idx": 73,
        "name": "Hashnode",
        "domain": "hashnode.com",
        "search_url": "https://hashnode.com/search?q={query}",
        "badge": "Hashnode"
    },
    "paperswithcode": {
        "idx": 74,
        "name": "Papers with Code",
        "domain": "paperswithcode.com",
        "search_url": "https://paperswithcode.com/search?q={query}",
        "badge": "Papers with Code"
    },
    "arxiv": {
        "idx": 75,
        "name": "arXiv",
        "domain": "arxiv.org",
        "search_url": "https://arxiv.org/search/?query={query}&searchtype=all",
        "badge": "arXiv"
    },
    "kaggle": {
        "idx": 76,
        "name": "Kaggle",
        "domain": "kaggle.com",
        "search_url": "https://www.kaggle.com/search?q={query}",
        "badge": "Kaggle"
    },
    "w3schools": {
        "idx": 77,
        "name": "W3Schools",
        "domain": "w3schools.com",
        "search_url": "https://www.google.com/search?q=site:w3schools.com+{query}",
        "badge": "W3Schools"
    },

    # --- 4. 视频流媒体、短视频与播客音频 ---
    "bilibili": {
        "idx": 78,
        "name": "哔哩哔哩 (Bilibili)",
        "domain": "bilibili.com",
        "search_url": "https://search.bilibili.com/all?keyword={query}",
        "badge": "哔哩哔哩"
    },
    "douyin_video": {
        "idx": 79,
        "name": "抖音短视频",
        "domain": "douyin.com",
        "search_url": "https://www.douyin.com/search/{query}",
        "badge": "抖音"
    },
    "kuaishou_video": {
        "idx": 80,
        "name": "快手视频",
        "domain": "kuaishou.com",
        "search_url": "https://www.kuaishou.com/search/video?searchKey={query}",
        "badge": "快手"
    },
    "tencent_video": {
        "idx": 81,
        "name": "腾讯视频",
        "domain": "v.qq.com",
        "search_url": "https://v.qq.com/x/search/?q={query}",
        "badge": "腾讯视频"
    },
    "iqiyi": {
        "idx": 82,
        "name": "爱奇艺",
        "domain": "iqiyi.com",
        "search_url": "https://www.iqiyi.com/search/{query}.html",
        "badge": "爱奇艺"
    },
    "youku": {
        "idx": 83,
        "name": "优酷",
        "domain": "youku.com",
        "search_url": "https://so.youku.com/search_video/q_{query}",
        "badge": "优酷"
    },
    "mgtv": {
        "idx": 84,
        "name": "芒果 TV",
        "domain": "mgtv.com",
        "search_url": "https://so.mgtv.com/so/k-{query}",
        "badge": "芒果TV"
    },
    "xiaoyuzhou": {
        "idx": 85,
        "name": "小宇宙播客",
        "domain": "xiaoyuzhoufm.com",
        "search_url": "https://www.xiaoyuzhoufm.com/search/{query}",
        "badge": "小宇宙"
    },
    "ximalaya": {
        "idx": 86,
        "name": "喜马拉雅",
        "domain": "ximalaya.com",
        "search_url": "https://www.ximalaya.com/search/{query}",
        "badge": "喜马拉雅"
    },
    "music_163": {
        "idx": 87,
        "name": "网易云音乐",
        "domain": "music.163.com",
        "search_url": "https://music.163.com/#/search/m/?s={query}&type=1",
        "badge": "网易云音乐"
    },
    "qq_music": {
        "idx": 88,
        "name": "QQ 音乐",
        "domain": "y.qq.com",
        "search_url": "https://y.qq.com/n/ryqq/search?w={query}",
        "badge": "QQ音乐"
    },
    "youtube": {
        "idx": 89,
        "name": "YouTube",
        "domain": "youtube.com",
        "search_url": "https://www.youtube.com/results?search_query={query}",
        "badge": "YouTube"
    },
    "twitch": {
        "idx": 90,
        "name": "Twitch",
        "domain": "twitch.tv",
        "search_url": "https://www.twitch.tv/search?term={query}",
        "badge": "Twitch"
    },
    "tiktok": {
        "idx": 91,
        "name": "TikTok (海外版)",
        "domain": "tiktok.com",
        "search_url": "https://www.tiktok.com/search?q={query}",
        "badge": "TikTok"
    },
    "vimeo": {
        "idx": 92,
        "name": "Vimeo",
        "domain": "vimeo.com",
        "search_url": "https://vimeo.com/search?q={query}",
        "badge": "Vimeo"
    },
    "netflix": {
        "idx": 93,
        "name": "Netflix",
        "domain": "netflix.com",
        "search_url": "https://www.netflix.com/search?q={query}",
        "badge": "Netflix"
    },
    "spotify": {
        "idx": 94,
        "name": "Spotify",
        "domain": "spotify.com",
        "search_url": "https://open.spotify.com/search/{query}",
        "badge": "Spotify"
    },
    "apple_podcasts": {
        "idx": 95,
        "name": "Apple Podcasts",
        "domain": "podcasts.apple.com",
        "search_url": "https://www.google.com/search?q=site:podcasts.apple.com+{query}",
        "badge": "Apple播客"
    },
    "soundcloud": {
        "idx": 96,
        "name": "SoundCloud",
        "domain": "soundcloud.com",
        "search_url": "https://soundcloud.com/search?q={query}",
        "badge": "SoundCloud"
    },

    # --- 5. 设计创意、UI/UX 灵感与素材库 ---
    "zcool": {
        "idx": 97,
        "name": "站酷 (ZCOOL)",
        "domain": "zcool.com.cn",
        "search_url": "https://www.zcool.com.cn/search/content?word={query}",
        "badge": "站酷"
    },
    "ui_cn": {
        "idx": 98,
        "name": "UI 中国",
        "domain": "ui.cn",
        "search_url": "https://www.ui.cn/search.html?r=project&keywords={query}",
        "badge": "UI中国"
    },
    "huaban": {
        "idx": 99,
        "name": "花瓣网",
        "domain": "huaban.com",
        "search_url": "https://huaban.com/search?q={query}",
        "badge": "花瓣网"
    },
    "zhisheji": {
        "idx": 100,
        "name": "致设计",
        "domain": "zhisheji.com",
        "search_url": "https://www.zhisheji.com/search?keywords={query}",
        "badge": "致设计"
    },
    "uisdc": {
        "idx": 101,
        "name": "优设网 (UISDC)",
        "domain": "uisdc.com",
        "search_url": "https://www.uisdc.com/?s={query}",
        "badge": "优设网"
    },
    "iconfont": {
        "idx": 102,
        "name": "阿里 Iconfont",
        "domain": "iconfont.cn",
        "search_url": "https://www.iconfont.cn/search/index?searchType=icon&q={query}",
        "badge": "Iconfont"
    },
    "gaoding": {
        "idx": 103,
        "name": "稿定设计 / 创客贴",
        "domain": "gaoding.com",
        "search_url": "https://www.gaoding.com/templates?keyword={query}",
        "badge": "稿定设计"
    },
    "dribbble": {
        "idx": 104,
        "name": "Dribbble",
        "domain": "dribbble.com",
        "search_url": "https://dribbble.com/search/{query}",
        "badge": "Dribbble"
    },
    "behance": {
        "idx": 105,
        "name": "Behance (Adobe)",
        "domain": "behance.net",
        "search_url": "https://www.behance.net/search/projects?search={query}",
        "badge": "Behance"
    },
    "pinterest": {
        "idx": 106,
        "name": "Pinterest",
        "domain": "pinterest.com",
        "search_url": "https://www.pinterest.com/search/pins/?q={query}",
        "badge": "Pinterest"
    },
    "figma": {
        "idx": 107,
        "name": "Figma Community",
        "domain": "figma.com",
        "search_url": "https://www.figma.com/community/search?resource_type=mixed&sort_by=relevancy&query={query}",
        "badge": "Figma"
    },
    "artstation": {
        "idx": 108,
        "name": "ArtStation",
        "domain": "artstation.com",
        "search_url": "https://www.artstation.com/search?sort_by=relevance&query={query}",
        "badge": "ArtStation"
    },
    "mobbin": {
        "idx": 109,
        "name": "Mobbin",
        "domain": "mobbin.com",
        "search_url": "https://mobbin.com/browse/ios/apps?q={query}",
        "badge": "Mobbin"
    },
    "refero": {
        "idx": 110,
        "name": "Refero / Styles",
        "domain": "refero.design",
        "search_url": "https://refero.design/search?q={query}",
        "badge": "Refero"
    },
    "awwwards": {
        "idx": 111,
        "name": "Awwwards",
        "domain": "awwwards.com",
        "search_url": "https://www.awwwards.com/websites/?terms={query}",
        "badge": "Awwwards"
    },
    "landbook": {
        "idx": 112,
        "name": "Land-book",
        "domain": "land-book.com",
        "search_url": "https://land-book.com/websites?q={query}",
        "badge": "Land-book"
    },
    "siteinspire": {
        "idx": 113,
        "name": "Siteinspire",
        "domain": "siteinspire.com",
        "search_url": "https://www.siteinspire.com/websites?q={query}",
        "badge": "Siteinspire"
    },
    "godly": {
        "idx": 114,
        "name": "Godly Website",
        "domain": "godly.website",
        "search_url": "https://godly.website/?search={query}",
        "badge": "Godly"
    },
    "lapaninja": {
        "idx": 115,
        "name": "Lapa Ninja",
        "domain": "lapa.ninja",
        "search_url": "https://www.lapa.ninja/search/{query}/",
        "badge": "Lapa Ninja"
    },
    "unsplash": {
        "idx": 116,
        "name": "Unsplash",
        "domain": "unsplash.com",
        "search_url": "https://unsplash.com/s/photos/{query}",
        "badge": "Unsplash"
    },
    "freepik": {
        "idx": 117,
        "name": "Freepik",
        "domain": "freepik.com",
        "search_url": "https://www.freepik.com/search?format=search&query={query}",
        "badge": "Freepik"
    },
    "tailwindui": {
        "idx": 118,
        "name": "Tailwind UI / Shadcn",
        "domain": "tailwindui.com",
        "search_url": "https://www.google.com/search?q=site:tailwindui.com+{query}",
        "badge": "Tailwind UI"
    },

    # --- 6. 科技商业、深度资讯与独立专栏 ---
    "36kr": {
        "idx": 119,
        "name": "36氪 (36Kr)",
        "domain": "36kr.com",
        "search_url": "https://36kr.com/search/articles/{query}",
        "badge": "36氪"
    },
    "huxiu": {
        "idx": 120,
        "name": "虎嗅网",
        "domain": "huxiu.com",
        "search_url": "https://www.huxiu.com/search?s={query}",
        "badge": "虎嗅网"
    },
    "thepaper": {
        "idx": 121,
        "name": "澎湃新闻",
        "domain": "thepaper.cn",
        "search_url": "https://www.thepaper.cn/searchResult?id={query}",
        "badge": "澎湃新闻"
    },
    "jiemian": {
        "idx": 122,
        "name": "界面新闻",
        "domain": "jiemian.com",
        "search_url": "https://www.baidu.com/s?wd=site%3Ajiemian.com%20{query}",
        "badge": "界面新闻"
    },
    "tmtpost": {
        "idx": 123,
        "name": "钛媒体",
        "domain": "tmtpost.com",
        "search_url": "https://www.baidu.com/s?wd=site%3Atmtpost.com%20{query}",
        "badge": "钛媒体"
    },
    "caixin": {
        "idx": 124,
        "name": "财新网 (Caixin)",
        "domain": "caixin.com",
        "search_url": "https://search.caixin.com/search/search.jsp?keyword={query}",
        "badge": "财新网"
    },
    "geekpark": {
        "idx": 125,
        "name": "极客公园",
        "domain": "geekpark.net",
        "search_url": "https://www.baidu.com/s?wd=site%3Ageekpark.net%20{query}",
        "badge": "极客公园"
    },
    "xueqiu": {
        "idx": 126,
        "name": "雪球",
        "domain": "xueqiu.com",
        "search_url": "https://xueqiu.com/k?q={query}",
        "badge": "雪球"
    },
    "eastmoney": {
        "idx": 127,
        "name": "东方财富网",
        "domain": "eastmoney.com",
        "search_url": "https://so.eastmoney.com/all?keyword={query}",
        "badge": "东方财富"
    },
    "wallstreetcn": {
        "idx": 128,
        "name": "华尔街见闻",
        "domain": "wallstreetcn.com",
        "search_url": "https://wallstreetcn.com/search?q={query}",
        "badge": "华尔街见闻"
    },
    "medium": {
        "idx": 129,
        "name": "Medium",
        "domain": "medium.com",
        "search_url": "https://medium.com/search?q={query}",
        "badge": "Medium"
    },
    "substack": {
        "idx": 130,
        "name": "Substack",
        "domain": "substack.com",
        "search_url": "https://substack.com/search/{query}",
        "badge": "Substack"
    },
    "hackernews": {
        "idx": 131,
        "name": "Hacker News (YC)",
        "domain": "news.ycombinator.com",
        "search_url": "https://hn.algolia.com/?q={query}",
        "badge": "Hacker News"
    },
    "producthunt": {
        "idx": 132,
        "name": "Product Hunt",
        "domain": "producthunt.com",
        "search_url": "https://www.producthunt.com/search?q={query}",
        "badge": "Product Hunt"
    },
    "techcrunch": {
        "idx": 133,
        "name": "TechCrunch",
        "domain": "techcrunch.com",
        "search_url": "https://techcrunch.com/?s={query}",
        "badge": "TechCrunch"
    },
    "theverge": {
        "idx": 134,
        "name": "The Verge",
        "domain": "theverge.com",
        "search_url": "https://www.theverge.com/search?q={query}",
        "badge": "The Verge"
    },
    "wired": {
        "idx": 135,
        "name": "Wired (连线)",
        "domain": "wired.com",
        "search_url": "https://www.wired.com/search/?q={query}",
        "badge": "Wired"
    },
    "bloomberg": {
        "idx": 136,
        "name": "Bloomberg (彭博社)",
        "domain": "bloomberg.com",
        "search_url": "https://www.bloomberg.com/search?query={query}",
        "badge": "Bloomberg"
    },
    "reuters": {
        "idx": 137,
        "name": "Reuters (路透社)",
        "domain": "reuters.com",
        "search_url": "https://www.reuters.com/site-search/?query={query}",
        "badge": "Reuters"
    },
    "wsj": {
        "idx": 138,
        "name": "Wall Street Journal",
        "domain": "wsj.com",
        "search_url": "https://www.wsj.com/search?query={query}",
        "badge": "WSJ"
    },
    "ft": {
        "idx": 139,
        "name": "Financial Times",
        "domain": "ft.com",
        "search_url": "https://www.ft.com/search?q={query}",
        "badge": "FT"
    },
    "mit_tech_review": {
        "idx": 140,
        "name": "MIT Tech Review",
        "domain": "technologyreview.com",
        "search_url": "https://www.technologyreview.com/search/?s={query}",
        "badge": "MIT科技评论"
    },

    # --- 7. 电商消费、评测打分与生活娱乐 ---
    "smzdm": {
        "idx": 141,
        "name": "什么值得买 (SMZDM)",
        "domain": "smzdm.com",
        "search_url": "https://search.smzdm.com/?c=home&s={query}",
        "badge": "什么值得买"
    },
    "taobao": {
        "idx": 142,
        "name": "淘宝 / 天猫",
        "domain": "taobao.com",
        "search_url": "https://s.taobao.com/search?q={query}",
        "badge": "淘宝"
    },
    "jd": {
        "idx": 143,
        "name": "京东 (JD)",
        "domain": "jd.com",
        "search_url": "https://search.jd.com/Search?keyword={query}",
        "badge": "京东"
    },
    "pinduoduo": {
        "idx": 144,
        "name": "拼多多",
        "domain": "pinduoduo.com",
        "search_url": "https://www.baidu.com/s?wd=site%3Apinduoduo.com%20{query}",
        "badge": "拼多多"
    },
    "goofish": {
        "idx": 145,
        "name": "闲鱼",
        "domain": "goofish.com",
        "search_url": "https://www.baidu.com/s?wd=site%3A2.taobao.com%20{query}",
        "badge": "闲鱼"
    },
    "dewu": {
        "idx": 146,
        "name": "得物 (Dewu)",
        "domain": "dewu.com",
        "search_url": "https://www.baidu.com/s?wd=site%3Adewu.com%20{query}",
        "badge": "得物"
    },
    "dianping": {
        "idx": 147,
        "name": "大众点评 / 美团",
        "domain": "dianping.com",
        "search_url": "https://www.dianping.com/search/keyword/1/0_{query}",
        "badge": "大众点评"
    },
    "autohome": {
        "idx": 148,
        "name": "汽车之家 / 懂车帝",
        "domain": "autohome.com.cn",
        "search_url": "https://sou.autohome.com.cn/zonghe?entry=40&q={query}",
        "badge": "汽车之家"
    },
    "ctrip": {
        "idx": 149,
        "name": "携程旅行",
        "domain": "ctrip.com",
        "search_url": "https://you.ctrip.com/searchsite/district/?query={query}",
        "badge": "携程旅行"
    },
    "amazon": {
        "idx": 150,
        "name": "Amazon (亚马逊)",
        "domain": "amazon.com",
        "search_url": "https://www.amazon.com/s?k={query}",
        "badge": "Amazon"
    },
    "steam": {
        "idx": 151,
        "name": "Steam 商店与社区",
        "domain": "steampowered.com",
        "search_url": "https://store.steampowered.com/search/?term={query}",
        "badge": "Steam"
    },
    "epicgames": {
        "idx": 152,
        "name": "Epic Games Store",
        "domain": "epicgames.com",
        "search_url": "https://store.epicgames.com/zh-CN/browse?q={query}",
        "badge": "Epic Games"
    },
    "ebay": {
        "idx": 153,
        "name": "eBay",
        "domain": "ebay.com",
        "search_url": "https://www.ebay.com/sch/i.html?_nkw={query}",
        "badge": "eBay"
    },
    "etsy": {
        "idx": 154,
        "name": "Etsy",
        "domain": "etsy.com",
        "search_url": "https://www.etsy.com/search?q={query}",
        "badge": "Etsy"
    },
    "aliexpress": {
        "idx": 155,
        "name": "AliExpress (速卖通)",
        "domain": "aliexpress.com",
        "search_url": "https://www.aliexpress.com/wholesale?SearchText={query}",
        "badge": "AliExpress"
    },

}

# Domain to platform key lookup index for rapid fallback
DOMAIN_TO_PLATFORM_KEY = {}
for k, v in PLATFORM_SEARCH_TEMPLATES.items():
    dom = v.get("domain", "").lower()
    if dom:
        DOMAIN_TO_PLATFORM_KEY[dom] = k
        # Strip common subdomains
        if dom.startswith("www."):
            DOMAIN_TO_PLATFORM_KEY[dom[4:]] = k

class GeneralResolver:
    def extract_url(self, text: str) -> Optional[str]:
        # Search for standard http/https URLs
        match = re.search(r'https?://[a-zA-Z0-9\.\-_/~\?=&%#:\+]+', text)
        if match:
            url = match.group(0).rstrip('.,;!?:')
            return url
        return None

    def resolve(
        self,
        text: str,
        title: Optional[str] = None,
        author: Optional[str] = None,
        platform_id: Optional[str] = None,
        platform_name: Optional[str] = None,
        site_domain: Optional[str] = None,
        found_id: Optional[str] = None,
        search_query: Optional[str] = None,
        distinctive_text: Optional[str] = None,
        breadcrumb: Optional[str] = None,
        language: Optional[str] = None,
        tech_tags: Optional[List[str]] = None
    ) -> PlatformResult:
        # 1. Check direct URL in image text
        direct_url = self.extract_url(text) if text else None
        if direct_url and len(direct_url) > 12:
            return PlatformResult(
                platform="url",
                platform_name="图片内文字链接直达",
                title=f"直达链接: {direct_url[:45]}...",
                url=direct_url,
                confidence=0.99,
                matched_method="direct_url_in_image",
                extra_urls=[{"name": "立即跳转该链接", "url": direct_url}]
            )

        # 2. Extract clean title
        clean_title = (title or "").strip()
        if not clean_title and text:
            lines = [l.strip() for l in text.split("\n") if len(l.strip()) > 3]
            clean_title = lines[0] if lines else text[:35].strip()
        if not clean_title:
            clean_title = "网页内容检索"

        # 3. Resolve platform configuration
        plat_key = (platform_id or "general").lower()
        plat_cfg = PLATFORM_SEARCH_TEMPLATES.get(plat_key)

        # Fallback to domain lookup if key not recognized
        if not plat_cfg and site_domain:
            clean_domain = site_domain.lower().replace("https://", "").replace("http://", "").split("/")[0]
            matched_key = DOMAIN_TO_PLATFORM_KEY.get(clean_domain)
            if not matched_key:
                for d_k, k_val in DOMAIN_TO_PLATFORM_KEY.items():
                    if clean_domain.endswith("." + d_k):
                        matched_key = k_val
                        break
            if matched_key:
                plat_key = matched_key
                plat_cfg = PLATFORM_SEARCH_TEMPLATES.get(plat_key)

        is_niche = plat_key in ["niche_site", "general"] or plat_cfg is None

        effective_domain = site_domain or (plat_cfg.get("domain") if plat_cfg else None)
        effective_name = platform_name or (plat_cfg.get("name") if plat_cfg else ("独立/第三方网站" if is_niche else "通用网页"))
        if effective_name in ["通用网页", "general", "niche_site"]:
            effective_name = "独立/第三方网站" if is_niche else "通用网页"

        # 4. Check explicit direct repository, question, package, or topic ID
        primary_url = None
        is_direct_article = False
        if found_id:
            fid = found_id.strip()
            if plat_key == "github" and "/" in fid:
                primary_url = f"https://github.com/{fid}"
                is_direct_article = True
            elif plat_key == "gitee" and "/" in fid:
                primary_url = f"https://gitee.com/{fid}"
                is_direct_article = True
            elif plat_key == "zhihu" and fid.isdigit():
                primary_url = f"https://www.zhihu.com/question/{fid}"
                is_direct_article = True
            elif plat_key == "v2ex" and fid.isdigit():
                primary_url = f"https://www.v2ex.com/t/{fid}"
                is_direct_article = True
            elif plat_key == "sspai" and fid.isdigit():
                primary_url = f"https://sspai.com/post/{fid}"
                is_direct_article = True
            elif plat_key == "thepaper" and fid.isdigit():
                primary_url = f"https://www.thepaper.cn/newsDetail_forward_{fid}"
                is_direct_article = True
            elif plat_key == "npm":
                primary_url = f"https://www.npmjs.com/package/{fid}"
                is_direct_article = True
            elif plat_key == "pypi":
                primary_url = f"https://pypi.org/project/{fid}/"
                is_direct_article = True
            elif plat_key == "steam" and fid.isdigit():
                primary_url = f"https://store.steampowered.com/app/{fid}/"
                is_direct_article = True
            elif plat_key == "bilibili" and (fid.upper().startswith("BV") or fid.upper().startswith("AV")):
                primary_url = f"https://www.bilibili.com/video/{fid}"
                is_direct_article = True

        # Check real-time article detail resolution for supported content platforms
        if not primary_url and clean_title and len(clean_title) >= 3:
            if plat_key == "sspai":
                from .sspai import SspaiResolver
                exact_sspai = SspaiResolver().search_exact_post(clean_title, author=author)
                if exact_sspai:
                    primary_url = exact_sspai
                    is_direct_article = True
            elif plat_key == "thepaper":
                from .thepaper import ThePaperResolver
                exact_paper = ThePaperResolver().search_exact_article(
                    clean_title, author=author, search_query=search_query, distinctive_text=distinctive_text
                )
                if exact_paper:
                    primary_url = exact_paper
                    is_direct_article = True


        # 5. Formulate high-precision multi-keyword fingerprint query
        fingerprint_query = clean_title

        # 6. Detect Language & Technical Intent (English/International vs Chinese)
        if language == "en":
            is_en = True
        elif language == "zh":
            is_en = False
        else:
            chinese_matches = re.findall(r'[\u4e00-\u9fff]', f"{clean_title} {fingerprint_query}")
            is_en = (len(chinese_matches) == 0)

        extra_urls = []
        encoded_fp = quote(fingerprint_query)

        # Base engine URLs
        google_lucky = f"https://www.google.com/search?q={encoded_fp}&btnI=1"
        ddg_bang = f"https://duckduckgo.com/?q=!+{encoded_fp}"
        google_search = f"https://www.google.com/search?q={encoded_fp}"
        bing_search = f"https://www.bing.com/search?q={encoded_fp}"
        baidu_search = f"https://www.baidu.com/s?wd={encoded_fp}"

        # 7. Build Platform In-Site Search (for known templates)
        if plat_cfg and "search_url" in plat_cfg:
            site_internal_search = plat_cfg["search_url"].format(query=encoded_fp)
            if not primary_url:
                primary_url = site_internal_search
            extra_urls.append({"name": f"在 {plat_cfg['badge']} 站内搜索", "url": site_internal_search})

        # 8. Build Targeted Domain Dorking or Universal Navigation
        if effective_domain:
            quoted_title = f'"{clean_title}"' if len(clean_title) > 3 else clean_title
            dork_query = f'site:{effective_domain} {quoted_title}'
            encoded_dork = quote(dork_query)
            baidu_dork = f"https://www.baidu.com/s?wd={encoded_dork}"
            google_dork = f"https://www.google.com/search?q={encoded_dork}"
            bing_dork = f"https://www.bing.com/search?q={encoded_dork}"
            lucky_dork = f"https://www.google.com/search?q={encoded_dork}&btnI=1"

            if not primary_url:
                primary_url = lucky_dork if is_en else baidu_dork

            if is_en:
                extra_urls.append({"name": f"🚀 Google 原站直达 (site:{effective_domain})", "url": lucky_dork})
                extra_urls.append({"name": f"Google 定向反查", "url": google_dork})
                extra_urls.append({"name": f"Bing 定向反查", "url": bing_dork})
                extra_urls.append({"name": f"百度 定向反查", "url": baidu_dork})
            else:
                extra_urls.append({"name": f"百度定向原址反查 (site:{effective_domain})", "url": baidu_dork})
                extra_urls.append({"name": f"Bing 定向反查", "url": bing_dork})
                extra_urls.append({"name": f"Google 定向反查", "url": google_dork})
        else:
            # Universal Niche / Third-Party Routing
            if is_en:
                if not primary_url:
                    primary_url = google_lucky
                extra_urls.append({"name": "🚀 智能直达原站 (手气不错)", "url": google_lucky})
                extra_urls.append({"name": "Google 全网精准搜索", "url": google_search})
                extra_urls.append({"name": "Bing 国际搜索", "url": bing_search})
                extra_urls.append({"name": "DuckDuckGo 极速直达", "url": ddg_bang})
                extra_urls.append({"name": "百度 网页搜索", "url": baidu_search})
            else:
                if not primary_url:
                    primary_url = bing_search
                extra_urls.append({"name": "Bing 全网精准搜索", "url": bing_search})
                extra_urls.append({"name": "百度 精准特征反查", "url": baidu_search})
                extra_urls.append({"name": "🚀 Google 智能直达 (手气不错)", "url": google_lucky})
                extra_urls.append({"name": "Google 网页搜索", "url": google_search})

        if author and not is_niche:
            author_search = f"https://www.baidu.com/s?wd={quote(f'{effective_name} {author}')}"
            extra_urls.append({"name": f"查找作者 ({author})", "url": author_search})

        if is_direct_article:
            extra_urls.insert(0, {"name": f"⚡ 立即打开{effective_name}原帖 (原网页)", "url": primary_url})

        confidence = 0.98 if is_direct_article else (0.96 if (distinctive_text or breadcrumb or search_query) else 0.88)
        matched_method = f"{plat_key}_direct_article" if is_direct_article else ("niche_site_fingerprint_direct" if is_niche else (f"platform_{plat_key}" if plat_cfg else "universal_general_search"))

        return PlatformResult(
            platform="niche_site" if is_niche else plat_key,
            platform_name=effective_name,
            title=clean_title,
            url=primary_url,
            author=author,
            confidence=confidence,
            matched_method=matched_method,
            extra_urls=extra_urls,
            raw_details={
                "platform_idx": plat_cfg.get("idx") if plat_cfg else None,
                "domain": effective_domain,
                "title": clean_title,
                "author": author,
                "breadcrumb": breadcrumb,
                "distinctive_text": distinctive_text,
                "language": "en" if is_en else "zh",
                "search_query": fingerprint_query,
                "search_fingerprint": fingerprint_query,
                "is_direct_url": is_direct_article,
                "is_niche_site": is_niche,
                "is_lucky_direct": is_niche,
                "is_dork_search": bool(effective_domain),
                "google_lucky": google_lucky,
                "google_search": google_search,
                "bing_search": bing_search,
                "ddg_bang": ddg_bang,
                "baidu_search": baidu_search
            },
            candidates=[]
        )

