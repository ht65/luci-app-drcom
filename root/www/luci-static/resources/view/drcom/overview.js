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
var callDevices = rpc.declare({ object: 'drcom', method: 'devices', params: [ 'force' ], expect: { '': {} } });
var callOnline  = rpc.declare({ object: 'drcom', method: 'online',  expect: { '': {} } });
var callOffline = rpc.declare({ object: 'drcom', method: 'offline', expect: { '': {} } });
var callRelogin = rpc.declare({ object: 'drcom', method: 'relogin', expect: { '': {} } });
var callRestart = rpc.declare({ object: 'drcom', method: 'restart', expect: { '': {} } });
var callKick    = rpc.declare({ object: 'drcom', method: 'kick',    params: [ 'mac', 'ip' ], expect: { '': {} } });
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

// LuCI 的 poll 回调不会随视图切换自动注销。本文件每次 render() 都会生成
// 新的 refresh 闭包，若不在重新渲染前移除旧的，反复进页面会累积成多条
// 5 秒 RPC 链（并让旧 DOM 一直无法回收）。这里保存上一次注册的函数句柄。
var lastPollFn = null;

// 布局：统一卡片内边距、行高与卡片间距，紧凑但不拥挤
var CSS = [
	// 卡片与标题
	'.drcom-section .drcom-body{padding:2px 16px 12px}',
	'.drcom-section>h3{margin:0;padding:11px 16px 6px;font-size:15px;font-weight:600;line-height:1.4}',
	'.drcom-h3row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}',
	// 键值行
	'.drcom-kv{display:flex;flex-wrap:wrap;gap:2px 14px;padding:6px 0;border-bottom:1px solid rgba(128,128,128,.16)}',
	'.drcom-kv:last-of-type{border-bottom:none}',
	'.drcom-kv-l{flex:0 0 92px;max-width:40%;opacity:.7;font-size:13px;line-height:1.6}',
	'.drcom-kv-v{flex:1 1 180px;min-width:0;font-size:13px;line-height:1.6;word-break:break-all;display:flex;flex-wrap:wrap;align-items:center;gap:6px}',
	// 通用
	'.drcom-btns{display:flex;flex-wrap:wrap;gap:8px}',
	'.drcom-note{margin:6px 0 0;font-size:12px;opacity:.68;line-height:1.55}',
	'.drcom-note:first-child{margin-top:0}',
	'.drcom-warn{margin:8px 0 0;font-size:12px;line-height:1.55;color:#ef6c00}',
	'.drcom-tag{font-size:11px;padding:1px 8px;border-radius:9px;background:rgba(128,128,128,.14);white-space:nowrap;line-height:1.7}',
	'.drcom-tag-on{background:rgba(46,125,50,.16);color:#2e7d32}',
	'.drcom-tag-block{background:rgba(198,40,40,.14);color:#c62828}',
	'.drcom-btn-sm{font-size:12px !important;padding:0 10px !important;min-height:24px !important;line-height:22px !important}',
	// 日志
	'.drcom-log{min-height:170px;max-height:280px;overflow:auto;padding:9px 10px;margin:0;background:rgba(127,127,127,.1);border-radius:4px;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-all}',
	'.drcom-tabs{display:flex;gap:6px;margin:0 0 8px}',
	'.drcom-tab{font-size:12px;padding:2px 10px;border-radius:10px;border:1px solid rgba(128,128,128,.35);background:transparent;cursor:pointer;color:inherit;line-height:1.7}',
	'.drcom-tab-on{background:rgba(90,110,190,.14);border-color:rgba(90,110,190,.45)}',
	// 设备行
	'.drcom-dev{display:flex;flex-wrap:wrap;align-items:center;gap:3px 10px;padding:7px 0;border-bottom:1px solid rgba(128,128,128,.16);font-size:13px;line-height:1.6}',
	'.drcom-dev:last-of-type{border-bottom:none}',
	'.drcom-dev-name{flex:1 1 130px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
	'.drcom-dev-ip{flex:0 0 auto;opacity:.8;font-variant-numeric:tabular-nums}',
	'.drcom-dev-mac{flex:0 0 auto;opacity:.5;font-size:11px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}',
	'.drcom-dev-count{font-size:12px;opacity:.65}',
	// 总开关停用时置灰
	'.drcom-off .cbi-button,.drcom-off .drcom-tab{opacity:.45;pointer-events:none}',
	// 表单：融进卡片（隐藏 LuCI 自带的 h2 与说明条，避免多余留白与边框重合）
	'.drcom-form .cbi-map{background:transparent;margin:0;padding:0}',
	'.drcom-form .cbi-map h2,.drcom-form .cbi-map-descr{display:none}',
	'.drcom-form .cbi-section{background:transparent !important;box-shadow:none !important;border-radius:0 !important;margin:0 !important;padding:0 !important}',
	'.drcom-form .cbi-section-node{padding:0 !important}',
	'.drcom-form .cbi-value{padding:7px 0;margin:0;border-bottom:1px solid rgba(128,128,128,.16)}',
	'.drcom-form .cbi-value:last-of-type{border-bottom:none}',
	'.drcom-form .cbi-value-description{font-size:12px;opacity:.68;line-height:1.5;margin-top:2px}',
	'.drcom-form .cbi-input-text,.drcom-form .cbi-input-select{max-width:100%}',
	'@media (max-width:560px){.drcom-kv-l{flex:0 0 100%;max-width:none}}'
].join('\n');

