// 页面交互：项目清单与依赖登记都从服务端拉取，任何一步失败都把说明显示在顶部并标到对应输入项上

const state = {
  projects: [],
  deps: [],
  licenses: [],
  statuses: [],
  editingId: '',
  policy: { allow: [], deny: [] },
  check: null,
};

const el = (id) => document.getElementById(id);

// 统一的请求入口：出错时把服务端给的错误码、说明与出错位置一起抛出去
async function request(path, options) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  let payload = null;
  try {
    payload = await res.json();
  } catch (err) {
    payload = null;
  }
  if (!res.ok) {
    const error = (payload && payload.error) || {};
    const failure = new Error(error.message || `请求失败（状态码 ${res.status}）`);
    failure.code = error.code || '';
    failure.field = error.field || '';
    throw failure;
  }
  return payload;
}

function notify(message, kind) {
  const box = el('notice');
  box.textContent = message;
  box.className = `notice ${kind === 'ok' ? 'ok' : 'error'}`;
}

function clearNotice() {
  const box = el('notice');
  box.className = 'notice hidden';
  box.textContent = '';
}

function clearFieldMarks() {
  document.querySelectorAll('.invalid').forEach((node) => node.classList.remove('invalid'));
}

// 把出错位置标到具体输入项上：项目区与依赖区共用一套标记
function markField(field) {
  if (!field) return;
  const target = document.querySelector(`[data-field="${field}"]`);
  if (!target) return;
  target.classList.add('invalid');
  const input = target.tagName === 'INPUT' || target.tagName === 'SELECT' ? target : target.querySelector('input, select');
  if (input) input.focus();
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num) => String(num).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// 操作者名字记在浏览器里，刷新之后还在，保存时随请求一起带上
const OPERATOR_KEY = 'dep-ledger-operator';

function currentOperator() {
  return el('operator').value.trim();
}

function restoreOperator() {
  el('operator').value = window.localStorage.getItem(OPERATOR_KEY) || '';
}

async function loadHealth() {
  try {
    await request('/api/health');
    el('health').textContent = '服务正常';
    el('health').className = 'health ok';
  } catch (err) {
    el('health').textContent = '服务连不上';
    el('health').className = 'health bad';
  }
}

async function loadProjects() {
  const payload = await request('/api/projects');
  state.projects = payload.projects || [];
  renderProjects();
  renderProjectOptions();
}

async function loadDeps() {
  const params = new URLSearchParams();
  const projectId = el('filter-project').value;
  const status = el('filter-status').value;
  const license = el('filter-license').value;
  const keyword = el('filter-keyword').value.trim();
  if (projectId) params.set('projectId', projectId);
  if (status) params.set('status', status);
  if (license) params.set('license', license);
  if (keyword) params.set('keyword', keyword);
  const query = params.toString();
  const payload = await request(`/api/deps${query ? `?${query}` : ''}`);
  state.deps = payload.deps || [];
  state.licenses = payload.licenses || [];
  state.statuses = payload.statuses || [];
  renderDepFilterOptions();
  renderDeps();
}

async function loadLicensePolicy() {
  const payload = await request('/api/license-policy');
  state.policy = { allow: payload.allow || [], deny: payload.deny || [] };
  renderPolicy();
}

async function loadLicenseCheck() {
  const payload = await request('/api/license-check');
  state.check = payload;
  renderCheck();
}

function renderProjects() {
  const body = el('project-body');
  body.innerHTML = state.projects.map((item) => `<tr>
      <td>${escapeHtml(item.name)}</td>
      <td>${escapeHtml(item.owner) || '<span class="missing">未指定</span>'}</td>
      <td class="note-cell">${escapeHtml(item.note)}</td>
      <td>${item.depCount} 条</td>
      <td class="mono">${escapeHtml(formatTime(item.createdAt))}</td>
      <td class="actions">
        <button type="button" class="link" data-project-rename="${escapeHtml(item.id)}">改名</button>
        <button type="button" class="link" data-project-owner="${escapeHtml(item.id)}">改负责人</button>
        <button type="button" class="link danger" data-project-delete="${escapeHtml(item.id)}">删除</button>
      </td>
    </tr>`).join('');
  el('project-empty').classList.toggle('hidden', state.projects.length > 0);
}

