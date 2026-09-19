// 许可写法的归一口径：大小写、首尾空白、空格与短横线的差异都不算区别，
// 常见别名再归到同一个本名上；清单比对与核查都按归一后的结果走，
// 这样「MIT」「mit 」「Mit」以及「Apache-2.0」「apache 2.0」都按同一种许可对待
const { pickText } = require('./errors');

// 本名 -> 常见别名（表里的写法都先经过同一套归一，再查这张表）
const LICENSE_ALIASES = {
  mit: ['mit', 'mit-license', 'the-mit-license'],
  'apache-2.0': ['apache-2.0', 'apache-2', 'apache2', 'apache-license-2.0', 'apache-license-version-2.0'],
  'bsd-2-clause': ['bsd-2-clause', 'bsd-2', 'bsd-2-clause-simplified', 'simplified-bsd'],
  'bsd-3-clause': ['bsd-3-clause', 'bsd-3', 'bsd-3-clause-new', 'bsd-new', 'new-bsd'],
  'gpl-3.0': ['gpl-3.0', 'gpl-3', 'gpl3', 'gplv3', 'gpl-3.0-only'],
  'lgpl-3.0': ['lgpl-3.0', 'lgpl-3', 'lgpl3', 'lgplv3'],
  'agpl-3.0': ['agpl-3.0', 'agpl-3', 'agpl3', 'agplv3'],
  'mpl-2.0': ['mpl-2.0', 'mpl-2', 'mpl2', 'mozilla-public-license-2.0'],
  isc: ['isc', 'isc-license'],
  'cc0-1.0': ['cc0-1.0', 'cc0'],
  unlicense: ['unlicense', 'the-unlicense'],
};

const ALIAS_TO_CANONICAL = {};
Object.keys(LICENSE_ALIASES).forEach((canonical) => {
  LICENSE_ALIASES[canonical].forEach((alias) => {
    ALIAS_TO_CANONICAL[alias] = canonical;
  });
});

// 归一一种许可写法：去首尾空白、统一小写、连续空白或下划线并成短横线，再查别名表；
// 不在表里的写法按归一后的样子当本名，空串表示没填许可
function canonicalizeLicense(value) {
  const text = pickText(value);
  if (!text) return '';
  const normalized = text
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return ALIAS_TO_CANONICAL[normalized] || normalized;
}

module.exports = { canonicalizeLicense, LICENSE_ALIASES };
