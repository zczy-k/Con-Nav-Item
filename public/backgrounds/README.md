# 背景图片目录

此目录用于存放内置背景图片。

## 支持的文件

将以下文件放入此目录即可启用对应的内置背景：

- `background.webp` - 默认背景（已存在于上级目录）
- `bg-mountain.webp` - 山峦背景
- `bg-ocean.webp` - 海洋背景
- `bg-forest.webp` - 森林背景
- `bg-stars.webp` - 星空背景
- `bg-city.webp` - 城市背景
- `bg-sunset.webp` - 日落背景
- `bg-aurora.webp` - 极光背景

## 图片要求

- 推荐分辨率：1920x1080 或更高
- 推荐格式：WebP（体积小、质量高）
- 文件大小：建议控制在 500KB 以内

## 添加自定义背景

1. 将图片文件放入此目录
2. 在 `routes/wallpaper.js` 的 `BUILTIN_BACKGROUNDS` 数组中添加对应配置
3. 重启服务器

示例：
```javascript
{ id: 9, name: '自定义', file: 'bg-custom.webp' }
```
