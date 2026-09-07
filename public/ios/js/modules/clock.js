/* ============ 时钟：世界时钟 / 闹钟 / 秒表 / 计时器 ============ */

import { el, uid, haptic, fmtDur, notify, alarmRing, requestNotifyPermission } from '../core/utils.js';
import { DB, Settings } from '../core/db.js';
import { createNav, navBtn, tabRoot } from '../core/nav.js';
import { toast, actionSheet, dialog, confirmDialog, promptDialog, escapeHtml, escapeAttr, sheet } from '../core/ui.js';
import { Apps as AppIcons, TIcons } from '../core/icons.js';

let root = null;
let timers = [];

/* 省会 / 首都 / 一线核心城市（省份或国家搜索命中时优先展示） */
const CAP_NAMES = new Set(['北京','上海','天津','重庆','石家庄','太原','呼和浩特','沈阳','长春','哈尔滨','南京','杭州','合肥','福州','南昌','济南','郑州','武汉','长沙','广州','南宁','海口','成都','贵阳','昆明','拉萨','西安','兰州','西宁','银川','乌鲁木齐','香港','澳门','台北','深圳','东京','首尔','新加坡','曼谷','伦敦','巴黎','柏林','罗马','马德里','莫斯科','雅典','开罗','迪拜','新德里','墨西哥城','纽约','洛杉矶','旧金山','多伦多','圣保罗','布宜诺斯艾利斯','利马','圣地亚哥','悉尼','墨尔本','奥克兰','开普敦']);

