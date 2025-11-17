const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('./config');

const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

const db = new sqlite3.Database(path.join(dbDir, 'nav.db'));

// Promisify database operations
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// 初始化数据库
async function initializeDatabase() {
  try {
    // 1. 创建所有表结构
    await dbRun(`CREATE TABLE IF NOT EXISTS menus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      "order" INTEGER DEFAULT 0
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_menus_order ON menus("order")`);
    
    await dbRun(`CREATE TABLE IF NOT EXISTS sub_menus (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      "order" INTEGER DEFAULT 0,
      FOREIGN KEY(parent_id) REFERENCES menus(id) ON DELETE CASCADE
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_sub_menus_parent_id ON sub_menus(parent_id)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_sub_menus_order ON sub_menus("order")`);
    
    await dbRun(`CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      menu_id INTEGER,
      sub_menu_id INTEGER,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      logo_url TEXT,
      custom_logo_path TEXT,
      desc TEXT,
      "order" INTEGER DEFAULT 0,
      FOREIGN KEY(menu_id) REFERENCES menus(id) ON DELETE CASCADE,
      FOREIGN KEY(sub_menu_id) REFERENCES sub_menus(id) ON DELETE CASCADE
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_cards_menu_id ON cards(menu_id)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_cards_sub_menu_id ON cards(sub_menu_id)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_cards_order ON cards("order")`);
    
    await dbRun(`CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      last_login_time TEXT,
      last_login_ip TEXT
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`);
    
    await dbRun(`CREATE TABLE IF NOT EXISTS ads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      position TEXT NOT NULL,
      img TEXT NOT NULL,
      url TEXT NOT NULL
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_ads_position ON ads(position)`);
    
    await dbRun(`CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      url TEXT NOT NULL,
      logo TEXT
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_friends_title ON friends(title)`);
    
    await dbRun(`CREATE TABLE IF NOT EXISTS custom_search_engines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      search_url TEXT NOT NULL,
      icon_url TEXT,
      keyword TEXT,
      "order" INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_custom_search_engines_order ON custom_search_engines("order")`);
    
    // 标签表
    await dbRun(`CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT DEFAULT '#2566d8',
      "order" INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_tags_order ON tags("order")`);
    
    // 卡片-标签关联表（多对多）
    await dbRun(`CREATE TABLE IF NOT EXISTS card_tags (
      card_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (card_id, tag_id),
      FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE,
      FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
    )`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_card_tags_card_id ON card_tags(card_id)`);
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_card_tags_tag_id ON card_tags(tag_id)`);

    // 尝试添加登录信息列（静默处理，如果列已存在会失败）
    try {
      await dbRun(`ALTER TABLE users ADD COLUMN last_login_time TEXT`);
    } catch (e) {}
    try {
      await dbRun(`ALTER TABLE users ADD COLUMN last_login_ip TEXT`);
    } catch (e) {}

    // 2. 检查并插入默认数据
    await seedDefaultData();
  } catch (error) {
    console.error('✗ 数据库初始化失败:', error);
    throw error;
  }
}

