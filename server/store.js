const fs = require('fs');
const path = require('path');
const { canonicalizeLicense } = require('./licenseNames');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const TEMP_FILE = path.join(DATA_DIR, 'db.json.tmp');

const MAX_NAME_LENGTH = 60;
const MAX_VERSION_LENGTH = 40;
const MAX_LICENSE_LENGTH = 40;
const MAX_OWNER_LENGTH = 40;
const MAX_NOTE_LENGTH = 200;
const UNASSIGNED = '未指定';
const STATUSES = ['在用', '待升', '已弃用'];

// 初始数据：三个项目、十八条依赖登记、一份许可清单。里面故意留了几种情况：
// 同一个依赖在两个项目里版本不一致、几条没写责任人、一条没写许可、
// 一条停在待升状态很久、一条已经弃用，另一种是同一依赖只在单个项目里出现过；
// 许可写法上故意让两条登记与清单里的写法不一致（小写的 mit、带空格的 apache 2.0），
// 用来验证归一后的核查结论；一条 GPL-3.0 落在不允许清单里，一条没填许可按待确认
function seedData() {
  return {
    projects: [
      { id: 'proj-1001', name: '订单服务', owner: '陈晓', note: '下单与订单查询', createdAt: '2026-08-28T02:00:00.000Z' },
      { id: 'proj-1002', name: '支付网关', owner: '李文', note: '收单与退款通道', createdAt: '2026-08-28T02:10:00.000Z' },
      { id: 'proj-1003', name: '会员中心', owner: '王凯', note: '账号与权益', createdAt: '2026-08-28T02:20:00.000Z' },
    ],
    policy: {
      allow: [
        { id: 'lic-3001', name: 'MIT', canonical: 'mit', createdAt: '2026-08-28T05:00:00.000Z' },
        { id: 'lic-3002', name: 'Apache-2.0', canonical: 'apache-2.0', createdAt: '2026-08-28T05:00:00.000Z' },
        { id: 'lic-3003', name: 'BSD-2-Clause', canonical: 'bsd-2-clause', createdAt: '2026-08-28T05:00:00.000Z' },
        { id: 'lic-3004', name: 'BSD-3-Clause', canonical: 'bsd-3-clause', createdAt: '2026-08-28T05:00:00.000Z' },
        { id: 'lic-3005', name: 'ISC', canonical: 'isc', createdAt: '2026-08-28T05:00:00.000Z' },
      ],
      deny: [
        { id: 'lic-3101', name: 'GPL-3.0', canonical: 'gpl-3.0', createdAt: '2026-08-28T05:00:00.000Z' },
        { id: 'lic-3102', name: 'AGPL-3.0', canonical: 'agpl-3.0', createdAt: '2026-08-28T05:00:00.000Z' },
      ],
    },
    deps: [
      { id: 'dep-2001', projectId: 'proj-1001', name: 'spring-boot', version: '2.7.18', license: 'Apache-2.0', owner: '陈晓', status: '在用', note: '基础框架', createdAt: '2026-08-28T03:00:00.000Z', updatedAt: '2026-09-15T06:10:00.000Z' },
      { id: 'dep-2002', projectId: 'proj-1001', name: 'postgresql', version: '42.6.0', license: 'BSD-2-Clause', owner: '陈晓', status: '在用', note: '数据库驱动', createdAt: '2026-08-28T03:02:00.000Z', updatedAt: '2026-09-15T06:12:00.000Z' },
      { id: 'dep-2003', projectId: 'proj-1001', name: 'redis-client', version: '3.1.0', license: 'MIT', owner: '', status: '待升', note: '等缓存改造完成后一起升', createdAt: '2026-08-29T01:20:00.000Z', updatedAt: '2026-08-20T02:30:00.000Z' },
      { id: 'dep-2004', projectId: 'proj-1001', name: 'jackson-databind', version: '2.15.3', license: 'Apache-2.0', owner: '陈晓', status: '在用', note: '结构化内容读写', createdAt: '2026-08-29T01:22:00.000Z', updatedAt: '2026-09-12T03:40:00.000Z' },
      { id: 'dep-2005', projectId: 'proj-1001', name: 'internal-sdk', version: '0.4.1', license: '', owner: '陈晓', status: '在用', note: '内部埋点封装，许可还没确认', createdAt: '2026-08-30T02:00:00.000Z', updatedAt: '2026-09-11T08:20:00.000Z' },
      { id: 'dep-2006', projectId: 'proj-1002', name: 'spring-boot', version: '2.6.15', license: 'Apache-2.0', owner: '李文', status: '在用', note: '基础框架，比订单服务低一档', createdAt: '2026-08-28T03:30:00.000Z', updatedAt: '2026-09-14T05:05:00.000Z' },
      { id: 'dep-2007', projectId: 'proj-1002', name: 'netty', version: '4.1.100', license: 'Apache-2.0', owner: '李文', status: '在用', note: '长连接通道', createdAt: '2026-08-28T03:32:00.000Z', updatedAt: '2026-09-14T05:08:00.000Z' },
      { id: 'dep-2008', projectId: 'proj-1002', name: 'bouncy-castle', version: '1.70', license: 'mit', owner: '李文', status: '待升', note: '等安全评估结论', createdAt: '2026-08-30T06:00:00.000Z', updatedAt: '2026-08-25T07:15:00.000Z' },
      { id: 'dep-2009', projectId: 'proj-1002', name: 'postgresql', version: '42.6.0', license: 'BSD-2-Clause', owner: '李文', status: '在用', note: '数据库驱动', createdAt: '2026-08-28T03:35:00.000Z', updatedAt: '2026-09-09T09:00:00.000Z' },
      { id: 'dep-2010', projectId: 'proj-1002', name: 'protobuf-java', version: '3.24.4', license: 'BSD-3-Clause', owner: '', status: '在用', note: '通道报文编解码', createdAt: '2026-08-30T06:05:00.000Z', updatedAt: '2026-09-09T09:05:00.000Z' },
      { id: 'dep-2011', projectId: 'proj-1003', name: 'react', version: '18.2.0', license: 'MIT', owner: '王凯', status: '在用', note: '页面框架', createdAt: '2026-08-28T04:00:00.000Z', updatedAt: '2026-09-16T02:00:00.000Z' },
      { id: 'dep-2012', projectId: 'proj-1003', name: 'axios', version: '1.6.2', license: 'MIT', owner: '王凯', status: '在用', note: '请求封装', createdAt: '2026-08-28T04:02:00.000Z', updatedAt: '2026-09-16T02:02:00.000Z' },
      { id: 'dep-2013', projectId: 'proj-1003', name: 'lodash', version: '4.17.21', license: 'MIT', owner: '', status: '待升', note: '很多地方直接引了整个包', createdAt: '2026-08-29T08:00:00.000Z', updatedAt: '2026-08-18T03:30:00.000Z' },
      { id: 'dep-2014', projectId: 'proj-1003', name: 'moment', version: '2.29.4', license: 'MIT', owner: '王凯', status: '已弃用', note: '体积太大，计划整体换成 dayjs', createdAt: '2026-08-29T08:05:00.000Z', updatedAt: '2026-09-10T01:00:00.000Z' },
      { id: 'dep-2015', projectId: 'proj-1003', name: 'dayjs', version: '1.11.10', license: 'MIT', owner: '王凯', status: '在用', note: '替换 moment 后的时间处理', createdAt: '2026-09-10T01:05:00.000Z', updatedAt: '2026-09-10T01:05:00.000Z' },
      { id: 'dep-2016', projectId: 'proj-1003', name: 'typescript', version: '5.2.2', license: 'apache 2.0', owner: '王凯', status: '在用', note: '编译与类型检查', createdAt: '2026-08-28T04:10:00.000Z', updatedAt: '2026-09-08T07:40:00.000Z' },
      { id: 'dep-2017', projectId: 'proj-1003', name: 'vite', version: '5.0.10', license: 'MIT', owner: '王凯', status: '在用', note: '本地构建', createdAt: '2026-08-28T04:12:00.000Z', updatedAt: '2026-09-08T07:42:00.000Z' },
      { id: 'dep-2018', projectId: 'proj-1003', name: 'xml-parser', version: '0.9.2', license: 'GPL-3.0', owner: '', status: '在用', note: '解析对账文件用，许可需要复核', createdAt: '2026-09-01T02:00:00.000Z', updatedAt: '2026-09-08T07:50:00.000Z' },
    ],
  };
}

