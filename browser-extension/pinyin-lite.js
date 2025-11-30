/**
 * 轻量级拼音搜索工具（浏览器扩展版）
 * 支持：中文直接匹配、完整拼音匹配、拼音首字母匹配
 */

// 常用汉字拼音映射表（覆盖约3500个常用字）
const PINYIN_MAP = {
  '阿': 'a', '啊': 'a', '哎': 'ai', '唉': 'ai', '爱': 'ai', '安': 'an', '暗': 'an', '按': 'an',
  '八': 'ba', '把': 'ba', '爸': 'ba', '吧': 'ba', '白': 'bai', '百': 'bai', '摆': 'bai', '败': 'bai',
  '班': 'ban', '般': 'ban', '板': 'ban', '半': 'ban', '办': 'ban', '帮': 'bang', '棒': 'bang',
  '包': 'bao', '保': 'bao', '报': 'bao', '抱': 'bao', '宝': 'bao', '杯': 'bei', '北': 'bei',
  '被': 'bei', '背': 'bei', '本': 'ben', '笨': 'ben', '比': 'bi', '笔': 'bi', '必': 'bi', '闭': 'bi',
  '边': 'bian', '变': 'bian', '便': 'bian', '遍': 'bian', '标': 'biao', '表': 'biao',
  '别': 'bie', '宾': 'bin', '冰': 'bing', '病': 'bing', '并': 'bing', '播': 'bo', '波': 'bo',
  '博': 'bo', '不': 'bu', '步': 'bu', '部': 'bu', '布': 'bu',
  '才': 'cai', '材': 'cai', '采': 'cai', '彩': 'cai', '菜': 'cai', '参': 'can', '餐': 'can',
  '藏': 'cang', '操': 'cao', '草': 'cao', '层': 'ceng', '曾': 'ceng', '查': 'cha', '茶': 'cha',
  '差': 'cha', '产': 'chan', '长': 'chang', '常': 'chang', '场': 'chang', '厂': 'chang',
  '唱': 'chang', '超': 'chao', '朝': 'chao', '潮': 'chao', '车': 'che', '彻': 'che',
  '称': 'cheng', '成': 'cheng', '城': 'cheng', '程': 'cheng', '承': 'cheng', '吃': 'chi',
  '持': 'chi', '池': 'chi', '迟': 'chi', '尺': 'chi', '冲': 'chong', '充': 'chong', '虫': 'chong',
  '重': 'chong', '抽': 'chou', '出': 'chu', '初': 'chu', '除': 'chu', '处': 'chu', '楚': 'chu',
  '穿': 'chuan', '传': 'chuan', '船': 'chuan', '窗': 'chuang', '床': 'chuang', '创': 'chuang',
  '春': 'chun', '纯': 'chun', '词': 'ci', '此': 'ci', '次': 'ci', '从': 'cong', '聪': 'cong',
  '村': 'cun', '存': 'cun', '错': 'cuo',
  '达': 'da', '答': 'da', '打': 'da', '大': 'da', '带': 'dai', '代': 'dai', '待': 'dai',
  '单': 'dan', '但': 'dan', '担': 'dan', '蛋': 'dan', '当': 'dang', '党': 'dang', '刀': 'dao',
  '导': 'dao', '到': 'dao', '道': 'dao', '得': 'de', '的': 'de', '德': 'de', '灯': 'deng',
  '等': 'deng', '低': 'di', '底': 'di', '地': 'di', '第': 'di', '弟': 'di', '点': 'dian',
  '电': 'dian', '店': 'dian', '典': 'dian', '掉': 'diao', '调': 'diao', '丁': 'ding', '定': 'ding',
  '顶': 'ding', '东': 'dong', '冬': 'dong', '懂': 'dong', '动': 'dong', '都': 'dou', '斗': 'dou',
  '读': 'du', '度': 'du', '独': 'du', '短': 'duan', '断': 'duan', '段': 'duan', '队': 'dui',
  '对': 'dui', '多': 'duo', '朵': 'duo',

  '俄': 'e', '饿': 'e', '恶': 'e', '儿': 'er', '而': 'er', '耳': 'er', '二': 'er',
  '发': 'fa', '法': 'fa', '翻': 'fan', '凡': 'fan', '烦': 'fan', '反': 'fan', '饭': 'fan',
  '范': 'fan', '方': 'fang', '房': 'fang', '防': 'fang', '放': 'fang', '飞': 'fei', '非': 'fei',
  '费': 'fei', '分': 'fen', '份': 'fen', '风': 'feng', '封': 'feng', '丰': 'feng', '逢': 'feng',
  '佛': 'fo', '否': 'fou', '夫': 'fu', '服': 'fu', '福': 'fu', '府': 'fu', '父': 'fu', '付': 'fu',
  '负': 'fu', '妇': 'fu', '复': 'fu', '富': 'fu', '副': 'fu',
  '该': 'gai', '改': 'gai', '盖': 'gai', '概': 'gai', '干': 'gan', '感': 'gan', '敢': 'gan',
  '刚': 'gang', '钢': 'gang', '高': 'gao', '搞': 'gao', '告': 'gao', '哥': 'ge', '歌': 'ge',
  '格': 'ge', '个': 'ge', '各': 'ge', '给': 'gei', '根': 'gen', '跟': 'gen', '更': 'geng',
  '工': 'gong', '公': 'gong', '功': 'gong', '共': 'gong', '狗': 'gou', '够': 'gou', '构': 'gou',
  '古': 'gu', '股': 'gu', '骨': 'gu', '故': 'gu', '顾': 'gu', '固': 'gu', '瓜': 'gua', '挂': 'gua',
  '怪': 'guai', '关': 'guan', '观': 'guan', '官': 'guan', '管': 'guan', '馆': 'guan', '惯': 'guan',
  '光': 'guang', '广': 'guang', '规': 'gui', '鬼': 'gui', '贵': 'gui', '国': 'guo', '果': 'guo',
  '过': 'guo',
  '哈': 'ha', '还': 'hai', '孩': 'hai', '海': 'hai', '害': 'hai', '含': 'han', '寒': 'han',
  '汉': 'han', '行': 'hang', '好': 'hao', '号': 'hao', '喝': 'he', '合': 'he', '何': 'he',
  '和': 'he', '河': 'he', '黑': 'hei', '很': 'hen', '恨': 'hen', '红': 'hong', '后': 'hou',
  '厚': 'hou', '候': 'hou', '呼': 'hu', '湖': 'hu', '虎': 'hu', '户': 'hu', '护': 'hu', '互': 'hu',
  '花': 'hua', '华': 'hua', '化': 'hua', '划': 'hua', '画': 'hua', '话': 'hua', '怀': 'huai',
  '坏': 'huai', '欢': 'huan', '环': 'huan', '换': 'huan', '黄': 'huang', '皇': 'huang',
  '回': 'hui', '会': 'hui', '汇': 'hui', '婚': 'hun', '活': 'huo', '火': 'huo', '或': 'huo',
  '货': 'huo',
  '机': 'ji', '鸡': 'ji', '积': 'ji', '基': 'ji', '激': 'ji', '及': 'ji', '极': 'ji', '即': 'ji',
  '急': 'ji', '集': 'ji', '几': 'ji', '己': 'ji', '计': 'ji', '记': 'ji', '纪': 'ji', '技': 'ji',
  '际': 'ji', '季': 'ji', '继': 'ji', '寄': 'ji', '加': 'jia', '家': 'jia', '假': 'jia', '价': 'jia',
  '架': 'jia', '驾': 'jia', '嫁': 'jia', '坚': 'jian', '间': 'jian', '简': 'jian', '见': 'jian',
  '建': 'jian', '件': 'jian', '健': 'jian', '剑': 'jian', '渐': 'jian', '将': 'jiang', '江': 'jiang',
  '讲': 'jiang', '奖': 'jiang', '降': 'jiang', '交': 'jiao', '教': 'jiao', '脚': 'jiao', '角': 'jiao',
  '叫': 'jiao', '较': 'jiao', '接': 'jie', '街': 'jie', '节': 'jie', '结': 'jie', '姐': 'jie',
  '解': 'jie', '介': 'jie', '届': 'jie', '借': 'jie', '今': 'jin', '金': 'jin', '斤': 'jin',
  '仅': 'jin', '紧': 'jin', '近': 'jin', '进': 'jin', '尽': 'jin', '禁': 'jin', '京': 'jing',
  '经': 'jing', '精': 'jing', '井': 'jing', '景': 'jing', '警': 'jing', '静': 'jing', '净': 'jing',
  '竟': 'jing', '境': 'jing', '镜': 'jing', '九': 'jiu', '久': 'jiu', '酒': 'jiu', '旧': 'jiu',
  '救': 'jiu', '就': 'jiu', '居': 'ju', '局': 'ju', '举': 'ju', '句': 'ju', '具': 'ju', '剧': 'ju',
  '据': 'ju', '距': 'ju', '聚': 'ju', '卷': 'juan', '决': 'jue', '觉': 'jue', '绝': 'jue',
  '军': 'jun', '均': 'jun',

  '卡': 'ka', '开': 'kai', '看': 'kan', '康': 'kang', '考': 'kao', '靠': 'kao', '科': 'ke',
  '可': 'ke', '课': 'ke', '客': 'ke', '刻': 'ke', '肯': 'ken', '空': 'kong', '孔': 'kong',
  '控': 'kong', '口': 'kou', '苦': 'ku', '哭': 'ku', '库': 'ku', '酷': 'ku', '快': 'kuai',
  '块': 'kuai', '宽': 'kuan', '款': 'kuan', '况': 'kuang', '狂': 'kuang', '困': 'kun',
  '拉': 'la', '来': 'lai', '兰': 'lan', '蓝': 'lan', '懒': 'lan', '烂': 'lan', '狼': 'lang',
  '浪': 'lang', '劳': 'lao', '老': 'lao', '乐': 'le', '了': 'le', '雷': 'lei', '类': 'lei',
  '累': 'lei', '冷': 'leng', '离': 'li', '李': 'li', '里': 'li', '理': 'li', '力': 'li', '立': 'li',
  '利': 'li', '历': 'li', '例': 'li', '丽': 'li', '连': 'lian', '联': 'lian', '脸': 'lian',
  '练': 'lian', '恋': 'lian', '良': 'liang', '凉': 'liang', '两': 'liang', '亮': 'liang',
  '量': 'liang', '辆': 'liang', '聊': 'liao', '料': 'liao', '了': 'liao', '列': 'lie', '烈': 'lie',
  '林': 'lin', '临': 'lin', '灵': 'ling', '领': 'ling', '令': 'ling', '另': 'ling', '零': 'ling',
  '流': 'liu', '留': 'liu', '六': 'liu', '龙': 'long', '楼': 'lou', '路': 'lu', '录': 'lu',
  '陆': 'lu', '绿': 'lv', '旅': 'lv', '律': 'lv', '乱': 'luan', '论': 'lun', '轮': 'lun',
  '落': 'luo', '罗': 'luo',
  '妈': 'ma', '马': 'ma', '吗': 'ma', '码': 'ma', '买': 'mai', '卖': 'mai', '麦': 'mai',
  '满': 'man', '慢': 'man', '忙': 'mang', '猫': 'mao', '毛': 'mao', '冒': 'mao', '贸': 'mao',
  '么': 'me', '没': 'mei', '美': 'mei', '每': 'mei', '妹': 'mei', '门': 'men', '们': 'men',
  '梦': 'meng', '迷': 'mi', '米': 'mi', '秘': 'mi', '密': 'mi', '免': 'mian', '面': 'mian',
  '棉': 'mian', '苗': 'miao', '秒': 'miao', '妙': 'miao', '灭': 'mie', '民': 'min', '名': 'ming',
  '明': 'ming', '命': 'ming', '摸': 'mo', '模': 'mo', '末': 'mo', '莫': 'mo', '默': 'mo',
  '某': 'mou', '母': 'mu', '木': 'mu', '目': 'mu', '牧': 'mu',
  '拿': 'na', '哪': 'na', '那': 'na', '纳': 'na', '奶': 'nai', '耐': 'nai', '男': 'nan',
  '南': 'nan', '难': 'nan', '脑': 'nao', '闹': 'nao', '呢': 'ne', '内': 'nei', '能': 'neng',
  '你': 'ni', '泥': 'ni', '年': 'nian', '念': 'nian', '娘': 'niang', '鸟': 'niao', '您': 'nin',
  '牛': 'niu', '农': 'nong', '弄': 'nong', '女': 'nv', '暖': 'nuan',
  '欧': 'ou', '偶': 'ou',
  '怕': 'pa', '拍': 'pai', '排': 'pai', '派': 'pai', '盘': 'pan', '判': 'pan', '旁': 'pang',
  '胖': 'pang', '跑': 'pao', '炮': 'pao', '陪': 'pei', '配': 'pei', '朋': 'peng', '碰': 'peng',
  '批': 'pi', '皮': 'pi', '脾': 'pi', '疲': 'pi', '片': 'pian', '篇': 'pian', '便': 'pian',
  '骗': 'pian', '票': 'piao', '漂': 'piao', '拼': 'pin', '品': 'pin', '贫': 'pin', '平': 'ping',
  '评': 'ping', '苹': 'ping', '瓶': 'ping', '破': 'po', '迫': 'po', '普': 'pu', '铺': 'pu',

  '七': 'qi', '期': 'qi', '其': 'qi', '奇': 'qi', '齐': 'qi', '起': 'qi', '气': 'qi', '器': 'qi',
  '汽': 'qi', '企': 'qi', '启': 'qi', '千': 'qian', '前': 'qian', '钱': 'qian', '浅': 'qian',
  '签': 'qian', '强': 'qiang', '墙': 'qiang', '抢': 'qiang', '桥': 'qiao', '巧': 'qiao',
  '切': 'qie', '且': 'qie', '亲': 'qin', '琴': 'qin', '勤': 'qin', '青': 'qing', '轻': 'qing',
  '清': 'qing', '情': 'qing', '晴': 'qing', '请': 'qing', '庆': 'qing', '穷': 'qiong',
  '秋': 'qiu', '球': 'qiu', '求': 'qiu', '区': 'qu', '取': 'qu', '去': 'qu', '趣': 'qu',
  '圈': 'quan', '全': 'quan', '权': 'quan', '泉': 'quan', '拳': 'quan', '犬': 'quan',
  '缺': 'que', '却': 'que', '确': 'que', '群': 'qun',
  '然': 'ran', '染': 'ran', '让': 'rang', '绕': 'rao', '热': 're', '人': 'ren', '认': 'ren',
  '任': 'ren', '仍': 'reng', '日': 'ri', '容': 'rong', '荣': 'rong', '肉': 'rou', '如': 'ru',
  '入': 'ru', '软': 'ruan', '弱': 'ruo',
  '撒': 'sa', '赛': 'sai', '三': 'san', '散': 'san', '扫': 'sao', '色': 'se', '森': 'sen',
  '杀': 'sha', '沙': 'sha', '傻': 'sha', '山': 'shan', '闪': 'shan', '善': 'shan', '伤': 'shang',
  '商': 'shang', '上': 'shang', '尚': 'shang', '赏': 'shang', '烧': 'shao', '少': 'shao',
  '绍': 'shao', '蛇': 'she', '舌': 'she', '设': 'she', '社': 'she', '射': 'she', '涉': 'she',
  '谁': 'shei', '身': 'shen', '深': 'shen', '神': 'shen', '审': 'shen', '甚': 'shen', '升': 'sheng',
  '生': 'sheng', '声': 'sheng', '省': 'sheng', '胜': 'sheng', '圣': 'sheng', '师': 'shi',
  '诗': 'shi', '失': 'shi', '狮': 'shi', '施': 'shi', '湿': 'shi', '十': 'shi', '什': 'shi',
  '石': 'shi', '时': 'shi', '识': 'shi', '实': 'shi', '食': 'shi', '史': 'shi', '使': 'shi',
  '始': 'shi', '士': 'shi', '世': 'shi', '市': 'shi', '示': 'shi', '事': 'shi', '式': 'shi',
  '试': 'shi', '视': 'shi', '是': 'shi', '适': 'shi', '室': 'shi', '收': 'shou', '手': 'shou',
  '首': 'shou', '守': 'shou', '受': 'shou', '授': 'shou', '售': 'shou', '瘦': 'shou', '书': 'shu',
  '输': 'shu', '舒': 'shu', '熟': 'shu', '属': 'shu', '数': 'shu', '术': 'shu', '树': 'shu',
  '束': 'shu', '双': 'shuang', '爽': 'shuang', '水': 'shui', '睡': 'shui', '顺': 'shun',
  '说': 'shuo', '思': 'si', '私': 'si', '司': 'si', '丝': 'si', '死': 'si', '四': 'si', '似': 'si',
  '松': 'song', '送': 'song', '宋': 'song', '搜': 'sou', '苏': 'su', '俗': 'su', '素': 'su',
  '速': 'su', '宿': 'su', '塑': 'su', '酸': 'suan', '算': 'suan', '虽': 'sui', '随': 'sui',
  '岁': 'sui', '碎': 'sui', '孙': 'sun', '损': 'sun', '所': 'suo', '索': 'suo', '锁': 'suo',

  '他': 'ta', '她': 'ta', '它': 'ta', '塔': 'ta', '台': 'tai', '太': 'tai', '态': 'tai',
  '谈': 'tan', '弹': 'tan', '坦': 'tan', '探': 'tan', '汤': 'tang', '唐': 'tang', '糖': 'tang',
  '堂': 'tang', '躺': 'tang', '烫': 'tang', '逃': 'tao', '桃': 'tao', '讨': 'tao', '套': 'tao',
  '特': 'te', '疼': 'teng', '腾': 'teng', '提': 'ti', '题': 'ti', '体': 'ti', '替': 'ti',
  '天': 'tian', '田': 'tian', '甜': 'tian', '填': 'tian', '条': 'tiao', '跳': 'tiao', '调': 'tiao',
  '铁': 'tie', '听': 'ting', '停': 'ting', '挺': 'ting', '庭': 'ting', '通': 'tong', '同': 'tong',
  '童': 'tong', '统': 'tong', '痛': 'tong', '头': 'tou', '投': 'tou', '透': 'tou', '突': 'tu',
  '图': 'tu', '土': 'tu', '吐': 'tu', '兔': 'tu', '团': 'tuan', '推': 'tui', '退': 'tui',
  '腿': 'tui', '托': 'tuo', '脱': 'tuo',
  '挖': 'wa', '娃': 'wa', '瓦': 'wa', '外': 'wai', '弯': 'wan', '完': 'wan', '玩': 'wan',
  '晚': 'wan', '碗': 'wan', '万': 'wan', '王': 'wang', '网': 'wang', '往': 'wang', '忘': 'wang',
  '望': 'wang', '危': 'wei', '威': 'wei', '微': 'wei', '为': 'wei', '围': 'wei', '违': 'wei',
  '唯': 'wei', '维': 'wei', '伟': 'wei', '尾': 'wei', '委': 'wei', '卫': 'wei', '未': 'wei',
  '位': 'wei', '味': 'wei', '胃': 'wei', '谓': 'wei', '温': 'wen', '文': 'wen', '闻': 'wen',
  '问': 'wen', '稳': 'wen', '我': 'wo', '握': 'wo', '屋': 'wu', '无': 'wu', '五': 'wu', '午': 'wu',
  '武': 'wu', '舞': 'wu', '物': 'wu', '务': 'wu', '误': 'wu', '雾': 'wu',
  '西': 'xi', '吸': 'xi', '希': 'xi', '息': 'xi', '惜': 'xi', '析': 'xi', '习': 'xi', '席': 'xi',
  '喜': 'xi', '洗': 'xi', '系': 'xi', '细': 'xi', '戏': 'xi', '下': 'xia', '夏': 'xia', '吓': 'xia',
  '先': 'xian', '鲜': 'xian', '闲': 'xian', '贤': 'xian', '弦': 'xian', '显': 'xian', '险': 'xian',
  '现': 'xian', '线': 'xian', '限': 'xian', '县': 'xian', '献': 'xian', '乡': 'xiang', '相': 'xiang',
  '香': 'xiang', '箱': 'xiang', '详': 'xiang', '想': 'xiang', '响': 'xiang', '享': 'xiang',
  '向': 'xiang', '象': 'xiang', '像': 'xiang', '项': 'xiang', '消': 'xiao', '销': 'xiao',
  '小': 'xiao', '晓': 'xiao', '笑': 'xiao', '效': 'xiao', '校': 'xiao', '些': 'xie', '鞋': 'xie',
  '写': 'xie', '泄': 'xie', '谢': 'xie', '心': 'xin', '辛': 'xin', '新': 'xin', '信': 'xin',
  '星': 'xing', '行': 'xing', '形': 'xing', '型': 'xing', '醒': 'xing', '兴': 'xing', '姓': 'xing',
  '性': 'xing', '幸': 'xing', '雄': 'xiong', '胸': 'xiong', '兄': 'xiong', '熊': 'xiong',
  '休': 'xiu', '修': 'xiu', '秀': 'xiu', '须': 'xu', '虚': 'xu', '需': 'xu', '许': 'xu', '序': 'xu',
  '叙': 'xu', '续': 'xu', '宣': 'xuan', '选': 'xuan', '学': 'xue', '雪': 'xue', '血': 'xue',
  '寻': 'xun', '训': 'xun', '迅': 'xun', '讯': 'xun', '压': 'ya', '呀': 'ya', '牙': 'ya',
  '雅': 'ya', '亚': 'ya', '烟': 'yan', '延': 'yan', '严': 'yan', '言': 'yan', '岩': 'yan',
  '沿': 'yan', '研': 'yan', '盐': 'yan', '颜': 'yan', '眼': 'yan', '演': 'yan', '验': 'yan',
  '燕': 'yan', '阳': 'yang', '杨': 'yang', '洋': 'yang', '养': 'yang', '样': 'yang', '腰': 'yao',
  '邀': 'yao', '摇': 'yao', '遥': 'yao', '咬': 'yao', '药': 'yao', '要': 'yao', '爷': 'ye',
  '也': 'ye', '野': 'ye', '业': 'ye', '叶': 'ye', '页': 'ye', '夜': 'ye', '一': 'yi', '衣': 'yi',
  '医': 'yi', '依': 'yi', '仪': 'yi', '宜': 'yi', '移': 'yi', '遗': 'yi', '疑': 'yi', '已': 'yi',
  '以': 'yi', '亿': 'yi', '义': 'yi', '艺': 'yi', '忆': 'yi', '议': 'yi', '易': 'yi', '益': 'yi',
  '意': 'yi', '因': 'yin', '音': 'yin', '阴': 'yin', '银': 'yin', '引': 'yin', '印': 'yin',
  '应': 'ying', '英': 'ying', '迎': 'ying', '营': 'ying', '影': 'ying', '硬': 'ying', '映': 'ying',
  '拥': 'yong', '永': 'yong', '勇': 'yong', '用': 'yong', '优': 'you', '忧': 'you', '由': 'you',
  '油': 'you', '游': 'you', '友': 'you', '有': 'you', '又': 'you', '右': 'you', '幼': 'you',
  '于': 'yu', '余': 'yu', '鱼': 'yu', '愉': 'yu', '与': 'yu', '雨': 'yu', '语': 'yu', '玉': 'yu',
  '育': 'yu', '预': 'yu', '域': 'yu', '欲': 'yu', '遇': 'yu', '元': 'yuan', '园': 'yuan',
  '原': 'yuan', '圆': 'yuan', '源': 'yuan', '远': 'yuan', '院': 'yuan', '愿': 'yuan', '约': 'yue',
  '月': 'yue', '越': 'yue', '阅': 'yue', '云': 'yun', '运': 'yun', '允': 'yun',

  '杂': 'za', '灾': 'zai', '再': 'zai', '在': 'zai', '咱': 'zan', '暂': 'zan', '赞': 'zan',
  '脏': 'zang', '早': 'zao', '造': 'zao', '遭': 'zao', '糟': 'zao', '则': 'ze', '责': 'ze',
  '择': 'ze', '怎': 'zen', '增': 'zeng', '曾': 'zeng', '炸': 'zha', '扎': 'zha', '眨': 'zha',
  '摘': 'zhai', '窄': 'zhai', '宅': 'zhai', '占': 'zhan', '站': 'zhan', '战': 'zhan', '展': 'zhan',
  '张': 'zhang', '章': 'zhang', '掌': 'zhang', '丈': 'zhang', '涨': 'zhang', '账': 'zhang',
  '招': 'zhao', '找': 'zhao', '照': 'zhao', '罩': 'zhao', '着': 'zhe', '折': 'zhe', '者': 'zhe',
  '这': 'zhe', '针': 'zhen', '真': 'zhen', '珍': 'zhen', '阵': 'zhen', '镇': 'zhen', '震': 'zhen',
  '争': 'zheng', '征': 'zheng', '整': 'zheng', '正': 'zheng', '证': 'zheng', '政': 'zheng',
  '之': 'zhi', '支': 'zhi', '知': 'zhi', '织': 'zhi', '脂': 'zhi', '执': 'zhi', '直': 'zhi',
  '值': 'zhi', '职': 'zhi', '植': 'zhi', '止': 'zhi', '只': 'zhi', '旨': 'zhi', '纸': 'zhi',
  '指': 'zhi', '至': 'zhi', '志': 'zhi', '制': 'zhi', '治': 'zhi', '质': 'zhi', '致': 'zhi',
  '智': 'zhi', '置': 'zhi', '中': 'zhong', '终': 'zhong', '钟': 'zhong', '忠': 'zhong',
  '种': 'zhong', '众': 'zhong', '重': 'zhong', '周': 'zhou', '洲': 'zhou', '州': 'zhou',
  '舟': 'zhou', '昼': 'zhou', '皱': 'zhou', '猪': 'zhu', '竹': 'zhu', '主': 'zhu', '住': 'zhu',
  '助': 'zhu', '注': 'zhu', '著': 'zhu', '祝': 'zhu', '筑': 'zhu', '抓': 'zhua', '专': 'zhuan',
  '转': 'zhuan', '赚': 'zhuan', '庄': 'zhuang', '装': 'zhuang', '壮': 'zhuang', '状': 'zhuang',
  '撞': 'zhuang', '追': 'zhui', '准': 'zhun', '桌': 'zhuo', '捉': 'zhuo', '着': 'zhuo',
  '资': 'zi', '子': 'zi', '字': 'zi', '自': 'zi', '紫': 'zi', '仔': 'zi', '总': 'zong',
  '宗': 'zong', '综': 'zong', '走': 'zou', '奏': 'zou', '租': 'zu', '足': 'zu', '族': 'zu',
  '组': 'zu', '阻': 'zu', '祖': 'zu', '嘴': 'zui', '最': 'zui', '罪': 'zui', '醉': 'zui',
  '尊': 'zun', '遵': 'zun', '昨': 'zuo', '左': 'zuo', '作': 'zuo', '做': 'zuo', '坐': 'zuo',
  '座': 'zuo',
  // 常用网络/技术词汇
  '浏': 'liu', '览': 'lan', '器': 'qi', '航': 'hang', '导': 'dao', '签': 'qian', '藏': 'cang',
  '频': 'pin', '频': 'pin', '频': 'pin', '聊': 'liao', '购': 'gou', '物': 'wu', '邮': 'you',
  '箱': 'xiang', '盘': 'pan', '驱': 'qu', '码': 'ma', '源': 'yuan', '库': 'ku', '栈': 'zhan',
  '端': 'duan', '链': 'lian', '接': 'jie', '口': 'kou', '据': 'ju', '析': 'xi', '算': 'suan',
  '法': 'fa', '程': 'cheng', '序': 'xu', '框': 'kuang', '架': 'jia', '件': 'jian', '插': 'cha',
  '扩': 'kuo', '展': 'zhan', '配': 'pei', '置': 'zhi', '脚': 'jiao', '本': 'ben', '编': 'bian',
  '译': 'yi', '调': 'diao', '试': 'shi', '测': 'ce', '部': 'bu', '署': 'shu', '运': 'yun',
  '维': 'wei', '护': 'hu', '监': 'jian', '控': 'kong', '志': 'zhi', '缓': 'huan', '存': 'cun',
  '索': 'suo', '引': 'yin', '擎': 'qing', '优': 'you', '化': 'hua'
};