function renderProjectOptions() {
  const select = el('dep-project');
  const current = select.value;
  select.innerHTML = state.projects
    .map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`)
    .join('');
  if (state.projects.some((item) => item.id === current)) select.value = current;

  const filter = el('filter-project');
  const filterCurrent = filter.value;
  filter.innerHTML = '<option value="">全部项目</option>'
    + state.projects.map((item) => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('');
  if (state.projects.some((item) => item.id === filterCurrent)) filter.value = filterCurrent;
}

function renderDepFilterOptions() {
  const statusSelect = el('filter-status');
  const statusCurrent = statusSelect.value;
  statusSelect.innerHTML = '<option value="">全部状态</option>'
    + state.statuses.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.statuses.includes(statusCurrent)) statusSelect.value = statusCurrent;

  const licenseSelect = el('filter-license');
  const licenseCurrent = licenseSelect.value;
  licenseSelect.innerHTML = '<option value="">全部许可</option>'
    + state.licenses.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  if (state.licenses.includes(licenseCurrent)) licenseSelect.value = licenseCurrent;

  const statusForm = el('dep-status');
  const statusFormCurrent = statusForm.value;
  statusForm.innerHTML = state.statuses
    .map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`)
    .join('');
  if (state.statuses.includes(statusFormCurrent)) statusForm.value = statusFormCurrent;
}

function projectName(projectId) {
  const found = state.projects.find((item) => item.id === projectId);
  return found ? found.name : projectId;
}

function renderDeps() {
  const body = el('dep-body');
  body.innerHTML = state.deps.map((item) => {
    const statusTag = item.status === '已弃用' ? 'off' : 'on';
    return `<tr>
      <td>${escapeHtml(projectName(item.projectId))}</td>
      <td class="mono">${escapeHtml(item.name)}</td>
      <td class="mono">${escapeHtml(item.version)}</td>
      <td>${item.license ? escapeHtml(item.license) : '<span class="missing">未填</span>'}</td>
      <td>${item.owner ? escapeHtml(item.owner) : '<span class="missing">未指定</span>'}</td>
      <td><span class="tag ${statusTag}">${escapeHtml(item.status)}</span></td>
      <td class="note-cell">${escapeHtml(item.note)}</td>
      <td class="mono">${escapeHtml(formatTime(item.updatedAt))}</td>
      <td class="actions">
        <button type="button" class="link" data-dep-edit="${escapeHtml(item.id)}">编辑</button>
        <button type="button" class="link danger" data-dep-delete="${escapeHtml(item.id)}">删除</button>
      </td>
    </tr>`;
  }).join('');
  el('dep-empty').classList.toggle('hidden', state.deps.length > 0);
}

// 两个清单的渲染：条目写法与规范名不一致时，旁边注明按什么对待
function renderPolicy() {
  ['allow', 'deny'].forEach((listName) => {
    const list = state.policy[listName] || [];
    el(`${listName}-list`).innerHTML = list.map((item) => {
      const alias = item.display && item.display !== item.name
        ? `<span class="policy-alias">按 ${escapeHtml(item.display)} 对待</span>`
        : '';
      return `<li>
        <span class="mono">${escapeHtml(item.name)}</span>${alias}
        <button type="button" class="link danger" data-policy-list="${listName}" data-policy-id="${escapeHtml(item.id)}" data-policy-name="${escapeHtml(item.name)}">移除</button>
      </li>`;
    }).join('');
    el(`${listName}-empty`).classList.toggle('hidden', list.length > 0);
    el(`${listName}-count`).textContent = `${list.length} 条`;
  });
}

const VERDICT_TAGS = {
  pass: '<span class="tag pass">通过</span>',
  fail: '<span class="tag fail">不通过</span>',
  pending: '<span class="tag pending">待确认</span>',
};