/* ---------- 世界城市库（tz 时区 / 经纬度用于地图标记；prov 省份/国家、py 拼音、pys 拼音首字母用于搜索） ---------- */
const CITIES = [
  /* ===== 中国 · 直辖市 ===== */
  { name: '北京', tz: 'Asia/Shanghai', lon: 116.4, lat: 39.9, prov: '北京', region: '中国', py: 'beijing', pys: 'bj' },
  { name: '上海', tz: 'Asia/Shanghai', lon: 121.5, lat: 31.2, prov: '上海', region: '中国', py: 'shanghai', pys: 'sh' },
  { name: '天津', tz: 'Asia/Shanghai', lon: 117.2, lat: 39.1, prov: '天津', region: '中国', py: 'tianjin', pys: 'tj' },
  { name: '重庆', tz: 'Asia/Shanghai', lon: 106.6, lat: 29.6, prov: '重庆', region: '中国', py: 'chongqing', pys: 'cq' },
  /* ===== 中国 · 华北东北 ===== */
  { name: '石家庄', tz: 'Asia/Shanghai', lon: 114.5, lat: 38.0, prov: '河北', region: '中国', py: 'shijiazhuang', pys: 'sjz' },
  { name: '保定', tz: 'Asia/Shanghai', lon: 115.5, lat: 38.9, prov: '河北', region: '中国', py: 'baoding', pys: 'bd' },
  { name: '唐山', tz: 'Asia/Shanghai', lon: 118.2, lat: 39.6, prov: '河北', region: '中国', py: 'tangshan', pys: 'ts' },
  { name: '秦皇岛', tz: 'Asia/Shanghai', lon: 119.6, lat: 39.9, prov: '河北', region: '中国', py: 'qinhuangdao', pys: 'qhd' },
  { name: '邯郸', tz: 'Asia/Shanghai', lon: 114.5, lat: 36.6, prov: '河北', region: '中国', py: 'handan', pys: 'hd' },
  { name: '邢台', tz: 'Asia/Shanghai', lon: 114.5, lat: 37.1, prov: '河北', region: '中国', py: 'xingtai', pys: 'xt' },
  { name: '张家口', tz: 'Asia/Shanghai', lon: 114.9, lat: 40.8, prov: '河北', region: '中国', py: 'zhangjiakou', pys: 'zjk' },
  { name: '承德', tz: 'Asia/Shanghai', lon: 117.9, lat: 41.0, prov: '河北', region: '中国', py: 'chengde', pys: 'cd' },
  { name: '沧州', tz: 'Asia/Shanghai', lon: 116.9, lat: 38.3, prov: '河北', region: '中国', py: 'cangzhou', pys: 'cz' },
  { name: '廊坊', tz: 'Asia/Shanghai', lon: 116.7, lat: 39.5, prov: '河北', region: '中国', py: 'langfang', pys: 'lf' },
  { name: '太原', tz: 'Asia/Shanghai', lon: 112.6, lat: 37.9, prov: '山西', region: '中国', py: 'taiyuan', pys: 'ty' },
  { name: '大同', tz: 'Asia/Shanghai', lon: 113.3, lat: 40.1, prov: '山西', region: '中国', py: 'datong', pys: 'dt' },
  { name: '长治', tz: 'Asia/Shanghai', lon: 113.1, lat: 36.2, prov: '山西', region: '中国', py: 'changzhi', pys: 'cz' },
  { name: '晋城', tz: 'Asia/Shanghai', lon: 112.9, lat: 35.5, prov: '山西', region: '中国', py: 'jincheng', pys: 'jc' },
  { name: '运城', tz: 'Asia/Shanghai', lon: 111.0, lat: 35.0, prov: '山西', region: '中国', py: 'yuncheng', pys: 'yc' },
  { name: '临汾', tz: 'Asia/Shanghai', lon: 111.5, lat: 36.1, prov: '山西', region: '中国', py: 'linfen', pys: 'lf' },
  { name: '晋中', tz: 'Asia/Shanghai', lon: 112.8, lat: 37.7, prov: '山西', region: '中国', py: 'jinzhong', pys: 'jz' },
  { name: '呼和浩特', tz: 'Asia/Shanghai', lon: 111.8, lat: 40.8, prov: '内蒙古', region: '中国', py: 'huhehaote', pys: 'hhht' },
  { name: '包头', tz: 'Asia/Shanghai', lon: 109.8, lat: 40.7, prov: '内蒙古', region: '中国', py: 'baotou', pys: 'bt' },
  { name: '赤峰', tz: 'Asia/Shanghai', lon: 118.9, lat: 42.3, prov: '内蒙古', region: '中国', py: 'chifeng', pys: 'cf' },
  { name: '通辽', tz: 'Asia/Shanghai', lon: 122.3, lat: 43.7, prov: '内蒙古', region: '中国', py: 'tongliao', pys: 'tl' },
  { name: '鄂尔多斯', tz: 'Asia/Shanghai', lon: 109.8, lat: 39.6, prov: '内蒙古', region: '中国', py: 'eerduosi', pys: 'eeds' },
  { name: '呼伦贝尔', tz: 'Asia/Shanghai', lon: 119.8, lat: 49.2, prov: '内蒙古', region: '中国', py: 'hulunbeier', pys: 'hlbe' },
  { name: '沈阳', tz: 'Asia/Shanghai', lon: 123.4, lat: 41.8, prov: '辽宁', region: '中国', py: 'shenyang', pys: 'sy' },
  { name: '大连', tz: 'Asia/Shanghai', lon: 121.6, lat: 38.9, prov: '辽宁', region: '中国', py: 'dalian', pys: 'dl' },
  { name: '鞍山', tz: 'Asia/Shanghai', lon: 123.0, lat: 41.1, prov: '辽宁', region: '中国', py: 'anshan', pys: 'as' },
  { name: '抚顺', tz: 'Asia/Shanghai', lon: 123.9, lat: 41.9, prov: '辽宁', region: '中国', py: 'fushun', pys: 'fs' },
  { name: '锦州', tz: 'Asia/Shanghai', lon: 121.1, lat: 41.1, prov: '辽宁', region: '中国', py: 'jinzhou', pys: 'jz' },
  { name: '营口', tz: 'Asia/Shanghai', lon: 122.2, lat: 40.7, prov: '辽宁', region: '中国', py: 'yingkou', pys: 'yk' },
  { name: '长春', tz: 'Asia/Shanghai', lon: 125.3, lat: 43.9, prov: '吉林', region: '中国', py: 'changchun', pys: 'cc' },
  { name: '吉林市', tz: 'Asia/Shanghai', lon: 126.5, lat: 43.8, prov: '吉林', region: '中国', py: 'jilin', pys: 'jl' },
  { name: '哈尔滨', tz: 'Asia/Shanghai', lon: 126.5, lat: 45.8, prov: '黑龙江', region: '中国', py: 'haerbin', pys: 'heb' },
  { name: '齐齐哈尔', tz: 'Asia/Shanghai', lon: 124.0, lat: 47.4, prov: '黑龙江', region: '中国', py: 'qiqihaer', pys: 'qqhe' },
  { name: '大庆', tz: 'Asia/Shanghai', lon: 125.1, lat: 46.6, prov: '黑龙江', region: '中国', py: 'daqing', pys: 'dq' },
  { name: '牡丹江', tz: 'Asia/Shanghai', lon: 129.6, lat: 44.6, prov: '黑龙江', region: '中国', py: 'mudanjiang', pys: 'mdj' },
  { name: '佳木斯', tz: 'Asia/Shanghai', lon: 130.3, lat: 46.8, prov: '黑龙江', region: '中国', py: 'jiamusi', pys: 'jms' },
  /* ===== 中国 · 华东 ===== */
  { name: '南京', tz: 'Asia/Shanghai', lon: 118.8, lat: 32.1, prov: '江苏', region: '中国', py: 'nanjing', pys: 'nj' },
  { name: '苏州', tz: 'Asia/Shanghai', lon: 120.6, lat: 31.3, prov: '江苏', region: '中国', py: 'suzhou', pys: 'sz' },
  { name: '无锡', tz: 'Asia/Shanghai', lon: 120.3, lat: 31.6, prov: '江苏', region: '中国', py: 'wuxi', pys: 'wx' },
  { name: '常州', tz: 'Asia/Shanghai', lon: 120.0, lat: 31.8, prov: '江苏', region: '中国', py: 'changzhou', pys: 'cz' },
  { name: '徐州', tz: 'Asia/Shanghai', lon: 117.3, lat: 34.3, prov: '江苏', region: '中国', py: 'xuzhou', pys: 'xz' },
  { name: '南通', tz: 'Asia/Shanghai', lon: 120.9, lat: 32.0, prov: '江苏', region: '中国', py: 'nantong', pys: 'nt' },
  { name: '扬州', tz: 'Asia/Shanghai', lon: 119.4, lat: 32.4, prov: '江苏', region: '中国', py: 'yangzhou', pys: 'yz' },
  { name: '连云港', tz: 'Asia/Shanghai', lon: 119.2, lat: 34.6, prov: '江苏', region: '中国', py: 'lianyungang', pys: 'lyg' },
  { name: '淮安', tz: 'Asia/Shanghai', lon: 119.0, lat: 33.6, prov: '江苏', region: '中国', py: 'huaian', pys: 'ha' },
  { name: '盐城', tz: 'Asia/Shanghai', lon: 120.1, lat: 33.4, prov: '江苏', region: '中国', py: 'yancheng', pys: 'yc' },
  { name: '镇江', tz: 'Asia/Shanghai', lon: 119.4, lat: 32.2, prov: '江苏', region: '中国', py: 'zhenjiang', pys: 'zj' },
  { name: '泰州', tz: 'Asia/Shanghai', lon: 119.9, lat: 32.5, prov: '江苏', region: '中国', py: 'taizhou', pys: 'tz' },
  { name: '杭州', tz: 'Asia/Shanghai', lon: 120.2, lat: 30.3, prov: '浙江', region: '中国', py: 'hangzhou', pys: 'hz' },
  { name: '宁波', tz: 'Asia/Shanghai', lon: 121.6, lat: 29.9, prov: '浙江', region: '中国', py: 'ningbo', pys: 'nb' },
  { name: '温州', tz: 'Asia/Shanghai', lon: 120.7, lat: 28.0, prov: '浙江', region: '中国', py: 'wenzhou', pys: 'wz' },
  { name: '嘉兴', tz: 'Asia/Shanghai', lon: 120.8, lat: 30.8, prov: '浙江', region: '中国', py: 'jiaxing', pys: 'jx' },
  { name: '湖州', tz: 'Asia/Shanghai', lon: 120.1, lat: 30.9, prov: '浙江', region: '中国', py: 'huzhou', pys: 'hz' },
  { name: '绍兴', tz: 'Asia/Shanghai', lon: 120.6, lat: 30.0, prov: '浙江', region: '中国', py: 'shaoxing', pys: 'sx' },
  { name: '金华', tz: 'Asia/Shanghai', lon: 119.6, lat: 29.1, prov: '浙江', region: '中国', py: 'jinhua', pys: 'jh' },
  { name: '台州', tz: 'Asia/Shanghai', lon: 121.4, lat: 28.7, prov: '浙江', region: '中国', py: 'taizhou', pys: 'tz' },
  { name: '合肥', tz: 'Asia/Shanghai', lon: 117.3, lat: 31.9, prov: '安徽', region: '中国', py: 'hefei', pys: 'hf' },
  { name: '芜湖', tz: 'Asia/Shanghai', lon: 118.4, lat: 31.4, prov: '安徽', region: '中国', py: 'wuhu', pys: 'wh' },
  { name: '黄山', tz: 'Asia/Shanghai', lon: 118.3, lat: 29.7, prov: '安徽', region: '中国', py: 'huangshan', pys: 'hs' },
  { name: '蚌埠', tz: 'Asia/Shanghai', lon: 117.4, lat: 32.9, prov: '安徽', region: '中国', py: 'bengbu', pys: 'bb' },
  { name: '安庆', tz: 'Asia/Shanghai', lon: 117.1, lat: 30.5, prov: '安徽', region: '中国', py: 'anqing', pys: 'aq' },
  { name: '马鞍山', tz: 'Asia/Shanghai', lon: 118.5, lat: 31.7, prov: '安徽', region: '中国', py: 'maanshan', pys: 'mas' },
  { name: '阜阳', tz: 'Asia/Shanghai', lon: 115.8, lat: 32.9, prov: '安徽', region: '中国', py: 'fuyang', pys: 'fy' },
  { name: '福州', tz: 'Asia/Shanghai', lon: 119.3, lat: 26.1, prov: '福建', region: '中国', py: 'fuzhou', pys: 'fz' },
  { name: '厦门', tz: 'Asia/Shanghai', lon: 118.1, lat: 24.5, prov: '福建', region: '中国', py: 'xiamen', pys: 'xm' },
  { name: '泉州', tz: 'Asia/Shanghai', lon: 118.7, lat: 24.9, prov: '福建', region: '中国', py: 'quanzhou', pys: 'qz' },
  { name: '莆田', tz: 'Asia/Shanghai', lon: 119.0, lat: 25.5, prov: '福建', region: '中国', py: 'putian', pys: 'pt' },
  { name: '漳州', tz: 'Asia/Shanghai', lon: 117.7, lat: 24.5, prov: '福建', region: '中国', py: 'zhangzhou', pys: 'zz' },
  { name: '南昌', tz: 'Asia/Shanghai', lon: 115.9, lat: 28.7, prov: '江西', region: '中国', py: 'nanchang', pys: 'nch' },
  { name: '赣州', tz: 'Asia/Shanghai', lon: 114.9, lat: 25.9, prov: '江西', region: '中国', py: 'ganzhou', pys: 'gz' },
  { name: '九江', tz: 'Asia/Shanghai', lon: 116.0, lat: 29.7, prov: '江西', region: '中国', py: 'jiujiang', pys: 'jj' },
  { name: '吉安', tz: 'Asia/Shanghai', lon: 114.9, lat: 27.1, prov: '江西', region: '中国', py: 'jian', pys: 'ja' },
  { name: '上饶', tz: 'Asia/Shanghai', lon: 117.9, lat: 28.5, prov: '江西', region: '中国', py: 'shangrao', pys: 'sr' },
  { name: '宜春', tz: 'Asia/Shanghai', lon: 114.4, lat: 27.8, prov: '江西', region: '中国', py: 'yichun', pys: 'yc' },
  { name: '济南', tz: 'Asia/Shanghai', lon: 117.1, lat: 36.7, prov: '山东', region: '中国', py: 'jinan', pys: 'jn' },
  { name: '青岛', tz: 'Asia/Shanghai', lon: 120.4, lat: 36.1, prov: '山东', region: '中国', py: 'qingdao', pys: 'qd' },
  { name: '烟台', tz: 'Asia/Shanghai', lon: 121.4, lat: 37.5, prov: '山东', region: '中国', py: 'yantai', pys: 'yt' },
  { name: '威海', tz: 'Asia/Shanghai', lon: 122.1, lat: 37.5, prov: '山东', region: '中国', py: 'weihai', pys: 'wh' },
  { name: '临沂', tz: 'Asia/Shanghai', lon: 118.4, lat: 35.1, prov: '山东', region: '中国', py: 'linyi', pys: 'ly' },
  { name: '淄博', tz: 'Asia/Shanghai', lon: 118.0, lat: 36.8, prov: '山东', region: '中国', py: 'zibo', pys: 'zb' },
  { name: '潍坊', tz: 'Asia/Shanghai', lon: 119.1, lat: 36.7, prov: '山东', region: '中国', py: 'weifang', pys: 'wf' },
  { name: '济宁', tz: 'Asia/Shanghai', lon: 116.6, lat: 35.4, prov: '山东', region: '中国', py: 'jining', pys: 'jn' },
  { name: '泰安', tz: 'Asia/Shanghai', lon: 117.1, lat: 36.2, prov: '山东', region: '中国', py: 'taian', pys: 'ta' },
  { name: '聊城', tz: 'Asia/Shanghai', lon: 116.0, lat: 36.5, prov: '山东', region: '中国', py: 'liaocheng', pys: 'lc' },
  { name: '德州', tz: 'Asia/Shanghai', lon: 116.4, lat: 37.4, prov: '山东', region: '中国', py: 'dezhou', pys: 'dz' },
  { name: '菏泽', tz: 'Asia/Shanghai', lon: 115.5, lat: 35.2, prov: '山东', region: '中国', py: 'heze', pys: 'hz' },
  /* ===== 中国 · 华中 ===== */
  { name: '郑州', tz: 'Asia/Shanghai', lon: 113.6, lat: 34.8, prov: '河南', region: '中国', py: 'zhengzhou', pys: 'zz' },
  { name: '洛阳', tz: 'Asia/Shanghai', lon: 112.5, lat: 34.6, prov: '河南', region: '中国', py: 'luoyang', pys: 'ly' },
  { name: '开封', tz: 'Asia/Shanghai', lon: 114.3, lat: 34.8, prov: '河南', region: '中国', py: 'kaifeng', pys: 'kf' },
  { name: '新乡', tz: 'Asia/Shanghai', lon: 113.9, lat: 35.3, prov: '河南', region: '中国', py: 'xinxiang', pys: 'xx' },
  { name: '南阳', tz: 'Asia/Shanghai', lon: 112.5, lat: 33.0, prov: '河南', region: '中国', py: 'nanyang', pys: 'ny' },
  { name: '信阳', tz: 'Asia/Shanghai', lon: 114.1, lat: 32.2, prov: '河南', region: '中国', py: 'xinyang', pys: 'xy' },
  { name: '安阳', tz: 'Asia/Shanghai', lon: 114.4, lat: 36.1, prov: '河南', region: '中国', py: 'anyang', pys: 'ay' },
  { name: '商丘', tz: 'Asia/Shanghai', lon: 115.7, lat: 34.4, prov: '河南', region: '中国', py: 'shangqiu', pys: 'sq' },
  { name: '濮阳', tz: 'Asia/Shanghai', lon: 115.0, lat: 35.7, prov: '河南', region: '中国', py: 'puyang', pys: 'py' },
  { name: '平顶山', tz: 'Asia/Shanghai', lon: 113.2, lat: 33.8, prov: '河南', region: '中国', py: 'pingdingshan', pys: 'pds' },
  { name: '焦作', tz: 'Asia/Shanghai', lon: 113.2, lat: 35.2, prov: '河南', region: '中国', py: 'jiaozuo', pys: 'jz' },
  { name: '鹤壁', tz: 'Asia/Shanghai', lon: 114.3, lat: 35.7, prov: '河南', region: '中国', py: 'hebi', pys: 'hb' },
  { name: '三门峡', tz: 'Asia/Shanghai', lon: 111.2, lat: 34.8, prov: '河南', region: '中国', py: 'sanmenxia', pys: 'smx' },
  { name: '许昌', tz: 'Asia/Shanghai', lon: 113.9, lat: 34.0, prov: '河南', region: '中国', py: 'xuchang', pys: 'xc' },
  { name: '漯河', tz: 'Asia/Shanghai', lon: 114.0, lat: 33.6, prov: '河南', region: '中国', py: 'luohe', pys: 'lh' },
  { name: '周口', tz: 'Asia/Shanghai', lon: 114.7, lat: 33.6, prov: '河南', region: '中国', py: 'zhoukou', pys: 'zk' },
  { name: '驻马店', tz: 'Asia/Shanghai', lon: 114.0, lat: 33.0, prov: '河南', region: '中国', py: 'zhumadian', pys: 'zmd' },
  { name: '武汉', tz: 'Asia/Shanghai', lon: 114.3, lat: 30.6, prov: '湖北', region: '中国', py: 'wuhan', pys: 'wh' },
  { name: '宜昌', tz: 'Asia/Shanghai', lon: 111.3, lat: 30.7, prov: '湖北', region: '中国', py: 'yichang', pys: 'yc' },
  { name: '襄阳', tz: 'Asia/Shanghai', lon: 112.1, lat: 32.0, prov: '湖北', region: '中国', py: 'xiangyang', pys: 'xy' },
  { name: '荆州', tz: 'Asia/Shanghai', lon: 112.2, lat: 30.3, prov: '湖北', region: '中国', py: 'jingzhou', pys: 'jz' },
  { name: '十堰', tz: 'Asia/Shanghai', lon: 110.8, lat: 32.6, prov: '湖北', region: '中国', py: 'shiyan', pys: 'sy' },
  { name: '孝感', tz: 'Asia/Shanghai', lon: 113.9, lat: 30.9, prov: '湖北', region: '中国', py: 'xiaogan', pys: 'xg' },
  { name: '长沙', tz: 'Asia/Shanghai', lon: 112.9, lat: 28.2, prov: '湖南', region: '中国', py: 'changsha', pys: 'cs' },
  { name: '株洲', tz: 'Asia/Shanghai', lon: 113.1, lat: 27.8, prov: '湖南', region: '中国', py: 'zhuzhou', pys: 'zz' },
  { name: '张家界', tz: 'Asia/Shanghai', lon: 110.5, lat: 29.1, prov: '湖南', region: '中国', py: 'zhangjiajie', pys: 'zjj' },
  { name: '岳阳', tz: 'Asia/Shanghai', lon: 113.1, lat: 29.4, prov: '湖南', region: '中国', py: 'yueyang', pys: 'yy' },
  { name: '常德', tz: 'Asia/Shanghai', lon: 111.7, lat: 29.0, prov: '湖南', region: '中国', py: 'changde', pys: 'cd' },
  { name: '衡阳', tz: 'Asia/Shanghai', lon: 112.6, lat: 26.9, prov: '湖南', region: '中国', py: 'hengyang', pys: 'hy' },
  { name: '郴州', tz: 'Asia/Shanghai', lon: 113.0, lat: 25.8, prov: '湖南', region: '中国', py: 'chenzhou', pys: 'cz' },
  /* ===== 中国 · 华南 ===== */
  { name: '广州', tz: 'Asia/Shanghai', lon: 113.3, lat: 23.1, prov: '广东', region: '中国', py: 'guangzhou', pys: 'gz' },
  { name: '深圳', tz: 'Asia/Shanghai', lon: 114.1, lat: 22.6, prov: '广东', region: '中国', py: 'shenzhen', pys: 'sz' },
  { name: '珠海', tz: 'Asia/Shanghai', lon: 113.6, lat: 22.3, prov: '广东', region: '中国', py: 'zhuhai', pys: 'zh' },
  { name: '东莞', tz: 'Asia/Shanghai', lon: 113.8, lat: 23.0, prov: '广东', region: '中国', py: 'dongguan', pys: 'dg' },
  { name: '佛山', tz: 'Asia/Shanghai', lon: 113.1, lat: 23.0, prov: '广东', region: '中国', py: 'foshan', pys: 'fs' },
  { name: '惠州', tz: 'Asia/Shanghai', lon: 114.4, lat: 23.1, prov: '广东', region: '中国', py: 'huizhou', pys: 'hz' },
  { name: '汕头', tz: 'Asia/Shanghai', lon: 116.7, lat: 23.4, prov: '广东', region: '中国', py: 'shantou', pys: 'st' },
  { name: '中山', tz: 'Asia/Shanghai', lon: 113.4, lat: 22.5, prov: '广东', region: '中国', py: 'zhongshan', pys: 'zs' },
  { name: '湛江', tz: 'Asia/Shanghai', lon: 110.4, lat: 21.2, prov: '广东', region: '中国', py: 'zhanjiang', pys: 'zj' },
  { name: '江门', tz: 'Asia/Shanghai', lon: 113.1, lat: 22.6, prov: '广东', region: '中国', py: 'jiangmen', pys: 'jm' },
  { name: '肇庆', tz: 'Asia/Shanghai', lon: 112.5, lat: 23.1, prov: '广东', region: '中国', py: 'zhaoqing', pys: 'zq' },
  { name: '潮州', tz: 'Asia/Shanghai', lon: 116.6, lat: 23.7, prov: '广东', region: '中国', py: 'chaozhou', pys: 'cz' },
  { name: '梅州', tz: 'Asia/Shanghai', lon: 116.1, lat: 24.3, prov: '广东', region: '中国', py: 'meizhou', pys: 'mz' },
  { name: '南宁', tz: 'Asia/Shanghai', lon: 108.4, lat: 22.8, prov: '广西', region: '中国', py: 'nanning', pys: 'nn' },
  { name: '桂林', tz: 'Asia/Shanghai', lon: 110.3, lat: 25.3, prov: '广西', region: '中国', py: 'guilin', pys: 'gl' },
  { name: '柳州', tz: 'Asia/Shanghai', lon: 109.4, lat: 24.3, prov: '广西', region: '中国', py: 'liuzhou', pys: 'lz' },
  { name: '北海', tz: 'Asia/Shanghai', lon: 109.1, lat: 21.5, prov: '广西', region: '中国', py: 'beihai', pys: 'bh' },
  { name: '玉林', tz: 'Asia/Shanghai', lon: 110.2, lat: 22.7, prov: '广西', region: '中国', py: 'yulin', pys: 'yl' },
  { name: '海口', tz: 'Asia/Shanghai', lon: 110.3, lat: 20.0, prov: '海南', region: '中国', py: 'haikou', pys: 'hk' },
  { name: '三亚', tz: 'Asia/Shanghai', lon: 109.5, lat: 18.3, prov: '海南', region: '中国', py: 'sanya', pys: 'sy' },
  /* ===== 中国 · 西南西北 ===== */
  { name: '成都', tz: 'Asia/Shanghai', lon: 104.1, lat: 30.6, prov: '四川', region: '中国', py: 'chengdu', pys: 'cd' },
  { name: '绵阳', tz: 'Asia/Shanghai', lon: 104.7, lat: 31.5, prov: '四川', region: '中国', py: 'mianyang', pys: 'my' },
  { name: '乐山', tz: 'Asia/Shanghai', lon: 103.8, lat: 29.6, prov: '四川', region: '中国', py: 'leshan', pys: 'ls' },
  { name: '宜宾', tz: 'Asia/Shanghai', lon: 104.6, lat: 28.8, prov: '四川', region: '中国', py: 'yibin', pys: 'yb' },
  { name: '泸州', tz: 'Asia/Shanghai', lon: 105.4, lat: 28.9, prov: '四川', region: '中国', py: 'luzhou', pys: 'lz' },
  { name: '德阳', tz: 'Asia/Shanghai', lon: 104.4, lat: 31.1, prov: '四川', region: '中国', py: 'deyang', pys: 'dy' },
  { name: '南充', tz: 'Asia/Shanghai', lon: 106.1, lat: 30.8, prov: '四川', region: '中国', py: 'nanchong', pys: 'nc' },
  { name: '达州', tz: 'Asia/Shanghai', lon: 107.5, lat: 31.2, prov: '四川', region: '中国', py: 'dazhou', pys: 'dz' },
  { name: '贵阳', tz: 'Asia/Shanghai', lon: 106.6, lat: 26.7, prov: '贵州', region: '中国', py: 'guiyang', pys: 'gy' },
  { name: '遵义', tz: 'Asia/Shanghai', lon: 106.9, lat: 27.7, prov: '贵州', region: '中国', py: 'zunyi', pys: 'zy' },
  { name: '六盘水', tz: 'Asia/Shanghai', lon: 104.8, lat: 26.6, prov: '贵州', region: '中国', py: 'liupanshui', pys: 'lps' },
  { name: '毕节', tz: 'Asia/Shanghai', lon: 105.3, lat: 27.3, prov: '贵州', region: '中国', py: 'bijie', pys: 'bj' },
  { name: '昆明', tz: 'Asia/Shanghai', lon: 102.8, lat: 24.9, prov: '云南', region: '中国', py: 'kunming', pys: 'km' },
  { name: '大理', tz: 'Asia/Shanghai', lon: 100.3, lat: 25.6, prov: '云南', region: '中国', py: 'dali', pys: 'dl' },
  { name: '丽江', tz: 'Asia/Shanghai', lon: 100.2, lat: 26.9, prov: '云南', region: '中国', py: 'lijiang', pys: 'lj' },
  { name: '曲靖', tz: 'Asia/Shanghai', lon: 103.8, lat: 25.5, prov: '云南', region: '中国', py: 'qujing', pys: 'qj' },
  { name: '西双版纳', tz: 'Asia/Shanghai', lon: 100.8, lat: 22.0, prov: '云南', region: '中国', py: 'xishuangbanna', pys: 'xsbn' },
  { name: '拉萨', tz: 'Asia/Shanghai', lon: 91.1, lat: 29.7, prov: '西藏', region: '中国', py: 'lasa', pys: 'ls' },
  { name: '日喀则', tz: 'Asia/Shanghai', lon: 88.9, lat: 29.3, prov: '西藏', region: '中国', py: 'rikaze', pys: 'rkz' },
  { name: '西安', tz: 'Asia/Shanghai', lon: 108.9, lat: 34.3, prov: '陕西', region: '中国', py: 'xian', pys: 'xa' },
  { name: '咸阳', tz: 'Asia/Shanghai', lon: 108.7, lat: 34.3, prov: '陕西', region: '中国', py: 'xianyang', pys: 'xy' },
  { name: '宝鸡', tz: 'Asia/Shanghai', lon: 107.2, lat: 34.4, prov: '陕西', region: '中国', py: 'baoji', pys: 'bj' },
  { name: '延安', tz: 'Asia/Shanghai', lon: 109.5, lat: 36.6, prov: '陕西', region: '中国', py: 'yanan', pys: 'ya' },
  { name: '汉中', tz: 'Asia/Shanghai', lon: 107.0, lat: 33.1, prov: '陕西', region: '中国', py: 'hanzhong', pys: 'hz' },
  { name: '渭南', tz: 'Asia/Shanghai', lon: 109.5, lat: 34.5, prov: '陕西', region: '中国', py: 'weinan', pys: 'wn' },
  { name: '榆林', tz: 'Asia/Shanghai', lon: 109.7, lat: 38.3, prov: '陕西', region: '中国', py: 'yulin', pys: 'yl' },
  { name: '兰州', tz: 'Asia/Shanghai', lon: 103.8, lat: 36.1, prov: '甘肃', region: '中国', py: 'lanzhou', pys: 'lz' },
  { name: '敦煌', tz: 'Asia/Shanghai', lon: 94.7, lat: 40.1, prov: '甘肃', region: '中国', py: 'dunhuang', pys: 'dh' },
  { name: '天水', tz: 'Asia/Shanghai', lon: 105.7, lat: 34.6, prov: '甘肃', region: '中国', py: 'tianshui', pys: 'ts' },
  { name: '酒泉', tz: 'Asia/Shanghai', lon: 98.5, lat: 39.7, prov: '甘肃', region: '中国', py: 'jiuquan', pys: 'jq' },
  { name: '张掖', tz: 'Asia/Shanghai', lon: 100.4, lat: 38.9, prov: '甘肃', region: '中国', py: 'zhangye', pys: 'zy' },
  { name: '武威', tz: 'Asia/Shanghai', lon: 102.6, lat: 37.9, prov: '甘肃', region: '中国', py: 'wuwei', pys: 'ww' },
  { name: '西宁', tz: 'Asia/Shanghai', lon: 101.8, lat: 36.6, prov: '青海', region: '中国', py: 'xining', pys: 'xn' },
  { name: '银川', tz: 'Asia/Shanghai', lon: 106.2, lat: 38.5, prov: '宁夏', region: '中国', py: 'yinchuan', pys: 'yc' },
  { name: '乌鲁木齐', tz: 'Asia/Shanghai', lon: 87.6, lat: 43.8, prov: '新疆', region: '中国', py: 'wulumuqi', pys: 'wlmq' },
  { name: '喀什', tz: 'Asia/Shanghai', lon: 76.0, lat: 39.5, prov: '新疆', region: '中国', py: 'kashi', pys: 'ks' },
  { name: '伊宁', tz: 'Asia/Shanghai', lon: 81.3, lat: 43.9, prov: '新疆', region: '中国', py: 'yining', pys: 'yn' },
  { name: '吐鲁番', tz: 'Asia/Shanghai', lon: 89.2, lat: 42.9, prov: '新疆', region: '中国', py: 'tulufan', pys: 'tlf' },
  { name: '阿克苏', tz: 'Asia/Shanghai', lon: 80.3, lat: 41.2, prov: '新疆', region: '中国', py: 'akesu', pys: 'aks' },
  { name: '和田', tz: 'Asia/Shanghai', lon: 79.9, lat: 37.1, prov: '新疆', region: '中国', py: 'hetian', pys: 'ht' },
  { name: '克拉玛依', tz: 'Asia/Shanghai', lon: 84.9, lat: 45.6, prov: '新疆', region: '中国', py: 'kelamayi', pys: 'klmy' },
  /* ===== 港澳台 ===== */
  { name: '香港', tz: 'Asia/Hong_Kong', lon: 114.2, lat: 22.3, prov: '香港', region: '中国', py: 'xianggang', pys: 'xg' },
  { name: '澳门', tz: 'Asia/Macau', lon: 113.6, lat: 22.2, prov: '澳门', region: '中国', py: 'aomen', pys: 'am' },
  { name: '台北', tz: 'Asia/Taipei', lon: 121.6, lat: 25.0, prov: '台湾', region: '中国', py: 'taibei', pys: 'tb' },
  { name: '高雄', tz: 'Asia/Taipei', lon: 120.3, lat: 22.6, prov: '台湾', region: '中国', py: 'gaoxiong', pys: 'gx' },
  /* ===== 亚洲 ===== */
  { name: '东京', tz: 'Asia/Tokyo', lon: 139.7, lat: 35.7, prov: '日本', region: '亚洲', py: 'tokyo', pys: 'tk' },
  { name: '大阪', tz: 'Asia/Tokyo', lon: 135.5, lat: 34.7, prov: '日本', region: '亚洲', py: 'osaka', pys: 'os' },
  { name: '首尔', tz: 'Asia/Seoul', lon: 127, lat: 37.5, prov: '韩国', region: '亚洲', py: 'seoul', pys: 'sl' },
  { name: '新加坡', tz: 'Asia/Singapore', lon: 103.8, lat: 1.35, prov: '新加坡', region: '亚洲', py: 'singapore', pys: 'sg' },
  { name: '吉隆坡', tz: 'Asia/Kuala_Lumpur', lon: 101.7, lat: 3.1, prov: '马来西亚', region: '亚洲', py: 'kualalumpur', pys: 'kl' },
  { name: '曼谷', tz: 'Asia/Bangkok', lon: 100.5, lat: 13.8, prov: '泰国', region: '亚洲', py: 'bangkok', pys: 'bk' },
  { name: '雅加达', tz: 'Asia/Jakarta', lon: 106.8, lat: -6.2, prov: '印度尼西亚', region: '亚洲', py: 'jakarta', pys: 'jk' },
  { name: '马尼拉', tz: 'Asia/Manila', lon: 121.0, lat: 14.6, prov: '菲律宾', region: '亚洲', py: 'manila', pys: 'ml' },
  { name: '河内', tz: 'Asia/Ho_Chi_Minh', lon: 105.8, lat: 21.0, prov: '越南', region: '亚洲', py: 'hanoi', pys: 'hn' },
  { name: '迪拜', tz: 'Asia/Dubai', lon: 55.3, lat: 25.2, prov: '阿联酋', region: '亚洲', py: 'dubai', pys: 'db' },
  { name: '德黑兰', tz: 'Asia/Tehran', lon: 51.4, lat: 35.7, prov: '伊朗', region: '亚洲', py: 'tehran', pys: 'th' },
  { name: '卡拉奇', tz: 'Asia/Karachi', lon: 67.0, lat: 24.9, prov: '巴基斯坦', region: '亚洲', py: 'karachi', pys: 'kr' },
  { name: '新德里', tz: 'Asia/Kolkata', lon: 77.2, lat: 28.6, prov: '印度', region: '亚洲', py: 'newdelhi', pys: 'nd' },
  { name: '孟买', tz: 'Asia/Kolkata', lon: 72.8, lat: 19, prov: '印度', region: '亚洲', py: 'mumbai', pys: 'mb' },
  { name: '达卡', tz: 'Asia/Dhaka', lon: 90.4, lat: 23.8, prov: '孟加拉国', region: '亚洲', py: 'dhaka', pys: 'dk' },
  /* ===== 大洋洲 ===== */
  { name: '悉尼', tz: 'Australia/Sydney', lon: 151.2, lat: -33.9, prov: '澳大利亚', region: '大洋洲', py: 'sydney', pys: 'sd' },
  { name: '墨尔本', tz: 'Australia/Melbourne', lon: 145.0, lat: -37.8, prov: '澳大利亚', region: '大洋洲', py: 'melbourne', pys: 'mb' },
  { name: '奥克兰', tz: 'Pacific/Auckland', lon: 174.8, lat: -36.8, prov: '新西兰', region: '大洋洲', py: 'auckland', pys: 'ak' },
  { name: '檀香山', tz: 'Pacific/Honolulu', lon: -157.9, lat: 21.3, prov: '美国', region: '大洋洲', py: 'honolulu', pys: 'hl' },
  /* ===== 欧洲 ===== */
  { name: '莫斯科', tz: 'Europe/Moscow', lon: 37.6, lat: 55.75, prov: '俄罗斯', region: '欧洲', py: 'moscow', pys: 'ms' },
  { name: '伊斯坦布尔', tz: 'Europe/Istanbul', lon: 29.0, lat: 41.0, prov: '土耳其', region: '欧洲', py: 'istanbul', pys: 'is' },
  { name: '雅典', tz: 'Europe/Athens', lon: 23.7, lat: 38.0, prov: '希腊', region: '欧洲', py: 'athens', pys: 'at' },
  { name: '伦敦', tz: 'Europe/London', lon: -0.1, lat: 51.5, prov: '英国', region: '欧洲', py: 'london', pys: 'ld' },
  { name: '都柏林', tz: 'Europe/Dublin', lon: -6.3, lat: 53.3, prov: '爱尔兰', region: '欧洲', py: 'dublin', pys: 'db' },
  { name: '巴黎', tz: 'Europe/Paris', lon: 2.35, lat: 48.85, prov: '法国', region: '欧洲', py: 'paris', pys: 'ps' },
  { name: '柏林', tz: 'Europe/Berlin', lon: 13.4, lat: 52.5, prov: '德国', region: '欧洲', py: 'berlin', pys: 'bl' },
  { name: '罗马', tz: 'Europe/Rome', lon: 12.5, lat: 41.9, prov: '意大利', region: '欧洲', py: 'rome', pys: 'rm' },
  { name: '马德里', tz: 'Europe/Madrid', lon: -3.7, lat: 40.4, prov: '西班牙', region: '欧洲', py: 'madrid', pys: 'md' },
  { name: '阿姆斯特丹', tz: 'Europe/Amsterdam', lon: 4.9, lat: 52.4, prov: '荷兰', region: '欧洲', py: 'amsterdam', pys: 'am' },
  { name: '苏黎世', tz: 'Europe/Zurich', lon: 8.5, lat: 47.4, prov: '瑞士', region: '欧洲', py: 'zurich', pys: 'zh' },
  { name: '维也纳', tz: 'Europe/Vienna', lon: 16.4, lat: 48.2, prov: '奥地利', region: '欧洲', py: 'vienna', pys: 'vn' },
  { name: '斯德哥尔摩', tz: 'Europe/Stockholm', lon: 18.1, lat: 59.3, prov: '瑞典', region: '欧洲', py: 'stockholm', pys: 'sh' },
  { name: '奥斯陆', tz: 'Europe/Oslo', lon: 10.7, lat: 59.9, prov: '挪威', region: '欧洲', py: 'oslo', pys: 'ol' },
  { name: '哥本哈根', tz: 'Europe/Copenhagen', lon: 12.6, lat: 55.7, prov: '丹麦', region: '欧洲', py: 'copenhagen', pys: 'cp' },
  { name: '赫尔辛基', tz: 'Europe/Helsinki', lon: 24.9, lat: 60.2, prov: '芬兰', region: '欧洲', py: 'helsinki', pys: 'hk' },
  { name: '里斯本', tz: 'Europe/Lisbon', lon: -9.1, lat: 38.7, prov: '葡萄牙', region: '欧洲', py: 'lisbon', pys: 'lb' },
  { name: '雷克雅未克', tz: 'Atlantic/Reykjavik', lon: -21.9, lat: 64.1, prov: '冰岛', region: '欧洲', py: 'reykjavik', pys: 'rv' },
  /* ===== 非洲 ===== */
  { name: '开罗', tz: 'Africa/Cairo', lon: 31.2, lat: 30, prov: '埃及', region: '非洲', py: 'cairo', pys: 'ce' },
  { name: '内罗毕', tz: 'Africa/Nairobi', lon: 36.8, lat: -1.3, prov: '肯尼亚', region: '非洲', py: 'nairobi', pys: 'nb' },
  { name: '拉各斯', tz: 'Africa/Lagos', lon: 3.4, lat: 6.5, prov: '尼日利亚', region: '非洲', py: 'lagos', pys: 'lg' },
  { name: '约翰内斯堡', tz: 'Africa/Johannesburg', lon: 28, lat: -26.2, prov: '南非', region: '非洲', py: 'johannesburg', pys: 'jb' },
  { name: '开普敦', tz: 'Africa/Johannesburg', lon: 18.4, lat: -33.9, prov: '南非', region: '非洲', py: 'capetown', pys: 'ct' },
  /* ===== 北美洲 ===== */
  { name: '安克雷奇', tz: 'America/Anchorage', lon: -149.9, lat: 61.2, prov: '美国', region: '北美洲', py: 'anchorage', pys: 'an' },
  { name: '纽约', tz: 'America/New_York', lon: -74, lat: 40.7, prov: '美国', region: '北美洲', py: 'newyork', pys: 'ny' },
  { name: '波士顿', tz: 'America/New_York', lon: -71.1, lat: 42.4, prov: '美国', region: '北美洲', py: 'boston', pys: 'bs' },
  { name: '华盛顿', tz: 'America/New_York', lon: -77.0, lat: 38.9, prov: '美国', region: '北美洲', py: 'washington', pys: 'wt' },
  { name: '芝加哥', tz: 'America/Chicago', lon: -87.6, lat: 41.9, prov: '美国', region: '北美洲', py: 'chicago', pys: 'cg' },
  { name: '丹佛', tz: 'America/Denver', lon: -105.0, lat: 39.7, prov: '美国', region: '北美洲', py: 'denver', pys: 'dv' },
  { name: '休斯顿', tz: 'America/Chicago', lon: -95.4, lat: 29.8, prov: '美国', region: '北美洲', py: 'houston', pys: 'ht' },
  { name: '迈阿密', tz: 'America/New_York', lon: -80.2, lat: 25.8, prov: '美国', region: '北美洲', py: 'miami', pys: 'mi' },
  { name: '洛杉矶', tz: 'America/Los_Angeles', lon: -118.2, lat: 34, prov: '美国', region: '北美洲', py: 'losangeles', pys: 'la' },
  { name: '旧金山', tz: 'America/Los_Angeles', lon: -122.4, lat: 37.8, prov: '美国', region: '北美洲', py: 'sanfrancisco', pys: 'sf' },
  { name: '多伦多', tz: 'America/Toronto', lon: -79.4, lat: 43.7, prov: '加拿大', region: '北美洲', py: 'toronto', pys: 'tt' },
  { name: '温哥华', tz: 'America/Vancouver', lon: -123.1, lat: 49.3, prov: '加拿大', region: '北美洲', py: 'vancouver', pys: 'vg' },
  { name: '墨西哥城', tz: 'America/Mexico_City', lon: -99.1, lat: 19.4, prov: '墨西哥', region: '北美洲', py: 'mexicocity', pys: 'mc' },
  /* ===== 南美洲 ===== */
  { name: '圣地亚哥', tz: 'America/Santiago', lon: -70.7, lat: -33.4, prov: '智利', region: '南美洲', py: 'santiago', pys: 'sg' },
  { name: '圣保罗', tz: 'America/Sao_Paulo', lon: -46.6, lat: -23.5, prov: '巴西', region: '南美洲', py: 'saopaulo', pys: 'sp' },
  { name: '布宜诺斯艾利斯', tz: 'America/Argentina/Buenos_Aires', lon: -58.4, lat: -34.6, prov: '阿根廷', region: '南美洲', py: 'buenosaires', pys: 'ba' },
  { name: '利马', tz: 'America/Lima', lon: -77.0, lat: -12.0, prov: '秘鲁', region: '南美洲', py: 'lima', pys: 'lm' },
];

