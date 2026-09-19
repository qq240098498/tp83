// 许可名称的归一化口径：大小写、前后空格、空格与短横线的差异、
// 以及常见别名（例如 MIT License 与 MIT、GPLv3 与 GPL-3.0）都归到同一个规范 key。
// 登记的许可与清单条目都先归一再比较，页面据此说明哪些登记按同一种许可对待。

// 归一后要丢掉的修饰词：它们不改变许可本身
const NOISE_WORDS = new Set(['license', 'licence', 'the', 'version', 'only']);

// 常见别名归到右边的规范 key；不在表里的写法按归一化后的原文处理
const ALIASES = {
  mit: 'mit',
  expat: 'mit',
  'mit-expat': 'mit',
  'apache-2.0': 'apache-2.0',
  'apache-2': 'apache-2.0',
  apache2: 'apache-2.0',
  'apache2.0': 'apache-2.0',
  'asl-2.0': 'apache-2.0',
  'asl-2': 'apache-2.0',
  'bsd-2-clause': 'bsd-2-clause',
  'bsd-2': 'bsd-2-clause',
  'bsd-2clause': 'bsd-2-clause',
  'simplified-bsd': 'bsd-2-clause',
  freebsd: 'bsd-2-clause',
  'bsd-3-clause': 'bsd-3-clause',
  'bsd-3': 'bsd-3-clause',
  'bsd-3clause': 'bsd-3-clause',
  'new-bsd': 'bsd-3-clause',
  'revised-bsd': 'bsd-3-clause',
  'gpl-3.0': 'gpl-3.0',
  'gpl-3': 'gpl-3.0',
  gpl3: 'gpl-3.0',
  gplv3: 'gpl-3.0',
  'gpl-2.0': 'gpl-2.0',
  'gpl-2': 'gpl-2.0',
  gpl2: 'gpl-2.0',
  gplv2: 'gpl-2.0',
  'lgpl-3.0': 'lgpl-3.0',
  'lgpl-3': 'lgpl-3.0',
  lgplv3: 'lgpl-3.0',
  'lgpl-2.1': 'lgpl-2.1',
  'agpl-3.0': 'agpl-3.0',
  'agpl-3': 'agpl-3.0',
  agplv3: 'agpl-3.0',
  'mpl-2.0': 'mpl-2.0',
  'mpl-2': 'mpl-2.0',
  mplv2: 'mpl-2.0',
  isc: 'isc',
  'cc0-1.0': 'cc0-1.0',
  cc0: 'cc0-1.0',
  unlicense: 'unlicense',
  wtfpl: 'wtfpl',
};

// 规范 key 对应的标准写法，页面显示统一用它
const DISPLAY_NAMES = {
  mit: 'MIT',
  'apache-2.0': 'Apache-2.0',
  'bsd-2-clause': 'BSD-2-Clause',
  'bsd-3-clause': 'BSD-3-Clause',
  'gpl-3.0': 'GPL-3.0',
  'gpl-2.0': 'GPL-2.0',
  'lgpl-3.0': 'LGPL-3.0',
  'lgpl-2.1': 'LGPL-2.1',
  'agpl-3.0': 'AGPL-3.0',
  'mpl-2.0': 'MPL-2.0',
  isc: 'ISC',
  'cc0-1.0': 'CC0-1.0',
  unlicense: 'Unlicense',
  wtfpl: 'WTFPL',
};

// 基础归一：去首尾空白、转小写、空白与下划线折成短横线、并掉重复短横线
function baseKey(raw) {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

// 规范 key：基础归一后丢掉修饰词，再查别名表；许可没填时返回空串
function canonicalKey(raw) {
  const base = baseKey(raw);
  if (!base) return '';
  const stripped = base.split('-').filter((word) => word && !NOISE_WORDS.has(word)).join('-');
  const key = stripped || base;
  return ALIASES[key] || key;
}

// 页面显示用的标准写法：认识的使用标准名，不认识的保留登记原文（去掉首尾空白）
function displayName(raw) {
  const key = canonicalKey(raw);
  if (!key) return '';
  return DISPLAY_NAMES[key] || String(raw).trim();
}

module.exports = { canonicalKey, displayName };