// 每条结论的依据写清楚：命中了哪条清单，或者是两个清单都没写到
function verdictReason(item) {
  if (item.verdict === 'pass') return `在允许清单里（条目：${item.matchedEntry}）`;
  if (item.verdict === 'fail') return `在不允许清单里（条目：${item.matchedEntry}）`;
  if (!item.license) return '许可未填，两个清单都没法对，按待确认处理';
  return '两个清单都没写到，按待确认处理';
}

// 同一组登记的处理意见：先写清统一按什么对待，再写结论从哪来
function groupAdvice(group) {
  if (!group.canonical) {
    return '这些登记没填许可，先补填许可再核；当前一律按待确认处理，不算通过';
  }
  const parts = [];
  if (group.writings.length > 1) {
    parts.push(`写法不一致：${group.writings.map(escapeHtml).join('、')}，统一按 ${escapeHtml(group.display)} 对待`);
  } else {
    parts.push(`统一按 ${escapeHtml(group.display)} 对待`);
  }
  if (group.verdict === 'pass') parts.push(`命中允许清单（条目：${escapeHtml(group.matchedEntry)}），结论通过`);
  else if (group.verdict === 'fail') parts.push(`命中不允许清单（条目：${escapeHtml(group.matchedEntry)}），结论不通过`);
  else parts.push('两个清单都没写到，结论待确认');
  return parts.join('；');
}

function renderCheck() {
  const check = state.check;
  if (!check) return;

  const summaryRows = check.summary.map((row) => `<tr>
      <td>${escapeHtml(row.projectName)}</td>
      <td><span class="tag pass">${row.pass}</span></td>
      <td><span class="tag fail">${row.fail}</span></td>
      <td><span class="tag pending">${row.pending}</span></td>
      <td>${row.total} 条</td>
    </tr>`);
  summaryRows.push(`<tr class="total-row">
      <td>全部项目合计</td>
      <td><span class="tag pass">${check.totals.pass}</span></td>
      <td><span class="tag fail">${check.totals.fail}</span></td>
      <td><span class="tag pending">${check.totals.pending}</span></td>
      <td>${check.totals.total} 条</td>
    </tr>`);
  el('summary-body').innerHTML = summaryRows.join('');
  el('summary-empty').classList.toggle('hidden', check.summary.length > 0);

  el('group-body').innerHTML = check.groups.map((group) => {
    const display = group.canonical
      ? `<span class="mono">${escapeHtml(group.display)}</span>`
      : '<span class="missing">（未填许可）</span>';
    const writings = group.writings.length
      ? group.writings.map((item) => `<span class="mono">${escapeHtml(item)}</span>`).join('、')
      : '<span class="missing">—</span>';
    const refs = group.refs.map((ref) => `${escapeHtml(ref.projectName)} / ${escapeHtml(ref.depName)}`).join('；');
    return `<tr>
      <td>${display}</td>
      <td class="wrap">${writings}</td>
      <td class="wrap">${refs}</td>
      <td class="wrap">${groupAdvice(group)}</td>
    </tr>`;
  }).join('');
  el('group-empty').classList.toggle('hidden', check.groups.length > 0);

  el('check-body').innerHTML = check.items.map((item) => {
    const license = item.license ? escapeHtml(item.license) : '<span class="missing">未填</span>';
    const display = item.canonical ? `<span class="mono">${escapeHtml(item.display)}</span>` : '<span class="missing">—</span>';
    return `<tr>
      <td>${escapeHtml(item.projectName)}</td>
      <td class="mono">${escapeHtml(item.depName)}</td>
      <td>${license}</td>
      <td>${display}</td>
      <td>${VERDICT_TAGS[item.verdict]}</td>
      <td class="wrap">${escapeHtml(verdictReason(item))}</td>
    </tr>`;
  }).join('');
  el('check-empty').classList.toggle('hidden', check.items.length > 0);
}