/* 简化世界陆地块（点阵图用，cc: 0..47 列，r: 0..23 行） */
const LAND_RECTS = [
  [4, 15, 1, 4], [2, 12, 5, 8], [17, 21, 1, 4], [10, 16, 8, 10], [12, 14, 10, 11],
  [13, 19, 11, 16], [22, 29, 1, 3], [23, 30, 4, 6], [22, 30, 7, 9], [23, 29, 10, 14],
  [30, 47, 1, 5], [30, 40, 6, 9], [34, 40, 8, 10], [41, 44, 7, 10], [40, 46, 11, 12],
  [39, 44, 12, 15], [10, 40, 21, 23], [30, 47, 20, 21],
];

/* 太阳直射点纬度（赤纬，近似公式） */
function solarDeclination(date) {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const N = Math.floor((date.getTime() - start) / 86400000);
  return 23.44 * Math.sin(2 * Math.PI * (284 + N) / 365);
}

/* 时区名 → 当日 UTC 偏移分钟数（量化到 15 分钟步进，消除秒数带来的 ±1 分钟抖动） */
function tzOffsetMin(tz) {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const parts = {};
    dtf.formatToParts(new Date()).forEach(p => { parts[p.type] = p.value; });
    const hour = parts.hour === '24' ? 0 : +parts.hour;
    const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, hour, +parts.minute);
    const raw = (asUTC - Date.now()) / 60000;
    return Math.round(raw / 15) * 15;
  } catch (e) { return 0; }
}

