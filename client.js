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
      switchInvalid: '凭据失效',
      switchManual: '手动',
      manageTitle: 'Key 管理',
      manageHint: 'id 自动生成；label 为显示名；凭据引用对应凭据页中的环境变量名。',
      addKey: '添加 Key',
      remove: '删除',
      save: '保存',
      discard: '放弃修改',
      saved: '已保存',
      saveFailed: '保存失败',
      labelPlaceholder: '显示名，如 主号',
      envPlaceholder: '如 OPENCODE_GO_KEY_A',
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
      switchInvalid: 'credential',
      switchManual: 'manual',
      manageTitle: 'Key management',
      manageHint: 'id is auto-generated; label is the display name; the credential ref names the environment entry on the credentials page.',
      addKey: 'Add key',
      remove: 'Remove',
      save: 'Save',
      discard: 'Discard',
      saved: 'Saved',
      saveFailed: 'Save failed',
      labelPlaceholder: 'display name, e.g. main',
      envPlaceholder: 'e.g. OPENCODE_GO_KEY_A',
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
    const DESCRIPTOR = (method, parameters, result) => ({
      id: `dsh-opencode-go-pool#opencodePool/${method}`,
      service: 'opencodePool',
      namespace: 'opencodePool',
      method,
      invocation: { kind: 'direct' },
      parameters: parameters.map(p => ({ name: p, wire: p, source: 'json', codec: { mode: 'strict', typeSymbol: 'json', schema: passthrough() } })),
      result,
    });
    const strict = () => ({ mode: 'strict', typeSymbol: 'json', schema: passthrough() });
    const srcJson = () => ({ mode: 'src-json' });

    const TYPERT_REMOTE = {
      package: 'dsh-opencode-go-pool',
      descriptors: [
        DESCRIPTOR('status', [], strict()),
        DESCRIPTOR('setActive', ['id'], srcJson()),
        DESCRIPTOR('setDisabled', ['id', 'on'], srcJson()),
        DESCRIPTOR('clearInvalid', ['id'], srcJson()),
        DESCRIPTOR('putKeys', ['keys'], srcJson()),
        DESCRIPTOR('takeOverState', [], srcJson()),
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
          isActive
            ? null
            : React.createElement('button', {
              style: { ...styles.button, ...styles.buttonPrimary, ...(disabled ? styles.buttonDisabled : {}) },
              disabled,
              onClick: () => onAction('setActive', item.id, t('confirmSwitch')),
            }, t('switchNow')),
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
      const { draft, setDraft, t, busy, onSave } = props;
      const update = (index, field, value) => {
        setDraft(prev => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
      };
      const remove = (index) => {
        setDraft(prev => prev.filter((_, i) => i !== index));
      };
      const add = () => {
        setDraft(prev => [...prev, { id: 'key-' + Date.now().toString(36), label: '', apiKeyEnv: '' }]);
      };
      const save = () => {
        const rows = draft.map(row => ({ id: row.id, label: row.label.trim(), apiKeyEnv: row.apiKeyEnv.trim() }));
        for (const row of rows) {
          if (!row.label) { onSave(null, t('labelPlaceholder')); return; }
          if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(row.apiKeyEnv)) { onSave(null, t('envPlaceholder')); return; }
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
          React.createElement('span', { style: styles.editorId }, row.id),
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

      const load = React.useCallback(async () => {
        try {
          const remote = await api();
          if (!remote) throw new Error('opencodePool remote is unavailable');
          const result = await remote.status();
          setData(result);
          setError(null);
          setFailures(0);
          if (result && typeof result.usageRefreshMs === 'number' && result.usageRefreshMs > 0) {
            setPollMs(result.usageRefreshMs);
          }
        } catch (err) {
          setFailures(prev => prev + 1);
          setError(String((err && err.message) || err));
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
          await fn(remote);
          await load();
        } catch (err) {
          setNotice({ ok: false, text: `${t('actionFailed')}: ${String((err && err.message) || err)}` });
        } finally {
          setBusy(null);
        }
      }, [api, load, t]);

      const onKeyAction = (kind, id, confirmText, extra) => {
        runAction(async remote => {
          if (kind === 'setActive') await remote.setActive(id);
          else if (kind === 'setDisabled') await remote.setDisabled(id, extra !== false);
          else if (kind === 'clearInvalid') await remote.clearInvalid(id);
        }, confirmText);
      };

      const onSaveKeys = (rows, invalidMessage) => {
        if (!rows) {
          setNotice({ ok: false, text: `${t('saveFailed')}: ${invalidMessage}` });
          return;
        }
        runAction(async remote => { await remote.putKeys(rows); setDraft(null); }, null)
          .then(() => setNotice(prev => prev && !prev.ok ? prev : { ok: true, text: t('saved') }));
      };

      const takeover = data ? data.takeover : null;
      const keys = data ? data.keys : [];

      return React.createElement('div', { style: styles.wrap },
        React.createElement('h2', { style: styles.title }, t('title')),
        React.createElement('p', { style: styles.subtitle }, t('subtitle')),
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
                ? React.createElement('p', { style: styles.hint }, `${t('activeBadge')}: ${data.activeId} · ${t('preemptNote')}: ${data.preemptAtPercent >= 100 ? t('preemptOff') : data.preemptAtPercent + '%'}`)
                : null,
              data.lastSwitch
                ? React.createElement('p', { style: styles.hint }, `${t('lastSwitch')}: ${data.lastSwitch.from ?? '—'} → ${data.lastSwitch.to ?? '—'} (${data.lastSwitch.reason === 'quota' ? t('switchQuota') : data.lastSwitch.reason === 'invalid' ? t('switchInvalid') : t('switchManual')}) @ ${new Date(data.lastSwitch.at).toLocaleString()}`)
                : null,
              keys.length > 0 && data.activeId === null
                ? React.createElement('p', { style: styles.error }, t('noKeysHint'))
                : null,
            ),
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
                onClick: () => setDraft(keys.map(k => ({ id: k.id, label: k.label, apiKeyEnv: k.apiKeyEnv }))),
              }, t('manageTitle'))
              : React.createElement(Editor, { draft, setDraft, t, busy, onSave: onSaveKeys }),
            notice
              ? React.createElement('p', { style: { ...styles.notice, ...(notice.ok ? styles.noticeOk : styles.noticeErr) } }, notice.text)
              : null,
            React.createElement('div', { style: styles.actions },
              React.createElement('button', { style: styles.button, disabled: busy !== null, onClick: load }, t('refresh')),
            ),
          ),
      );
    }

    function apply(ctx) {
      const mountReady = ctx.remote.$mount(TYPERT_REMOTE);
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-opencode-go-pool: dictionaries');
      const t = ctx.locale.bind(NS);

      const api = async () => {
        await mountReady;
        const remote = ctx.get('remote.opencodePool');
        return remote || null;
      };
      const injected = () => ({ t, api });

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'opencode-go-pool',
        order: 41,
        label: () => t('nav'),
        locale: NS,
        inject: injected,
      }, PoolPage));
    }

    exports.NS = NS;
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