function openDepForm(dep) {
  state.editingId = dep ? dep.id : '';
  el('dep-form-title').textContent = dep ? `编辑登记：${dep.name}` : '新建登记';
  if (state.projects.length) {
    el('dep-project').value = dep ? dep.projectId : state.projects[0].id;
  }
  el('dep-name').value = dep ? dep.name : '';
  el('dep-version').value = dep ? dep.version : '';
  el('dep-license').value = dep ? dep.license : '';
  el('dep-owner').value = dep ? dep.owner : currentOperator();
  el('dep-status').value = dep ? dep.status : (state.statuses[0] || '在用');
  el('dep-note').value = dep ? dep.note : '';
  el('dep-form').classList.remove('hidden');
  el('dep-name').focus();
}

function closeDepForm() {
  state.editingId = '';
  el('dep-form').classList.add('hidden');
  clearFieldMarks();
}

async function submitProject(event) {
  event.preventDefault();
  clearNotice();
  clearFieldMarks();
  const payload = {
    name: el('project-name').value,
    owner: el('project-owner').value,
    note: el('project-note').value,
  };
  try {
    await request('/api/projects', { method: 'POST', body: JSON.stringify(payload) });
    el('project-name').value = '';
    el('project-owner').value = '';
    el('project-note').value = '';
    notify('项目已新增', 'ok');
    await loadProjects();
    await loadDeps();
    await loadLicenseCheck();
  } catch (err) {
    notify(err.message, 'error');
    markField(err.field);
  }
}

async function submitDep(event) {
  event.preventDefault();
  clearNotice();
  clearFieldMarks();
  const payload = {
    projectId: el('dep-project').value,
    name: el('dep-name').value,
    version: el('dep-version').value,
    license: el('dep-license').value,
    owner: el('dep-owner').value,
    status: el('dep-status').value,
    note: el('dep-note').value,
  };
  const editing = state.editingId;
  try {
    if (editing) {
      await request(`/api/deps/${encodeURIComponent(editing)}`, { method: 'PATCH', body: JSON.stringify(payload) });
      notify('依赖登记已保存', 'ok');
    } else {
      await request('/api/deps', { method: 'POST', body: JSON.stringify(payload) });
      notify('依赖登记已新增', 'ok');
    }
    closeDepForm();
    await loadProjects();
    await loadDeps();
    await loadLicenseCheck();
  } catch (err) {
    notify(err.message, 'error');
    markField(err.field);
  }
}

// 许可清单的添加：两个表单共用，清单类型决定出错位置标到哪个输入框
async function submitPolicy(listName, event) {
  event.preventDefault();
  clearNotice();
  clearFieldMarks();
  const input = el(listName === 'allow' ? 'allow-name' : 'deny-name');
  try {
    await request('/api/license-policy', { method: 'POST', body: JSON.stringify({ list: listName, name: input.value }) });
    input.value = '';
    notify(listName === 'allow' ? '已加入允许清单' : '已加入不允许清单', 'ok');
    await loadLicensePolicy();
    await loadLicenseCheck();
  } catch (err) {
    notify(err.message, 'error');
    markField(err.field);
  }
}