// 把单个项目整理成固定结构，避免数据文件被手工改动后出现缺字段
function normalizeProject(item, fallbackIndex) {
  const source = item && typeof item === 'object' ? item : {};
  const createdAt = typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : new Date().toISOString();
  return {
    id: typeof source.id === 'string' && source.id ? source.id : `proj-restored-${fallbackIndex + 1}`,
    name: typeof source.name === 'string' && source.name.trim() ? source.name.trim() : `未命名项目 ${fallbackIndex + 1}`,
    owner: typeof source.owner === 'string' ? source.owner.trim() : '',
    note: typeof source.note === 'string' ? source.note : '',
    createdAt,
  };
}

// 把单条依赖登记整理成固定结构，状态不认识的一律按在用处理
function normalizeDep(item, fallbackIndex) {
  const source = item && typeof item === 'object' ? item : {};
  const createdAt = typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : new Date().toISOString();
  const status = STATUSES.includes(source.status) ? source.status : STATUSES[0];
  return {
    id: typeof source.id === 'string' && source.id ? source.id : `dep-restored-${fallbackIndex + 1}`,
    projectId: typeof source.projectId === 'string' ? source.projectId : '',
    name: typeof source.name === 'string' ? source.name.trim() : '',
    version: typeof source.version === 'string' ? source.version.trim() : '',
    license: typeof source.license === 'string' ? source.license.trim() : '',
    owner: typeof source.owner === 'string' ? source.owner.trim() : '',
    status,
    note: typeof source.note === 'string' ? source.note : '',
    createdAt,
    updatedAt: typeof source.updatedAt === 'string' && source.updatedAt ? source.updatedAt : createdAt,
  };
}

