'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require poll';
'require ui';

var callStatus  = rpc.declare({ object: 'drcom', method: 'status',  expect: { '': {} } });
var callLogAuto = rpc.declare({ object: 'drcom', method: 'log',     expect: { '': {} } });
var callLogOp   = rpc.declare({ object: 'drcom', method: 'oplog',   expect: { '': {} } });
var callDevices = rpc.declare({ object: 'drcom', method: 'devices', expect: { '': {} } });
var callOnline  = rpc.declare({ object: 'drcom', method: 'online',  expect: { '': {} } });
var callOffline = rpc.declare({ object: 'drcom', method: 'offline', expect: { '': {} } });
var callRelogin = rpc.declare({ object: 'drcom', method: 'relogin', expect: { '': {} } });
var callRestart = rpc.declare({ object: 'drcom', method: 'restart', expect: { '': {} } });
var callKick    = rpc.declare({ object: 'drcom', method: 'kick',    params: [ 'mac' ], expect: { '': {} } });
var callUnkick  = rpc.declare({ object: 'drcom', method: 'unkick',  params: [ 'mac' ], expect: { '': {} } });
var callStart   = rpc.declare({ object: 'drcom', method: 'start',   expect: { '': {} } });
var callStop    = rpc.declare({ object: 'drcom', method: 'stop',    expect: { '': {} } });

var TERM_NAMES = {
	'0': '未知',
	'1': 'PC（占用电脑槽位）',
	'2': '手机（占用移动终端槽位）',
	'3': '平板 · 横屏',
	'4': '平板 · 竖屏'
};

// 状态 5 秒一轮；日志与设备列表每 3 轮（15 秒）拉一次，减少无谓开销
var SLOW_EVERY = 3;

// 布局全部交给 CSS 类，便于随容器宽度自适应；LuCI 主题自带的 .cbi-section 没有水平内边距
var CSS = [
	'.drcom-body{padding:0 16px 14px}',
	'.drcom-kv{display:flex;flex-wrap:wrap;gap:2px 14px;padding:8px 0;border-bottom:1px solid rgba(128,128,128,.18)}',
	'.drcom-kv:last-child{border-bottom:none}',
	'.drcom-kv-l{flex:0 0 96px;max-width:40%;opacity:.72;font-size:13px}',
	'.drcom-kv-v{flex:1 1 180px;min-width:0;font-size:13px;word-break:break-all}',
	'.drcom-btns{display:flex;flex-wrap:wrap;gap:8px}',
	'.drcom-note{margin:10px 0 0;font-size:12px;opacity:.7;line-height:1.6}',
	'.drcom-warn{margin:10px 0 0;font-size:12px;line-height:1.6;color:#ef6c00}',
	'.drcom-log{max-height:300px;overflow:auto;padding:10px;margin:0;background:rgba(127,127,127,.1);border-radius:4px;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-all}',
	'.drcom-dev{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 10px;padding:7px 0;border-bottom:1px solid rgba(128,128,128,.18);font-size:13px}',
	'.drcom-dev:last-child{border-bottom:none}',
	'.drcom-dev-name{flex:1 1 130px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
	'.drcom-dev-ip{flex:0 0 auto;opacity:.8;font-variant-numeric:tabular-nums}',
	'.drcom-dev-mac{flex:0 0 auto;opacity:.5;font-size:11px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}',
	'.drcom-dev-tag{flex:0 0 auto;font-size:11px;padding:1px 7px;border-radius:9px;background:rgba(128,128,128,.14);white-space:nowrap}',
	'.drcom-tag-on{background:rgba(46,125,50,.16);color:#2e7d32}',
	'.drcom-tag-block{background:rgba(198,40,40,.14);color:#c62828}',
	'.drcom-dev-away{opacity:.45}',
	'.drcom-dev-btn{flex:0 0 auto;padding:0 8px !important;min-height:24px !important;line-height:22px !important;font-size:12px !important}',
	'.drcom-dev-count{font-size:12px;opacity:.65}',
	'.drcom-refresh{font-size:12px !important;padding:0 10px !important;min-height:24px !important;line-height:22px !important}',
	'.drcom-tabs{display:flex;gap:6px;margin:0 0 8px}',
	'.drcom-tab{font-size:12px;padding:2px 10px;border-radius:10px;border:1px solid rgba(128,128,128,.35);background:transparent;cursor:pointer;color:inherit}',
	'.drcom-tab-on{background:rgba(90,110,190,.14);border-color:rgba(90,110,190,.45)}',
	// 总开关停用时，让下面这些操作整体变灰且不可点
	'.drcom-off .cbi-button,.drcom-off .drcom-tab{opacity:.45;pointer-events:none}',
	'.drcom-master{margin:0}',
	'.drcom-form .cbi-section{padding-bottom:12px}',
	'@media (max-width:560px){.drcom-kv-l{flex:0 0 100%;max-width:none}}'
].join('\n');

