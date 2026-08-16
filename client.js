// Client half of dsh-opencode-go-pool.
// Hand-written browser bundle in the lazy-CJS format the client module loader
// expects: it only REGISTERS the factory; the body runs at materialization.
// It mounts the opencodePool Remote, registers a settings.section sidebar
// entry ("OpenCode Go 套餐池"), and renders the usage dashboard: one card per
// key with 5h-rolling / weekly / monthly usage bars, plus switch / disable /
// clear actions and an inline key editor that writes through putKeys.

window.__ModuleLoader__.load({
  id: 'dsh-opencode-go-pool',
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
    const React = require('react');

    const NS = 'settings.opencodeGoPool';
    const inject = ['slots', 'locale', 'remote'];

    const zh = {
      nav: 'OpenCode Go 套餐池',
      title: 'OpenCode Go 套餐池',
      subtitle: '多 Key 池 · 额度耗尽自动切换',
      loading: '查询中…',
      loadFailed: '加载失败',
      paused: '连续失败，已暂停自动刷新',
      refresh: '刷新',
      takeoverServing: '服务中 · 路由 opencode-go 已接管',
      takeoverOwnRoute: '自有路由模式 · opencode-go-pool',
      takeoverWaiting: '等待接管',
      takeoverWaitingHint: 'opencode-go 路由当前由其他插件持有。请在「设置 → 模型」中删除 opencode-go 供应商行，本插件会自动接管，历史会话无需任何改动。',
      noKeysTitle: '尚未配置 Key',
      noKeysHint: '每个 Key 对应一个 OpenCode Go 账号。在下方「Key 管理」中添加，Key 值请通过凭据填写（设置 → 模型 的凭据页，或 ~/.dsh/.credentials.yaml / 环境变量）。',
      activeBadge: '使用中',
      idleBadge: '空闲',
      exhaustedBadge: '额度耗尽',
      invalidBadge: '已失效',
      disabledBadge: '已停用',
      rolling: '5 小时滚动',
      weekly: '每周',
      monthly: '每月',
      used: '已用',
      left: '剩余',
      resetsIn: '重置',
      credentialRef: '凭据引用',
      noApiKey: '未配置凭据，等待填写',
      unauthorized: 'Key 无效或已过期（401）',
      network: '网络请求失败',
      badJson: '接口响应解析失败',
      httpError: '接口返回 HTTP {status}',
      unknown: '未知',
      switchNow: '立即切换',
      disable: '停用',
      enable: '启用',
      clearInvalid: '清除失效',
      lastSwitch: '最近切换',
      switchQuota: '额度耗尽',
      switchConsecutive: '连续失败',
      switchInvalid: '凭据失效',
      switchManual: '手动',
      manageTitle: 'Key 管理',
      manageHint: 'id 自动生成；label 为显示名；密钥直接粘贴（留空则不修改）；凭据引用名留空会自动生成。',
      addKey: '添加 Key',
      remove: '删除',
      save: '保存',
      discard: '放弃修改',
      saved: '已保存',
      saveFailed: '保存失败',
      labelPlaceholder: '显示名，如 主号',
      envPlaceholder: '引用名，留空自动生成（如 OPENCODE_GO_KEY_A）',
      secretPlaceholder: '粘贴 sk-... 密钥（留空则不修改）',
      envInvalidHint: '引用名不是密钥！密钥请粘贴到第三个「密钥」栏；引用名留空即可自动生成',
      strategyTitle: '切号策略',
      strategyHint: '避让：5 小时滚动窗口或每周窗口任一达到阈值即提前切走（100=仅失败时切）；连败：模型调用失败累计 N 次切号（0=关闭）。额度耗尽或凭据失效始终立即切换。',
      preemptLead: '5h/每周用量达到',
      preemptUnit: '% 自动避让',
      consecLead: '连续失败',
      consecUnit: '次切号',
      refreshing: '刷新中…',
      updatedAt: '数据更新于',
      preemptLabel: '5 小时用量达到 % 自动切号（100=仅失败时切）',
      consecLabel: '连续失败次数达到后自动切号（0=关闭）',
      consecNote: '连败切号',
      existingRowTag: '已有',
      newRowTag: '新增',
      confirmRemoveExisting: '以下已有 Key 将从池中移除：',
      activeBanner: '当前使用',
      confirmSwitch: '立即切换到该 Key？',
      confirmDisable: '停用该 Key？停用后不再参与自动切换。',
      confirmRemove: '删除该 Key？其运行状态将一并清除。',
      confirmClear: '清除失效标记？请确认已在凭据中修复该 Key。',
      actionFailed: '操作失败',
      yes: '确定',
      cancel: '取消',
      perKey: '每 Key',
      preemptNote: '预切换阈值',
      preemptOff: '失败才切',
    };
    const en = {
      nav: 'OpenCode Go Pool',
      title: 'OpenCode Go Pool',
      subtitle: 'Multi-key pool · automatic quota failover',
      loading: 'Loading…',
      loadFailed: 'Failed to load',
      paused: 'repeated failures, auto-refresh paused',
      refresh: 'Refresh',
      takeoverServing: 'Serving · opencode-go route taken over',
      takeoverOwnRoute: 'Own route mode · opencode-go-pool',
      takeoverWaiting: 'Waiting for takeover',
      takeoverWaitingHint: 'The opencode-go route is currently owned by another plugin. Remove the opencode-go row under Settings → Models and this plugin takes over automatically — existing conversations keep working unchanged.',
      noKeysTitle: 'No keys configured',
      noKeysHint: 'Each key is one OpenCode Go account. Add keys under “Key management” below; paste the literal key into the credentials page (Settings → Models, or ~/.dsh/.credentials.yaml / environment variables).',
      activeBadge: 'in use',
      idleBadge: 'idle',
      exhaustedBadge: 'quota exhausted',
      invalidBadge: 'invalid',
      disabledBadge: 'disabled',
      rolling: '5h rolling',
      weekly: 'Weekly',
      monthly: 'Monthly',
      used: 'used',
      left: 'left',
      resetsIn: 'resets',
      credentialRef: 'credential ref',
      noApiKey: 'credential not set yet',
      unauthorized: 'key rejected (401)',
      network: 'network request failed',
      badJson: 'bad JSON from the usage endpoint',
      httpError: 'usage endpoint answered HTTP {status}',
      unknown: 'unknown',
      switchNow: 'Switch now',
      disable: 'Disable',
      enable: 'Enable',
      clearInvalid: 'Clear invalid',
      lastSwitch: 'last switch',
      switchQuota: 'quota',
      switchConsecutive: 'consecutive failures',
      switchInvalid: 'credential',
      switchManual: 'manual',
      manageTitle: 'Key management',
      manageHint: 'id is auto-generated; label is the display name; paste the secret directly (empty = keep); the credential ref auto-generates when left empty.',
      addKey: 'Add key',
      remove: 'Remove',
      save: 'Save',
      discard: 'Discard',
      saved: 'Saved',
      saveFailed: 'Save failed',
      labelPlaceholder: 'display name, e.g. main',
      envPlaceholder: 'ref name, auto when empty (e.g. OPENCODE_GO_KEY_A)',
      secretPlaceholder: 'paste the sk-... secret (empty = keep)',
      envInvalidHint: 'the ref name is not the secret! Paste the secret into the third field, or leave the ref name empty to auto-generate',
      strategyTitle: 'Switching strategy',
      strategyHint: 'Avoid: switch ahead once the 5h rolling OR weekly window reaches the threshold (100=fail-only). Consecutive: switch after N accumulated call failures (0=off). Quota exhaustion or an invalid credential always switches immediately.',
      preemptLead: 'Auto-avoid at',
      preemptUnit: '% 5h/weekly usage',
      consecLead: 'switch after',
      consecUnit: 'consecutive failures',
      refreshing: 'Refreshing…',
      updatedAt: 'updated',
      preemptLabel: 'Auto-switch at 5h usage % (100=fail-only)',
      consecLabel: 'Switch after N consecutive failures (0=off)',
      consecNote: 'consec. failures',
      existingRowTag: 'existing',
      newRowTag: 'new',
      confirmRemoveExisting: 'These existing keys will be removed from the pool:',
      activeBanner: 'in use',
      confirmSwitch: 'Switch to this key now?',
      confirmDisable: 'Disable this key? It stops taking part in failover.',
      confirmRemove: 'Remove this key? Its runtime state is cleared too.',
      confirmClear: 'Clear the invalid mark? Make sure the credential is fixed first.',
      actionFailed: 'Action failed',
      yes: 'OK',
      cancel: 'Cancel',
      perKey: 'per key',
      preemptNote: 'preempt threshold',
      preemptOff: 'fail-only',
    };

    // Client-side Remote contribution. The result codecs are pass-through
    // parsers: the Host validates business results against its own zod schemas
    // before they cross the wire; this side only needs the descriptor shapes
    // to mount and call.
    const passthrough = () => ({ parse(value) { return value; } });
    // NOTE: every result codec must be strict — the generated client Remote
    // binder rejects src-json results at mount time ("has no strict codec").
    const strict = () => ({ mode: 'strict', typeSymbol: 'json', schema: passthrough() });
    const DESCRIPTOR = (method, parameters) => ({
      id: `dsh-opencode-go-pool#opencodePool/${method}`,
      service: 'opencodePool',
      namespace: 'opencodePool',
      method,
      invocation: { kind: 'direct' },
      parameters: parameters.map(p => ({ name: p, wire: p, source: 'json', codec: { mode: 'strict', typeSymbol: 'json', schema: passthrough() } })),
      result: strict(),
    });

    const TYPERT_REMOTE = {
      package: 'dsh-opencode-go-pool',
      descriptors: [
        DESCRIPTOR('status', []),
        DESCRIPTOR('setActive', ['id']),
        DESCRIPTOR('setDisabled', ['id', 'on']),
        DESCRIPTOR('clearInvalid', ['id']),
        DESCRIPTOR('putKeys', ['keys']),
        DESCRIPTOR('putKeySecret', ['id', 'secret']),
        DESCRIPTOR('putConfig', ['config']),
        DESCRIPTOR('takeOverState', []),
      ],
    };

    const styles = {
      wrap: { maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 14, padding: '8px 0' },
      title: { fontSize: 16, fontWeight: 600, margin: 0 },
      subtitle: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, margin: '2px 0 0' },
      hint: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 13, lineHeight: 1.6, margin: 0 },
      error: { color: 'var(--dsw-alias-state-error-primary)', fontSize: 13, lineHeight: 1.6, margin: 0 },
      banner: { border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-3)', borderRadius: 10, padding: '12px 14px', fontSize: 13, lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: 6 },
      bannerWarn: { borderColor: 'var(--dsw-alias-state-warning-primary, #d97706)', color: 'var(--dsw-alias-label-primary)' },
      bannerOk: { borderColor: 'var(--dsw-alias-state-business-primary)', color: 'var(--dsw-alias-label-primary)' },
      card: { border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-3)', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 },
      cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' },
      cardName: { fontSize: 14, fontWeight: 600, margin: 0 },
      cardMeta: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, margin: 0 },
      badges: { display: 'flex', gap: 6, flexWrap: 'wrap' },
      barRow: { display: 'flex', flexDirection: 'column', gap: 3 },
      barHead: { display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--dsw-alias-label-secondary)', gap: 8 },
      barTrack: { height: 8, borderRadius: 4, background: 'var(--dsw-alias-bg-layer-1)', overflow: 'hidden' },
      barFill: { height: '100%', borderRadius: 4, background: 'var(--dsw-alias-state-business-primary)', transition: 'width .2s ease' },
      actions: { display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 2 },
      button: { border: '1px solid var(--dsw-alias-border-l2)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', cursor: 'pointer', background: 'transparent', borderRadius: 6, padding: '5px 12px' },
      buttonPrimary: { border: '1px solid var(--dsw-alias-state-business-primary)', color: 'var(--dsw-alias-state-business-primary)' },
      buttonDanger: { border: '1px solid var(--dsw-alias-state-error-primary)', color: 'var(--dsw-alias-state-error-primary)' },
      buttonDisabled: { opacity: 0.45, cursor: 'not-allowed' },
      row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
      input: { flex: '1 1 160px', border: '1px solid var(--dsw-alias-border-l2)', background: 'var(--dsw-alias-bg-layer-1)', color: 'var(--dsw-alias-label-primary)', font: 'inherit', borderRadius: 6, padding: '5px 10px', minWidth: 0 },
      editorRow: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
      editorId: { color: 'var(--dsw-alias-label-tertiary)', fontSize: 12, minWidth: 110 },
      notice: { fontSize: 13, margin: 0 },
      noticeOk: { color: 'var(--dsw-alias-state-business-primary)' },
      noticeErr: { color: 'var(--dsw-alias-state-error-primary)' },
      badge: { fontSize: 11, borderRadius: 999, padding: '2px 9px', border: '1px solid transparent', whiteSpace: 'nowrap' },
    };

    const BADGE_TONE = {
      active: { bg: 'var(--dsw-alias-state-business-primary)', color: '#fff', text: t => t('activeBadge') },
      idle: { bg: 'transparent', color: 'var(--dsw-alias-label-secondary)', border: 'var(--dsw-alias-border-l2)', text: t => t('idleBadge') },
      exhausted: { bg: 'transparent', color: '#d97706', border: '#d97706', text: t => t('exhaustedBadge') },
      invalid: { bg: 'transparent', color: 'var(--dsw-alias-state-error-primary)', border: 'var(--dsw-alias-state-error-primary)', text: t => t('invalidBadge') },
      disabled: { bg: 'transparent', color: 'var(--dsw-alias-label-tertiary)', border: 'var(--dsw-alias-border-l2)', text: t => t('disabledBadge') },
    };

    // The typert client Remote wraps every result in an `{ ok, value }`
    // envelope (ok:false carries `error.message`); unwrap or throw so the
    // UI only ever sees business values.
    function unwrapRemote(result) {
      if (result && result.ok === false) {
        throw new Error((result.error && result.error.message) || 'remote failed')
      }
      return result && result.value !== undefined ? result.value : result
    }

    function badgeFor(state, active, t) {
      const kind = active && state === 'healthy' ? 'active'
        : state === 'exhausted' ? 'exhausted'
          : state === 'invalid' ? 'invalid'
            : state === 'disabled' ? 'disabled'
              : 'idle';
      const tone = BADGE_TONE[kind];
      return React.createElement('span', {
        style: { ...styles.badge, background: tone.bg, color: tone.color, borderColor: tone.border },
      }, tone.text(t));
    }

    function fmtReset(resetsAt, t, tick) {
      if (!resetsAt) return t('unknown');
      const target = new Date(resetsAt).getTime();
      if (Number.isNaN(target)) return resetsAt;
      const diff = target - tick;
      if (diff <= 0) return t('unknown');
      const totalMin = Math.floor(diff / 60000);
      if (totalMin < 60 * 24) {
        const h = Math.floor(totalMin / 60);
        const m = totalMin % 60;
        return h > 0 ? `${h}h ${m}m` : `${m}m`;
      }
      return new Date(resetsAt).toLocaleString();
    }

    function barColor(percent) {
      if (percent === null) return 'var(--dsw-alias-state-business-primary)';
      if (percent >= 100) return 'var(--dsw-alias-state-error-primary)';
      if (percent >= 90) return '#d97706';
      return 'var(--dsw-alias-state-business-primary)';
    }

    // Original "GO" mark: a G arc-with-bar plus an O ring, drawn in the same
    // 1.5px outline stroke language as the settings icon set (currentColor).
    function GoMark(props) {
      const { size } = props;
      return React.createElement('svg', {
        width: size, height: size, viewBox: '0 0 34 16', fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round',
        'aria-hidden': 'true', style: { display: 'block' },
      },
        React.createElement('path', { d: 'M 7 2.75 A 5.25 5.25 0 1 1 9.625 3.453' }),
        React.createElement('path', { d: 'M 12.25 8 H 9.5' }),
        React.createElement('circle', { cx: 27, cy: 8, r: 5.25 }),
      );
    }

    function UsageBar(props) {
      const { name, windowData, t, tick } = props;
      const percent = windowData && typeof windowData.percent === 'number' ? windowData.percent : null;
      const pct = percent === null ? 0 : Math.max(0, Math.min(100, percent));
      const left = percent === null ? t('unknown') : `${Math.max(0, 100 - percent)}%`;
      const shown = percent === null ? t('unknown') : `${percent}%`;
      return React.createElement('div', { style: styles.barRow },
        React.createElement('div', { style: styles.barHead },
          React.createElement('span', null, `${name} · ${t('used')} ${shown} / ${t('left')} ${left}`),
          React.createElement('span', null, `${t('resetsIn')}: ${fmtReset(windowData && windowData.resetsAt, t, tick)}`),
        ),
        React.createElement('div', { style: styles.barTrack },
          React.createElement('div', { style: { ...styles.barFill, width: pct + '%', background: barColor(percent) } }),
        ),
      );
    }

    function usageErrorText(code, t) {
      if (code === 'no-api-key') return t('noApiKey');
      if (code === 'unauthorized') return t('unauthorized');
      if (code === 'network') return t('network');
      if (code === 'bad-json') return t('badJson');
      if (code && code.startsWith('http-')) return t('httpError').replace('{status}', code.slice(5));
      return t('unknown');
    }

    function KeyCard(props) {
      const { item, t, tick, busy, onAction } = props;
      const usage = item.usage || {};
      const disabled = busy !== null;
      const isActive = item.active && item.state === 'healthy';
      return React.createElement('div', { style: styles.card },
        React.createElement('div', { style: styles.cardHead },
          React.createElement('div', null,
            React.createElement('h3', { style: styles.cardName }, item.label),
            React.createElement('p', { style: styles.cardMeta }, `${t('credentialRef')}: ${item.apiKeyEnv}`),
          ),
          React.createElement('div', { style: styles.badges }, badgeFor(item.state, item.active, t)),
        ),
        item.usageError
          ? React.createElement('p', { style: styles.error }, usageErrorText(item.usageError, t))
          : React.createElement(React.Fragment, null,
            React.createElement(UsageBar, { name: t('rolling'), windowData: usage.rolling, t, tick }),
            React.createElement(UsageBar, { name: t('weekly'), windowData: usage.weekly, t, tick }),
            React.createElement(UsageBar, { name: t('monthly'), windowData: usage.monthly, t, tick }),
          ),
        React.createElement('div', { style: styles.actions },
          // Manual switch only makes sense on a usable key (healthy + not
          // already active). Disabled/exhausted/invalid keys would be
          // rejected by the host ("not usable right now").
          item.state === 'healthy' && !isActive
            ? React.createElement('button', {
              style: { ...styles.button, ...styles.buttonPrimary, ...(disabled ? styles.buttonDisabled : {}) },
              disabled,
              onClick: () => onAction('setActive', item.id, t('confirmSwitch')),
            }, t('switchNow'))
            : null,
          item.state === 'disabled'
            ? React.createElement('button', {
              style: { ...styles.button, ...(disabled ? styles.buttonDisabled : {}) },
              disabled,
              onClick: () => onAction('setDisabled', item.id, null, false),
            }, t('enable'))
            : React.createElement('button', {
              style: { ...styles.button, ...(disabled ? styles.buttonDisabled : {}) },
              disabled,
              onClick: () => onAction('setDisabled', item.id, t('confirmDisable'), true),
            }, t('disable')),
          item.state === 'invalid'
            ? React.createElement('button', {
              style: { ...styles.button, ...(disabled ? styles.buttonDisabled : {}) },
              disabled,
              onClick: () => onAction('clearInvalid', item.id, t('confirmClear')),
            }, t('clearInvalid'))
            : null,
        ),
      );
    }

    function Editor(props) {
      const { draft, setDraft, t, busy, onSave, existingKeys } = props;
      const existingIds = new Set((existingKeys || []).map(k => k.id));
      const update = (index, field, value) => {
        setDraft(prev => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
      };
      const remove = (index) => {
        setDraft(prev => prev.filter((_, i) => i !== index));
      };
      const add = () => {
        setDraft(prev => [...prev, { id: 'key-' + Date.now().toString(36), label: '', apiKeyEnv: '', secret: '' }]);
      };
      const save = () => {
        const rows = draft.map(row => ({
          id: row.id,
          label: (row.label || '').trim(),
          apiKeyEnv: (row.apiKeyEnv || '').trim(),
          secret: (row.secret || '').trim(),
        }));
        for (const row of rows) {
          if (!row.label) { onSave(null, t('labelPlaceholder')); return; }
          // The secret belongs in its own field; a reference name must look
          // like an environment variable. An empty one auto-generates.
          if (row.apiKeyEnv && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(row.apiKeyEnv)) {
            onSave(null, t('envInvalidHint')); return;
          }
        }
        // Deleting an already-saved key is destructive; confirm before wiping.
        const draftIds = new Set(rows.map(r => r.id));
        const removed = (existingKeys || []).filter(k => !draftIds.has(k.id));
        if (removed.length > 0
            && typeof window !== 'undefined' && typeof window.confirm === 'function'
            && !window.confirm(`${t('confirmRemoveExisting')}\n${removed.map(k => k.label).join('、')}`)) {
          return;
        }
        onSave(rows);
      };
      return React.createElement('div', { style: styles.card },
        React.createElement('div', { style: styles.cardHead },
          React.createElement('div', null,
            React.createElement('h3', { style: styles.cardName }, t('manageTitle')),
            React.createElement('p', { style: styles.cardMeta }, t('manageHint')),
          ),
        ),
        draft.map((row, index) => React.createElement('div', { key: row.id, style: styles.editorRow },
          React.createElement('span', { style: styles.editorId },
            row.id,
            React.createElement('span', {
              style: { marginLeft: 6, opacity: 0.6, fontSize: 11 },
            }, existingIds.has(row.id) ? t('existingRowTag') : t('newRowTag')),
          ),
          React.createElement('input', {
            style: styles.input,
            placeholder: t('labelPlaceholder'),
            value: row.label,
            disabled: busy !== null,
            onChange: event => update(index, 'label', event.target.value),
          }),
          React.createElement('input', {
            style: styles.input,
            placeholder: t('envPlaceholder'),
            value: row.apiKeyEnv,
            disabled: busy !== null,
            onChange: event => update(index, 'apiKeyEnv', event.target.value),
          }),
          React.createElement('input', {
            style: styles.input,
            type: 'password',
            autoComplete: 'off',
            placeholder: t('secretPlaceholder'),
            value: row.secret,
            disabled: busy !== null,
            onChange: event => update(index, 'secret', event.target.value),
          }),
          React.createElement('button', {
            style: { ...styles.button, ...styles.buttonDanger, ...(busy !== null ? styles.buttonDisabled : {}) },
            disabled: busy !== null,
            onClick: () => remove(index),
          }, t('remove')),
        )),
        React.createElement('div', { style: styles.actions },
          React.createElement('button', { style: styles.button, disabled: busy !== null, onClick: add }, t('addKey')),
          React.createElement('button', {
            style: { ...styles.button, ...styles.buttonPrimary, ...(busy !== null ? styles.buttonDisabled : {}) },
            disabled: busy !== null,
            onClick: save,
          }, t('save')),
          React.createElement('button', {
            style: { ...styles.button, ...(busy !== null ? styles.buttonDisabled : {}) },
            disabled: busy !== null,
            onClick: () => setDraft(null),
          }, t('discard')),
        ),
      );
    }

    /** Switching-strategy form: the two configurable auto-switch rules. */
    function StrategyCard(props) {
      const { t, data, strategy, setStrategy, busy, onSave } = props;
      const value = strategy !== null
        ? strategy
        : { preempt: String(data.preemptAtPercent ?? 100), consec: String(data.switchAfterConsecutiveFailures ?? 0) };
      const update = (field, raw) => {
        const next = { ...value, [field]: raw };
        setStrategy(next);
      };
      const save = () => {
        const preempt = Number(value.preempt);
        const consec = Number(value.consec);
        if (!Number.isFinite(preempt) || preempt < 0 || preempt > 100) { onSave(null, t('preemptLabel')); return; }
        if (!Number.isFinite(consec) || consec < 0 || consec > 20) { onSave(null, t('consecLabel')); return; }
        onSave({ preemptAtPercent: preempt, switchAfterConsecutiveFailures: consec });
      };
      const rowStyle = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 13, color: 'var(--dsw-alias-label-secondary)' };
      const smallInput = { width: 64, flex: 'none' };
      return React.createElement('div', { style: styles.card },
        React.createElement('div', { style: styles.cardHead },
          React.createElement('div', null,
            React.createElement('h3', { style: styles.cardName }, t('strategyTitle')),
            React.createElement('p', { style: styles.cardMeta }, t('strategyHint')),
          ),
        ),
        React.createElement('div', { style: rowStyle },
          React.createElement('span', null, t('preemptLead')),
          React.createElement('input', {
            style: { ...styles.input, ...smallInput },
            value: value.preempt,
            disabled: busy !== null,
            onChange: event => update('preempt', event.target.value),
          }),
          React.createElement('span', null, t('preemptUnit')),
          React.createElement('span', null, t('consecLead')),
          React.createElement('input', {
            style: { ...styles.input, ...smallInput },
            value: value.consec,
            disabled: busy !== null,
            onChange: event => update('consec', event.target.value),
          }),
          React.createElement('span', null, t('consecUnit')),
          React.createElement('button', {
            style: { ...styles.button, ...styles.buttonPrimary, ...(busy !== null ? styles.buttonDisabled : {}) },
            disabled: busy !== null,
            onClick: save,
          }, t('save')),
        ),
      );
    }

    function PoolPage(props) {
      const { t, api } = props;
      const [data, setData] = React.useState(null);
      const [error, setError] = React.useState(null);
      const [failures, setFailures] = React.useState(0);
      const [pollMs, setPollMs] = React.useState(30000);
      const [tick, setTick] = React.useState(Date.now());
      const [busy, setBusy] = React.useState(null);
      const [notice, setNotice] = React.useState(null);
      const [draft, setDraft] = React.useState(null);
      const [strategy, setStrategy] = React.useState(null);
      const [refreshing, setRefreshing] = React.useState(false);
      const [loadedAt, setLoadedAt] = React.useState(null);

      const load = React.useCallback(async () => {
        setRefreshing(true);
        try {
          const remote = await api();
          if (!remote) throw new Error('opencodePool remote is unavailable');
          const result = unwrapRemote(await remote.status());
          setData(result);
          setError(null);
          setFailures(0);
          setLoadedAt(new Date());
          if (result && typeof result.usageRefreshMs === 'number' && result.usageRefreshMs > 0) {
            setPollMs(result.usageRefreshMs);
          }
        } catch (err) {
          setFailures(prev => prev + 1);
          setError(String((err && err.message) || err));
        } finally {
          setRefreshing(false);
        }
      }, [api]);

      React.useEffect(() => { load(); }, [load]);
      React.useEffect(() => {
        if (failures >= 3) return undefined;
        const timer = setInterval(() => { load(); }, pollMs);
        return () => clearInterval(timer);
      }, [load, pollMs, failures]);
      React.useEffect(() => {
        const timer = setInterval(() => setTick(Date.now()), 1000);
        return () => clearInterval(timer);
      }, []);

      const runAction = React.useCallback(async (fn, confirmText) => {
        if (confirmText && !window.confirm(confirmText)) return;
        setBusy(confirmText || 'busy');
        setNotice(null);
        try {
          const remote = await api();
          if (!remote) throw new Error('opencodePool remote is unavailable');
          await unwrapRemote(await fn(remote));
          await load();
        } catch (err) {
          setNotice({ ok: false, text: `${t('actionFailed')}: ${String((err && err.message) || err)}` });
        } finally {
          setBusy(null);
        }
      }, [api, load, t]);

      const onKeyAction = (kind, id, confirmText, extra) => {
        runAction(async remote => {
          if (kind === 'setActive') return remote.setActive(id);
          if (kind === 'setDisabled') return remote.setDisabled(id, extra !== false);
          return remote.clearInvalid(id);
        }, confirmText);
      };

      const onSaveKeys = (rows, invalidMessage) => {
        if (!rows) {
          setNotice({ ok: false, text: `${t('saveFailed')}: ${invalidMessage}` });
          return;
        }
        runAction(async remote => {
          // Persist the key list first; an empty reference name auto-generates
          // from the key id, so pasting just a label + secret always works.
          const keys = rows.map(row => ({
            id: row.id,
            label: row.label,
            apiKeyEnv: row.apiKeyEnv || 'OPENCODE_GO_KEY_' + row.id.replace(/[^A-Za-z0-9_]/g, '_').toUpperCase(),
          }));
          let result = await remote.putKeys(keys);
          if (result && result.ok === false) return result; // keep the draft on refusal
          for (const row of rows) {
            if (!row.secret) continue;
            result = await remote.putKeySecret(row.id, row.secret);
            if (result && result.ok === false) return result;
          }
          setDraft(null);
          return result;
        }, null)
          .then(() => setNotice(prev => prev && !prev.ok ? prev : { ok: true, text: t('saved') }));
      };

      const onSetStrategy = (patch) => {
        runAction(async remote => remote.putConfig(patch), null)
          .then(() => {
            setStrategy(null); // re-derive the form from the server values
            setNotice(prev => prev && !prev.ok ? prev : { ok: true, text: t('saved') });
          });
      };

      const takeover = data ? data.takeover : null;
      const keys = Array.isArray(data && data.keys) ? data.keys : [];

      return React.createElement('div', { style: styles.wrap },
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          React.createElement('div', { style: { color: 'var(--dsw-alias-state-business-primary)' } },
            React.createElement(GoMark, { size: 24 }),
          ),
          React.createElement('div', null,
            React.createElement('h2', { style: styles.title }, t('title')),
            React.createElement('p', { style: styles.subtitle }, t('subtitle')),
          ),
        ),
        data === null && !error
          ? React.createElement('p', { style: styles.hint }, t('loading'))
          : null,
        error
          ? React.createElement('div', { style: styles.banner },
            React.createElement('p', { style: styles.error }, `${t('loadFailed')}: ${error}`),
            failures >= 3 ? React.createElement('p', { style: styles.hint }, t('paused')) : null,
            React.createElement('button', { style: styles.button, onClick: () => { setFailures(0); load(); } }, t('refresh')),
          )
          : null,
        data === null
          ? null
          : React.createElement(React.Fragment, null,
            React.createElement('div', { style: { ...styles.banner, ...(takeover === 'waiting' ? styles.bannerWarn : styles.bannerOk) } },
              React.createElement('p', { style: { margin: 0, fontWeight: 600 } },
                takeover === 'serving' ? t('takeoverServing')
                  : takeover === 'own-route' ? t('takeoverOwnRoute') : t('takeoverWaiting')),
              takeover === 'waiting'
                ? React.createElement('p', { style: styles.hint }, data.takeoverHint ? `${t('takeoverWaitingHint')} ${data.takeoverHint}` : t('takeoverWaitingHint'))
                : null,
              data.activeId
                ? React.createElement('p', { style: styles.hint },
                    `${t('activeBanner')}: ${data.activeId} · ${t('preemptNote')}: ${data.preemptAtPercent >= 100 ? t('preemptOff') : data.preemptAtPercent + '%'} · ${t('consecNote')}: ${data.switchAfterConsecutiveFailures > 0 ? data.switchAfterConsecutiveFailures : t('preemptOff')}`)
                : null,
              data.lastSwitch
                ? React.createElement('p', { style: styles.hint }, `${t('lastSwitch')}: ${data.lastSwitch.from ?? '—'} → ${data.lastSwitch.to ?? '—'} (${data.lastSwitch.reason === 'quota' ? t('switchQuota') : data.lastSwitch.reason === 'invalid' ? t('switchInvalid') : data.lastSwitch.reason === 'consecutive' ? t('switchConsecutive') : t('switchManual')}) @ ${new Date(data.lastSwitch.at).toLocaleString()}`)
                : null,
              keys.length > 0 && data.activeId === null
                ? React.createElement('p', { style: styles.error }, t('noKeysHint'))
                : null,
            ),
            keys.length > 0
              ? React.createElement(StrategyCard, {
                  t, data, strategy, setStrategy, busy,
                  onSave: (patch, invalidMessage) => {
                    if (!patch) {
                      setNotice({ ok: false, text: `${t('saveFailed')}: ${invalidMessage}` });
                      return;
                    }
                    onSetStrategy(patch);
                  },
                })
              : null,
            keys.length === 0 && takeover !== 'waiting'
              ? React.createElement('div', { style: styles.banner },
                React.createElement('p', { style: { margin: 0, fontWeight: 600 } }, t('noKeysTitle')),
                React.createElement('p', { style: styles.hint }, t('noKeysHint')),
              )
              : null,
            keys.map(item => React.createElement(KeyCard, {
              key: item.id, item, t, tick, busy,
              onAction: onKeyAction,
            })),
            draft === null
              ? React.createElement('button', {
                style: styles.button,
                disabled: busy !== null,
                onClick: () => setDraft(keys.map(k => ({ id: k.id, label: k.label, apiKeyEnv: k.apiKeyEnv, secret: '' }))),
              }, t('manageTitle'))
              : React.createElement(Editor, { draft, setDraft, t, busy, onSave: onSaveKeys, existingKeys: keys }),
            notice
              ? React.createElement('p', { style: { ...styles.notice, ...(notice.ok ? styles.noticeOk : styles.noticeErr) } }, notice.text)
              : null,
            React.createElement('div', { style: styles.actions },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
                React.createElement('button', { style: styles.button, disabled: busy !== null || refreshing, onClick: load }, refreshing ? t('refreshing') : t('refresh')),
                loadedAt
                  ? React.createElement('span', { style: { fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, `${t('updatedAt')} ${loadedAt.toLocaleTimeString()}`)
                  : null,
              ),
            ),
          ),
      );
    }

    // The nav-row sparkle mark: same geometry as the shell's IconSparkle16,
    // so the sidebar entry matches the built-in icon language exactly. The
    // shell hardcodes a gear for unknown section ids; a one-line injected
    // rule hides it for OUR row only (graceful: without :has() support the
    // row just shows both icons).
    function SparkleNavMark(props) {
      const { className } = props;
      return React.createElement('svg', {
        width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none',
        className, 'aria-hidden': 'true',
        style: { display: 'inline-block', flex: 'none', marginRight: 8, verticalAlign: '-3px' },
      },
        React.createElement('path', { d: 'M6.1 3.1Q6.6 7.8 11.3 8.3Q6.6 8.8 6.1 13.5Q5.6 8.8 0.9 8.3Q5.6 7.8 6.1 3.1Z', fill: 'currentColor' }),
        React.createElement('path', { d: 'M11.9 1Q12.2 3.7 14.9 4Q12.2 4.3 11.9 7Q11.6 4.3 8.9 4Q11.6 3.7 11.9 1Z', fill: 'currentColor' }),
        React.createElement('path', { d: 'M12.5 9.4Q12.7 11.4 14.7 11.6Q12.7 11.8 12.5 13.8Q12.3 11.8 10.3 11.6Q12.3 11.4 12.5 9.4Z', fill: 'currentColor' }),
      );
    }

    function navLabel(t) {
      return React.createElement(React.Fragment, null,
        React.createElement(SparkleNavMark, { className: 'dsh-ogp-nav-mark' }),
        React.createElement('span', null, t('nav')),
      );
    }

    function injectNavStyle() {
      if (typeof document === 'undefined') return;
      if (document.getElementById('dsh-ogp-nav-style')) return;
      const style = document.createElement('style');
      style.id = 'dsh-ogp-nav-style';
      // Hide the shell's default gear icon on our nav row only.
      style.textContent = 'button:has(.dsh-ogp-nav-mark) > svg { display: none; }';
      document.head.appendChild(style);
    }

    function apply(ctx) {
      const mountReady = ctx.remote.$mount(TYPERT_REMOTE);
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-opencode-go-pool: dictionaries');
      const t = ctx.locale.bind(NS);
      injectNavStyle();

      const api = async () => {
        await mountReady;
        const remote = ctx.get('remote.opencodePool');
        return remote || null;
      };
      const injected = () => ({ t, api });

      // Error boundary: any render crash inside the page becomes a VISIBLE
      // diagnostic instead of a blank content column, so problems self-report.
      class PoolPageBoundary extends React.Component {
        constructor(props) {
          super(props);
          this.state = { error: null };
        }
        static getDerivedStateFromError(error) {
          return { error };
        }
        render() {
          if (this.state.error !== null) {
            const err = this.state.error;
            return React.createElement('div', {
              style: {
                padding: 16,
                border: '1px solid var(--dsw-alias-state-error-primary)',
                borderRadius: 10,
                color: 'var(--dsw-alias-state-error-primary)',
                fontSize: 13,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              },
            },
              React.createElement('p', { style: { margin: 0, fontWeight: 600 } }, 'OpenCode Go 套餐池 · 渲染异常'),
              React.createElement('p', { style: { margin: '8px 0 0' } }, String((err && err.message) || err)),
              React.createElement('p', { style: { margin: '8px 0 0', opacity: 0.75 } }, String((err && err.stack) || '').slice(0, 1200)),
            );
          }
          return React.createElement(PoolPage, this.props);
        }
      }

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'opencode-go-pool',
        order: 41,
        label: () => {
          try {
            return navLabel(t);
          } catch {
            // Degrade to plain text if the shell ever rejects element labels.
            return t('nav');
          }
        },
        locale: NS,
        inject: injected,
      }, PoolPageBoundary));
    }

    exports.NS = NS;
    exports.apply = apply;
    exports.inject = inject;
    // Render-path test hooks (unused by the runtime; see test/client.test.mjs).
    exports.__test = { KeyCard, UsageBar, badgeFor, fmtReset, usageErrorText, PoolPage, GoMark, TYPERT_REMOTE, unwrapRemote };
    return module.exports;
  }
});