/* 用户城市条目解析：字符串=预设城市名（旧数据兼容）；{name, offset}=自定义城市 */
function resolveCity(entry) {
  if (typeof entry === 'object' && entry) {
    return { name: entry.name || '自定义', offsetMin: Math.round(entry.offset ?? 0), lon: null, lat: null, isCustom: true };
  }
  const c = CITIES.find(x => x.name === entry);
  if (!c) return null;
  return { name: c.name, offsetMin: tzOffsetMin(c.tz), lon: c.lon, lat: c.lat, isCustom: false };
}

/* 城市当前时刻（统一用偏移量计算，兼容半小时时区） */
function cityNow(offsetMin) {
  return new Date(Date.now() + offsetMin * 60000);
}
function fmtHM(d) {
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}
function dateNumOf(d) {
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
}

/* 时差描述：今天/昨天/明天 · +8小时 / +5小时30分 */
function offsetLabel(cityOffsetMin, localOffsetMin) {
  const cityD = cityNow(cityOffsetMin);
  const diff = dateNumOf(cityD) - dateNumOf(cityNow(localOffsetMin));
  const day = diff > 0 ? '明天' : diff < 0 ? '昨天' : '今天';
  let mins = Math.round((cityOffsetMin - localOffsetMin));
  const sign = mins >= 0 ? '+' : '-';
  mins = Math.abs(mins);
  const h = Math.floor(mins / 60), m = mins % 60;
  const txt = h === 0 && m === 0 ? '0小时' : `${sign}${h}小时${m ? m + '分' : ''}`;
  return { day, txt };
}