// 插入默认数据
async function seedDefaultData() {
  try {
    // 开始事务
    await dbRun('BEGIN TRANSACTION');

    // 检查菜单是否为空
    const menuCount = await dbGet('SELECT COUNT(*) as count FROM menus');
    
    if (menuCount && menuCount.count === 0) {
      // 插入默认菜单
      const defaultMenus = [
        ['Home', 1],
        ['Ai Stuff', 2],
        ['Cloud', 3],
        ['Software', 4],
        ['Tools', 5],
        ['Other', 6]
      ];
      
      const menuMap = {};
      for (const [name, order] of defaultMenus) {
        const result = await dbRun('INSERT INTO menus (name, "order") VALUES (?, ?)', [name, order]);
        menuMap[name] = result.lastID;
      }

      // 插入默认子菜单
      const subMenus = [
        { parentMenu: 'Ai Stuff', name: 'AI chat', order: 1 },
        { parentMenu: 'Ai Stuff', name: 'AI tools', order: 2 },
        { parentMenu: 'Tools', name: 'Dev Tools', order: 1 },
        { parentMenu: 'Software', name: 'Mac', order: 1 },
        { parentMenu: 'Software', name: 'iOS', order: 2 },
        { parentMenu: 'Software', name: 'Android', order: 3 },
        { parentMenu: 'Software', name: 'Windows', order: 4 }
      ];
      
      const subMenuMap = {};
      for (const subMenu of subMenus) {
        if (menuMap[subMenu.parentMenu]) {
          const result = await dbRun(
            'INSERT INTO sub_menus (parent_id, name, "order") VALUES (?, ?, ?)',
            [menuMap[subMenu.parentMenu], subMenu.name, subMenu.order]
          );
          subMenuMap[`${subMenu.parentMenu}_${subMenu.name}`] = result.lastID;
        }
      }

      // 插入默认卡片
      const cards = [
        // Home
        { menu: 'Home', title: 'Baidu', url: 'https://www.baidu.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.baidu.com&sz=128', desc: '全球最大的中文搜索引擎'  },
        { menu: 'Home', title: 'Youtube', url: 'https://www.youtube.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.youtube.com&sz=128', desc: '全球最大的视频社区'  },
        { menu: 'Home', title: 'Gmail', url: 'https://mail.google.com', logo_url: 'https://api.xinac.net/icon/?url=https://mail.google.com&sz=128', desc: ''  },
        { menu: 'Home', title: 'GitHub', url: 'https://github.com', logo_url: 'https://api.xinac.net/icon/?url=https://github.com&sz=128', desc: '全球最大的代码托管平台'  },
        { menu: 'Home', title: 'ip.sb', url: 'https://ip.sb', logo_url: 'https://api.xinac.net/icon/?url=https://ip.sb&sz=128', desc: 'ip地址查询'  },
        { menu: 'Home', title: 'Cloudflare', url: 'https://dash.cloudflare.com', logo_url: 'https://api.xinac.net/icon/?url=https://dash.cloudflare.com&sz=128', desc: '全球最大的cdn服务商'  },
        { menu: 'Home', title: 'ChatGPT', url: 'https://chat.openai.com', logo_url: 'https://api.xinac.net/icon/?url=https://chat.openai.com&sz=128', desc: '人工智能AI聊天机器人'  },
        { menu: 'Home', title: 'Huggingface', url: 'https://huggingface.co', logo_url: 'https://api.xinac.net/icon/?url=https://huggingface.co&sz=128', desc: '全球最大的开源模型托管平台'  },
        { menu: 'Home', title: 'ITDOG - 在线ping', url: 'https://www.itdog.cn/tcping', logo_url: 'https://api.xinac.net/icon/?url=https://www.itdog.cn&sz=128', desc: '在线tcping'  },
        { menu: 'Home', title: 'Ping0', url: 'https://ping0.cc', logo_url: 'https://api.xinac.net/icon/?url=https://ping0.cc&sz=128', desc: 'ip地址查询'  },
        { menu: 'Home', title: '浏览器指纹', url: 'https://www.browserscan.net/zh', logo_url: 'https://api.xinac.net/icon/?url=https://www.browserscan.net&sz=128', desc: '浏览器指纹查询'  },
        { menu: 'Home', title: 'nezha面板', url: 'https://ssss.nyc.mn', logo_url: 'https://api.xinac.net/icon/?url=https://ssss.nyc.mn&sz=128', desc: 'nezha面板'  },
        { menu: 'Home', title: 'Api测试', url: 'https://hoppscotch.io', logo_url: 'https://api.xinac.net/icon/?url=https://hoppscotch.io&sz=128', desc: '在线api测试工具'  },
        { menu: 'Home', title: '域名检查', url: 'https://who.cx', logo_url: 'https://api.xinac.net/icon/?url=https://who.cx&sz=128', desc: '域名可用性查询' },
        { menu: 'Home', title: '域名比价', url: 'https://www.whois.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.whois.com&sz=128', desc: '域名价格比较' },
        { menu: 'Home', title: 'NodeSeek', url: 'https://www.nodeseek.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.nodeseek.com&sz=128', desc: '主机论坛' },
        { menu: 'Home', title: 'Linux do', url: 'https://linux.do', logo_url: 'https://api.xinac.net/icon/?url=https://linux.do&sz=128', desc: '新的理想型社区' },
        { menu: 'Home', title: '在线音乐', url: 'https://music.eooce.com', logo_url: 'https://api.xinac.net/icon/?url=https://music.eooce.com&sz=128', desc: '在线音乐' },
        { menu: 'Home', title: '在线电影', url: 'https://libretv.eooce.com', logo_url: 'https://api.xinac.net/icon/?url=https://libretv.eooce.com&sz=128', desc: '在线电影'  },
        { menu: 'Home', title: '免费接码', url: 'https://www.smsonline.cloud/zh', logo_url: 'https://api.xinac.net/icon/?url=https://www.smsonline.cloud&sz=128', desc: '免费接收短信验证码' },
        { menu: 'Home', title: '订阅转换', url: 'https://sublink.eooce.com', logo_url: 'https://api.xinac.net/icon/?url=https://sublink.eooce.com&sz=128', desc: '最好用的订阅转换工具' },
        { menu: 'Home', title: 'webssh', url: 'https://ssh.eooce.com', logo_url: 'https://api.xinac.net/icon/?url=https://ssh.eooce.com&sz=128', desc: '最好用的webssh终端管理工具' },
        { menu: 'Home', title: '文件快递柜', url: 'https://filebox.nnuu.nyc.mn', logo_url: 'https://api.xinac.net/icon/?url=https://filebox.nnuu.nyc.mn&sz=128', desc: '文件输出分享' },
        { menu: 'Home', title: '真实地址生成', url: 'https://address.nnuu.nyc.mn', logo_url: 'https://api.xinac.net/icon/?url=https://address.nnuu.nyc.mn&sz=128', desc: '基于当前ip生成真实的地址' },
        // AI Stuff
        { menu: 'Ai Stuff', title: 'ChatGPT', url: 'https://chat.openai.com', logo_url: 'https://api.xinac.net/icon/?url=https://chat.openai.com&sz=128', desc: 'OpenAI官方AI对话' },
        { menu: 'Ai Stuff', title: 'Deepseek', url: 'https://www.deepseek.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.deepseek.com&sz=128', desc: 'Deepseek AI搜索' },
        { menu: 'Ai Stuff', title: 'Claude', url: 'https://claude.ai', logo_url: 'https://api.xinac.net/icon/?url=https://claude.ai&sz=128', desc: 'Anthropic Claude AI' },
        { menu: 'Ai Stuff', title: 'Google Gemini', url: 'https://gemini.google.com', logo_url: 'https://api.xinac.net/icon/?url=https://gemini.google.com&sz=128', desc: 'Google Gemini大模型' },
        { menu: 'Ai Stuff', title: '阿里千问', url: 'https://chat.qwenlm.ai', logo_url: 'https://api.xinac.net/icon/?url=https://chat.qwenlm.ai&sz=128', desc: '阿里云千问大模型' },
        { menu: 'Ai Stuff', title: 'Kimi', url: 'https://www.kimi.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.kimi.com&sz=128', desc: '月之暗面Moonshot AI' },
        // AI Stuff - 子菜单卡片
        { subMenu: 'AI chat', title: 'ChatGPT', url: 'https://chat.openai.com', logo_url: 'https://api.xinac.net/icon/?url=https://chat.openai.com&sz=128', desc: 'OpenAI官方AI对话' },
        { subMenu: 'AI chat', title: 'Deepseek', url: 'https://www.deepseek.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.deepseek.com&sz=128', desc: 'Deepseek AI搜索' },
        { subMenu: 'AI tools', title: 'ChatGPT', url: 'https://chat.openai.com', logo_url: 'https://api.xinac.net/icon/?url=https://chat.openai.com&sz=128', desc: 'OpenAI官方AI对话' },
        { subMenu: 'AI tools', title: 'Deepseek', url: 'https://www.deepseek.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.deepseek.com&sz=128', desc: 'Deepseek AI搜索' },
        // Cloud
        { menu: 'Cloud', title: '阿里云', url: 'https://www.aliyun.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.aliyun.com&sz=128', desc: '阿里云官网' },
        { menu: 'Cloud', title: '腾讯云', url: 'https://cloud.tencent.com', logo_url: 'https://api.xinac.net/icon/?url=https://cloud.tencent.com&sz=128', desc: '腾讯云官网' },
        { menu: 'Cloud', title: '甲骨文云', url: 'https://cloud.oracle.com', logo_url: 'https://api.xinac.net/icon/?url=https://cloud.oracle.com&sz=128', desc: 'Oracle Cloud' },
        { menu: 'Cloud', title: '亚马逊云', url: 'https://aws.amazon.com', logo_url: 'https://api.xinac.net/icon/?url=https://aws.amazon.com&sz=128', desc: 'Amazon AWS' },
        { menu: 'Cloud', title: 'DigitalOcean', url: 'https://www.digitalocean.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.digitalocean.com&sz=128', desc: 'DigitalOcean VPS' },
        { menu: 'Cloud', title: 'Vultr', url: 'https://www.vultr.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.vultr.com&sz=128', desc: 'Vultr VPS' },
        // Software
        { menu: 'Software', title: 'Hellowindows', url: 'https://hellowindows.cn', logo_url: 'https://api.xinac.net/icon/?url=https://hellowindows.cn&sz=128', desc: 'windows系统及office下载' },
        { menu: 'Software', title: '奇迹秀', url: 'https://www.qijishow.com/down', logo_url: 'https://api.xinac.net/icon/?url=https://www.qijishow.com&sz=128', desc: '设计师的百宝箱' },
        { menu: 'Software', title: '易破解', url: 'https://www.ypojie.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.ypojie.com&sz=128', desc: '精品windows软件' },
        { menu: 'Software', title: '软件先锋', url: 'https://topcracked.com', logo_url: 'https://api.xinac.net/icon/?url=https://topcracked.com&sz=128', desc: '精品windows软件' },
        { menu: 'Software', title: 'Macwk', url: 'https://www.macwk.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.macwk.com&sz=128', desc: '精品Mac软件' },
        { menu: 'Software', title: 'Macsc', url: 'https://mac.macsc.com', logo_url: 'https://api.xinac.net/icon/?url=https://mac.macsc.com&sz=128', desc: '' },
        // Tools
        { menu: 'Tools', title: 'JSON工具', url: 'https://www.json.cn', logo_url: 'https://api.xinac.net/icon/?url=https://www.json.cn&sz=128', desc: 'JSON格式化/校验' },
        { menu: 'Tools', title: 'base64工具', url: 'https://www.qqxiuzi.cn/bianma/base64.htm', logo_url: 'https://api.xinac.net/icon/?url=https://www.qqxiuzi.cn&sz=128', desc: '在线base64编码解码' },
        { menu: 'Tools', title: '二维码生成', url: 'https://cli.im', logo_url: 'https://api.xinac.net/icon/?url=https://cli.im&sz=128', desc: '二维码生成工具' },
        { menu: 'Tools', title: 'JS混淆', url: 'https://obfuscator.io', logo_url: 'https://api.xinac.net/icon/?url=https://obfuscator.io&sz=128', desc: '在线Javascript代码混淆' },
        { menu: 'Tools', title: 'Python混淆', url: 'https://freecodingtools.org/tools/obfuscator/python', logo_url: 'https://api.xinac.net/icon/?url=https://freecodingtools.org&sz=128', desc: '在线python代码混淆' },
        { menu: 'Tools', title: 'Remove.photos', url: 'https://remove.photos/zh-cn', logo_url: 'https://api.xinac.net/icon/?url=https://remove.photos&sz=128', desc: '一键抠图' },
        // Tools - Dev Tools 子菜单卡片
        { subMenu: 'Dev Tools', title: 'Uiverse', url: 'https://uiverse.io/elements', logo_url: 'https://api.xinac.net/icon/?url=https://uiverse.io&sz=128', desc: 'CSS动画和设计元素' },
        { subMenu: 'Dev Tools', title: 'Icons8', url: 'https://igoutu.cn/icons', logo_url: 'https://api.xinac.net/icon/?url=https://igoutu.cn&sz=128', desc: '免费图标和设计资源' },
        // Other
        { menu: 'Other', title: 'Gmail', url: 'https://mail.google.com', logo_url: 'https://api.xinac.net/icon/?url=https://mail.google.com&sz=128', desc: 'Google邮箱' },
        { menu: 'Other', title: 'Outlook', url: 'https://outlook.live.com', logo_url: 'https://api.xinac.net/icon/?url=https://outlook.live.com&sz=128', desc: '微软Outlook邮箱' },
        { menu: 'Other', title: 'Proton Mail', url: 'https://account.proton.me', logo_url: 'https://api.xinac.net/icon/?url=https://account.proton.me&sz=128', desc: '安全加密邮箱' },
        { menu: 'Other', title: 'QQ邮箱', url: 'https://mail.qq.com', logo_url: 'https://api.xinac.net/icon/?url=https://mail.qq.com&sz=128', desc: '腾讯QQ邮箱' },
        { menu: 'Other', title: '雅虎邮箱', url: 'https://mail.yahoo.com', logo_url: 'https://api.xinac.net/icon/?url=https://mail.yahoo.com&sz=128', desc: '雅虎邮箱' },
        { menu: 'Other', title: '10分钟临时邮箱', url: 'https://linshiyouxiang.net', logo_url: 'https://api.xinac.net/icon/?url=https://linshiyouxiang.net&sz=128', desc: '10分钟临时邮箱' },
      ];
      
      let cardCount = 0;
      for (const card of cards) {
        if (card.subMenu) {
          // 查找子菜单ID
          let subMenuId = null;
          for (const [key, id] of Object.entries(subMenuMap)) {
            if (key.endsWith(`_${card.subMenu}`)) {
              subMenuId = id;
              break;
            }
          }
          
          if (subMenuId) {
            await dbRun(
              'INSERT INTO cards (menu_id, sub_menu_id, title, url, logo_url, desc) VALUES (?, ?, ?, ?, ?, ?)',
              [null, subMenuId, card.title, card.url, card.logo_url, card.desc]
            );
            cardCount++;
          }
        } else if (menuMap[card.menu]) {
          await dbRun(
            'INSERT INTO cards (menu_id, sub_menu_id, title, url, logo_url, desc) VALUES (?, ?, ?, ?, ?, ?)',
            [menuMap[card.menu], null, card.title, card.url, card.logo_url, card.desc]
          );
          cardCount++;
        }
      }
    }

    // 插入默认管理员账号（仅首次初始化）
    const userCount = await dbGet('SELECT COUNT(*) as count FROM users');
    if (userCount && userCount.count === 0) {
      const passwordHash = bcrypt.hashSync(config.admin.password, 10);
      await dbRun('INSERT INTO users (username, password) VALUES (?, ?)', [config.admin.username, passwordHash]);
    }

    // 插入默认友情链接
    const friendCount = await dbGet('SELECT COUNT(*) as count FROM friends');
    if (friendCount && friendCount.count === 0) {
      const defaultFriends = [
        ['Noodseek图床', 'https://www.nodeimage.com', 'https://www.nodeseek.com/static/image/favicon/favicon-32x32.png'],
        ['Font Awesome', 'https://fontawesome.com', 'https://fontawesome.com/favicon.ico']
      ];
      for (const [title, url, logo] of defaultFriends) {
        await dbRun('INSERT INTO friends (title, url, logo) VALUES (?, ?, ?)', [title, url, logo]);
      }
    }

    // 预置标签分类
    await seedTags();

    // 提交事务
    await dbRun('COMMIT');
  } catch (error) {
    // 回滚事务
    await dbRun('ROLLBACK');
    console.error('✗ 插入默认数据失败:', error);
    throw error;
  }
}