// 把一类许可清单整理成固定结构：名字为空的丢掉，按归一后的许可去重，同一份许可只留第一条
function normalizePolicyList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const entries = [];
  list.forEach((item, index) => {
    const source = item && typeof item === 'object' ? item : {};
    const name = typeof source.name === 'string' ? source.name.trim() : '';
    if (!name) return;
    const canonical = canonicalizeLicense(name);
    if (!canonical || seen.has(canonical)) return;
    seen.add(canonical);
    entries.push({
      id: typeof source.id === 'string' && source.id ? source.id : `lic-restored-${index + 1}`,
      name,
      canonical,
      createdAt: typeof source.createdAt === 'string' && source.createdAt ? source.createdAt : new Date().toISOString(),
    });
  });
  return entries;
}

// 整份数据保证 projects 与 deps 结构一致，指向不存在项目的登记一律丢掉
function normalize(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const seed = seedData();

  const projects = Array.isArray(source.projects)
    ? source.projects.map((item, index) => normalizeProject(item, index))
    : seed.projects;

  const seenIds = new Set();
  const seenNames = new Set();
  const dedupedProjects = [];
  projects.forEach((item) => {
    const lowerName = item.name.toLowerCase();
    if (seenIds.has(item.id) || seenNames.has(lowerName)) return;
    seenIds.add(item.id);
    seenNames.add(lowerName);
    dedupedProjects.push(item);
  });

  const known = new Set(dedupedProjects.map((item) => item.id));
  const deps = Array.isArray(source.deps)
    ? source.deps
        .map((item, index) => normalizeDep(item, index))
        .filter((item) => item.id && item.name)
        .filter((item) => known.has(item.projectId))
    : [];

  // 许可清单：同一份许可两边都有时以不允许为准，从允许清单里去掉
  const policySource = source.policy && typeof source.policy === 'object' ? source.policy : seed.policy;
  const deny = normalizePolicyList(policySource.deny);
  const denyKeys = new Set(deny.map((item) => item.canonical));
  const allow = normalizePolicyList(policySource.allow).filter((item) => !denyKeys.has(item.canonical));

  return { projects: dedupedProjects, deps, policy: { allow, deny } };
}

// 读取数据文件：文件缺失或内容损坏时回落到初始数据并立刻补写
function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return normalize(JSON.parse(raw));
  } catch (err) {
    const data = seedData();
    save(data);
    return data;
  }
}

// 先写临时文件再改名，写入中途被打断也不会把正式数据文件写坏
function save(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const text = `${JSON.stringify(normalize(data), null, 2)}\n`;
  fs.writeFileSync(TEMP_FILE, text, 'utf8');
  fs.renameSync(TEMP_FILE, DATA_FILE);
}

module.exports = {
  load,
  save,
  seedData,
  normalize,
  normalizeProject,
  normalizeDep,
  normalizePolicyList,
  STATUSES,
  UNASSIGNED,
  MAX_NAME_LENGTH,
  MAX_VERSION_LENGTH,
  MAX_LICENSE_LENGTH,
  MAX_OWNER_LENGTH,
  MAX_NOTE_LENGTH,
  DATA_FILE,
};