export default {
  id: 'clock',
  name: '时钟',
  icon: AppIcons.clock,
  sbStyle: 'light',

  mount(rootEl, ctx) {
    root = rootEl;
    root.innerHTML = '';
    const t = tabRoot({
      tabs: [
        { label: '世界时钟', icon: TIcons.globe },
        { label: '闹钟', icon: TIcons.alarm },
        { label: '秒表', icon: TIcons.stopwatch },
        { label: '计时器', icon: TIcons.timerI },
      ],
      onChange: (i) => {
        clearInterval(tickTimer);
        if (i === 0) renderWorld();
        else if (i === 1) renderAlarm();
        else if (i === 2) renderStopwatch();
        else renderTimerApp();
      },
      initial: 0,
    });
    root.appendChild(t.root);
    renderWorld();
  },

  unmount() {
    timers.forEach(clearInterval);
    timers = [];
    clearInterval(tickTimer);
    stopStopwatch();
  },
};

let tickTimer = null;


/* ============ 世界时钟 ============ */
async function renderWorld() {
  const c = contentOf();
  c.innerHTML = '';
  const page = el('div', 'nav-page'); page.style.position = 'static';
  const navBar = el('div', 'nav');
  navBar.innerHTML = `<div class="nav-side" style="width:1px"></div><div class="nav-title">世界时钟</div><div class="nav-side right"></div>`;
  navBar.querySelector('.nav-side.right').appendChild(navBtn('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>', () => addCity()));
  const body = el('div', 'page-body pad');
  page.append(navBar, body);
  c.appendChild(page);

  body.innerHTML = `
    <div class="world-map" id="world-map"></div>
    <div class="wm-legend">
      <span><i class="dot city"></i>预设城市</span>
      <span><i class="dot custom"></i>自定义城市</span>
      <span class="sunmoon"><i class="sun"></i>白昼<i class="moon"></i>黑夜</span>
    </div>
    <div class="inset-group" style="margin-top:14px">
      <div class="inset-group-title">城市</div>
      <div class="inset-card" id="city-list"></div>
      <div class="inset-group-title" style="text-transform:none;letter-spacing:0">长按城市可置顶或移除；右上角 + 添加城市。</div>
    </div>`;

  drawWorldMap(body.querySelector('#world-map'));
  renderCityList(body.querySelector('#city-list'));
  tickTimer = setInterval(() => {
    if (root.isConnected) {
      renderCityList(body.querySelector('#city-list'));
      drawWorldMap(body.querySelector('#world-map'));
    } else clearInterval(tickTimer);
  }, 10000);
}

function contentOf() {
  return root.querySelector('.tabbar').previousElementSibling;
}

/* 用户城市列表（首次访问时固化默认四城，避免后续增删时默认值丢失） */
async function loadEntries() {
  let e = await Settings.load('worldClocks', null);
  if (e == null || !Array.isArray(e)) {
    e = ['北京', '东京', '伦敦', '纽约'];
    await Settings.set('worldClocks', e);
  }
  return e;
}

