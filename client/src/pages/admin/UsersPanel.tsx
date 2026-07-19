import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Avatar from '../../components/Avatar';
import { Badges } from '../../components/Identity';
import { Empty } from '../../components/States';
import { Input, Button } from '../../components/heroui';
import { useToast } from '../../context/ToastContext';
import api from '../../api/client';
import { fmtNum } from '../../lib/format';
import { promptDialog } from '../../components/prompt';
import { downloadCSV, AdminSearch } from './ui';

// 行内积分编辑：点「积分」展开输入框 → 确定写入（管理员手动加/扣积分）。
function PointsEdit({ value, onSave }: { value: number; onSave: (n: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(String(value));
  if (!editing) return <Button size="sm" variant="bordered" className="haha-btn-app" onClick={() => { setV(String(value)); setEditing(true); }} title="调整积分">积分</Button>;
  return (
    <span className="row gap-4" style={{ alignItems: 'center' }}>
      <Input className="haha-inp" type="number" min={0} value={v} autoFocus onChange={(e: any) => setV(e.target.value)}
        onKeyDown={(e: any) => { if (e.key === 'Enter') { onSave(Math.max(0, Math.round(Number(v) || 0))); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
        style={{ width: 96, height: 30, fontSize: 13 }} />
      <Button size="sm" color="primary" className="haha-btn-app" onClick={() => { onSave(Math.max(0, Math.round(Number(v) || 0))); setEditing(false); }}>确定</Button>
      <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => setEditing(false)}>取消</Button>
    </span>
  );
}

const USER_FILTERS: [string, string][] = [['all', '全部'], ['admin', '管理员'], ['vip', 'VIP'], ['banned', '已封禁']];

// 用户后台：搜索 / 筛选 / 积分补丁 / VIP / 认证 / 管理员 / 重置密码 / 封禁 / 导出 CSV。
// 第 9 刀自 Admin.tsx 整体抽离：PointsEdit 与 USER_FILTERS 一并迁出，组件自取自存、无外部 props，实现逐字不变。
export default function UsersPanel() {
  const toast = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [hasMore, setHasMore] = useState(false);
  const load = (query = q, f = filter, off = 0) => api.get('/admin/users', { params: { q: query, filter: f === 'all' ? undefined : f, offset: off || undefined } }).then(({ data }) => {
    setUsers((prev) => (off > 0 ? [...prev, ...data.users] : data.users));
    setHasMore(!!data.hasMore);
  });
  useEffect(() => { load(); }, []);
  const pickFilter = (f: string) => { setFilter(f); load(q, f); };

  const patch = async (u: any, body: any, label: any) => {
    try { const { data } = await api.put(`/admin/users/${u.id}`, body); setUsers((xs) => xs.map((x) => x.id === u.id ? { ...x, ...data.user } : x)); toast.ok(label); }
    catch (e: any) { toast.err(e.message); }
  };
  // 重置密码（帮助找回）：弹窗输入新密码 → 后端 bcrypt 存储 + 通知该用户
  const resetPw = async (u: any) => {
    const pw = await promptDialog({ title: `为「${u.nickname}」设置新登录密码`, placeholder: '至少 6 位', type: 'password', minLength: 6, confirmText: '重置密码' });
    if (pw == null) return;
    try { await api.post(`/admin/users/${u.id}/reset-password`, { password: pw }); toast.ok('密码已重置，并已通知用户'); }
    catch (e: any) { toast.err(e.message); }
  };

  return (
    <div className="ui-card" style={{ overflow: 'hidden' }}>
      <div className="col gap-8" style={{ padding: 14 }}>
        <div className="row gap-8">
          <AdminSearch value={q} onChange={setQ} onSearch={() => load(q, filter)} placeholder="搜索用户名/昵称…" />
          <Button variant="flat" className="haha-btn-app" isDisabled={!users.length} title="导出当前列表为 CSV" onClick={() => downloadCSV(`用户_${filter}.csv`, [
            { label: '昵称', get: (u) => u.nickname }, { label: '用户名', get: (u) => u.username }, { label: '等级', get: (u) => u.level },
            { label: '积分', get: (u) => u.points }, { label: 'VIP等级', get: (u) => u.vipLevel ?? (u.vip ? 1 : 0) }, { label: '角色', get: (u) => u.role || 'user' },
            { label: '封禁', get: (u) => (u.banned ? '是' : '否') },
          ], users)}>导出 CSV</Button>
        </div>
        <div className="audit-filters">
          {USER_FILTERS.map(([k, l]) => <button key={k} className={`audit-chip${filter === k ? ' active' : ''}`} onClick={() => pickFilter(k)}>{l}</button>)}
        </div>
      </div>
      {users.length === 0 ? <Empty text="没有符合条件的用户" /> : users.map((u, i) => (
        <div key={u.id}>{i > 0 && <div className="divider" />}
          <div className="row gap-12" style={{ padding: '12px 16px', flexWrap: 'wrap' }}>
            <Avatar user={u} size={40} showV />
            <div className="grow" style={{ minWidth: 140 }}>
              <Link to={`/u/${u.username}`} className="uname">{u.nickname}</Link> <Badges user={u} />
              <div className="faint" style={{ fontSize: 12 }}>@{u.username} · Lv.{u.level} · {fmtNum(u.points)}积分 {u.banned && <span style={{ color: 'var(--like)' }}>· 已封禁</span>}</div>
            </div>
            <div className="row gap-4" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <Button size="sm" variant={u.verified ? 'flat' : 'bordered'} className="haha-btn-app" onClick={() => patch(u, { verified: !u.verified }, u.verified ? '已取消认证' : '已认证')}>V认证</Button>
              <select className="haha-inp" value={u.vipLevel ?? (u.vip ? 1 : 0)} onChange={(e) => patch(u, { vipLevel: Number(e.target.value) }, 'VIP 等级已更新')} style={{ height: 30, width: 'auto', padding: '0 8px', fontSize: 13 }} title="VIP 等级">
                <option value={0}>非会员</option>
                <option value={1}>VIP1 青铜</option>
                <option value={2}>VIP2 黄金</option>
                <option value={3}>VIP3 黑钻</option>
              </select>
              <PointsEdit value={u.points} onSave={(n) => patch(u, { points: n }, '积分已更新')} />
              <Button size="sm" variant={u.role === 'admin' ? 'flat' : 'bordered'} className="haha-btn-app" onClick={() => patch(u, { role: u.role === 'admin' ? 'user' : 'admin' }, '角色已更新')}>管理员</Button>
              <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => resetPw(u)} title="重置该用户登录密码">重置密码</Button>
              <Button size="sm" variant="bordered" className="haha-btn-app" style={{ color: u.banned ? 'var(--good)' : 'var(--like)', borderColor: 'currentColor' }} onClick={() => patch(u, { banned: !u.banned }, u.banned ? '已解封' : '已封禁')}>{u.banned ? '解封' : '封禁'}</Button>
            </div>
          </div>
        </div>
      ))}
      {hasMore && (
        <div className="row" style={{ justifyContent: 'center', padding: 12, borderTop: '1px solid var(--line)' }}>
          <Button size="sm" variant="flat" className="haha-btn-app" onClick={() => load(q, filter, users.length)}>加载更多</Button>
        </div>
      )}
    </div>
  );
}
