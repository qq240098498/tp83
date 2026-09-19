// 许可清单与核查：维护允许与不允许两类清单，核查时按项目与依赖逐条给出结论。
// 每条登记的许可先归一，再对照两类清单：落在允许清单里通过、落在不允许清单里不通过、
// 两边都没写到（包括没填许可）一律按待确认列出，不悄悄放过，也不算作通过
const crypto = require('crypto');
const { load, save, MAX_LICENSE_LENGTH } = require('./store');
const { ApiError, pickText } = require('./errors');
const { canonicalizeLicense } = require('./licenseNames');

const LISTS = ['allow', 'deny'];
const LIST_LABELS = { allow: '允许清单', deny: '不允许清单' };
const LIST_FIELDS = { allow: 'allowName', deny: 'denyName' };

function readList(value) {
  const list = pickText(value);
  if (!LISTS.includes(list)) {
    throw new ApiError(400, 'POLICY_LIST_INVALID', '清单只能是 allow（允许）或 deny（不允许）', 'list');
  }
  return list;
}

function getPolicy() {
  return load().policy;
}

function addPolicyEntry(payload) {
  const input = payload && typeof payload === 'object' ? payload : {};
  const list = readList(input.list);
  const field = LIST_FIELDS[list];
  const name = pickText(input.name);
  if (!name) throw new ApiError(400, 'POLICY_NAME_REQUIRED', '请填写许可名称', field);
  if (name.length > MAX_LICENSE_LENGTH) {
    throw new ApiError(400, 'POLICY_NAME_TOO_LONG', `许可名称不能超过 ${MAX_LICENSE_LENGTH} 个字符`, field);
  }
  const canonical = canonicalizeLicense(name);
  if (!canonical) {
    throw new ApiError(400, 'POLICY_NAME_INVALID', '许可名称里至少要有字母或数字', field);
  }

  const data = load();
  const other = list === 'allow' ? 'deny' : 'allow';
  const conflict = data.policy[other].find((item) => item.canonical === canonical);
  if (conflict) {
    throw new ApiError(409, 'POLICY_CONFLICT', `${conflict.name} 已经在${LIST_LABELS[other]}里，先从那边移除，再加入${LIST_LABELS[list]}`, field);
  }
  const duplicated = data.policy[list].find((item) => item.canonical === canonical);
  if (duplicated) {
    throw new ApiError(409, 'POLICY_DUPLICATED', `${LIST_LABELS[list]}里已经有 ${duplicated.name}，两种写法按同一种许可对待，不需要重复登记`, field);
  }

  const created = { id: crypto.randomUUID(), name, canonical, createdAt: new Date().toISOString() };
  data.policy[list].push(created);
  save(data);
  return created;
}

function removePolicyEntry(listValue, id) {
  const list = readList(listValue);
  const data = load();
  const index = data.policy[list].findIndex((item) => item.id === id);
  if (index === -1) throw new ApiError(404, 'POLICY_ENTRY_NOT_FOUND', '这条许可不在清单里，可能已经被移除', '');
  const [removed] = data.policy[list].splice(index, 1);
  save(data);
  return { id: removed.id, name: removed.name };
}

// 核查：每条登记按归一后的许可对照两类清单，通过、不通过、待确认必居其一
function checkLicenses() {
  const data = load();
  const allowSet = new Set(data.policy.allow.map((item) => item.canonical));
  const denySet = new Set(data.policy.deny.map((item) => item.canonical));
  const projectNames = {};
  data.projects.forEach((item) => { projectNames[item.id] = item.name; });

  const rows = data.deps
    .map((dep) => {
      const canonical = canonicalizeLicense(dep.license);
      let verdict = 'pending';
      if (canonical && allowSet.has(canonical)) verdict = 'pass';
      else if (canonical && denySet.has(canonical)) verdict = 'fail';
      return {
        depId: dep.id,
        projectId: dep.projectId,
        projectName: projectNames[dep.projectId] || dep.projectId,
        name: dep.name,
        license: dep.license,
        canonical,
        verdict,
      };
    })
    .sort((a, b) => {
      if (a.projectId !== b.projectId) return a.projectId < b.projectId ? -1 : 1;
      return a.name < b.name ? -1 : 1;
    });

  // 按项目汇总：每条登记只落进一个结论，三个数字加起来就是这个项目的登记条数
  const projects = data.projects.map((project) => {
    const summary = { pass: 0, fail: 0, pending: 0 };
    rows.forEach((row) => {
      if (row.projectId === project.id) summary[row.verdict] += 1;
    });
    return {
      projectId: project.id,
      projectName: project.name,
      pass: summary.pass,
      fail: summary.fail,
      pending: summary.pending,
      total: summary.pass + summary.fail + summary.pending,
    };
  });

  // 统一处理意见：归一后是同一种许可的登记归成一组，同组的结论必然一致，
  // 页面上据此写清哪些写法、哪些登记按同一种许可对待
  const groupMap = new Map();
  rows.forEach((row) => {
    if (!row.canonical) return;
    if (!groupMap.has(row.canonical)) {
      groupMap.set(row.canonical, { canonical: row.canonical, spellings: new Set(), refs: [], verdict: row.verdict });
    }
    const group = groupMap.get(row.canonical);
    group.spellings.add(row.license);
    group.refs.push({ depId: row.depId, depName: row.name, projectName: row.projectName });
  });
  const groups = Array.from(groupMap.values())
    .map((group) => ({
      canonical: group.canonical,
      spellings: Array.from(group.spellings).sort(),
      refs: group.refs,
      verdict: group.verdict,
    }))
    .sort((a, b) => (a.canonical < b.canonical ? -1 : 1));

  return { policy: data.policy, projects, rows, groups };
}

module.exports = {
  getPolicy,
  addPolicyEntry,
  removePolicyEntry,
  checkLicenses,
};
