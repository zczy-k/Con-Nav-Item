# Serv00 部署问题修复

## 问题症状

- 访问网站显示 524 错误
- 前端无法加载
- API 请求失败

## 快速修复

```bash
# 一键修复脚本
bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/fix-serv00-frontend.sh)

# 或指定域名
DOMAIN=your-domain.com bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/fix-serv00-frontend.sh)
```

## 手动修复

```bash
cd ~/domains/your-domain.com/public_nodejs

# 更新代码
curl -s https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/app.js -o app.js

# 重启
devil www restart your-domain.com
```

## 问题原因

1. **端口管理**：Passenger 自动管理端口，不需要手动配置
2. **监听地址**：必须监听所有接口（不能绑定到 127.0.0.1）

## 验证部署

```bash
# 检查进程
ps aux | grep node20

# 测试访问
curl -I https://your-domain.com/api/menus
```

预期结果：
- 有 node20 进程运行
- API 返回 200 状态码

## 重新部署

如果修复无效，建议完全重新部署：

```bash
DOMAIN=your-domain.com bash <(curl -Ls https://raw.githubusercontent.com/zczy-k/Con-Nav-Item/main/scripts/install-serv00.sh)
```
