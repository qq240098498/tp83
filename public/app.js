// 页面交互：项目清单与依赖登记都从服务端拉取，任何一步失败都把说明显示在顶部并标到对应输入项上

const state = {
  projects: [],
  deps: [],
  licenses: [],
  statuses: [],
  editingId: '',
  policy: { allow: [], deny: [] },
  check: { projects: [], rows: [], groups: [] },
};

// 核查结论的三种结果：落在允许清单里通过、落在不允许清单里不通过、其余一律待确认
const VERDICTS = {
  pass: { label: '通过', cls: 'pass' },
  fail: { label: '不通过', cls: 'fail' },
  pending: { label: '待确认', cls: 'pending' },
};

function verdictTag(verdict) {
  const meta = VERDICTS[verdict] || VERDICTS.pending;
  return `<span class="tag ${meta.cls}">${meta.label}</span>`;
}

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

async function loadPolicy() {
  const payload = await request('/api/license-policy');
  state.policy = payload.policy || { allow: [], deny: [] };
  renderPolicy();
}

async function loadCheck() {
  const payload = await request('/api/license-check');
  state.check = {
    projects: payload.projects || [],
    rows: payload.rows || [],
    groups: payload.groups || [],
  };
  renderCheck();
}

function renderPolicyList(listKey) {
  const list = state.policy[listKey] || [];
  const ul = el(`${listKey}-list`);
  ul.innerHTML = list.map((item) => {
    const canonical = item.canonical && item.canonical !== item.name
      ? `<span class="canon">统一按 ${escapeHtml(item.canonical)} 对待</span>`
      : '';
    return `<li>
      <span class="mono">${escapeHtml(item.name)}</span>
      ${canonical}
      <button type="button" class="link danger" data-policy-remove="${listKey}:${escapeHtml(item.id)}">移除</button>
    </li>`;
  }).join('');
  el(`${listKey}-empty`).classList.toggle('hidden', list.length > 0);
}

function renderPolicy() {
  renderPolicyList('allow');
  renderPolicyList('deny');
}

function renderCheckSummary() {
  el('check-summary-body').innerHTML = state.check.projects.map((item) => `<tr>
      <td>${escapeHtml(item.projectName)}</td>
      <td><span class="tag pass">${item.pass}</span></td>
      <td><span class="tag fail">${item.fail}</span></td>
      <td><span class="tag pending">${item.pending}</span></td>
      <td>${item.pass + item.fail + item.pending} 条</td>
    </tr>`).join('');
}

// 统一处理意见：归一后是同一种许可的登记归成一组，写清哪些写法、哪些登记按同一种许可对待；
// 没填许可的登记单独列出，一律按待确认处理，不能算作通过
function renderCheckGroups() {
  const parts = state.check.groups.map((group) => {
    const spellings = group.spellings.map((item) => `<span class="mono">${escapeHtml(item)}</span>`).join('、');
    const refs = group.refs.map((ref) => `${escapeHtml(ref.depName)}（${escapeHtml(ref.projectName)}）`).join('、');
    const merged = group.spellings.length > 1 ? '多种写法已归一，' : '';
    return `<div class="check-group">
      <div class="check-group-head">
        <span class="mono strong">${escapeHtml(group.canonical)}</span>
        ${verdictTag(group.verdict)}
        <span class="check-group-note">${merged}${group.refs.length} 条登记按同一种许可对待</span>
      </div>
      <div class="check-group-line">登记写法：${spellings}</div>
      <div class="check-group-line">涉及登记：${refs}</div>
    </div>`;
  });
  const unfilled = state.check.rows.filter((row) => !row.canonical);
  if (unfilled.length) {
    const refs = unfilled.map((row) => `${escapeHtml(row.name)}（${escapeHtml(row.projectName)}）`).join('、');
    parts.push(`<div class="check-group">
      <div class="check-group-head">
        <span class="strong">未填许可</span>
        ${verdictTag('pending')}
        <span class="check-group-note">${unfilled.length} 条登记没填许可，一律按待确认处理，不能算作通过</span>
      </div>
      <div class="check-group-line">涉及登记：${refs}</div>
    </div>`);
  }
  el('check-groups').innerHTML = parts.join('');
  el('check-groups-empty').classList.toggle('hidden', parts.length > 0);
}

function renderCheckRows() {
  el('check-rows-body').innerHTML = state.check.rows.map((row) => `<tr>
      <td>${escapeHtml(row.projectName)}</td>
      <td class="mono">${escapeHtml(row.name)}</td>
      <td>${row.license ? escapeHtml(row.license) : '<span class="missing">未填</span>'}</td>
      <td class="mono">${row.canonical ? escapeHtml(row.canonical) : '<span class="missing">—</span>'}</td>
      <td>${verdictTag(row.verdict)}</td>
    </tr>`).join('');
  el('check-rows-empty').classList.toggle('hidden', state.check.rows.length > 0);
}

function renderCheck() {
  renderCheckSummary();
  renderCheckGroups();
  renderCheckRows();
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
    await loadCheck();
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
    await loadCheck();
  } catch (err) {
    notify(err.message, 'error');
    markField(err.field);
  }
}

async function submitPolicy(listKey, event) {
  event.preventDefault();
  clearNotice();
  clearFieldMarks();
  const input = el(`${listKey}-name`);
  try {
    await request('/api/license-policy', { method: 'POST', body: JSON.stringify({ list: listKey, name: input.value }) });
    input.value = '';
    notify(listKey === 'allow' ? '已加入允许清单' : '已加入不允许清单', 'ok');
    await loadPolicy();
    await loadCheck();
  } catch (err) {
    notify(err.message, 'error');
    markField(err.field);
  }
}

// 列表上的操作用事件委托统一处理，列表重绘之后不需要重新绑定
document.addEventListener('click', async (event) => {
  const node = event.target.closest('button');
  if (!node) return;

  if (node.dataset.policyRemove) {
    clearNotice();
    const [listKey, entryId] = node.dataset.policyRemove.split(':');
    const found = (state.policy[listKey] || []).find((item) => item.id === entryId);
    if (!found) return;
    const label = listKey === 'allow' ? '允许清单' : '不允许清单';
    if (!window.confirm(`确定把 ${found.name} 从${label}里移除吗？`)) return;
    try {
      await request(`/api/license-policy/${encodeURIComponent(listKey)}/${encodeURIComponent(entryId)}`, { method: 'DELETE' });
      notify('许可已从清单里移除', 'ok');
      await loadPolicy();
      await loadCheck();
    } catch (err) {
      notify(err.message, 'error');
    }
    return;
  }

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
      await loadCheck();
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
      await loadCheck();
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
    .then(loadPolicy)
    .then(loadCheck)
    .catch((err) => notify(err.message, 'error'));
});
el('allow-form').addEventListener('submit', (event) => submitPolicy('allow', event));
el('deny-form').addEventListener('submit', (event) => submitPolicy('deny', event));
el('check-refresh').addEventListener('click', () => {
  clearNotice();
  loadPolicy()
    .then(loadCheck)
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

// 页面打开时先把项目、依赖登记与许可清单各拉一遍，项目决定登记表单里能选哪些归属，
// 核查结论随许可清单一起出来
restoreOperator();
loadHealth();
loadProjects()
  .then(loadDeps)
  .catch((err) => notify(err.message, 'error'));
loadPolicy()
  .then(loadCheck)
  .catch((err) => notify(err.message, 'error'));
