const crypto = require('crypto');
const { load, save, MAX_LICENSE_LENGTH } = require('./store');
const { ApiError, pickText } = require('./errors');
const { canonicalKey, displayName } = require('./license-names');

const LISTS = ['allow', 'deny'];
const LIST_LABELS = { allow: '允许使用', deny: '一律不允许' };

function readListName(value) {
  const list = pickText(value);
  if (!LISTS.includes(list)) {
    throw new ApiError(400, 'POLICY_LIST_INVALID', '清单类型只能是 allow（允许使用）或 deny（一律不允许）', 'list');
  }
  return list;
}

// 出错位置按清单分开，页面才能把问题标到对应的输入框上
function fieldFor(list) {
  return list === 'allow' ? 'allowName' : 'denyName';
}

function validatePolicyName(value, field) {
  const name = pickText(value);
  if (!name) throw new ApiError(400, 'POLICY_NAME_REQUIRED', '请填写许可名称', field);
  if (name.length > MAX_LICENSE_LENGTH) {
    throw new ApiError(400, 'POLICY_NAME_TOO_LONG', `许可名称不能超过 ${MAX_LICENSE_LENGTH} 个字符`, field);
  }
  return name;
}

// 清单条目带上归一化后的信息，页面直接看得出这条按什么许可对待
function presentEntry(item) {
  return {
    id: item.id,
    name: item.name,
    canonical: canonicalKey(item.name),
    display: displayName(item.name),
    createdAt: item.createdAt,
  };
}

function presentPolicy(data) {
  return {
    allow: data.licensePolicy.allow.map(presentEntry),
    deny: data.licensePolicy.deny.map(presentEntry),
  };
}

function getLicensePolicy() {
  return presentPolicy(load());
}

function addLicensePolicy(payload) {
  const input = payload && typeof payload === 'object' ? payload : {};
  const list = readListName(input.list);
  const field = fieldFor(list);
  const name = validatePolicyName(input.name, field);
  const key = canonicalKey(name);
  const data = load();
  const policy = data.licensePolicy;

  // 同一个许可两个清单里只能出现一次：先查对面清单，再查本清单，比较都按归一化后的口径
  const other = list === 'allow' ? 'deny' : 'allow';
  const inOther = policy[other].find((item) => canonicalKey(item.name) === key);
  if (inOther) {
    throw new ApiError(409, 'POLICY_CONFLICT', `${displayName(name)} 已经在${LIST_LABELS[other]}清单里（登记为 ${inOther.name}），同一个许可不能两边都放，请先从对面清单移除`, field);
  }
  const inSelf = policy[list].find((item) => canonicalKey(item.name) === key);
  if (inSelf) {
    throw new ApiError(409, 'POLICY_DUPLICATED', `${LIST_LABELS[list]}清单里已经有 ${inSelf.name} 了，和 ${name} 按同一种许可对待`, field);
  }

  policy[list].push({ id: crypto.randomUUID(), name, createdAt: new Date().toISOString() });
  save(data);
  return presentPolicy(data);
}

function removeLicensePolicy(payload) {
  const input = payload && typeof payload === 'object' ? payload : {};
  const list = readListName(input.list);
  const id = pickText(input.id);
  const data = load();
  const policy = data.licensePolicy;
  const index = policy[list].findIndex((item) => item.id === id);
  if (index === -1) throw new ApiError(404, 'POLICY_ENTRY_NOT_FOUND', '这条清单条目不存在或已被移除', '');
  const [removed] = policy[list].splice(index, 1);
  save(data);
  return { id: removed.id, name: removed.name };
}

// 核查：每条登记的许可归一化后去两个清单里对，通过、不通过、待确认三选一。
// 没填许可、两个清单都没写到的，一律按待确认列出，不算通过。
function checkLicenses() {
  const data = load();
  const policy = data.licensePolicy;
  const allowKeys = new Map(policy.allow.map((item) => [canonicalKey(item.name), item.name]));
  const denyKeys = new Map(policy.deny.map((item) => [canonicalKey(item.name), item.name]));

  const projectNames = {};
  data.projects.forEach((project) => { projectNames[project.id] = project.name; });

  const items = data.deps.map((dep) => {
    const key = canonicalKey(dep.license);
    let verdict = 'pending';
    let matchedList = '';
    let matchedEntry = '';
    // 不通过优先：同一个许可被手工写进两个清单时按不通过处理，宁严勿宽
    if (key && denyKeys.has(key)) {
      verdict = 'fail';
      matchedList = 'deny';
      matchedEntry = denyKeys.get(key);
    } else if (key && allowKeys.has(key)) {
      verdict = 'pass';
      matchedList = 'allow';
      matchedEntry = allowKeys.get(key);
    }
    return {
      depId: dep.id,
      depName: dep.name,
      version: dep.version,
      projectId: dep.projectId,
      projectName: projectNames[dep.projectId] || dep.projectId,
      license: dep.license,
      canonical: key,
      display: key ? displayName(dep.license) : '',
      verdict,
      matchedList,
      matchedEntry,
    };
  });

  items.sort((a, b) => {
    if (a.projectName !== b.projectName) return a.projectName < b.projectName ? -1 : 1;
    return a.depName < b.depName ? -1 : 1;
  });

  // 按项目汇总：通过、不通过、待确认三栏加起来就是这个项目的登记条数
  const summary = data.projects.map((project) => {
    const rows = items.filter((item) => item.projectId === project.id);
    const pass = rows.filter((item) => item.verdict === 'pass').length;
    const fail = rows.filter((item) => item.verdict === 'fail').length;
    const pending = rows.length - pass - fail;
    return { projectId: project.id, projectName: project.name, pass, fail, pending, total: rows.length };
  });

  const totals = { pass: 0, fail: 0, pending: 0, total: items.length };
  items.forEach((item) => { totals[item.verdict] += 1; });

  // 写法归一的分组：同一个规范许可下的所有登记放在一起，写清这些登记按同一种许可对待
  const groupMap = new Map();
  items.forEach((item) => {
    const key = item.canonical || '(blank)';
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        canonical: item.canonical,
        display: item.display,
        writings: new Set(),
        refs: [],
        verdict: item.verdict,
        matchedList: item.matchedList,
        matchedEntry: item.matchedEntry,
      });
    }
    const group = groupMap.get(key);
    if (item.license) group.writings.add(item.license);
    group.refs.push({ depId: item.depId, depName: item.depName, projectName: item.projectName, license: item.license });
  });
  const groups = Array.from(groupMap.values())
    .map((group) => ({ ...group, writings: Array.from(group.writings) }))
    .sort((a, b) => {
      // 没填许可的一组排最前面，最需要先处理
      if (!a.canonical !== !b.canonical) return a.canonical ? 1 : -1;
      return (a.display || '') < (b.display || '') ? -1 : 1;
    });

  return { summary, totals, items, groups };
}

module.exports = {
  getLicensePolicy,
  addLicensePolicy,
  removeLicensePolicy,
  checkLicenses,
};
