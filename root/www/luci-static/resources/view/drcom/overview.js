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
var callRestart = rpc.declare({ object: 'drcom', method: 'restart', expect: { '': {} } });

var TERM_NAMES = {
	'0': '未知',
	'1': 'PC（占用电脑槽位）',
	'2': '手机（占用移动终端槽位）',
	'3': '平板 · 横屏',
	'4': '平板 · 竖屏'
};

function section(title, children) {
	return E('div', { 'class': 'cbi-section' }, [
		E('h3', {}, title),
		E('div', {}, children)
	]);
}

function kv(label, valueNode) {
	return E('div', {
		'style': 'display:flex;gap:12px;padding:7px 0;border-bottom:1px solid rgba(128,128,128,.18)'
	}, [
		E('div', { 'style': 'flex:0 0 92px;opacity:.7;font-size:13px' }, label),
		E('div', { 'style': 'font-size:13px;word-break:break-all' }, valueNode)
	]);
}

return view.extend({
	load: function() {
		return Promise.all([ uci.load('drcom'), callStatus(), callLog() ]);
	},

	render: function(data) {
		var st = data[1] || {};
		var lg = data[2] || {};

		var badge = E('span', {
			'style': 'display:inline-block;padding:2px 10px;border-radius:10px;color:#fff;font-size:12px;background:#666'
		}, '…');

		var vUplink  = E('span', {}, '—');
		var vIp      = E('span', {}, '—');
		var vAccount = E('span', {}, '—');
		var vServer  = E('span', {}, '—');
		var vTerm    = E('span', {}, '—');
		var vAge     = E('span', {}, '—');

		function applyStatus(s) {
			s = s || {};

			var running    = parseInt(s.running) == 1;
			var online     = parseInt(s.online) == 1;
			var paused     = parseInt(s.paused) == 1;
			var enabled    = parseInt(s.enabled) == 1;
			var configured = parseInt(s.configured) == 1;
			var offline    = paused && (!s.ip || s.ip == '-');

			var text, color;

			if (!running)       { text = '服务未运行';        color = '#c62828'; }
			else if (!enabled)  { text = '已禁用';            color = '#616161'; }
			else if (!configured) { text = '未配置账号';      color = '#ef6c00'; }
			else if (offline)   { text = '已下线 · 上行已断开'; color = '#616161'; }
			else if (paused)    { text = '已暂停 · 不再自动登录'; color = '#ef6c00'; }
			else if (online)    { text = '已认证 · 可上网';   color = '#2e7d32'; }
			else                { text = '运行中 · 未认证';   color = '#ef6c00'; }

			badge.textContent = text;
			badge.style.background = color;

			vUplink.textContent  = s.uplink || '—';
			vIp.textContent      = (s.ip && s.ip != '-') ? s.ip : '未获取';
			vAccount.textContent = s.account || '未配置';
			vServer.textContent  = s.server ? (s.server + ':' + (s.port || '801')) : '—';
			vTerm.textContent    = TERM_NAMES[String(s.terminal)] || '—';

			var age = parseInt(s.age);
			vAge.textContent = (isNaN(age) || age < 0) ? '—' : (age + ' 秒前');
		}
		applyStatus(st);

		function refresh() {
			return Promise.all([ callStatus(), callLog() ]).then(function(r) {
				applyStatus(r[0]);
				if (r[1] && r[1].lines)
					logPre.textContent = r[1].lines.length ? r[1].lines.join('\n') : '（暂无日志）';
			}).catch(function() {});
		}

		function actionBtn(label, cls, fn) {
			var btn = E('button', { 'class': 'cbi-button ' + cls, 'style': 'margin-right:8px' }, label);

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
			kv('状态更新', vAge)
		]);

		var actions = section('手动操作', [
			actionBtn('上线 / 立即登录', 'cbi-button-apply', callOnline),
			actionBtn('下线路由器', 'cbi-button-reset', callOffline),
			actionBtn('重启服务', 'cbi-button-action', callRestart),
			E('p', { 'style': 'margin:10px 0 0;font-size:12px;opacity:.7' },
				'「下线路由器」会断开本机的上行连接并暂停自动认证。它只作用于这台路由器，不会波及同账号的手机等其他设备。')
		]);

		var logPre = E('pre', {
			'style': 'max-height:300px;overflow:auto;padding:10px;margin:0;background:rgba(127,127,127,.1);border-radius:4px;font-size:12px;line-height:1.55;white-space:pre-wrap;word-break:break-all'
		}, (lg.lines && lg.lines.length) ? lg.lines.join('\n') : '（暂无日志）');

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
		o.datatype = 'uinteger';
		o.placeholder = '60';

		o = s.option(form.Value, 'retry_interval', _('失败重试间隔'), _('单位秒。'));
		o.datatype = 'uinteger';
		o.placeholder = '20';

		o = s.option(form.Value, 'portal_host', _('认证门户域名'), _('用于打开认证页获取服务器地址。换学校时需要修改。'));
		o.placeholder = 'login.cqcfe.com';

		o = s.option(form.Value, 'portal_ip', _('认证服务器 IP'), _('取不到门户地址时的兜底。'));
		o.placeholder = '172.22.44.46';

		o = s.option(form.Value, 'portal_port', _('认证端口'));
		o.datatype = 'port';
		o.placeholder = '801';

		poll.add(refresh, 5);
		poll.start();

		return Promise.resolve(m.render()).then(function(node) {
			return E([ statusBox, actions, node, logBox ]);
		});
	}
});