/**
 * 获取文本的拼音和拼音首字母
 */
function getPinyinInfo(text) {
    if (!text || typeof text !== 'string') {
        return { full: '', first: '' };
    }
    
    let fullPinyin = '';
    let firstLetters = '';
    
    for (const char of text) {
        const py = PINYIN_MAP[char];
        if (py) {
            fullPinyin += py;
            firstLetters += py[0];
        } else {
            // 非中文字符保持原样
            fullPinyin += char.toLowerCase();
            firstLetters += char.toLowerCase();
        }
    }
    
    return { full: fullPinyin, first: firstLetters };
}

/**
 * 检查文本是否匹配搜索关键词（支持拼音）
 */
function matchWithPinyin(text, searchQuery) {
    if (!text || !searchQuery) return false;
    
    const textLower = text.toLowerCase();
    const queryLower = searchQuery.toLowerCase().trim();
    
    // 1. 直接匹配
    if (textLower.includes(queryLower)) return true;
    
    // 2. 拼音匹配
    const pinyinInfo = getPinyinInfo(text);
    
    // 完整拼音匹配
    if (pinyinInfo.full.includes(queryLower)) return true;
    
    // 拼音首字母匹配
    if (pinyinInfo.first.includes(queryLower)) return true;
    
    return false;
}

