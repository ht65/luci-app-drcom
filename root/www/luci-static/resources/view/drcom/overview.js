'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require poll';
'require ui';

var callStatus  = rpc.declare({ object: 'drcom', method: 'status',  expect: { '': {} } });
var callLog     = rpc.declare({ object: 'drcom', method: 'log',     expect: { '': {} } });
var callOnline  = rpc.declare({ object: 'drcom', method: 'online',  expect: { '': {} } });
var callOffline = rpc.declare({ object: 'drcom', method: 'offline', expect: { '': {} } });
var callRelogin = rpc.declare({ object: 'drcom', method: 'relogin', expect: { '': {} } });
var callRestart = rpc.declare({ object: 'drcom', method: 'restart', expect: { '': {} } });

var TERM_NAMES = {
	'0': '未知',
	'1': 'PC（占用电脑槽位）',
	'2': '手机（占用移动终端槽位）',
	'3': '平板 · 横屏',
	'4': '平板 · 竖屏'
};

// 日志比状态刷新得慢：状态 5 秒一轮，日志每 3 轮（15 秒）才拉一次，减少无谓流量
var LOG_EVERY = 3;

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

return view.extend({
	load: function() {
		// 这里只读配置。状态与日志放到 render 之后串行拉取：
		// 同时并发多个 RPC 会被 LuCI 合批，实测三个一起发时 Promise 不落地，
		// 页面会一直停在「正在载入视图」。
		return uci.load('drcom');
	},

	render: function() {
		var tick = 0;          // 轮询计数，用来降低日志刷新频率
		var lastLog = null;    // 上一次日志内容，没变就不重绘（否则会把滚动位置拽回去）

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
			if (!enabled)          { text = '已禁用';                  color = '#616161'; }
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

		// 严格串行：先状态，必要时再日志。并发 RPC 在 LuCI 26 上会卡住页面。
		function refresh() {
			var wantLog = (tick % LOG_EVERY) === 0;
			tick++;

			return callStatus().then(function(st) {
				applyStatus(st);
			}).catch(function() {
				badge.textContent = '状态获取失败';
				badge.style.background = '#c62828';
			}).then(function() {
				if (!wantLog)
					return null;
				return callLog().then(applyLog).catch(function() {});
			});
		}

		function actionBtn(label, cls, fn) {
			var btn = E('button', { 'class': 'cbi-button ' + cls }, label);

			btn.addEventListener('click', function(ev) {
				ev.preventDefault();
				btn.disabled = true;

				return fn().then(function(r) {
					ui.addNotification(null, E('p', {}, (r && r.message) ? r.message : '已执行'));
					return refresh();
				}).catch(function(e) {
					ui.addNotification(null, E('p', {}, '操作失败：' + e.message));
				}).finally(function() {
					btn.disabled = false;
				});
			});

			return btn;
		}

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

		var actions = section('手动操作', [
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

		var logPre = E('pre', { 'class': 'drcom-log' }, '（加载中…）');

		var logBox = section('实时日志', [ logPre ]);

		var m = new form.Map('drcom', _('Dr.COM 校园网认证'),
			_('路由器自动完成校园网 Portal 认证，供接入本机的设备共享上网。修改后保存，最多 60 秒自动生效；需要立刻生效请点上方「重启服务」。'));

		var s = m.section(form.NamedSection, 'main', 'drcom');
		s.anonymous = true;
		s.addremove = false;

		var o = s.option(form.Flag, 'enabled', _('启用认证'), _('关闭后停止自动认证。'));
		o.default = '1';
		o.rmempty = false;

		o = s.option(form.Value, 'username', _('账号'));
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
		refresh();

		return Promise.resolve(m.render()).then(function(node) {
			return E([ E('style', {}, CSS), statusBox, actions, node, logBox ]);
		});
	}
});