/* ---------- 城市列表（iOS 大字号细体时钟行） ---------- */
async function renderCityList(listEl) {
  const entries = await loadEntries();
  const localOffMin = -new Date().getTimezoneOffset();
  listEl.innerHTML = '';

  if (!entries.length) {
    listEl.innerHTML = `<div class="empty-state" style="padding:36px 24px"><div class="es-title">没有城市</div><div>点右上角 + 添加城市</div></div>`;
    return;
  }

  entries.forEach((entry, idx) => {
    const city = resolveCity(entry);
    if (!city) return;
    const d = cityNow(city.offsetMin);
    const hour = d.getUTCHours();
    const isDay = hour >= 6 && hour < 18;
    const { day, txt } = offsetLabel(city.offsetMin, localOffMin);

    const row = el('div', 'row wc-row');
    row.innerHTML = `
      <div class="wc-chip ${isDay ? 'sun' : 'moon'}">${isDay ? SUN_MINI : MOON_MINI}</div>
      <div class="row-label">
        <div class="wc-name">${escapeHtml(city.name)}${city.isCustom ? '<span class="wc-custom-tag">自定义</span>' : ''}</div>
        <div class="wc-sub">${day} · ${txt}</div>
      </div>
      <div class="wc-time num">${fmtHM(d)}</div>`;

    const menu = () => cityMenu(idx);
    row.oncontextmenu = (e) => { e.preventDefault(); menu(); };
    let t;
    row.addEventListener('touchstart', () => { t = setTimeout(menu, 500); }, { passive: true });
    row.addEventListener('touchmove', () => clearTimeout(t), { passive: true });
    row.addEventListener('touchend', () => clearTimeout(t));
    listEl.appendChild(row);
  });
}

/* ---------- 长按菜单：置顶 / 移除 ---------- */
async function cityMenu(idx) {
  const v = await actionSheet([
    { text: '置顶', value: 'top' },
    { text: '移除此城市', value: 'del', danger: true },
  ]);
  if (!v) return;
  let entries = await loadEntries();
  if (v === 'top' && entries[idx]) {
    const [it] = entries.splice(idx, 1);
    entries.unshift(it);
    await Settings.set('worldClocks', entries);
  } else if (v === 'del' && entries[idx]) {
    entries.splice(idx, 1);
    await Settings.set('worldClocks', entries);
  }
  renderCityList(root.querySelector('#city-list'));
  drawWorldMap(root.querySelector('#world-map'));
}

/* ---------- 添加城市：搜索预设 + 自定义城市（UTC 滚轮） ---------- */
async function addCity() {
  const entries = await loadEntries();
  const has = (name) => entries.some(e => (typeof e === 'object' ? e.name : e) === name);

  sheet({
    title: '添加城市',
    build(body, close) {
      body.innerHTML = `
        <div class="searchbar" style="margin:2px 0 10px">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/></svg>
          <input id="wc-search" placeholder="搜索城市 / 省份 / 国家 / 拼音" autocomplete="off" enterkeyhint="search">
        </div>
        <div class="wc-pick-list" id="wc-pick-list"></div>
        <div class="wc-custom-row" id="wc-custom-btn">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>
          <span>自定义城市（按 UTC 时差）</span>
        </div>`;

      const listEl = body.querySelector('#wc-pick-list');
      let q = '';

      /* 多字段匹配：城市名 / 省份国家 / 地区 / 全拼 / 拼音首字母（如 河南→郑州、zz→郑州、usa→纽约） */
      const match = (c, kw) =>
        c.name.toLowerCase().includes(kw) ||
        (c.prov || '').toLowerCase().includes(kw) ||
        (c.region || '').toLowerCase().includes(kw) ||
        (c.py || '').includes(kw) ||
        (c.pys || '').includes(kw);

      const rowHTML = (c) => {
        const d = cityNow(tzOffsetMin(c.tz));
        return `<div class="wc-pick${has(c.name) ? ' added' : ''}" data-name="${escapeAttr(c.name)}">
          <div class="wc-pick-name">${escapeHtml(c.name)}<span class="wc-pick-prov">${escapeHtml(c.prov || '')}</span></div>
          <div class="wc-pick-time num">${fmtHM(d)}</div>
          ${has(c.name) ? '<span class="wc-added-tag">已添加</span>' : ''}
        </div>`;
      };

      const render = () => {
        if (!q) {
          /* 无搜索词：按地区分区展示（中国优先） */
          const ORDER = ['中国', '亚洲', '大洋洲', '欧洲', '非洲', '北美洲', '南美洲'];
          let html = '';
          for (const reg of ORDER) {
            const items = CITIES.filter(c => c.region === reg);
            if (!items.length) continue;
            html += `<div class="wc-region-title">${reg}</div>` + items.map(rowHTML).join('');
          }
          listEl.innerHTML = html;
        } else {
          /* 搜索：城市名命中优先，其次拼音，最后省份/地区 */
          const kw = q.toLowerCase();
          const hits = CITIES.filter(c => match(c, kw));
          hits.sort((a, b) => {
            const score = (c) => (c.name.toLowerCase().includes(kw) ? 0 : ((c.py || '').includes(kw) || (c.pys || '').includes(kw)) ? 1 : 2);
            const d = score(a) - score(b);
            if (d) return d;
            if (score(a) === 2) { /* 省份/国家命中：省会与核心城市优先 */
              const ca = CAP_NAMES.has(a.name) ? 0 : 1, cb = CAP_NAMES.has(b.name) ? 0 : 1;
              if (ca !== cb) return ca - cb;
            }
            const aCN = a.region === '中国' ? 0 : 1, bCN = b.region === '中国' ? 0 : 1;
            if (aCN !== bCN) return aCN - bCN;
            return (a.py || '').localeCompare(b.py || '');
          });
          listEl.innerHTML = hits.length
            ? hits.map(rowHTML).join('')
            : `<div class="wc-pick-empty">没有匹配的城市<br><small>试试输入省份（如：河南）或拼音（如：zz）<br>或使用下方「自定义城市」</small></div>`;
        }
        listEl.querySelectorAll('.wc-pick:not(.added)').forEach(p => {
          p.onclick = async () => {
            const name = p.dataset.name;
            const cur = await loadEntries();
            if (!cur.includes(name)) {
              cur.push(name);
              await Settings.set('worldClocks', cur);
            }
            close();
            renderCityList(root.querySelector('#city-list'));
            drawWorldMap(root.querySelector('#world-map'));
            toast('已添加 ' + name);
          };
        });
      };
      render();
      body.querySelector('#wc-search').addEventListener('input', (e) => {
        q = e.target.value.trim().toLowerCase();
        render();
      });

      body.querySelector('#wc-custom-btn').onclick = () => {
        close();
        setTimeout(() => openCustomCitySheet(), 260);
      };
    },
  });
}

/* ---------- 自定义城市：名称 + UTC 时差滚轮 ---------- */
function openCustomCitySheet() {
  const localOffMin = -new Date().getTimezoneOffset();
  /* 候选偏移：UTC-12:00 ~ UTC+14:00，半小时步进 */
  const OFFS = [];
  for (let m = -12 * 60; m <= 14 * 60; m += 30) OFFS.push(m);
  const initIdx = Math.max(0, OFFS.indexOf(Math.round(localOffMin / 30) * 30));
  let picked = initIdx;
  const ROW = 54;

  const label = (m) => {
    const sign = m >= 0 ? '+' : '-';
    const h = Math.floor(Math.abs(m) / 60), mm = Math.abs(m) % 60;
    return `UTC${sign}${h}:${String(mm).padStart(2, '0')}`;
  };

  sheet({
    title: '自定义城市',
    build(body, close) {
      body.innerHTML = `
        <div class="inset-card" style="margin:0 0 12px">
          <div class="row" style="padding:9px 14px">
            <div class="row-label" style="color:var(--text-2);flex:none;width:52px">名称</div>
            <input class="row-input" id="cc-name" placeholder="如：西宁市 / 我家" maxlength="10" style="text-align:left">
          </div>
        </div>
        <div class="wheel" style="height:${ROW * 4}px">
          <div class="wheel-band" style="top:${ROW * 1.5}px;height:${ROW}px"></div>
          <div class="wheel-colwrap" style="width:150px">
            <div class="wheel-col" id="cc-col">
              <div class="wheel-pad"></div>
              ${OFFS.map((m, i) => `<div class="wheel-item${i === initIdx ? ' cur' : ''}">${label(m)}</div>`).join('')}
              <div class="wheel-pad"></div>
            </div>
          </div>
          <div class="wheel-fade top"></div>
          <div class="wheel-fade bottom"></div>
        </div>
        <div style="text-align:center;font-size:12px;color:var(--text-2);padding:6px 0 2px">当前选择 <b id="cc-cur">${label(OFFS[initIdx])}</b> · 相对本地 ${offsetLabel(OFFS[initIdx], localOffMin).txt}</div>
        <div class="sheet-actions">
          <button class="btn-fill ghost" id="cc-cancel">取消</button>
          <button class="btn-fill" id="cc-ok" style="flex:1.6">添加</button>
        </div>`;

      const col = body.querySelector('#cc-col');
      const items = [...col.querySelectorAll('.wheel-item')];
      const cur = body.querySelector('#cc-cur');
      let snapT = null;
      const snap = () => {
        const target = Math.round(col.scrollTop / ROW) * ROW;
        if (Math.abs(col.scrollTop - target) > 0.5) col.scrollTo({ top: target, behavior: 'smooth' });
      };
      col.addEventListener('scroll', () => {
        const i = Math.max(0, Math.min(items.length - 1, Math.round(col.scrollTop / ROW)));
        if (i !== picked) {
          picked = i;
          items.forEach((it, j) => it.classList.toggle('cur', j === i));
          cur.textContent = label(OFFS[i]);
          haptic(3);
        }
        clearTimeout(snapT);
        snapT = setTimeout(snap, 90);
      });
      requestAnimationFrame(() => { col.scrollTop = initIdx * ROW; });

      body.querySelector('#cc-cancel').onclick = () => close();
      body.querySelector('#cc-ok').onclick = async () => {
        const name = body.querySelector('#cc-name').value.trim();
        if (!name) { toast('请输入城市名称'); return; }
        const entries = await loadEntries();
        if (entries.some(e => (typeof e === 'object' ? e.name : e) === name)) {
          toast('该城市已在列表中');
          return;
        }
        entries.push({ name, offset: OFFS[picked] });
        await Settings.set('worldClocks', entries);
        haptic(8);
        close();
        renderCityList(root.querySelector('#city-list'));
        drawWorldMap(root.querySelector('#world-map'));
        toast('已添加 ' + name + '（' + label(OFFS[picked]) + '）');
      };
    },
  });
}