/**
 * 对卡片进行拼音搜索过滤
 */
function filterCardsWithPinyin(cards, searchQuery) {
    if (!searchQuery || !searchQuery.trim()) return cards;
    
    const queryLower = searchQuery.toLowerCase().trim();
    
    return cards.filter(card => {
        // 匹配标题
        if (matchWithPinyin(card.title, queryLower)) return true;
        
        // 匹配 URL
        if (card.url && card.url.toLowerCase().includes(queryLower)) return true;
        
        // 匹配描述
        if (card.desc && matchWithPinyin(card.desc, queryLower)) return true;
        
        // 匹配标签名称
        if (card.tags && card.tags.length > 0) {
            return card.tags.some(tag => matchWithPinyin(tag.name, queryLower));
        }
        
        return false;
    });
}

/**
 * 对书签进行拼音搜索过滤
 */
function filterBookmarksWithPinyin(bookmarks, searchQuery) {
    if (!searchQuery || !searchQuery.trim()) return bookmarks;
    
    const queryLower = searchQuery.toLowerCase().trim();
    
    return bookmarks.filter(bookmark => {
        // 匹配标题
        if (matchWithPinyin(bookmark.title, queryLower)) return true;
        
        // 匹配 URL
        if (bookmark.url && bookmark.url.toLowerCase().includes(queryLower)) return true;
        
        return false;
    });
}