// 列表上的操作用事件委托统一处理，列表重绘之后不需要重新绑定
document.addEventListener('click', async (event) => {
  const node = event.target.closest('button');
  if (!node) return;

  const projectId = node.dataset.projectRename || node.dataset.projectOwner || node.dataset.projectDelete;
  if (projectId) {
    clearNotice();
    const found = state.projects.find((item) => item.id === projectId);
    if (!found) return;
    try {
      if (node.dataset.projectRename) {
        const next = window.prompt(`把 ${found.name} 的名称改成`, found.name);
        if (next === null) return;
        await request(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', body: JSON.stringify({ name: next }) });
        notify('项目名称已更新', 'ok');
      } else if (node.dataset.projectOwner) {
        const next = window.prompt(`把 ${found.name} 的负责人改成`, found.owner || '');
        if (next === null) return;
        await request(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', body: JSON.stringify({ owner: next }) });
        notify('项目负责人已更新', 'ok');
      } else {
        if (!window.confirm(`确定删除项目 ${found.name} 吗？`)) return;
        await request(`/api/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
        notify('项目已删除', 'ok');
      }
      await loadProjects();
      await loadDeps();
      await loadLicenseCheck();
    } catch (err) {
      notify(err.message, 'error');
    }
    return;
  }

  if (node.dataset.policyId) {
    clearNotice();
    const listName = node.dataset.policyList;
    const label = listName === 'allow' ? '允许清单' : '不允许清单';
    if (!window.confirm(`确定把 ${node.dataset.policyName} 从${label}里移除吗？移除后相关登记会重新判定`)) return;
    try {
      await request('/api/license-policy', { method: 'DELETE', body: JSON.stringify({ list: listName, id: node.dataset.policyId }) });
      notify('清单条目已移除', 'ok');
      await loadLicensePolicy();
      await loadLicenseCheck();
    } catch (err) {
      notify(err.message, 'error');
    }
    return;
  }

  if (node.dataset.depEdit) {
    clearNotice();
    const found = state.deps.find((item) => item.id === node.dataset.depEdit);
    if (found) openDepForm(found);
    return;
  }

  if (node.dataset.depDelete) {
    clearNotice();
    const found = state.deps.find((item) => item.id === node.dataset.depDelete);
    if (!window.confirm(`确定删除登记 ${found ? found.name : ''} 吗？`)) return;
    try {
      await request(`/api/deps/${encodeURIComponent(node.dataset.depDelete)}`, { method: 'DELETE' });
      if (state.editingId === node.dataset.depDelete) closeDepForm();
      notify('登记已删除', 'ok');
      await loadProjects();
      await loadDeps();
      await loadLicenseCheck();
    } catch (err) {
      notify(err.message, 'error');
    }
  }
});

el('project-form').addEventListener('submit', submitProject);
el('dep-form').addEventListener('submit', submitDep);
el('dep-new').addEventListener('click', () => {
  clearNotice();
  if (!state.projects.length) {
    notify('请先登记一个项目，再登记依赖', 'error');
    return;
  }
  openDepForm(null);
});
el('dep-cancel').addEventListener('click', closeDepForm);
el('filter-apply').addEventListener('click', () => {
  clearNotice();
  loadDeps().catch((err) => notify(err.message, 'error'));
});
el('filter-reset').addEventListener('click', () => {
  el('filter-project').value = '';
  el('filter-status').value = '';
  el('filter-license').value = '';
  el('filter-keyword').value = '';
  loadDeps().catch((err) => notify(err.message, 'error'));
});
el('dep-refresh').addEventListener('click', () => {
  clearNotice();
  loadProjects()
    .then(loadDeps)
    .then(loadLicenseCheck)
    .catch((err) => notify(err.message, 'error'));
});
el('filter-project').addEventListener('change', () => {
  loadDeps().catch((err) => notify(err.message, 'error'));
});
el('filter-status').addEventListener('change', () => {
  loadDeps().catch((err) => notify(err.message, 'error'));
});
el('filter-license').addEventListener('change', () => {
  loadDeps().catch((err) => notify(err.message, 'error'));
});
el('operator').addEventListener('change', () => {
  window.localStorage.setItem(OPERATOR_KEY, currentOperator());
});
el('allow-form').addEventListener('submit', (event) => submitPolicy('allow', event));
el('deny-form').addEventListener('submit', (event) => submitPolicy('deny', event));
el('license-refresh').addEventListener('click', () => {
  clearNotice();
  loadLicensePolicy()
    .then(loadLicenseCheck)
    .catch((err) => notify(err.message, 'error'));
});

// 页面打开时先把项目与依赖登记拉一遍，项目决定登记表单里能选哪些归属；许可清单与核查结果一并拉取
restoreOperator();
loadHealth();
loadProjects()
  .then(loadDeps)
  .catch((err) => notify(err.message, 'error'));
loadLicensePolicy()
  .then(loadLicenseCheck)
  .catch((err) => notify(err.message, 'error'));