// title 可以是字符串，也可以是节点数组（例如标题后面跟一个状态徽标）
function section(title, children) {
	return E('div', { 'class': 'cbi-section' }, [
		E('h3', {}, title),
		E('div', { 'class': 'drcom-body' }, children)
	]);
}

function kv(label, valueNode) {
	return E('div', { 'class': 'drcom-kv' }, [
		E('div', { 'class': 'drcom-kv-l' }, label),
		E('div', { 'class': 'drcom-kv-v' }, valueNode)
	]);
}

// 相对时间：最后在线多久之前
function relTime(ts) {
	var d = Math.floor(Date.now() / 1000) - ts;
	if (d < 60)
		return '1 分钟内';
	if (d < 3600)
		return Math.floor(d / 60) + ' 分钟前';
	if (d < 86400)
		return Math.floor(d / 3600) + ' 小时前';
	return Math.floor(d / 86400) + ' 天前';
}

return view.extend({
	load: function() {
		// 这里只读配置。状态与日志放到 render 之后串行拉取：
		// 同时并发多个 RPC 会被 LuCI 合批，实测三个一起发时 Promise 不落地，
		// 页面会一直停在「正在载入视图」。
		return uci.load('drcom');
	},

	render: function() {
		var tick = 0;          // 轮询计数，用来降低日志/设备列表刷新频率
		var lastLog = null;    // 上一次日志内容，没变就不重绘（否则会把滚动位置拽回去）
		var logKind = 'auto';  // 'auto' 自动认证日志 / 'op' 手动操作日志

		var badge = E('span', {
			'style': 'display:inline-block;padding:2px 10px;border-radius:10px;color:#fff;font-size:12px;background:#666'
		}, '…');

		var vUplink  = E('span', {}, '—');
		var vIp      = E('span', {}, '—');
		var vAccount = E('span', {}, '—');
		var vServer  = E('span', {}, '—');
		var vTerm    = E('span', {}, '—');
		var vAge     = E('span', {}, '—');
		var vError   = E('span', {}, '—');
		var warnEl   = E('p', { 'class': 'drcom-warn', 'style': 'display:none' }, '');

		// 总开关状态（由 applyStatus 更新）
		var masterOn = true;
		var masterBadge = E('span', { 'class': 'drcom-dev-tag drcom-tag-on' }, '运行中');
		var masterBtn = E('button', { 'class': 'cbi-button cbi-button-reset' }, '停用插件');
		var actionsBox = null;   // 在下面创建后赋给，用于停用时置灰
		var devicesBox = null;
		masterBtn.addEventListener('click', function(ev) {
			ev.preventDefault();
			masterBtn.disabled = true;
			var fn = masterOn ? callStop : callStart;

			fn().then(function(r) {
				ui.addNotification(null, E('p', {}, (r && r.message) ? r.message : '已执行'));
				return refresh(true);
			}).catch(function(e) {
				ui.addNotification(null, E('p', {}, '操作失败：' + e.message));
			}).finally(function() {
				masterBtn.disabled = false;
			});
		});

		function setMasterUi() {
			masterBadge.textContent = masterOn ? '运行中' : '已停用';
			masterBadge.className = 'drcom-dev-tag ' + (masterOn ? 'drcom-tag-on' : '');
			masterBtn.textContent = masterOn ? '停用插件' : '启用插件';
			masterBtn.className = 'cbi-button ' + (masterOn ? 'cbi-button-reset' : 'cbi-button-apply');
			if (actionsBox)
				actionsBox.classList.toggle('drcom-off', !masterOn);
			if (devicesBox)
				devicesBox.classList.toggle('drcom-off', !masterOn);
		}

		function applyStatus(s) {
			// 首屏还没拿到真实状态时不要把 badge 写成「服务未运行」，那会误报成故障
			if (!s || s.running === undefined)
				return;

			var running    = parseInt(s.running) == 1;
			var online     = parseInt(s.online) == 1;
			var paused     = parseInt(s.paused) == 1;
			var held       = parseInt(s.hold) == 1;
			var fails      = parseInt(s.fails) || 0;
			var enabled    = parseInt(s.enabled) == 1;
			var configured = parseInt(s.configured) == 1;
			var offline    = paused && (!s.ip || s.ip == '-');

			var text, color;

			// 「已禁用」优先于「服务未运行」：禁用时服务本来就不会启动，
			// 先判 running 的话用户只会看到一片红色错误。
			if (!enabled)          { text = '已停用 · 插件不工作';       color = '#616161'; }
			else if (!running)     { text = '服务未运行';              color = '#c62828'; }
			else if (!configured)  { text = '未配置账号';              color = '#ef6c00'; }
			else if (offline)      { text = '已下线 · 上行已断开';     color = '#616161'; }
			else if (held)         { text = '已暂停 · 连续认证失败';   color = '#ef6c00'; }
			else if (paused)       { text = '已暂停 · 不再自动登录';   color = '#ef6c00'; }
			else if (online)       { text = '已认证 · 可上网';         color = '#2e7d32'; }
			else                   { text = '运行中 · 未认证';       color = '#ef6c00'; }

			badge.textContent = text;
			badge.style.background = color;

			vUplink.textContent  = (s.uplink && s.uplink != '-') ? s.uplink : '—';
			vIp.textContent      = (s.ip && s.ip != '-') ? s.ip : '未获取';
			vAccount.textContent = s.account || '未配置';
			vServer.textContent  = s.server ? (s.server + ':' + (s.port || '801')) : '—';
			vTerm.textContent    = TERM_NAMES[String(s.terminal)] || '—';

			var age = parseInt(s.age);
			vAge.textContent = (isNaN(age) || age < 0) ? '—' : (age + ' 秒前');

			vError.textContent = s.last_error
				? (s.last_error + (fails > 1 ? '（已连续失败 ' + fails + ' 次）' : ''))
				: '—';

			if (held) {
				warnEl.textContent = '连续认证失败 ' + fails + ' 次，已暂停自动重试以免账号被风控。'
					+ '请检查账号、密码或运营商后缀，改好后点下面的「立即重新认证」。';
				warnEl.style.display = '';
			}
			else {
				warnEl.style.display = 'none';
			}

			// 总开关：控制下方操作区与设备操作是否可用
			masterOn = enabled;
			setMasterUi();
		}

		function applyLog(lg) {
			var text = (lg && lg.lines && lg.lines.length)
				? lg.lines.join('\n')
				: '（暂无日志）';

			if (text === lastLog)
				return;

			// 用户正在往下翻日志时，别每轮都把他拽回顶部
			var atBottom = logPre.scrollTop + logPre.clientHeight >= logPre.scrollHeight - 4;
			var prevTop = logPre.scrollTop;

			lastLog = text;
			logPre.textContent = text;
			logPre.scrollTop = atBottom ? logPre.scrollHeight : prevTop;
		}

		function kickDevice(x) {
			var label = x.name || x.ip || x.mac;
			var ok = window.confirm('断开「' + label + '」？\n\n'
				+ '会阻断它的网络访问 5 分钟（到期自动解除，也可以点「解除」立即恢复）。\n'
				+ '设备可能仍显示已连接 WiFi，但无法上网。\n'
				+ '如果这是你正在用的这台设备，阻断期间将无法访问本页面。');
			if (!ok)
				return;

			callKick(x.mac).then(function(r) {
				ui.addNotification(null, E('p', {}, (r && r.message) ? r.message : '已断开'));
				return refresh(true);
			}).catch(function(e) {
				ui.addNotification(null, E('p', {}, '操作失败：' + e.message));
			});
		}

		function unkickDevice(x) {
			callUnkick(x.mac).then(function(r) {
				ui.addNotification(null, E('p', {}, (r && r.message) ? r.message : '已解除阻断'));
				return refresh(true);
			}).catch(function(e) {
				ui.addNotification(null, E('p', {}, '操作失败：' + e.message));
			});
		}

		function applyDevices(d) {
			var list = (d && d.devices) || [];

			while (devList.firstChild)
				devList.removeChild(devList.firstChild);

			if (!list.length) {
				devCount.textContent = '0 台';
				devList.appendChild(E('p', { 'class': 'drcom-note' }, '当前没有已连接的设备。'));
				return;
			}

			var online = 0;
			list.forEach(function(x) {
				if (parseInt(x.online) == 1)
					online++;
			});
			devCount.textContent = online + ' / ' + list.length + ' 台在线';

			// 在线的排前面，其次阻断的，最后离线的
			list.sort(function(a, b) {
				var sa = (parseInt(a.online) || 0) * 2 + (parseInt(a.blocked) || 0);
				var sb = (parseInt(b.online) || 0) * 2 + (parseInt(b.blocked) || 0);
				return sb - sa;
			});

			list.forEach(function(x) {
				var on = parseInt(x.online) == 1;
				var wifi = parseInt(x.wireless) == 1;
				var blocked = parseInt(x.blocked) == 1;
				var left = parseInt(x.block_left) || 0;
				var seen = parseInt(x.last_seen) || 0;

				var statusText, statusCls;
				if (blocked) {
					statusText = '已阻断 ' + Math.max(1, Math.ceil(left / 60)) + ' 分钟';
					statusCls = 'drcom-tag-block';
				}
				else if (on) {
					statusText = '在线';
					statusCls = 'drcom-tag-on';
				}
				else {
					statusText = seen > 0 ? ('离线 · ' + relTime(seen)) : '离线';
					statusCls = '';
				}

				var actBtn = blocked
					? E('button', { 'class': 'cbi-button cbi-button-action drcom-dev-btn' }, '解除')
					: E('button', { 'class': 'cbi-button cbi-button-reset drcom-dev-btn' }, '断开');

				// 直接用 addEventListener，不依赖 E() 对事件属性的处理
				actBtn.addEventListener('click', function(ev) {
					ev.preventDefault();
					if (blocked)
						unkickDevice(x);
					else
						kickDevice(x);
				});

				devList.appendChild(E('div', {
					'class': 'drcom-dev' + ((!on && !blocked) ? ' drcom-dev-away' : '')
				}, [
					E('span', { 'class': 'drcom-dev-name' }, x.name || '未知设备'),
					E('span', { 'class': 'drcom-dev-ip' }, x.ip || '—'),
					E('span', { 'class': 'drcom-dev-mac' }, x.mac || ''),
					E('span', { 'class': 'drcom-dev-tag' }, wifi ? 'WiFi' : '有线'),
					E('span', { 'class': 'drcom-dev-tag ' + statusCls }, statusText),
					actBtn
				]));
			});
		}

		function fetchLog() {
			return (logKind == 'op' ? callLogOp() : callLogAuto())
				.then(applyLog).catch(function() {});
		}

		// 严格串行：先状态，再设备、最后日志。并发 RPC 在 LuCI 26 上会卡住页面。
		// 设备列表放在日志前面：日志要读 80 行，慢的时候会让设备区一直停在「加载中」。
		// force=true 用于手动刷新与按钮操作后立刻拉一遍。
		function refresh(force) {
			var wantSlow = (force === true) || (tick % SLOW_EVERY) === 0;
			tick++;

			return callStatus().then(function(st) {
				applyStatus(st);
			}).catch(function() {
				badge.textContent = '状态获取失败';
				badge.style.background = '#c62828';
			}).then(function() {
				if (!wantSlow)
					return null;
				return callDevices().then(applyDevices).catch(function() {}).then(fetchLog);
			});
		}

		function actionBtn(label, cls, fn) {
			var btn = E('button', { 'class': 'cbi-button ' + cls }, label);

			btn.addEventListener('click', function(ev) {
				ev.preventDefault();
				btn.disabled = true;

				return fn().then(function(r) {
					ui.addNotification(null, E('p', {}, (r && r.message) ? r.message : '已执行'));
					// 操作后立刻刷新，日志与设备列表不用等下一个 15 秒周期
					return refresh(true);
				}).catch(function(e) {
					ui.addNotification(null, E('p', {}, '操作失败：' + e.message));
				}).finally(function() {
					btn.disabled = false;
				});
			});

			return btn;
		}

		var masterBox = section([
			E('span', {}, '插件总开关'), ' ', masterBadge
		], [
			E('div', { 'class': 'drcom-btns drcom-master' }, [ masterBtn ]),
			E('p', { 'class': 'drcom-note' },
				'停用后插件完全停止：不再探测、不再认证、不会去动上行接口，也不会在接口拨起时做任何事。'
				+ '改用 USB CPE 等其它上行时请关掉，避免两个网络互相抢。')
		]);

		var statusBox = section([
			E('span', {}, '当前状态'), ' ', badge
		], [
			kv('上行接口', vUplink),
			kv('本机 IP', vIp),
			kv('认证账号', vAccount),
			kv('终端类型', vTerm),
			kv('认证服务器', vServer),
			kv('状态更新', vAge),
			kv('最近错误', vError),
			warnEl
		]);

		actionsBox = section('手动操作', [
			E('div', { 'class': 'drcom-btns' }, [
				actionBtn('上线（拉起上行）', 'cbi-button-apply', callOnline),
				actionBtn('立即重新认证', 'cbi-button-action', callRelogin),
				actionBtn('下线路由器', 'cbi-button-reset', callOffline),
				actionBtn('重启服务', 'cbi-button-action', callRestart)
			]),
			E('p', { 'class': 'drcom-note' },
				'「立即重新认证」只重新走一次认证，不动接口；「下线路由器」会断开本机上行并暂停自动认证'
				+ '（重启路由器后仍保持暂停），只作用于这台路由器，不会波及同账号的手机等其他设备。')
		]);

		var devCount = E('span', { 'class': 'drcom-dev-count' }, '…');
		var devList = E('div', {}, E('p', { 'class': 'drcom-note' }, '（加载中…）'));

		var devReload = E('button', { 'class': 'cbi-button cbi-button-action drcom-refresh' }, '刷新');
		devReload.addEventListener('click', function(ev) {
			ev.preventDefault();
			devReload.disabled = true;
			refresh(true).finally(function() { devReload.disabled = false; });
		});

		devicesBox = section([
			E('span', {}, '当前连接设备'), ' ', devCount, ' ', devReload
		], [
			devList,
			E('p', { 'class': 'drcom-note' },
				'「断开」会阻断该设备的网络访问 5 分钟（到期自动解除，点「解除」立即恢复），期间设备可能仍显示已连接 WiFi。'
				+ '请勿对自己正在使用的设备操作。离线状态以无线连接、ARP 邻居为准。')
		]);

		var logPre = E('pre', { 'class': 'drcom-log' }, '（加载中…）');

		var tabAuto = E('button', { 'class': 'drcom-tab drcom-tab-on' }, '自动认证');
		var tabOp = E('button', { 'class': 'drcom-tab' }, '手动操作');

		function renderTabs() {
			tabAuto.className = 'drcom-tab' + (logKind == 'auto' ? ' drcom-tab-on' : '');
			tabOp.className = 'drcom-tab' + (logKind == 'op' ? ' drcom-tab-on' : '');
		}

		function switchLog(kind) {
			if (kind == logKind)
				return;
			logKind = kind;
			lastLog = null;
			renderTabs();
			logPre.textContent = '（切换中…）';
			// 切日志只重拉日志，不必动状态与设备
			fetchLog();
		}

		tabAuto.addEventListener('click', function(ev) { ev.preventDefault(); switchLog('auto'); });
		tabOp.addEventListener('click', function(ev) { ev.preventDefault(); switchLog('op'); });

		var logBox = section('实时日志', [
			E('div', { 'class': 'drcom-tabs' }, [ tabAuto, tabOp ]),
			logPre
		]);

		var m = new form.Map('drcom', _('Dr.COM 校园网认证'),
			_('路由器自动完成校园网 Portal 认证，供接入本机的设备共享上网。修改后保存，最多 60 秒自动生效；需要立刻生效请点上方「重启服务」。'));

		var s = m.section(form.NamedSection, 'main', 'drcom');
		s.anonymous = true;
		s.addremove = false;

		var o = s.option(form.Value, 'username', _('账号'));
		o.placeholder = _('校园网账号');
		o.rmempty = false;

		o = s.option(form.Value, 'password', _('密码'));
		o.password = true;
		o.rmempty = false;

		o = s.option(form.ListValue, 'carrier', _('运营商'), _('校园移动 / 校园用户不需要后缀。'));
		o.value('', _('校园移动 / 校园用户'));
		o.value('@dx', _('校园电信 (@dx)'));
		o.value('@lt', _('校园联通 (@lt)'));

		o = s.option(form.ListValue, 'terminal_type', _('终端类型'),
			_('决定后台把这台路由器算作哪类设备。校园网通常限「1 台 PC + 1 台移动终端」：选手机就会去抢手机的槽位。修改后要重新认证才会生效。'));
		o.value('1', _('PC（默认 · 占电脑槽位）'));
		o.value('2', _('手机（占移动终端槽位）'));
		o.value('3', _('平板 · 横屏'));
		o.value('4', _('平板 · 竖屏'));
		o.value('0', _('未知'));
		o.rmempty = false;

		o = s.option(form.ListValue, 'uplink', _('上行接口'), _('auto 自动在无线中继 (wwan) 与有线 (wan) 中选择已获取 IP 的那个。'));
		o.value('auto', 'auto');
		o.value('wwan', 'wwan');
		o.value('wan', 'wan');
		o.rmempty = false;

		o = s.option(form.Value, 'check_interval', _('在线检测间隔'), _('单位秒。越大越省流量，越小掉线恢复越快。'));
		o.datatype = 'range(10,86400)';
		o.placeholder = '60';

		o = s.option(form.Value, 'retry_interval', _('失败重试间隔'), _('单位秒。连续失败时会按指数退避逐次拉长。'));
		o.datatype = 'range(5,3600)';
		o.placeholder = '20';

		o = s.option(form.Value, 'retry_max_interval', _('最大重试间隔'),
			_('单位秒。失败退避的上限。'));
		o.datatype = 'range(30,3600)';
		o.default = '300';

		o = s.option(form.Value, 'fail_max', _('连续失败上限'),
			_('连续失败达到该次数后暂停自动重试，避免账号被认证服务器风控。改好账号后点「立即重新认证」恢复。'));
		o.datatype = 'range(1,100)';
		o.default = '5';

		o = s.option(form.Value, 'portal_host', _('认证门户域名'), _('用于打开认证页获取服务器地址。换学校时需要修改。'));
		o.placeholder = 'login.cqcfe.com';

		o = s.option(form.Value, 'portal_ip', _('认证服务器 IP'), _('取不到门户地址时的兜底。'));
		o.placeholder = '172.22.44.46';

		o = s.option(form.Value, 'portal_port', _('认证端口'));
		o.datatype = 'port';
		o.placeholder = '801';

		poll.add(refresh, 5);
		poll.start();
		refresh(true);

		return Promise.resolve(m.render()).then(function(node) {
			return E([
				E('style', {}, CSS),
				masterBox,
				statusBox,
				actionsBox,
				devicesBox,
				// 包一层，好给表单卡片补底部留白（见 CSS 里的 .drcom-form）
				E('div', { 'class': 'drcom-form' }, node),
				logBox
			]);
		});
	}
});