/* ---------- 点阵世界地图：晨昏线 + 太阳月亮 + 城市标记 ---------- */
function drawWorldMap(container) {
  if (!container) return;
  const now = new Date();
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
  const subsolarLon = ((180 - utcH * 15) % 360 + 540) % 360 - 180;  // 归一到 [-180,180)
  const decl = solarDeclination(now);

  const cells = new Set();
  LAND_RECTS.forEach(([c0, c1, r0, r1]) => {
    for (let r = r0; r <= r1; r++) {
      for (let cc = c0; cc <= c1; cc++) cells.add(cc + ',' + r);
    }
  });

  /* 精确昼夜判定：cos(H) > -tan(lat)·tan(δ) */
  const isDayCell = (lon, lat) => {
    const H = ((lon - subsolarLon) * Math.PI) / 180;
    const la = (lat * Math.PI) / 180, de = (decl * Math.PI) / 180;
    if (Math.abs(la) > Math.PI / 2 - 0.01) return lat > 0 ? decl > 0 : decl < 0; // 极地
    return Math.cos(H) > -Math.tan(la) * Math.tan(de);
  };

  let html = '';
  cells.forEach(key => {
    const [cc, r] = key.split(',').map(Number);
    const lon = (cc - 24) * 7.5;
    const lat = 90 - r * 7.5;
    const isDay = isDayCell(lon, lat);
    html += `<i style="grid-column:${cc + 1};grid-row:${r + 1};background:${isDay ? 'rgba(255,255,255,.88)' : 'rgba(255,255,255,.2)'}"></i>`;
  });

  /* 城市标记（预设蓝 / 自定义橙） */
  loadEntries().then(entries => {
    entries.forEach(entry => {
      const city = resolveCity(entry);
      if (!city || city.lon == null) return;
      const col = Math.round(city.lon / 7.5 + 24) + 1;
      const row = Math.round((90 - city.lat) / 7.5) + 1;
      html += `<i class="wm-city${city.isCustom ? ' custom' : ''}" style="grid-column:${col};grid-row:${row}"></i>`;
    });
    container.innerHTML = html;
  }).catch(() => { container.innerHTML = html; });

  /* 太阳直射点 + 月亮（对跖点） */
  const sunCol = Math.round(subsolarLon / 7.5 + 24) + 1;
  const sunRow = Math.round((90 - decl) / 7.5) + 1;
  html += `<i class="wm-sun" style="grid-column:${sunCol};grid-row:${sunRow}"></i>`;
  const moonLon = ((subsolarLon + 180) % 360 + 540) % 360 - 180;
  const moonCol = Math.round(moonLon / 7.5 + 24) + 1;
  const moonRow = Math.round((90 + decl) / 7.5) + 1;
  html += `<i class="wm-moon" style="grid-column:${moonCol};grid-row:${moonRow}"></i>`;
}

/* 太阳/月亮迷你图标（城市行昼夜徽章） */
const SUN_MINI = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#B25E00" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" fill="#FFD60A" stroke="#B25E00"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5 5l1.4 1.4M17.6 17.6L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/></svg>';
const MOON_MINI = '<svg width="12" height="12" viewBox="0 0 24 24" fill="#C7C9FF" stroke="#5E5CE6" stroke-width="1.8" stroke-linejoin="round" transform="rotate(-18 12 12)"><path d="M20 13.2A8.2 8.2 0 1 1 10.8 4a6.8 6.8 0 0 0 9.2 9.2z"/></svg>';

/* ============ 闹钟 ============ */
async function renderAlarm() {
  const c = contentOf();
  c.innerHTML = '';
  const page = el('div', 'nav-page'); page.style.position = 'static';
  const navBar = el('div', 'nav');
  navBar.innerHTML = `<div class="nav-side" style="width:1px"></div><div class="nav-title">闹钟</div><div class="nav-side right"></div>`;
  navBar.querySelector('.nav-side.right').appendChild(navBtn('<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>', () => addAlarm()));
  const body = el('div', 'page-body pad');
  page.append(navBar, body);
  c.appendChild(page);

  const alarms = null; // 闹钟存在 settings 里
  let list = await Settings.load('alarms', []);
  body.innerHTML = `<div class="inset-group"><div class="inset-card" id="alarm-list"></div>
    <div class="inset-group-title" style="padding-top:2px">闹钟会在应用打开时响铃；授权通知后，网页在后台也能提醒。</div></div>`;
  const listEl = body.querySelector('#alarm-list');
  const render = () => {
    listEl.innerHTML = '';
    if (!list.length) {
      listEl.innerHTML = `<div class="empty-state" style="padding:34px"><div class="es-title">没有闹钟</div><div>点右上角 + 添加</div></div>`;
    }
    list.forEach((a, i) => {
      const row = el('div', 'row');
      row.innerHTML = `
        <div class="row-label">
          <div style="font-size:38px;font-weight:250;font-variant-numeric:tabular-nums;${a.on ? '' : 'color:var(--text-3)'}">${a.time}</div>
          <div style="font-size:13px;color:var(--text-2)">${escapeHtml(a.label || '闹钟')}${a.repeat && a.repeat.length ? ' · ' + a.repeat.map(d => ['日', '一', '二', '三', '四', '五', '六'][d]).join(' ') : ''}</div>
        </div>
        <div class="switch ${a.on ? 'on' : ''}"></div>`;
      row.querySelector('.switch').onclick = async () => {
        a.on = !a.on;
        await Settings.set('alarms', list);
        render();
        if (a.on) scheduleAlarmCheck(list);
      };
      row.oncontextmenu = (e) => { e.preventDefault(); alarmMenu(a, i, list, render); };
      let t;
      row.addEventListener('touchstart', () => { t = setTimeout(() => alarmMenu(a, i, list, render), 500); }, { passive: true });
      row.addEventListener('touchmove', () => clearTimeout(t), { passive: true });
      row.addEventListener('touchend', () => clearTimeout(t));
      listEl.appendChild(row);
    });
  };
  render();
  scheduleAlarmCheck(list);

  async function addAlarm() {
    const sh = sheet({
      title: '添加闹钟',
      build(body, close) {
        body.innerHTML = `
          <div class="alarm-time-input"><input type="time" id="al-time" value="08:00"></div>
          <div class="inset-card" style="margin:12px 0">
            <div class="row"><div class="row-label" style="color:var(--text-2)">标签</div><input class="row-input" id="al-label" placeholder="闹钟"></div>
          </div>
          <div style="font-size:13px;color:var(--text-2);padding:4px 2px 8px">重复</div>
          <div class="week-picker" id="al-repeat">${['日', '一', '二', '三', '四', '五', '六'].map((d, i) => `<button data-d="${i}">${d}</button>`).join('')}</div>
          <div class="sheet-actions"><button class="btn-fill" id="al-ok">保存</button></div>`;
        const picked = new Set();
        body.querySelectorAll('#al-repeat button').forEach(b => {
          b.onclick = () => { b.classList.toggle('on'); b.classList.contains('on') ? picked.add(+b.dataset.d) : picked.delete(+b.dataset.d); };
        });
        body.querySelector('#al-ok').onclick = async () => {
          const time = body.querySelector('#al-time').value || '08:00';
          list.push({ id: uid('al'), time, label: body.querySelector('#al-label').value.trim() || '闹钟', repeat: [...picked].sort(), on: true });
          await Settings.set('alarms', list);
          close();
          render();
          scheduleAlarmCheck(list);
          await requestNotifyPermission();
          toast('闹钟已设置：' + time);
        };
      },
    });
  }
}

async function alarmMenu(a, i, list, render) {
  const v = await actionSheet([{ text: '删除闹钟', value: 'del', danger: true }]);
  if (v === 'del') {
    list.splice(i, 1);
    await Settings.set('alarms', list);
    render();
  }
}

function scheduleAlarmCheck(list) {
  clearInterval(alarmTick);
  alarmTick = setInterval(async () => {
    if (!root?.isConnected) { clearInterval(alarmTick); return; }
    const alarms = await Settings.load('alarms', []);
    const now = new Date();
    const cur = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    for (const a of alarms) {
      if (!a.on || a._fired === cur) continue;
      if (a.time === cur) {
        a._fired = cur;
        if (!a.repeat?.length || a.repeat.includes(now.getDay())) {
          fireAlarm(a);
        }
      }
    }
  }, 20000);
}
let alarmTick = null;

function fireAlarm(a) {
  alarmRing(10);
  notify('闹钟 ⏰ ' + a.time, a.label || '闹钟响铃了！');
  const mask = el('div', 'dialog-mask');
  mask.style.zIndex = 1400;
  mask.innerHTML = `<div class="dialog">
    <div class="dialog-title" style="font-size:44px;font-weight:250" >${a.time}</div>
    <div class="dialog-msg">${escapeHtml(a.label || '闹钟')}</div>
    <div class="dialog-btns">
      <button id="al-snooze">稍后提醒</button>
      <button class="bold" id="al-stop">停止</button>
    </div></div>`;
  document.getElementById('screen').appendChild(mask);
  mask.querySelector('#al-stop').onclick = () => mask.remove();
  mask.querySelector('#al-snooze').onclick = async () => {
    mask.remove();
    const alarms = await Settings.load('alarms', []);
    const [h, m] = a.time.split(':').map(Number);
    const d = new Date(2000, 0, 1, h, m + 9);
    alarms.find(x => x.id === a.id).time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    await Settings.set('alarms', alarms);
    toast('已延后 9 分钟');
  };
}

/* ============ 秒表 ============ */
let swRAF = null, swRunning = false, swStart = 0, swElapsed = 0, swLaps = [];