// 统一卡片：h3 标题 + drcom-body 内容
function section(title, children) {
	return E('div', { 'class': 'cbi-section drcom-section' }, [
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

		var failMax = parseInt(uci.get('drcom', 'main', 'fail_max')) || 5;
		// 「连续失败 N 次后暂停重试」这句提示随配置实时更新，不用刷新页面
		var failHint = E('p', { 'class': 'drcom-note' }, '');

		var badge = E('span', {
			'style': 'display:inline-block;padding:1px 10px;border-radius:10px;color:#fff;font-size:12px;line-height:1.8;background:#666'
		}, '…');

		var vUplink  = E('span', {}, '—');
		var vIp      = E('span', {}, '—');
		var vAccount = E('span', {}, '—');
		var vServer  = E('span', {}, '—');
		var vTerm    = E('span', {}, '—');
		var vAge     = E('span', {}, '—');
		var vError   = E('span', {}, '—');
		var warnEl   = E('p', { 'class': 'drcom-warn', 'style': 'display:none' }, '');

		// 总开关
		var masterOn = true;
		var masterBadge = E('span', { 'class': 'drcom-tag drcom-tag-on' }, '运行中');
		var masterBtn = E('button', { 'class': 'cbi-button cbi-button-reset drcom-btn-sm' }, '停用插件');
		var actionsBox = null;
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
			masterBadge.className = 'drcom-tag ' + (masterOn ? 'drcom-tag-on' : '');
			masterBtn.textContent = masterOn ? '停用插件' : '启用插件';
			masterBtn.className = 'cbi-button drcom-btn-sm ' + (masterOn ? 'cbi-button-reset' : 'cbi-button-apply');
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

			// 「已停用」优先于「服务未运行」：停用时服务本来就不会启动
			if (!enabled)          { text = '已停用 · 插件不工作';     color = '#616161'; }
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
			vAge.textContent = (isNaN(age) || age < 0)
				? '—'
				: relTime(Math.floor(Date.now() / 1000) - age);

			vError.textContent = s.last_error
				? (s.last_error + (fails > 1 ? '（已连续失败 ' + fails + ' 次）' : ''))
				: '—';

			if (held) {
				warnEl.textContent = '连续认证失败 ' + fails + ' 次，已暂停自动重试以免账号被风控。'
					+ '请检查账号、密码或运营商后缀，改好后点「立即重新认证」。';
				warnEl.style.display = '';
			}
			else {
				warnEl.style.display = 'none';
			}

			var fm = parseInt(s.fail_max);
			if (!isNaN(fm) && fm > 0)
				failMax = fm;
			failHint.textContent = '修改后保存，下一轮在线检测时自动生效（更快请点上方「重启服务」）。'
				+ '连续失败 ' + failMax + ' 次后会自动暂停重试，避免账号被风控。';

			masterOn = enabled;
			masterBtn.disabled = false;	// 之前若因状态读取失败被禁用，现在恢复
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
				+ '会立即切断它已建立的连接，并阻断它的新连接——一直持续到你点「解除」或关闭插件总开关。\n'
				+ '设备可能仍显示已连接 WiFi，但无法上网。\n'
				+ '如果这是你正在用的这台设备，阻断期间将无法访问本页面。');
			if (!ok)
				return;

			// 点击立刻按「已阻断」重绘，视觉上点了就生效
			optimisticDevices(x.mac, true);
			callKick(x.mac, x.ip || '').then(function(r) {
				ui.addNotification(null, E('p', {}, (r && r.message) ? r.message : '已断开'));
				return loadDevices(true).catch(function() {});	// 再按后端真实结果校准
			}).catch(function(e) {
				optimisticDevices(x.mac, false);	// 失败回滚
				ui.addNotification(null, E('p', {}, '操作失败：' + e.message));
			});
		}

		function unkickDevice(x) {
			// 点击立刻按「已解除」重绘
			optimisticDevices(x.mac, false);
			callUnkick(x.mac).then(function(r) {
				ui.addNotification(null, E('p', {}, (r && r.message) ? r.message : '已解除阻断'));
				return loadDevices(true).catch(function() {});
			}).catch(function(e) {
				optimisticDevices(x.mac, true);	// 失败回滚
				ui.addNotification(null, E('p', {}, '操作失败：' + e.message));
			});
		}

		// 设备列表最近一次完整结果 + 请求序号 + 一个「短暂保护窗」。
		// 目的：点「断开/解除」时先乐观重绘（点击即反应），并在这之后的几秒内
		// 忽略「读缓存」的旧设备响应，避免 devwatch 还没刷新时把界面又改回去。
		var lastDevices = null;
		var lastDevSig = null;	// 上一次已渲染的设备列表签名，内容没变就不重建 DOM
		var devSeq = 0, devAppliedSeq = 0, devHoldUntil = 0;

		// 立刻把某台设备按「已阻断 / 已解除」重绘，不等后端往返。
		function optimisticDevices(mac, blocked) {
			devAppliedSeq = ++devSeq;
			devHoldUntil = Date.now() + 8000;
			if (!lastDevices)
				return;
			lastDevices.forEach(function(x) {
				if (x.mac !== mac)
					return;
				x.blocked = blocked ? 1 : 0;
				x.online = blocked ? 0 : 1;
			});
			applyDevices({ devices: lastDevices });
		}

		// 拉设备列表并应用。force=false 读缓存；返回的强制探测结果总能覆盖。
		// seq 保证晚到的旧响应不会覆盖较新的结果；保护窗内忽略读缓存的旧结果。
		function loadDevices(force) {
			var seq = ++devSeq;
			var forced = (force === true);
			return callDevices(forced ? 1 : 0).then(function(d) {
				if (!forced && Date.now() < devHoldUntil)
					return;
				if (seq < devAppliedSeq)
					return;
				devAppliedSeq = seq;
				applyDevices(d);
			});
		}

		function applyDevices(d) {
			var all = (d && d.devices) || [];
			lastDevices = all;

			// 只显示「在线」和「已阻断」的设备。
			// 断开的设备（无线掉了 / 拔了网线 / ARP 不通）直接不显示，而不是留一行灰的。
			// 已阻断的必须留着，否则就没有「解除」按钮了。
			var list = all.filter(function(x) {
				return parseInt(x.online) == 1 || parseInt(x.blocked) == 1;
			});

			// 在线的排前面，阻断的排后面。先排序再算签名，避免探测顺序抖动
			// 导致每轮都误判为「有变化」而整块重建。
			list.sort(function(a, b) {
				var sa = (parseInt(a.online) || 0) * 2 + (parseInt(a.blocked) || 0);
				var sb = (parseInt(b.online) || 0) * 2 + (parseInt(b.blocked) || 0);
				return sb - sa;
			});

			// 内容没变就不重建：每 5 秒轮询都会拿到一份全新对象，无条件重建
			// 会让设备行抖动，并打断正在点的「断开 / 解除」按钮。
			var sig = list.map(function(x) {
				return [x.mac, x.ip, x.online, x.blocked, x.wireless, x.name].join('|');
			}).join(';');
			if (sig === lastDevSig)
				return;
			lastDevSig = sig;

			while (devList.firstChild)
				devList.removeChild(devList.firstChild);

			if (!list.length) {
				devCount.textContent = '0 台在线';
				devList.appendChild(E('p', { 'class': 'drcom-note' }, '当前没有已连接的设备。'));
				return;
			}

			var online = 0, blocked = 0;
			list.forEach(function(x) {
				if (parseInt(x.online) == 1)
					online++;
				else if (parseInt(x.blocked) == 1)
					blocked++;
			});
			devCount.textContent = online + ' 台在线' + (blocked ? ' · ' + blocked + ' 台已阻断' : '');

			list.forEach(function(x) {
				var wifi = parseInt(x.wireless) == 1;
				var blocked = parseInt(x.blocked) == 1;

				// 列表只保留「在线 / 已阻断」两种，不会再出现离线的行
				var statusText, statusCls;
				if (blocked) {
					statusText = '已阻断';
					statusCls = 'drcom-tag drcom-tag-block';
				}
				else {
					statusText = '在线';
					statusCls = 'drcom-tag drcom-tag-on';
				}

				var actBtn = blocked
					? E('button', { 'class': 'cbi-button cbi-button-action drcom-btn-sm' }, '解除')
					: E('button', { 'class': 'cbi-button cbi-button-reset drcom-btn-sm' }, '断开');

				// 直接用 addEventListener，不依赖 E() 对事件属性的处理
				actBtn.addEventListener('click', function(ev) {
					ev.preventDefault();
					if (blocked)
						unkickDevice(x);
					else
						kickDevice(x);
				});

				devList.appendChild(E('div', {
					'class': 'drcom-dev'
				}, [
					E('span', { 'class': 'drcom-dev-name' }, x.name || '未知设备'),
					E('span', { 'class': 'drcom-dev-ip' }, x.ip || '—'),
					E('span', { 'class': 'drcom-dev-mac' }, x.mac || ''),
					E('span', { 'class': 'drcom-tag' }, wifi ? 'WiFi' : '有线'),
					E('span', { 'class': statusCls }, statusText),
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
		function doRefresh(force) {
			var wantLog = (force === true) || (tick % SLOW_EVERY) === 0;
			tick++;

			return callStatus().then(function(st) {
				applyStatus(st);
			}).catch(function() {
				badge.textContent = '状态获取失败';
				badge.style.background = '#c62828';
				// 拿不到真实启用状态时，别让总开关保持乐观的「运行中 / 停用插件」
				masterBtn.disabled = true;
			}).then(function() {
				// 设备列表读的是后端缓存（后台每 5 秒刷新），响应很快，所以每轮都拉；
				// 日志要读 80 行、比较慢，仍每 3 轮（15 秒）拉一次。
				// 手动刷新（force）时让后端跳过缓存、现场探测一次，拔线/插线立刻反映
				return loadDevices(force === true).catch(function() {
					// 清掉签名，保证下一次成功的结果一定会重绘，把这条错误提示替换掉
					lastDevSig = null;
					while (devList.firstChild)
						devList.removeChild(devList.firstChild);
					devCount.textContent = '读取失败';
					devList.appendChild(E('p', { 'class': 'drcom-note' }, '（读取设备列表失败，可点「刷新」重试）'));
				});
			}).then(function() {
				if (!wantLog)
					return null;
				return fetchLog();
			});
		}

		// 同一时刻只允许一条刷新链在跑：轮询与按钮触发的刷新若并发，
		// 会同时发出多组 status/devices/log RPC，正是历史上导致页面卡死的 RPC 合批场景。
		var refreshing = null, refreshQueued = false;
		function refresh(force) {
			if (refreshing) {
				if (force === true)
					refreshQueued = true;
				return refreshing;
			}
			refreshing = doRefresh(force).finally(function() {
				refreshing = null;
				if (refreshQueued) {
					refreshQueued = false;
					refresh(true);
				}
			});
			return refreshing;
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

		// ---- 卡片 1：状态 + 总开关 ----
		var statusBox = section([
			E('span', { 'class': 'drcom-h3row' }, [
				E('span', {}, '当前状态'), badge
			])
		], [
			kv('插件总开关', [ masterBadge, masterBtn ]),
			E('p', { 'class': 'drcom-note' }, '停用后插件完全停止（不探测、不认证、不动上行接口），适合改用 USB CPE 等其它上行。'),
			kv('上行接口', vUplink),
			kv('本机 IP', vIp),
			kv('认证账号', vAccount),
			kv('终端类型', vTerm),
			kv('认证服务器', vServer),
			kv('状态更新', vAge),
			kv('最近错误', vError),
			warnEl
		]);

		// ---- 卡片 2：手动操作 ----
		actionsBox = section('手动操作', [
			E('div', { 'class': 'drcom-btns' }, [
				actionBtn('上线（拉起上行）', 'cbi-button-apply', callOnline),
				actionBtn('立即重新认证', 'cbi-button-action', callRelogin),
				actionBtn('下线路由器', 'cbi-button-reset', callOffline),
				actionBtn('重启服务', 'cbi-button-action', callRestart)
			]),
			E('p', { 'class': 'drcom-note' },
				'「立即重新认证」只认证一次、不换接口；「下线路由器」会断开本机上行并暂停自动认证'
				+ '（重启后仍暂停），只影响这台路由器，不波及同账号的手机。')
		]);

		// ---- 卡片 3：连接设备 ----
		var devCount = E('span', { 'class': 'drcom-dev-count' }, '…');
		var devList = E('div', {}, E('p', { 'class': 'drcom-note' }, '（加载中…）'));

		var devReload = E('button', { 'class': 'cbi-button cbi-button-action drcom-btn-sm' }, '刷新');
		devReload.addEventListener('click', function(ev) {
			ev.preventDefault();
			devReload.disabled = true;
			// 走统一的刷新链（force 会让后端跳过缓存、现场探测一次），
			// 避免和轮询同时各跑一套探测 / RPC。
			refresh(true).catch(function() {}).finally(function() { devReload.disabled = false; });
		});

		devicesBox = section([
			E('span', { 'class': 'drcom-h3row' }, [
				E('span', {}, '当前连接设备'), devCount, devReload
			])
		], [
			devList,
			E('p', { 'class': 'drcom-note' },
				'只显示当前在线和已阻断的设备，断开的设备会自动从列表消失。'
				+ '「断开」会立即切断并持续阻断，直到你点「解除」或关闭插件总开关；请勿对自己正在使用的设备操作。')
		]);

		// ---- 卡片 4：认证设置（表单嵌进卡片里） ----
		var formBody = E('div', { 'class': 'drcom-body' });

		var formBox = E('div', { 'class': 'cbi-section drcom-section' }, [
			E('h3', {}, '认证设置'),
			formBody
		]);

		// ---- 卡片 5：日志 ----
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
			lastLog = null;		// 两种日志内容不同，强制重绘
			renderTabs();
			// 不把内容替换成「切换中…」：那会让日志框瞬间变矮再回弹，很突兀。
			// 保留旧内容、只降透明度，等新日志到了再恢复。
			logPre.style.opacity = '.45';
			fetchLog().finally(function() { logPre.style.opacity = ''; });
		}

		tabAuto.addEventListener('click', function(ev) { ev.preventDefault(); switchLog('auto'); });
		tabOp.addEventListener('click', function(ev) { ev.preventDefault(); switchLog('op'); });

		var logBox = section('实时日志', [
			E('div', { 'class': 'drcom-tabs' }, [ tabAuto, tabOp ]),
			logPre
		]);

		// ---- 表单 ----
		var m = new form.Map('drcom', _('Dr.COM 校园网认证'), '');
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

		o = s.option(form.Value, 'retry_max_interval', _('最大重试间隔'), _('单位秒。失败退避的上限。'));
		o.datatype = 'range(30,3600)';
		o.default = '300';

		o = s.option(form.Value, 'fail_max', _('连续失败上限'),
			_('达到该次数后暂停自动重试；改好账号后点「立即重新认证」恢复。'));
		o.datatype = 'range(1,100)';
		o.default = '5';

		o = s.option(form.Value, 'portal_host', _('认证门户域名'), _('用于打开认证页获取服务器地址。换学校时需要修改。'));
		o.datatype = 'hostname';
		o.placeholder = 'login.cqcfe.com';

		o = s.option(form.Value, 'portal_ip', _('认证服务器 IP'), _('取不到门户地址时的兜底。'));
		o.datatype = 'ipaddr';
		o.placeholder = '172.22.44.46';

		o = s.option(form.Value, 'portal_port', _('认证端口'));
		o.datatype = 'port';
		o.placeholder = '801';

		o = s.option(form.Value, 'probe_url', _('连通性检测地址'),
			_('只有该地址返回的内容等于下面的「期望内容」时才判定已认证。换学校若门户劫持方式不同，可改这里。'));
		o.placeholder = 'http://www.msftconnecttest.com/connecttest.txt';

		o = s.option(form.Value, 'probe_expect', _('期望返回内容'),
			_('与检测地址的响应正文完全一致才算在线（区分大小写）。'));
		o.placeholder = 'Microsoft Connect Test';

		// LuCI 的 poll 回调不会随视图切换自动注销。这里用带「DOM 是否还在文档里」
		// 检查的包装函数：离开页面后自动注销；同时先移除上一次注册的，
		// 避免反复进页面累积成多条 5 秒 RPC 链。
		// pollAttached 用于避免「视图还没挂到文档上」的极短窗口里误注销。
		var pollAttached = false;
		function pollTick() {
			var inDoc = document.body.contains(logBox);

			if (inDoc) {
				pollAttached = true;
			}
			else if (pollAttached && typeof poll.remove == 'function') {
				poll.remove(pollTick);
				return;
			}

			refresh(false);
		}

		if (lastPollFn && typeof poll.remove == 'function')
			poll.remove(lastPollFn);
		lastPollFn = pollTick;
		poll.add(pollTick, 5);
		poll.start();
		refresh(true);

		return Promise.resolve(m.render()).then(function(node) {
			formBody.appendChild(failHint);
			formBody.appendChild(E('div', { 'class': 'drcom-form' }, node));

			return E([
				E('style', {}, CSS),
				statusBox,
				actionsBox,
				devicesBox,
				formBox,
				logBox
			]);
		});
	}
});
