const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const config = require('./config');

const dbDir = path.join(__dirname, 'database');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir);
}

const dbPath = path.join(dbDir, 'nav.db');
let db = new Database(dbPath);
db.pragma('journal_mode = WAL'); // 启用 WAL 模式提升并发性能

// 重新连接数据库（用于备份恢复后刷新连接）
function reconnectDatabase() {
  try {
    db.close();
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    console.log('✓ 数据库已重新连接');
    return Promise.resolve();
  } catch (err) {
    console.error('重新连接数据库失败:', err);
    return Promise.reject(err);
  }
}

// Promisify-like wrappers for compatibility with existing async/await usage
// better-sqlite3 is synchronous, so we can just return resolved promises
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    try {
      const info = db.prepare(sql).run(params);
      resolve({ lastID: info.lastInsertRowid, changes: info.changes });
    } catch (err) {
      reject(err);
    }
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    try {
      const row = db.prepare(sql).get(params);
      resolve(row);
    } catch (err) {
      reject(err);
    }
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.prepare(sql).all(params);
      resolve(rows);
    } catch (err) {
      reject(err);
    }
  });
};

// 初始化数据库
async function initializeDatabase() {
  try {
    // 使用事务进行初始化
    const init = db.transaction(() => {
      db.prepare(`CREATE TABLE IF NOT EXISTS menus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        "order" INTEGER DEFAULT 0
      )`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_menus_order ON menus("order")`).run();

      db.prepare(`CREATE TABLE IF NOT EXISTS sub_menus (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        parent_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        "order" INTEGER DEFAULT 0,
        FOREIGN KEY(parent_id) REFERENCES menus(id) ON DELETE CASCADE
      )`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_sub_menus_parent_id ON sub_menus(parent_id)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_sub_menus_order ON sub_menus("order")`).run();

      db.prepare(`CREATE TABLE IF NOT EXISTS cards (
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
      )`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_cards_menu_id ON cards(menu_id)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_cards_sub_menu_id ON cards(sub_menu_id)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_cards_order ON cards("order")`).run();

      db.prepare(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        last_login_time TEXT,
        last_login_ip TEXT,
        token_version INTEGER DEFAULT 1
      )`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`).run();

      db.prepare(`CREATE TABLE IF NOT EXISTS promos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        position TEXT NOT NULL,
        img TEXT NOT NULL,
        url TEXT NOT NULL
      )`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_promos_position ON promos(position)`).run();

      db.prepare(`CREATE TABLE IF NOT EXISTS friends (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        logo TEXT
      )`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_friends_title ON friends(title)`).run();

      db.prepare(`CREATE TABLE IF NOT EXISTS custom_search_engines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        search_url TEXT NOT NULL,
        icon_url TEXT,
        keyword TEXT,
        "order" INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_custom_search_engines_order ON custom_search_engines("order")`).run();

      db.prepare(`CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        color TEXT DEFAULT '#2566d8',
        "order" INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_tags_order ON tags("order")`).run();

      db.prepare(`CREATE TABLE IF NOT EXISTS card_tags (
        card_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        PRIMARY KEY (card_id, tag_id),
        FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE,
        FOREIGN KEY(tag_id) REFERENCES tags(id) ON DELETE CASCADE
      )`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_card_tags_card_id ON card_tags(card_id)`).run();
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_card_tags_tag_id ON card_tags(tag_id)`).run();

      db.prepare(`CREATE TABLE IF NOT EXISTS data_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER DEFAULT 1,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`).run();
      
      db.prepare(`CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`).run();

      // 确保 data_version 只有一条记录
      const versionRow = db.prepare('SELECT * FROM data_version WHERE id = 1').get();
      if (!versionRow) {
        db.prepare('INSERT INTO data_version (id, version) VALUES (1, 1)').run();
      }
    });

    init();
    await seedDefaultData();
  } catch (error) {
    console.error('✗ 数据库初始化失败:', error);
    throw error;
  }
}

// 插入默认数据
async function seedDefaultData() {
  try {
    const seed = db.transaction(() => {
      // 检查菜单是否为空
      const menuCount = db.prepare('SELECT COUNT(*) as count FROM menus').get().count;

      if (menuCount === 0) {
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
        const insertMenu = db.prepare('INSERT INTO menus (name, "order") VALUES (?, ?)');
        for (const [name, order] of defaultMenus) {
          const info = insertMenu.run(name, order);
          menuMap[name] = info.lastInsertRowid;
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
        const insertSubMenu = db.prepare('INSERT INTO sub_menus (parent_id, name, "order") VALUES (?, ?, ?)');
        for (const subMenu of subMenus) {
          if (menuMap[subMenu.parentMenu]) {
            const info = insertSubMenu.run(menuMap[subMenu.parentMenu], subMenu.name, subMenu.order);
            subMenuMap[`${subMenu.parentMenu}_${subMenu.name}`] = info.lastInsertRowid;
          }
        }

        // 插入默认卡片
        const cards = [
          { menu: 'Home', title: 'Baidu', url: 'https://www.baidu.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.baidu.com&sz=128', desc: '全球最大的中文搜索引擎' },
          { menu: 'Home', title: 'Youtube', url: 'https://www.youtube.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.youtube.com&sz=128', desc: '全球最大的视频社区' },
          { menu: 'Home', title: 'Gmail', url: 'https://mail.google.com', logo_url: 'https://api.xinac.net/icon/?url=https://mail.google.com&sz=128', desc: '' },
          { menu: 'Home', title: 'GitHub', url: 'https://github.com', logo_url: 'https://api.xinac.net/icon/?url=https://github.com&sz=128', desc: '全球最大的代码托管平台' },
          { menu: 'Home', title: 'ip.sb', url: 'https://ip.sb', logo_url: 'https://api.xinac.net/icon/?url=https://ip.sb&sz=128', desc: 'ip地址查询' },
          { menu: 'Home', title: 'Cloudflare', url: 'https://dash.cloudflare.com', logo_url: 'https://api.xinac.net/icon/?url=https://dash.cloudflare.com&sz=128', desc: '全球最大的cdn服务商' },
          { menu: 'Home', title: 'Huggingface', url: 'https://huggingface.co', logo_url: 'https://api.xinac.net/icon/?url=https://huggingface.co&sz=128', desc: '全球最大的开源模型托管平台' },
          { menu: 'Home', title: 'ITDOG - 在线ping', url: 'https://www.itdog.cn/tcping', logo_url: 'https://api.xinac.net/icon/?url=https://www.itdog.cn&sz=128', desc: '在线tcping' },
          { menu: 'Home', title: 'Ping0', url: 'https://ping0.cc', logo_url: 'https://api.xinac.net/icon/?url=https://ping0.cc&sz=128', desc: 'ip地址查询' },
          { menu: 'Home', title: '浏览器指纹', url: 'https://www.browserscan.net/zh', logo_url: 'https://api.xinac.net/icon/?url=https://www.browserscan.net&sz=128', desc: '浏览器指纹查询' },
          { menu: 'Home', title: 'Api测试', url: 'https://hoppscotch.io', logo_url: 'https://api.xinac.net/icon/?url=https://hoppscotch.io&sz=128', desc: '在线api测试工具' },
          { menu: 'Home', title: '域名检查', url: 'https://who.cx', logo_url: 'https://api.xinac.net/icon/?url=https://who.cx&sz=128', desc: '域名可用性查询' },
          { menu: 'Home', title: '域名比价', url: 'https://www.whois.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.whois.com&sz=128', desc: '域名价格比较' },
          { menu: 'Home', title: 'NodeSeek', url: 'https://www.nodeseek.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.nodeseek.com&sz=128', desc: '主机论坛' },
          { menu: 'Home', title: 'Linux do', url: 'https://linux.do', logo_url: 'https://api.xinac.net/icon/?url=https://linux.do&sz=128', desc: '新的理想型社区' },
          { menu: 'Home', title: '免费接码', url: 'https://www.smsonline.cloud/zh', logo_url: 'https://api.xinac.net/icon/?url=https://www.smsonline.cloud&sz=128', desc: '免费接收短信验证码' },
          { menu: 'Home', title: '订阅转换', url: 'https://sublink.eooce.com', logo_url: 'https://api.xinac.net/icon/?url=https://sublink.eooce.com&sz=128', desc: '最好用的订阅转换工具' },
          { menu: 'Home', title: 'webssh', url: 'https://ssh.eooce.com', logo_url: 'https://api.xinac.net/icon/?url=https://ssh.eooce.com&sz=128', desc: '最好用的webssh终端管理工具' },
          { menu: 'Home', title: '文件快递柜', url: 'https://filebox.nnuu.nyc.mn', logo_url: 'https://api.xinac.net/icon/?url=https://filebox.nnuu.nyc.mn&sz=128', desc: '文件输出分享' },
          { menu: 'Home', title: '真实地址生成', url: 'https://address.nnuu.nyc.mn', logo_url: 'https://api.xinac.net/icon/?url=https://address.nnuu.nyc.mn&sz=128', desc: '基于当前ip生成真实的地址' },
          { menu: 'Ai Stuff', title: 'Claude', url: 'https://claude.ai', logo_url: 'https://api.xinac.net/icon/?url=https://claude.ai&sz=128', desc: 'Anthropic Claude AI' },
          { menu: 'Ai Stuff', title: 'Google Gemini', url: 'https://gemini.google.com', logo_url: 'https://api.xinac.net/icon/?url=https://gemini.google.com&sz=128', desc: 'Google Gemini大模型' },
          { menu: 'Ai Stuff', title: '阿里千问', url: 'https://chat.qwenlm.ai', logo_url: 'https://api.xinac.net/icon/?url=https://chat.qwenlm.ai&sz=128', desc: '阿里云千问大模型' },
          { menu: 'Ai Stuff', title: 'Kimi', url: 'https://www.kimi.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.kimi.com&sz=128', desc: '月之暗面Moonshot AI' },
          { subMenu: 'AI chat', title: 'ChatGPT', url: 'https://chat.openai.com', logo_url: 'https://api.xinac.net/icon/?url=https://chat.openai.com&sz=128', desc: 'OpenAI官方AI对话' },
          { subMenu: 'AI chat', title: 'Deepseek', url: 'https://www.deepseek.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.deepseek.com&sz=128', desc: 'Deepseek AI搜索' },
          { subMenu: 'AI tools', title: 'Cursor', url: 'https://www.cursor.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.cursor.com&sz=128', desc: 'AI编程工具' },
          { subMenu: 'AI tools', title: 'V0', url: 'https://v0.dev', logo_url: 'https://api.xinac.net/icon/?url=https://v0.dev&sz=128', desc: 'AI生成前端代码' },
          { menu: 'Cloud', title: '阿里云', url: 'https://www.aliyun.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.aliyun.com&sz=128', desc: '阿里云官网' },
          { menu: 'Cloud', title: '腾讯云', url: 'https://cloud.tencent.com', logo_url: 'https://api.xinac.net/icon/?url=https://cloud.tencent.com&sz=128', desc: '腾讯云官网' },
          { menu: 'Cloud', title: '甲骨文云', url: 'https://cloud.oracle.com', logo_url: 'https://api.xinac.net/icon/?url=https://cloud.oracle.com&sz=128', desc: 'Oracle Cloud' },
          { menu: 'Cloud', title: '亚马逊云', url: 'https://aws.amazon.com', logo_url: 'https://api.xinac.net/icon/?url=https://aws.amazon.com&sz=128', desc: 'Amazon AWS' },
          { menu: 'Cloud', title: 'DigitalOcean', url: 'https://www.digitalocean.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.digitalocean.com&sz=128', desc: 'DigitalOcean VPS' },
          { menu: 'Cloud', title: 'Vultr', url: 'https://www.vultr.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.vultr.com&sz=128', desc: 'Vultr VPS' },
          { menu: 'Software', title: 'Hellowindows', url: 'https://hellowindows.cn', logo_url: 'https://api.xinac.net/icon/?url=https://hellowindows.cn&sz=128', desc: 'windows系统及office下载' },
          { menu: 'Software', title: '奇迹秀', url: 'https://www.qijishow.com/down', logo_url: 'https://api.xinac.net/icon/?url=https://www.qijishow.com&sz=128', desc: '设计师的百宝箱' },
          { menu: 'Software', title: '易破解', url: 'https://www.ypojie.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.ypojie.com&sz=128', desc: '精品windows软件' },
          { menu: 'Software', title: '软件先锋', url: 'https://topcracked.com', logo_url: 'https://api.xinac.net/icon/?url=https://topcracked.com&sz=128', desc: '精品windows软件' },
          { menu: 'Software', title: 'Macwk', url: 'https://www.macwk.com', logo_url: 'https://api.xinac.net/icon/?url=https://www.macwk.com&sz=128', desc: '精品Mac软件' },
          { menu: 'Software', title: 'Macsc', url: 'https://mac.macsc.com', logo_url: 'https://api.xinac.net/icon/?url=https://mac.macsc.com&sz=128', desc: '' },
          { menu: 'Tools', title: 'JSON工具', url: 'https://www.json.cn', logo_url: 'https://api.xinac.net/icon/?url=https://www.json.cn&sz=128', desc: 'JSON格式化/校验' },
          { menu: 'Tools', title: 'base64工具', url: 'https://www.qqxiuzi.cn/bianma/base64.htm', logo_url: 'https://api.xinac.net/icon/?url=https://www.qqxiuzi.cn&sz=128', desc: '在线base64编码解码' },
          { menu: 'Tools', title: '二维码生成', url: 'https://cli.im', logo_url: 'https://api.xinac.net/icon/?url=https://cli.im&sz=128', desc: '二维码生成工具' },
          { menu: 'Tools', title: 'JS混淆', url: 'https://obfuscator.io', logo_url: 'https://api.xinac.net/icon/?url=https://obfuscator.io&sz=128', desc: '在线Javascript代码混淆' },
          { menu: 'Tools', title: 'Python混淆', url: 'https://freecodingtools.org/tools/obfuscator/python', logo_url: 'https://api.xinac.net/icon/?url=https://freecodingtools.org&sz=128', desc: '在线python代码混淆' },
          { menu: 'Tools', title: 'Remove.photos', url: 'https://remove.photos/zh-cn', logo_url: 'https://api.xinac.net/icon/?url=https://remove.photos&sz=128', desc: '一键抠图' },
          { subMenu: 'Dev Tools', title: 'Uiverse', url: 'https://uiverse.io/elements', logo_url: 'https://api.xinac.net/icon/?url=https://uiverse.io&sz=128', desc: 'CSS动画和设计元素' },
          { subMenu: 'Dev Tools', title: 'Icons8', url: 'https://igoutu.cn/icons', logo_url: 'https://api.xinac.net/icon/?url=https://igoutu.cn&sz=128', desc: '免费图标和设计资源' },
          { menu: 'Other', title: 'Outlook', url: 'https://outlook.live.com', logo_url: 'https://api.xinac.net/icon/?url=https://outlook.live.com&sz=128', desc: '微软Outlook邮箱' },
          { menu: 'Other', title: 'Proton Mail', url: 'https://account.proton.me', logo_url: 'https://api.xinac.net/icon/?url=https://account.proton.me&sz=128', desc: '安全加密邮箱' },
          { menu: 'Other', title: 'QQ邮箱', url: 'https://mail.qq.com', logo_url: 'https://api.xinac.net/icon/?url=https://mail.qq.com&sz=128', desc: '腾讯QQ邮箱' },
          { menu: 'Other', title: '雅虎邮箱', url: 'https://mail.yahoo.com', logo_url: 'https://api.xinac.net/icon/?url=https://mail.yahoo.com&sz=128', desc: '雅虎邮箱' },
          { menu: 'Other', title: '10分钟临时邮箱', url: 'https://linshiyouxiang.net', logo_url: 'https://api.xinac.net/icon/?url=https://linshiyouxiang.net&sz=128', desc: '10分钟临时邮箱' },
        ];

        const insertCard = db.prepare('INSERT INTO cards (menu_id, sub_menu_id, title, url, logo_url, desc) VALUES (?, ?, ?, ?, ?, ?)');
        for (const card of cards) {
          if (card.subMenu) {
            let subMenuId = null;
            for (const [key, id] of Object.entries(subMenuMap)) {
              if (key.endsWith(`_${card.subMenu}`)) {
                subMenuId = id;
                break;
              }
            }
            if (subMenuId) insertCard.run(null, subMenuId, card.title, card.url, card.logo_url, card.desc);
          } else if (menuMap[card.menu]) {
            insertCard.run(menuMap[card.menu], null, card.title, card.url, card.logo_url, card.desc);
          }
        }
      }

      // 插入默认管理员账号
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
      if (userCount === 0) {
        const passwordHash = bcrypt.hashSync(config.admin.password, 10);
        db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(config.admin.username, passwordHash);
      }

      // 插入默认友情链接
      const friendCount = db.prepare('SELECT COUNT(*) as count FROM friends').get().count;
      if (friendCount === 0) {
        const insertFriend = db.prepare('INSERT INTO friends (title, url, logo) VALUES (?, ?, ?)');
        insertFriend.run('Nodeseek图床', 'https://www.nodeimage.com', null);
        insertFriend.run('Font Awesome', 'https://fontawesome.com', null);
      }

      // 预置标签分类
      seedTagsSync();
    });

    seed();
  } catch (error) {
    console.error('✗ 插入默认数据失败:', error);
    throw error;
  }
}

// 预置标签分类 (同步版本)
function seedTagsSync() {
  const tagCount = db.prepare('SELECT COUNT(*) as count FROM tags').get().count;
  if (tagCount > 0) return;

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
  const insertTag = db.prepare('INSERT INTO tags (name, color, "order") VALUES (?, ?, ?)');
  for (const tag of DEFAULT_TAGS) {
    const info = insertTag.run(tag.name, tag.color, tag.order);
    tagMap[tag.name] = info.lastInsertRowid;
  }

  const CARD_TAG_RULES = [
    { urlPattern: 'baidu.com', tags: ['搜索引擎'] },
    { urlPattern: 'google.com', tags: ['搜索引擎', '邮箱'] },
    { urlPattern: 'youtube.com', tags: ['视频', '社交媒体'] },
    { urlPattern: 'github.com', tags: ['开发工具', '社区'] },
    { urlPattern: 'chat.openai.com', tags: ['AI工具'] },
    { urlPattern: 'deepseek.com', tags: ['AI工具'] },
    { urlPattern: 'cloudflare.com', tags: ['云服务', '网络工具'] },
    { urlPattern: 'ip.sb', tags: ['网络工具', '工具'] }
  ];

  const cards = db.prepare('SELECT id, url FROM cards').all();
  const insertCardTag = db.prepare('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)');
  for (const card of cards) {
    for (const rule of CARD_TAG_RULES) {
      if (card.url.includes(rule.urlPattern)) {
        rule.tags.forEach(tagName => {
          if (tagMap[tagName]) insertCardTag.run(card.id, tagMap[tagName]);
        });
      }
    }
  }
}

const dbInitPromise = initializeDatabase();

const MAX_VERSION = 1000000;

async function incrementDataVersion() {
  try {
    const current = db.prepare('SELECT version FROM data_version WHERE id = 1').get();
    const newVersion = (current && current.version >= MAX_VERSION) ? 1 : (current?.version || 0) + 1;
    db.prepare('UPDATE data_version SET version = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1').run(newVersion);
    return newVersion;
  } catch (e) {
    console.error('递增数据版本号失败:', e);
    throw e;
  }
}

async function getDataVersion() {
  try {
    const row = db.prepare('SELECT version FROM data_version WHERE id = 1').get();
    return row ? row.version : 1;
  } catch (e) {
    return 1;
  }
}

// AI 相关方法 (简化为同步调用)
async function getAIConfig() {
  const keys = ['ai_provider', 'ai_api_key', 'ai_base_url', 'ai_model', 'ai_request_delay', 'ai_auto_generate', 'ai_last_tested_ok'];
  const rows = db.prepare(`SELECT key, value FROM settings WHERE key IN (${keys.map(() => '?').join(',')})`).all(keys);
  
  const config = { provider: 'deepseek', apiKey: '', baseUrl: '', model: '', requestDelay: '1500', autoGenerate: 'false', lastTestedOk: 'false' };
  const keyMap = { 'ai_provider': 'provider', 'ai_api_key': 'apiKey', 'ai_base_url': 'baseUrl', 'ai_model': 'model', 'ai_request_delay': 'requestDelay', 'ai_auto_generate': 'autoGenerate', 'ai_last_tested_ok': 'lastTestedOk' };

  rows.forEach(row => { if (keyMap[row.key]) config[keyMap[row.key]] = row.value || ''; });
  return config;
}

async function saveAIConfig(config) {
  const mappings = { provider: 'ai_provider', apiKey: 'ai_api_key', baseUrl: 'ai_base_url', model: 'ai_model', requestDelay: 'ai_request_delay', autoGenerate: 'ai_auto_generate', lastTestedOk: 'ai_last_tested_ok' };
  const stmt = db.prepare('REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)');
  for (const [key, dbKey] of Object.entries(mappings)) {
    if (config[key] !== undefined && config[key] !== null) {
      stmt.run(dbKey, config[key].toString());
    }
  }
}

async function getCardsNeedingAI(type) {
  let sql = 'SELECT c.id, c.title, c.url, c.desc FROM cards c';
  const nameCond = "(c.title IS NULL OR c.title = '' OR c.title LIKE '%://%' OR c.title LIKE 'www.%')";
  const descCond = "(c.desc IS NULL OR c.desc = '')";
  const tagsCond = "c.id NOT IN (SELECT DISTINCT card_id FROM card_tags)";
  
  if (type === 'description') sql += ` WHERE ${descCond}`;
  else if (type === 'tags') sql += ` WHERE ${tagsCond}`;
  else if (type === 'name') sql += ` WHERE ${nameCond}`;
  else if (type === 'all') sql += ` WHERE ${nameCond} OR ${descCond} OR ${tagsCond}`;
  else sql += ` WHERE ${descCond} OR ${tagsCond}`;
  
  return db.prepare(sql).all();
}

async function getAllCards() { return db.prepare('SELECT id, title, url, desc FROM cards ORDER BY id').all(); }

async function getCardsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  return db.prepare(`SELECT id, title, url, desc FROM cards WHERE id IN (${ids.map(() => '?').join(',')})`).all(ids);
}

async function getAllTagNames() { return db.prepare('SELECT name FROM tags ORDER BY "order"').all().map(r => r.name); }

async function updateCardDescription(cardId, description) {
  db.prepare('UPDATE cards SET desc = ? WHERE id = ?').run(description, cardId);
  await incrementDataVersion();
}

async function updateCardName(cardId, name) {
  db.prepare('UPDATE cards SET title = ? WHERE id = ?').run(name, cardId);
  await incrementDataVersion();
}

async function updateCardNameAndDescription(cardId, name, description) {
  const updates = [];
  const params = [];
  if (name) { updates.push('title = ?'); params.push(name); }
  if (description) { updates.push('desc = ?'); params.push(description); }
  if (updates.length > 0) {
    params.push(cardId);
    db.prepare(`UPDATE cards SET ${updates.join(', ')} WHERE id = ?`).run(params);
    await incrementDataVersion();
  }
}

async function updateCardTags(cardId, tagNames) {
  const trans = db.transaction(() => {
    db.prepare('DELETE FROM card_tags WHERE card_id = ?').run(cardId);
    for (const tagName of tagNames) {
      let tag = db.prepare('SELECT id FROM tags WHERE name = ?').get(tagName);
      if (!tag) {
        const info = db.prepare('INSERT INTO tags (name, color) VALUES (?, ?)').run(tagName, getRandomColor());
        tag = { id: info.lastInsertRowid };
      }
      db.prepare('INSERT OR IGNORE INTO card_tags (card_id, tag_id) VALUES (?, ?)').run(cardId, tag.id);
    }
  });
  trans();
  await incrementDataVersion();
}

function getRandomColor() {
  const colors = ['#3b82f6', '#ef4444', '#10b981', '#8b5cf6', '#f59e0b', '#06b6d4', '#ec4899', '#6366f1', '#14b8a6', '#f97316'];
  return colors[Math.floor(Math.random() * colors.length)];
}

async function filterCardsForAI({ status = [], menuIds = [], subMenuIds = [], tagIds = [], excludeTagIds = [] }) {
  let sql = 'SELECT DISTINCT c.id, c.title, c.url, c.desc, c.menu_id, c.sub_menu_id FROM cards c';
  const conditions = [];
  const params = [];
  
  if (tagIds.length > 0) {
    sql += ' INNER JOIN card_tags ct ON c.id = ct.card_id';
    conditions.push(`ct.tag_id IN (${tagIds.map(() => '?').join(',')})`);
    params.push(...tagIds);
  }
  
  const statusConditions = [];
  if (status.includes('empty_name')) statusConditions.push("(c.title IS NULL OR c.title = '' OR c.title LIKE '%://%' OR c.title LIKE 'www.%')");
  if (status.includes('empty_desc')) statusConditions.push("(c.desc IS NULL OR c.desc = '')");
  if (status.includes('empty_tags')) statusConditions.push("c.id NOT IN (SELECT DISTINCT card_id FROM card_tags)");
  if (statusConditions.length > 0) conditions.push(`(${statusConditions.join(' OR ')})`);
  
  if (menuIds.length > 0) { conditions.push(`c.menu_id IN (${menuIds.map(() => '?').join(',')})`); params.push(...menuIds); }
  if (subMenuIds.length > 0) { conditions.push(`c.sub_menu_id IN (${subMenuIds.map(() => '?').join(',')})`); params.push(...subMenuIds); }
  if (excludeTagIds.length > 0) { conditions.push(`c.id NOT IN (SELECT card_id FROM card_tags WHERE tag_id IN (${excludeTagIds.map(() => '?').join(',')}))`); params.push(...excludeTagIds); }
  
  if (conditions.length > 0) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY c.id';
  return db.prepare(sql).all(params);
}

const dbWrapper = {
  run: dbRun,
  get: dbGet,
  all: dbAll,
  prepare: (sql) => db.prepare(sql),
  transaction: (fn) => db.transaction(fn),
  reconnect: reconnectDatabase,
  initPromise: dbInitPromise,
  incrementDataVersion,
  getDataVersion,
  getAIConfig,
  saveAIConfig,
  getCardsNeedingAI,
  getAllCards,
  getCardsByIds,
  getAllTagNames,
  updateCardDescription,
  updateCardName,
  updateCardNameAndDescription,
  updateCardTags,
  filterCardsForAI,
  close: () => db.close()
};

module.exports = dbWrapper;