function renderStopwatch() {
  const c = contentOf();
  c.innerHTML = '';
  const page = el('div', 'nav-page'); page.style.position = 'static';
  const navBar = el('div', 'nav');
  navBar.innerHTML = `<div class="nav-side" style="width:1px"></div><div class="nav-title">秒表</div><div class="nav-side right" style="width:1px"></div>`;
  const body = el('div', 'page-body');
  body.classList.add('sw-body');
  page.append(navBar, body);
  c.appendChild(page);

  body.innerHTML = `
    <div class="sw-display num" id="sw-display">00:00.00</div>
    <div class="sw-controls">
      <button class="sw-btn" id="sw-lap">计次</button>
      <button class="sw-btn main" id="sw-start">启动</button>
    </div>
    <div class="sw-laps" id="sw-laps"></div>`;

  const display = body.querySelector('#sw-display');
  const lapsEl = body.querySelector('#sw-laps');

  const fmt = (ms) => {
    const total = ms / 1000;
    const m = Math.floor(total / 60);
    const s = Math.floor(total % 60);
    const cs = Math.floor((total * 100) % 100);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
  };

  const loop = () => {
    if (!swRunning) return;
    display.textContent = fmt(swElapsed + (performance.now() - swStart));
    swRAF = requestAnimationFrame(loop);
  };

  const renderLaps = () => {
    lapsEl.innerHTML = swLaps.map((l, i) => {
      const prev = i > 0 ? swLaps[i - 1].total : 0;
      return `<div class="sw-lap">
        <span>计次 ${i + 1}</span><span class="num">${fmt(l.total - prev)}</span><span class="num">${fmt(l.total)}</span>
      </div>`;
    }).reverse().join('');
  };

  body.querySelector('#sw-start').onclick = (e) => {
    haptic(8);
    if (!swRunning) {
      swRunning = true;
      swStart = performance.now();
      loop();
      e.target.textContent = '停止';
      e.target.classList.add('running');
    } else {
      swElapsed += performance.now() - swStart;
      swRunning = false;
      cancelAnimationFrame(swRAF);
      e.target.textContent = '启动';
      e.target.classList.remove('running');
    }
  };
  body.querySelector('#sw-lap').onclick = () => {
    if (!swRunning && !swElapsed) return;
    const total = swElapsed + (swRunning ? performance.now() - swStart : 0);
    swLaps.push({ total });
    renderLaps();
  };
  // 长按复位
  let rt;
  body.addEventListener('touchstart', () => { rt = setTimeout(() => { stopStopwatch(); display.textContent = '00:00.00'; swLaps = []; renderLaps(); body.querySelector('#sw-start').textContent = '启动'; }, 600); }, { passive: true });
  body.addEventListener('touchmove', () => clearTimeout(rt), { passive: true });
  body.addEventListener('touchend', () => clearTimeout(rt));
  renderLaps();
}

function stopStopwatch() {
  swRunning = false;
  if (swRAF) cancelAnimationFrame(swRAF);
  swElapsed = 0; swLaps = [];
}

/* ============ 计时器 ============ */
let tmRAF = null, tmEnd = 0, tmTotal = 0, tmRunning = false;

function renderTimerApp() {
  const c = contentOf();
  c.innerHTML = '';
  const page = el('div', 'nav-page'); page.style.position = 'static';
  const navBar = el('div', 'nav');
  navBar.innerHTML = `<div class="nav-side" style="width:1px"></div><div class="nav-title">计时器</div><div class="nav-side right" style="width:1px"></div>`;
  const body = el('div', 'page-body');
  body.classList.add('tm-body');
  page.append(navBar, body);
  c.appendChild(page);

  const fmtDurCN = (sec) => {
    if (sec <= 0) return '自定义';
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    if (h > 0) return `${h}小时${m ? m + '分' : ''}`;
    if (m > 0) return `${m}分${s ? s + '秒' : ''}`;
    return `${s}秒`;
  };

  body.innerHTML = `
    <div class="tm-ring-wrap">
      <svg viewBox="0 0 200 200" class="tm-ring">
        <circle cx="100" cy="100" r="92" fill="none" stroke="var(--fill-2)" stroke-width="6"/>
        <circle id="tm-progress" cx="100" cy="100" r="92" fill="none" stroke="var(--accent)" stroke-width="6" stroke-linecap="round" transform="rotate(-90 100 100)" stroke-dasharray="578" stroke-dashoffset="0"/>
      </svg>
      <div class="tm-display">
        <div class="num" id="tm-display">0:00</div>
        <div id="tm-sub" style="font-size:12px;color:var(--text-2)">选择时长开始</div>
      </div>
    </div>
    <div class="tm-presets" id="tm-presets">
      ${[1, 3, 5, 10, 15, 30, 60].map(m => `<button data-m="${m}">${m < 60 ? m + '分钟' : '1小时'}</button>`).join('')}
      <button data-m="custom" id="tm-custom-btn">自定义</button>
    </div>
    <div class="sw-controls tm-ctl">
      <button class="sw-btn" id="tm-cancel">取消</button>
      <button class="sw-btn main" id="tm-start">开始</button>
    </div>`;

  const R = 92, CIRC = 2 * Math.PI * R;
  const prog = body.querySelector('#tm-progress');
  const disp = body.querySelector('#tm-display');
  const sub = body.querySelector('#tm-sub');

  const fmt = (sec) => {
    sec = Math.max(0, Math.ceil(sec));
    const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return h > 0
      ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      : `${m}:${String(s).padStart(2, '0')}`;
  };

  const loop = () => {
    if (!tmRunning) return;
    const left = (tmEnd - Date.now()) / 1000;
    prog.style.strokeDashoffset = CIRC * (1 - left / (tmTotal / 1000));
    disp.textContent = fmt(left);
    if (left <= 0) { timerDone(); return; }
    tmRAF = requestAnimationFrame(loop);
  };

  const reset = () => {
    tmRunning = false;
    cancelAnimationFrame(tmRAF);
    prog.style.strokeDashoffset = 0;
    disp.textContent = fmt(tmTotal / 1000);
  };

  const applyDuration = (sec, label) => {
    tmTotal = sec * 1000;
    tmEnd = Date.now() + tmTotal;
    reset();
    sub.textContent = label;
  };

  body.querySelectorAll('#tm-presets button[data-m]:not([data-m="custom"])').forEach(b => {
    b.onclick = () => {
      body.querySelectorAll('#tm-presets button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      const m = +b.dataset.m;
      applyDuration(m * 60, '已选 ' + (m < 60 ? m + ' 分钟' : '1 小时'));
    };
  });

  /* 自定义时长：iOS 滚轮选择器（时 / 分 / 秒） */
  body.querySelector('#tm-custom-btn').onclick = () => {
    openDurationWheel(Math.round((tmTotal || 15 * 60000) / 1000), (sec) => {
      body.querySelectorAll('#tm-presets button').forEach(x => x.classList.remove('on'));
      const btn = body.querySelector('#tm-custom-btn');
      btn.classList.add('on');
      btn.textContent = fmtDurCN(sec);
      applyDuration(sec, '已选 ' + fmtDurCN(sec));
    });
  };

  body.querySelector('#tm-start').onclick = (e) => {
    haptic(8);
    if (!tmTotal) { toast('先选择一个时长'); return; }
    if (!tmRunning) {
      if (Date.now() >= tmEnd) tmEnd = Date.now() + tmTotal;
      tmRunning = true;
      e.target.textContent = '暂停';
      e.target.classList.add('running');
      loop();
    } else {
      tmTotal = tmEnd - Date.now();
      tmRunning = false;
      cancelAnimationFrame(tmRAF);
      e.target.textContent = '继续';
      e.target.classList.remove('running');
    }
  };
  body.querySelector('#tm-cancel').onclick = () => {
    tmRunning = false;
    cancelAnimationFrame(tmRAF);
    tmTotal = 0;
    disp.textContent = '0:00';
    prog.style.strokeDashoffset = 0;
    body.querySelector('#tm-start').textContent = '开始';
    sub.textContent = '选择时长开始';
    body.querySelectorAll('#tm-presets button').forEach(x => x.classList.remove('on'));
    body.querySelector('#tm-custom-btn').textContent = '自定义';
  };

  function timerDone() {
    tmRunning = false;
    tmTotal = 0;
    disp.textContent = '0:00';
    body.querySelector('#tm-start').textContent = '开始';
    alarmRing(6);
    try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 300]); } catch (e) {}
    notify('计时结束 ⏱️', '时间到！');
    toast('计时结束！');
  }
}

/* ---------- 时长滚轮选择器（仿 iOS UIDatePicker：时 / 分 / 秒） ---------- */
function openDurationWheel(initialSec, onConfirm) {
  const ROW = 54;               // 单行高度
  const VISIBLE = 4;            // 可见行数（216px）
  const LIMITS = [24, 60, 60];
  const init = [
    Math.min(23, Math.floor(initialSec / 3600)),
    Math.min(59, Math.floor(initialSec % 3600 / 60)),
    Math.min(59, initialSec % 60),
  ];
  const picked = [...init];

  const colHTML = (idx) => {
    const n = LIMITS[idx];
    const items = Array.from({ length: n }, (_, i) =>
      `<div class="wheel-item${i === init[idx] ? ' cur' : ''}">${i}</div>`).join('');
    return `<div class="wheel-colwrap">
      <div class="wheel-col" data-idx="${idx}">
        <div class="wheel-pad"></div>${items}<div class="wheel-pad"></div>
      </div>
      <span class="wheel-unit">${['小时', '分钟', '秒'][idx]}</span>
    </div>`;
  };

  sheet({
    title: '自定义时长',
    build(body, close) {
      body.innerHTML = `
        <div class="wheel" style="height:${ROW * VISIBLE}px">
          <div class="wheel-band" style="top:${ROW * 1.5}px;height:${ROW}px"></div>
          ${colHTML(0)}${colHTML(1)}${colHTML(2)}
          <div class="wheel-fade top"></div>
          <div class="wheel-fade bottom"></div>
        </div>
        <div class="sheet-actions">
          <button class="btn-fill ghost" id="dw-cancel">取消</button>
          <button class="btn-fill" id="dw-ok" style="flex:1.6">设定</button>
        </div>`;

      [...body.querySelectorAll('.wheel-col')].forEach(col => {
        const idx = +col.dataset.idx;
        const items = [...col.querySelectorAll('.wheel-item')];
        let snapT = null;

        const snap = () => {
          const target = Math.round(col.scrollTop / ROW) * ROW;
          if (Math.abs(col.scrollTop - target) > 0.5) col.scrollTo({ top: target, behavior: 'smooth' });
        };

        col.addEventListener('scroll', () => {
          const i = Math.max(0, Math.min(items.length - 1, Math.round(col.scrollTop / ROW)));
          if (i !== picked[idx]) {
            picked[idx] = i;
            items.forEach((it, j) => it.classList.toggle('cur', j === i));
            haptic(3);
          }
          clearTimeout(snapT);
          snapT = setTimeout(snap, 90);
        });

        requestAnimationFrame(() => { col.scrollTop = init[idx] * ROW; });
      });

      body.querySelector('#dw-cancel').onclick = () => close();
      body.querySelector('#dw-ok').onclick = () => {
        const sec = picked[0] * 3600 + picked[1] * 60 + picked[2];
        if (sec <= 0) { toast('时长需大于 0 秒'); return; }
        haptic(8);
        onConfirm(sec);
        close();
      };
    },
  });
}