// 预置标签分类
async function seedTags() {
  try {
    const tagCount = await dbGet('SELECT COUNT(*) as count FROM tags');
    
    if (tagCount && tagCount.count > 0) {
      return;
    }
    
    // 预置标签
    const DEFAULT_TAGS = [
      { name: '搜索引擎', color: '#3b82f6', order: 1 },
      { name: '视频', color: '#ef4444', order: 2 },
      { name: '邮箱', color: '#10b981', order: 3 },
      { name: '开发工具', color: '#8b5cf6', order: 4 },
      { name: 'AI工具', color: '#f59e0b', order: 5 },
      { name: '云服务', color: '#06b6d4', order: 6 },
      { name: '社交媒体', color: '#ec4899', order: 7 },
      { name: '工具', color: '#6366f1', order: 8 },
      { name: '软件下载', color: '#14b8a6', order: 9 },
      { name: '网络工具', color: '#f97316', order: 10 },
      { name: '娱乐', color: '#a855f7', order: 11 },
      { name: '社区', color: '#84cc16', order: 12 },
      { name: '图片处理', color: '#22d3ee', order: 13 },
      { name: '域名工具', color: '#fb923c', order: 14 }
    ];
    
    const tagMap = {};
    for (const tag of DEFAULT_TAGS) {
      const result = await dbRun(
        'INSERT INTO tags (name, color, "order") VALUES (?, ?, ?)',
        [tag.name, tag.color, tag.order]
      );
      tagMap[tag.name] = result.lastID;
    }
    
    // 为卡片分配标签
    const CARD_TAG_RULES = [
      { urlPattern: 'baidu.com', tags: ['搜索引擎'] },
      { urlPattern: 'google.com', tags: ['搜索引擎', '邮箱'] },
      { urlPattern: 'youtube.com', tags: ['视频', '社交媒体'] },
      { urlPattern: 'music.eooce.com', tags: ['娱乐'] },
      { urlPattern: 'libretv.eooce.com', tags: ['视频', '娱乐'] },
      { urlPattern: 'github.com', tags: ['开发工具', '社区'] },
      { urlPattern: 'hoppscotch.io', tags: ['开发工具', '工具'] },
      { urlPattern: 'json.cn', tags: ['开发工具', '工具'] },
      { urlPattern: 'obfuscator.io', tags: ['开发工具', '工具'] },
      { urlPattern: 'freecodingtools.org', tags: ['开发工具', '工具'] },
      { urlPattern: 'uiverse.io', tags: ['开发工具'] },
      { urlPattern: 'igoutu.cn', tags: ['开发工具'] },
      { urlPattern: 'chat.openai.com', tags: ['AI工具'] },
      { urlPattern: 'deepseek.com', tags: ['AI工具'] },
      { urlPattern: 'claude.ai', tags: ['AI工具'] },
      { urlPattern: 'gemini.google.com', tags: ['AI工具'] },
      { urlPattern: 'chat.qwenlm.ai', tags: ['AI工具'] },
      { urlPattern: 'kimi.com', tags: ['AI工具'] },
      { urlPattern: 'huggingface.co', tags: ['AI工具', '开发工具'] },
      { urlPattern: 'cloudflare.com', tags: ['云服务', '网络工具'] },
      { urlPattern: 'aliyun.com', tags: ['云服务'] },
      { urlPattern: 'cloud.tencent.com', tags: ['云服务'] },
      { urlPattern: 'cloud.oracle.com', tags: ['云服务'] },
      { urlPattern: 'aws.amazon.com', tags: ['云服务'] },
      { urlPattern: 'digitalocean.com', tags: ['云服务'] },
      { urlPattern: 'vultr.com', tags: ['云服务'] },
      { urlPattern: 'ip.sb', tags: ['网络工具', '工具'] },
      { urlPattern: 'ping0.cc', tags: ['网络工具', '工具'] },
      { urlPattern: 'itdog.cn', tags: ['网络工具', '工具'] },
      { urlPattern: 'browserscan.net', tags: ['网络工具', '工具'] },
      { urlPattern: 'ssss.nyc.mn', tags: ['网络工具', '工具'] },
      { urlPattern: 'ssh.eooce.com', tags: ['网络工具', '工具'] },
      { urlPattern: 'sublink.eooce.com', tags: ['网络工具', '工具'] },
      { urlPattern: 'who.cx', tags: ['域名工具', '工具'] },
      { urlPattern: 'whois.com', tags: ['域名工具', '工具'] },
      { urlPattern: 'nodeseek.com', tags: ['社区'] },
      { urlPattern: 'linux.do', tags: ['社区'] },
      { urlPattern: 'mail.google.com', tags: ['邮箱'] },
      { urlPattern: 'outlook.live.com', tags: ['邮箱'] },
      { urlPattern: 'account.proton.me', tags: ['邮箱'] },
      { urlPattern: 'mail.qq.com', tags: ['邮箱'] },
      { urlPattern: 'mail.yahoo.com', tags: ['邮箱'] },
      { urlPattern: 'linshiyouxiang.net', tags: ['邮箱', '工具'] },
      { urlPattern: 'smsonline.cloud', tags: ['工具'] },
      { urlPattern: 'hellowindows.cn', tags: ['软件下载'] },
      { urlPattern: 'qijishow.com', tags: ['软件下载'] },
      { urlPattern: 'ypojie.com', tags: ['软件下载'] },
      { urlPattern: 'topcracked.com', tags: ['软件下载'] },
      { urlPattern: 'macwk.com', tags: ['软件下载'] },
      { urlPattern: 'mac.macsc.com', tags: ['软件下载'] },
      { urlPattern: 'qqxiuzi.cn', tags: ['工具'] },
      { urlPattern: 'cli.im', tags: ['工具'] },
      { urlPattern: 'remove.photos', tags: ['图片处理', '工具'] },
      { urlPattern: 'filebox.nnuu.nyc.mn', tags: ['工具'] },
      { urlPattern: 'address.nnuu.nyc.mn', tags: ['工具'] }
    ];
    
    const cards = await dbAll('SELECT id, url FROM cards');
    let assignCount = 0;
    
    for (const card of cards) {
      const matchedTags = new Set();
      
      for (const rule of CARD_TAG_RULES) {
        if (card.url.includes(rule.urlPattern)) {
          rule.tags.forEach(tagName => {
            if (tagMap[tagName]) {
              matchedTags.add(tagMap[tagName]);
            }
          });
        }
      }
      
      if (matchedTags.size > 0) {
        for (const tagId of matchedTags) {
          await dbRun(
            'INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)',
            [card.id, tagId]
          );
        }
        assignCount++;
      }
    }
  } catch (error) {
    console.error('✗ 预置标签失败:', error);
    // 不阻断初始化流程
  }
}

// 执行初始化并导出 Promise
const dbInitPromise = initializeDatabase();

module.exports = db;
module.exports.initPromise = dbInitPromise;
