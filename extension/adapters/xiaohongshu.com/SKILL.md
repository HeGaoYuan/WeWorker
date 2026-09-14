# 小红书

小红书：导航主页、按关键字搜索帖子

Matches: xiaohongshu.com

## Tools (3)

### xiaohongshu.com.navigate_to_homepage

Navigate to the Xiaohongshu (小红书) homepage.

### xiaohongshu.com.search_notes

Search for notes (帖子) on Xiaohongshu by keyword with optional filters. If not on the search results page, navigates there first — call again after 3-5 seconds (with the same keyword and desired filters) to apply filters and get results.

Parameters:

- `keyword`: string **(required)** — 搜索关键字 (e.g.,
- `sortBy`: string — 排序依据
- `noteType`: string — 笔记类型
- `publishTime`: string — 发布时间
- `searchScope`: string — 搜索范围
- `location`: string — 位置距离

### xiaohongshu.com.open_note

Open a Xiaohongshu note by ID or URL and return its full detail: title, body text, post date, and top-level comments (author, content, date, location, likes). For image notes, returns noteType="image" and images[]. For video notes, returns noteType="video" and video={cover, duration} — LIMITATION: the actual video URL is not available; the adapter runs in an isolated DOM context and cannot access the real video URL stored in the page JS memory (xgplayer config). If not already on the note page, navigates there first — call again after 3-5 seconds to get the content.

Parameters:

- `id`: string — Note ID (e.g.,
- `url`: string — Full note URL (e.g.,
